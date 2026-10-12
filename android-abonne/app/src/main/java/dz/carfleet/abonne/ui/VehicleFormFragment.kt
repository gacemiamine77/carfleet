package dz.carfleet.abonne.ui

import android.app.AlertDialog
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
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.api.OwnerVehicle
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch

// Fiche véhicule : création / modification / suppression (modifiables même sans paiement).
class VehicleFormFragment : Fragment() {
    private val vehicleId: Int get() = arguments?.getInt("vehicleId", 0) ?: 0

    companion object {
        fun nouveau() = VehicleFormFragment()
        fun existant(id: Int) = VehicleFormFragment().apply {
            arguments = Bundle().apply { putInt("vehicleId", id) }
        }

        val MARQUES = mapOf(
            "Renault" to listOf("Clio", "Symbol", "Duster", "Master", "Kangoo", "Captur"),
            "Peugeot" to listOf("208", "301", "2008", "Partner", "Boxer"),
            "Dacia" to listOf("Logan", "Sandero", "Duster", "Dokker"),
            "Hyundai" to listOf("Accent", "Tucson", "H-1", "Creta"),
            "Toyota" to listOf("Corolla", "Hilux", "Land Cruiser", "Hiace"),
            "Kia" to listOf("Picanto", "Rio", "Sportage", "K2500"),
            "Volkswagen" to listOf("Polo", "Caddy", "Transporter", "Amarok"),
            "Fiat" to listOf("500", "Doblo", "Ducato", "Tipo"),
            "Skoda" to listOf("Fabia", "Octavia", "Kodiaq"),
            "Nissan" to listOf("Micra", "Sunny", "Navara", "Patrol"),
            "Suzuki" to listOf("Swift", "Vitara", "Jimny"),
            "Chery" to listOf("Tiggo", "Arrizo", "QQ"),
            "Chevrolet" to listOf("Aveo", "Spark", "Niva"),
            "MAN" to listOf("TGS", "TGX", "TGL"),
            "Mercedes-Benz" to listOf("Actros", "Atego", "Sprinter"),
            "Volvo" to listOf("FH", "FM", "FMX"),
            "Scania" to listOf("R", "P", "G"),
            "Iveco" to listOf("Daily", "Stralis", "Eurocargo"),
            "Autre" to listOf("Autre modèle")
        )
        val CATEGORIES = listOf(
            "leger" to "Voiture", "lourd" to "Camion", "transport" to "Transport",
            "engin" to "Engin de chantier", "moto" to "Moto"
        )
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = if (vehicleId == 0) "＋ Nouveau véhicule" else "Gérer le véhicule"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)

        val spCat = Ui.liste(ctx, CATEGORIES.map { it.second })
        val spMarque = Ui.liste(ctx, MARQUES.keys.toList())
        val spModele = Ui.liste(ctx, emptyList())
        val etAnnee = Ui.champ(ctx, "Année", numeric = true)
        val spCouleur = Ui.liste(ctx, listOf("Chargement…"))
        val etCouleurLibre = Ui.champ(ctx, "Préciser la couleur").apply { visibility = View.GONE }
        val etImmat = Ui.champ(ctx, "Immatriculation*")
        val etVin = Ui.champ(ctx, "VIN (17)")
        val etSerial = Ui.champ(ctx, "N° série dispositif (vide = auto)")
        val etLong = Ui.champ(ctx, "Longueur (m)", numeric = true)
        val etLarg = Ui.champ(ctx, "Largeur (m)", numeric = true)
        val etHaut = Ui.champ(ctx, "Hauteur (m)", numeric = true)
        val etTel1 = Ui.champ(ctx, "Tél. principal")
        val etTel2 = Ui.champ(ctx, "Tél. secondaire")
        val etNomInt = Ui.champ(ctx, "Nom/code interne (entreprise)")
        val etService = Ui.champ(ctx, "Service / département")
        val etResp = Ui.champ(ctx, "Responsable")
        val btnSave = Ui.bouton(ctx, "Enregistrer")
        val btnDel = Ui.bouton(ctx, "Supprimer").apply { visibility = View.GONE }
        val btnCancel = Ui.bouton(ctx, "Annuler")
        listOf(spCat, spMarque, spModele, etAnnee, spCouleur, etCouleurLibre, etImmat, etVin, etSerial,
            etLong, etLarg, etHaut, etTel1, etTel2, etNomInt, etService, etResp, btnSave, btnDel, btnCancel
        ).forEach { box.addView(it) }

