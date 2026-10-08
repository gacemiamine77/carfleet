package dz.carfleet.device.ui

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
import dz.carfleet.device.api.AddDriverRequest
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.api.OwnedVehicle
import dz.carfleet.device.data.SessionManager
import kotlinx.coroutines.launch

// Chauffeur : choisi le véhicule (liste) puis désigne (listes fermées pour la wilaya)
class DriverFragment : Fragment() {
    private var vehicules: List<OwnedVehicle> = emptyList()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_driver, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        val spVeh: Spinner = view.findViewById(R.id.spVeh)
        val etNom: EditText = view.findViewById(R.id.etNom)
        val etPrenom: EditText = view.findViewById(R.id.etPrenom)
        val etTel: EditText = view.findViewById(R.id.etTel)
        val etPermis: EditText = view.findViewById(R.id.etPermis)
        val spWilaya: Spinner = view.findViewById(R.id.spWilaya)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        spWilaya.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, Ref.WILAYAS).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

        fun chargerVehicules() {
            if (!session.isLogged) {
                tvErr.text = "Connecte-toi d'abord (onglet Compte)"
                return
            }
            ApiClient.init(session.baseUrl)
            lifecycleScope.launch {
                try {
                    val res = ApiClient.service().myVehicles(session.authHeader)
                    vehicules = res.vehicules
                    // Règle 1 chauffeur : déjà désigné → formulaire verrouillé
                    val ch = vehicules.firstOrNull()?.chauffeur
                    if (ch != null) {
                        tvErr.text = "Chauffeur déjà désigné : ${ch.prenom} ${ch.nom} (un seul par dispositif)"
                        view.findViewById<Button>(R.id.btnAdd).isEnabled = false
                    }
                    spVeh.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item,
                        vehicules.map { "${it.immatriculation} — ${it.marque ?: ""} ${it.modele ?: ""}".trim() }).apply {
                        setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                    }
                    if (vehicules.isEmpty()) tvErr.text = "Aucun véhicule — ajoute-le d'abord (onglet Véhicule)"
                } catch (e: Exception) {
                    tvErr.text = "Serveur injoignable : ${e.message}"
                }
            }
        }
        chargerVehicules()

        view.findViewById<Button>(R.id.btnAdd).setOnClickListener {
            if (vehicules.isEmpty()) {
                tvErr.text = "Aucun véhicule à affecter"
                return@setOnClickListener
            }
            val v = vehicules[spVeh.selectedItemPosition]
            val nom = etNom.text.toString().trim()
            val prenom = etPrenom.text.toString().trim()
            val tel = etTel.text.toString().trim()
            if (nom.isEmpty() || prenom.isEmpty() || tel.isEmpty()) {
                tvErr.text = "Nom, prénom et téléphone requis"
                return@setOnClickListener
            }
            val wil = Ref.WILAYAS[spWilaya.selectedItemPosition]
            tvErr.text = "Désignation…"
            lifecycleScope.launch {
                try {
                    ApiClient.service().addDriver(
                        session.authHeader,
                        AddDriverRequest(v.id, nom, prenom, tel,
                            etPermis.text.toString().trim().ifBlank { null },
                            wil.substringAfter("- "))
                    )
                    tvErr.text = ""
                    Toast.makeText(context, "$prenom $nom désigné sur ${v.immatriculation}", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    tvErr.text = "Échec : ${e.message}"
                }
            }
        }
    }
}
