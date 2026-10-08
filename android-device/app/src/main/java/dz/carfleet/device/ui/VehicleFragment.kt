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
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.device.R
import dz.carfleet.device.api.AddVehicleRequest
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.data.SessionManager
import kotlinx.coroutines.launch
import java.util.UUID

// Véhicule : listes fermées marque → modèle → couleur (zéro saisie libre) + n° série virtuel
class VehicleFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_vehicle, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
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
        // Règle 1 voiture/dispositif : vérifie côté serveur et masque le formulaire si déjà inscrit
        lifecycleScope.launch {
            if (!session.isLogged) return@launch
            try {
                ApiClient.init(session.baseUrl)
                val mine = ApiClient.service().myVehicles(session.authHeader).vehicules
                if (mine.isNotEmpty()) {
                    val v = mine[0]
                    tvSerial.text = "Déjà inscrit : ${v.marque ?: ""} ${v.modele ?: ""} (${v.immatriculation})\ncarId : ${v.carId}"
                    view.findViewById<Button>(R.id.btnAdd).isEnabled = false
                    tvErr.text = "Un seul véhicule par dispositif"
                }
            } catch (_: Exception) { }
        }
        view.findViewById<Button>(R.id.btnAdd).setOnClickListener {
            if (!session.isLogged) {
                tvErr.text = "Crée d'abord ton compte (onglet Compte)"
                return@setOnClickListener
            }
            val marque = marques[spMarque.selectedItemPosition]
            val modele = (Ref.MARQUES[marque] ?: emptyList()).getOrNull(spModele.selectedItemPosition) ?: ""
            val couleur = Ref.COULEURS[spCouleur.selectedItemPosition]
            val immat = etImmat.text.toString().trim()
            if (modele.isEmpty() || immat.isEmpty()) {
                tvErr.text = "Modèle et matricule requis"
                return@setOnClickListener
            }
            // N° de série virtuel généré sur le téléphone (dispositif GPS simulé)
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
                        tvSerial.text = "N° série : ${res.vehicule.numeroSerie}\ncarId : ${res.vehicule.carId}"
                        tvErr.text = ""
                        Toast.makeText(context, "Véhicule enregistré", Toast.LENGTH_SHORT).show()
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

    private fun posListener(onPos: () -> Unit) = object : android.widget.AdapterView.OnItemSelectedListener {
        private var first = true
        override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
            if (first) { first = false; return }
            onPos()
        }
        override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
    }
}