        fun remplirModeles(sel: String = "") {
            val modeles = MARQUES[spMarque.selectedItem?.toString()] ?: listOf("—")
            spModele.adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, modeles).apply {
                setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            }
            val i = modeles.indexOf(sel)
            if (i >= 0) spModele.setSelection(i)
        }
        spMarque.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) = remplirModeles()
            override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        }
        var couleursConnues = listOf("Blanc", "Noir", "Gris", "Rouge", "Bleu")
        fun remplirCouleurs(sel: String = "") {
            val connu = couleursConnues.contains(sel)
            val items = couleursConnues + "Autre (saisie libre)…"
            spCouleur.adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, items).apply {
                setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            }
            if (sel.isNotEmpty() && connu) spCouleur.setSelection(couleursConnues.indexOf(sel))
            else if (sel.isNotEmpty()) {
                spCouleur.setSelection(items.size - 1)
                etCouleurLibre.setText(sel)
            }
            etCouleurLibre.visibility = if (spCouleur.selectedItemPosition == items.size - 1) View.VISIBLE else View.GONE
        }
        spCouleur.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
                etCouleurLibre.visibility = if (pos == spCouleur.adapter.count - 1) View.VISIBLE else View.GONE
            }
            override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        }
        fun lireCouleur(): String {
            return if (spCouleur.selectedItemPosition == spCouleur.adapter.count - 1) etCouleurLibre.text.toString().trim()
            else spCouleur.selectedItem?.toString() ?: ""
        }
        fun remplir(v: OwnerVehicle) {
            val ci = CATEGORIES.indexOfFirst { it.first == v.categorieVehicule }.takeIf { it >= 0 } ?: 0
            spCat.setSelection(ci)
            val mi = MARQUES.keys.indexOf(v.marque).takeIf { it >= 0 } ?: MARQUES.size - 1
            spMarque.setSelection(mi)
            remplirModeles(v.modele ?: "")
            etAnnee.setText(v.annee?.toString() ?: "")
            remplirCouleurs(v.couleur ?: "")
            etImmat.setText(v.immatriculation ?: "")
            etVin.setText(v.vin ?: "")
            etSerial.setText(v.numeroSerie ?: "")
            etLong.setText(v.longueur?.toString() ?: "")
            etLarg.setText(v.largeur?.toString() ?: "")
            etHaut.setText(v.hauteur?.toString() ?: "")
            etTel1.setText(v.telPrincipal ?: "")
            etTel2.setText(v.telSecondaire ?: "")
            etNomInt.setText(v.nomInterne ?: "")
            etService.setText(v.service ?: "")
            etResp.setText(v.responsable ?: "")
        }

        remplirModeles()
        lifecycleScope.launch {
            when (val r = ApiHelper.run { ApiClient.service().couleurs() }) {
                is ApiResult.Ok -> if (r.v.couleurs.isNotEmpty()) couleursConnues = r.v.couleurs
                is ApiResult.Err -> {}
            }
            if (vehicleId != 0) {
                when (val rr = ApiHelper.run { ApiClient.service().ownerVehicles(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        val v = rr.v.vehicules.find { it.id == vehicleId }
                        if (v == null) tvErr.text = "Véhicule introuvable"
                        else {
                            remplir(v)
                            btnDel.visibility = View.VISIBLE
                        }
                    }
                    is ApiResult.Err -> tvErr.text = rr.msg
                }
            } else remplirCouleurs("")
        }

        btnCancel.setOnClickListener { parentFragmentManager.popBackStack() }
        btnSave.setOnClickListener {
            if (etImmat.text.isBlank()) {
                tvErr.text = "Immatriculation requise"
                return@setOnClickListener
            }
            fun num(e: EditText): Double? = e.text.toString().trim().replace(',', '.').toDoubleOrNull()
            fun txt(e: EditText): String? = e.text.toString().trim().ifBlank { null }
            val body = mutableMapOf<String, Any?>(
                "immatriculation" to etImmat.text.toString().trim(),
                "marque" to spMarque.selectedItem?.toString(),
                "modele" to spModele.selectedItem?.toString(),
                "couleur" to lireCouleur(),
                "categorieVehicule" to CATEGORIES[spCat.selectedItemPosition].first,
                "annee" to etAnnee.text.toString().toIntOrNull(),
                "vin" to txt(etVin),
                "longueur" to num(etLong),
                "largeur" to num(etLarg),
                "hauteur" to num(etHaut),
                "telPrincipal" to txt(etTel1),
                "telSecondaire" to txt(etTel2),
                "nomInterne" to txt(etNomInt),
                "service" to txt(etService),
                "responsable" to txt(etResp)
            )
            tvErr.text = "Enregistrement…"
            lifecycleScope.launch {
                val res = if (vehicleId != 0) {
                    body["id"] = vehicleId
                    ApiHelper.run { ApiClient.service().patchVehicle(session.authHeader, body) }
                } else {
                    txt(etSerial)?.let { body["numeroSerie"] = it }
                    when (val r = ApiHelper.run { ApiClient.service().addVehicle(session.authHeader, body) }) {
                        is ApiResult.Ok -> if (r.v.ok) ApiResult.Ok(dz.carfleet.abonne.api.OkResponse(true)) else ApiResult.Err(r.v.error ?: "Échec", 400)
                        is ApiResult.Err -> r
                    }
                }
                when (res) {
                    is ApiResult.Ok -> parentFragmentManager.popBackStack()
                    is ApiResult.Err -> tvErr.text = res.msg
                }
            }
        }
        btnDel.setOnClickListener {
            AlertDialog.Builder(ctx)
                .setTitle("Supprimer ce véhicule et tout son historique ?")
                .setPositiveButton("Supprimer") { _, _ ->
                    lifecycleScope.launch {
                        when (val r = ApiHelper.run { ApiClient.service().deleteVehicle(session.authHeader, vehicleId) }) {
                            is ApiResult.Ok -> parentFragmentManager.popBackStack()
                            is ApiResult.Err -> tvErr.text = r.msg
                        }
                    }
                }
                .setNegativeButton("Annuler", null)
                .show()
        }
    }
}
