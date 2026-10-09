package dz.carfleet.device.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.device.R
import dz.carfleet.device.api.AddVehicleRequest
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.api.OwnedVehicle
import dz.carfleet.device.data.SessionManager
import kotlinx.coroutines.launch
import java.util.UUID

// Véhicule : fiche complète (vue + édition) ou ajout si aucun (1 seul/dispositif)
class VehicleFragment : Fragment() {
    private var mine: OwnedVehicle? = null
    private var editing = false

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_vehicle, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        if (!session.isLogged) {
            view.findViewById<TextView>(R.id.tvErr).text = "Connecte-toi d'abord (onglet Compte)"
            return
        }
        ApiClient.init(session.baseUrl)
        lifecycleScope.launch {
            try {
                val res = ApiClient.service().myVehicles(session.authHeader)
                mine = res.vehicules.firstOrNull()
                // Sync local prefs avec serveur : évite "véhicule déjà choisi" fantôme d'un autre compte
                if (mine != null) {
                    // si local vide ou désynchronisé, resync depuis serveur
                    if (!session.hasVehicle || session.carId != mine!!.carId) {
                        session.saveVehicle(dz.carfleet.device.api.VehiculeInfo(mine!!.id, mine!!.carId, mine!!.immatriculation, null), mine!!.marque ?: session.marque, mine!!.modele ?: session.modele, mine!!.immatriculation)
                    }
                    // sync chauffeur aussi pour que TrackingService envoie le bon conducteur
                    mine!!.chauffeur?.let { ch -> session.saveDriver(ch.nom ?: "", ch.prenom ?: "", ch.telephone ?: "", ch.numeroPermis) }
                        ?: session.clearDriver()
                    showFiche(view, session)
                } else {
                    // serveur vide mais local a un vieux véhicule -> purge
                    if (session.hasVehicle) {
                        view.context.getSharedPreferences("carfleet_device", android.content.Context.MODE_PRIVATE).edit().remove("carId").remove("serial").remove("marque").remove("modele").remove("immat").apply()
                    }
                    showAjout(view, session)
                }
            } catch (e: Exception) {
                // hors-ligne : se fie au local
                if (session.hasVehicle) showFiche(view, session) else showAjout(view, session)
                view.findViewById<TextView>(R.id.tvErr).text = "Serveur injoignable : ${e.message}"
            }
        }
    }

    private fun catLabel(c: String?): String {
        val leg = if ((c ?: "leger") == "leger") " (Léger)" else " (Lourd)"
        return (c ?: "leger") + leg
    }

    private fun showFiche(view: View, session: SessionManager) {
        val v = mine ?: return
        view.findViewById<LinearLayout>(R.id.formAjout).visibility = View.GONE
        view.findViewById<LinearLayout>(R.id.ficheVeh).visibility = View.VISIBLE
        majFiche(view)
        view.findViewById<Button>(R.id.btnEditVeh).setOnClickListener {
            if (!editing) {
                editing = true
                view.findViewById<LinearLayout>(R.id.editVeh).visibility = View.VISIBLE
                (it as Button).text = "Enregistrer"
            } else {
                sauver(view, session)
            }
        }
        view.findViewById<Button>(R.id.btnCopy).setOnClickListener {
            val cm = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("serial", session.serial))
            Toast.makeText(context, "N° de série copié", Toast.LENGTH_SHORT).show()
        }
    }

    private fun majFiche(view: View) {
        val v = mine ?: return
        setupEditSpinners(view)
        val session = SessionManager(requireContext())
        val owner = "${session.prenom} ${session.nom}".trim().ifEmpty { "—" }
        view.findViewById<TextView>(R.id.tvFiche).text =
            "👤 Propriétaire (compte) : $owner (${session.username})\n" +
            "🚗 ${v.marque ?: ""} ${v.modele ?: ""}\nMatricule : ${v.immatriculation}\n" +
            "${catLabel(v.categorieVehicule)} · ${v.couleur ?: "—"}\ncarId : ${v.carId}\n" +
            (v.chauffeur?.let { "🧑‍✈️ Chauffeur : ${it.prenom} ${it.nom} (${it.telephone ?: "—"})" } ?: "Chauffeur : non désigné (ira comme propriétaire)")
    }

    private fun sauver(view: View, session: SessionManager) {
        val spMarque: Spinner = view.findViewById(R.id.spMarque2)
        val spModele: Spinner = view.findViewById(R.id.spModele2)
        val spCouleur: Spinner = view.findViewById(R.id.spCouleur2)
        val spCat: Spinner = view.findViewById(R.id.spCat2)
        val etImmat: EditText = view.findViewById(R.id.etImmat2)
        val marque = spMarque.selectedItem as String
        val modele = (Ref.MARQUES[marque] ?: emptyList()).getOrNull(spModele.selectedItemPosition) ?: ""
        val body = mutableMapOf<String, Any?>("id" to (mine?.id ?: 0))
        body["marque"] = marque
        body["modele"] = modele
        body["couleur"] = Ref.COULEURS[spCouleur.selectedItemPosition]
        body["categorieVehicule"] = listOf("leger", "lourd", "transport", "transport_dangereux", "convoi_exceptionnel")[spCat.selectedItemPosition]
        val immat = etImmat.text.toString().trim()
        if (immat.isNotEmpty()) body["immatriculation"] = immat
        view.findViewById<TextView>(R.id.tvErr).text = "Enregistrement…"
        lifecycleScope.launch {
            try {
                ApiClient.service().patchVehicle(session.authHeader, body)
                val res = ApiClient.service().myVehicles(session.authHeader)
                mine = res.vehicules.firstOrNull()
                editing = false
                view.findViewById<LinearLayout>(R.id.editVeh).visibility = View.GONE
                view.findViewById<Button>(R.id.btnEditVeh).text = "Modifier"
                view.findViewById<TextView>(R.id.tvErr).text = ""
                majFiche(view)
            } catch (e: Exception) {
                view.findViewById<TextView>(R.id.tvErr).text = "Échec : ${e.message}"
            }
        }
    }

    private fun showAjout(view: View, session: SessionManager) {
        view.findViewById<LinearLayout>(R.id.ficheVeh).visibility = View.GONE
        view.findViewById<LinearLayout>(R.id.formAjout).visibility = View.VISIBLE
        val spMarque: Spinner = view.findViewById(R.id.spMarque)
        val spModele: Spinner = view.findViewById(R.id.spModele)
        val spCouleur: Spinner = view.findViewById(R.id.spCouleur)
        val etImmat: EditText = view.findViewById(R.id.etImmat)
        val spCat: Spinner = view.findViewById(R.id.spCat)
        val tvSerial: TextView = view.findViewById(R.id.tvSerial)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val marques = Ref.MARQUES.keys.toList()
        spMarque.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, marques).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        fun refreshModeles() {
            val modeles = Ref.MARQUES[marques[spMarque.selectedItemPosition]] ?: emptyList<String>()
            spModele.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, modeles).apply {
                setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            }
        }
        refreshModeles()
        spMarque.onItemSelectedListener = posListener { refreshModeles() }
        spCouleur.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, Ref.COULEURS).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        val cats = listOf("leger", "lourd", "transport", "transport_dangereux", "convoi_exceptionnel")
        spCat.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, cats).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        if (session.hasVehicle) {
            tvSerial.text = "N° série : ${session.serial}\ncarId : ${session.carId}\n${session.marque} ${session.modele} (${session.immat})"
        }
        view.findViewById<Button>(R.id.btnAdd).setOnClickListener {
            val marque = marques[spMarque.selectedItemPosition]
            val modele = (Ref.MARQUES[marque] ?: emptyList()).getOrNull(spModele.selectedItemPosition) ?: ""
            val couleur = Ref.COULEURS[spCouleur.selectedItemPosition]
            val immat = etImmat.text.toString().trim()
            if (modele.isEmpty() || immat.isEmpty()) {
                tvErr.text = "Modèle et matricule requis"
                return@setOnClickListener
            }
            val serial = "VSN-" + UUID.randomUUID().toString().take(8).uppercase()
            tvErr.text = "Enregistrement…"
            ApiClient.init(session.baseUrl)
            lifecycleScope.launch {
                try {
                    val res = ApiClient.service().addVehicle(
                        session.authHeader,
                        AddVehicleRequest(immat, marque, modele, couleur, cats[spCat.selectedItemPosition], serial)
                    )
                    if (res.ok && res.vehicule != null) {
                        session.saveVehicle(res.vehicule, marque, modele, immat)
                        tvErr.text = ""
                        Toast.makeText(context, "Véhicule enregistré", Toast.LENGTH_SHORT).show()
                        showFicheRefresh(view, session)
                    } else {
                        tvErr.text = res.error ?: "Échec"
                    }
                } catch (e: Exception) {
                    tvErr.text = "Serveur injoignable : ${e.message}"
                }
            }
        }
        view.findViewById<Button>(R.id.btnCopy).setOnClickListener {
            val cm = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("serial", session.serial))
            Toast.makeText(context, "N° de série copié", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showFicheRefresh(view: View, session: SessionManager) {
        lifecycleScope.launch {
            try {
                val res = ApiClient.service().myVehicles(session.authHeader)
                mine = res.vehicules.firstOrNull()
                if (mine != null) {
                    prefillEdit(view)
                    showFiche(view, session)
                }
            } catch (_: Exception) { }
        }
    }

    private fun prefillEdit(view: View) {
        val v = mine ?: return
        view.findViewById<EditText>(R.id.etImmat2).setText(v.immatriculation)
    }

    private fun setupEditSpinners(view: View) {
        val v = mine
        val marques = Ref.MARQUES.keys.toList()
        val spMarque: Spinner = view.findViewById(R.id.spMarque2)
        val spModele: Spinner = view.findViewById(R.id.spModele2)
        val spCouleur: Spinner = view.findViewById(R.id.spCouleur2)
        val spCat: Spinner = view.findViewById(R.id.spCat2)
        spMarque.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, marques).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        fun refreshModeles() {
            val modeles = Ref.MARQUES[marques[spMarque.selectedItemPosition]] ?: emptyList<String>()
            spModele.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, modeles).apply {
                setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            }
        }
        refreshModeles()
        spMarque.onItemSelectedListener = posListener { refreshModeles() }
        spCouleur.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, Ref.COULEURS).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        val cats = listOf("leger", "lourd", "transport", "transport_dangereux", "convoi_exceptionnel")
        spCat.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, cats).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        if (v != null) {
            (Ref.MARQUES.keys.toList().indexOf(v.marque).takeIf { it >= 0 } ?: 0).let { spMarque.setSelection(it) }
            refreshModeles()
            (Ref.MARQUES[v.marque].orEmpty().indexOf(v.modele).takeIf { it >= 0 } ?: 0).let { spModele.setSelection(it) }
            (Ref.COULEURS.indexOf(v.couleur).takeIf { it >= 0 } ?: 0).let { spCouleur.setSelection(it) }
            (cats.indexOf(v.categorieVehicule).takeIf { it >= 0 } ?: 0).let { spCat.setSelection(it) }
        }
    }

    private fun posListener(onPos: () -> Unit) = object : android.widget.AdapterView.OnItemSelectedListener {
        private var first = true
        override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
            if (first) { first = false; return }
            onPos()
        }
        override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
    }
}
