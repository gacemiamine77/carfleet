package dz.carfleet.device.ui

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
import dz.carfleet.device.api.AddDriverRequest
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.api.OwnedVehicle
import dz.carfleet.device.data.SessionManager
import kotlinx.coroutines.launch

// Chauffeur : fiche (si désigné) + édition, sinon désignation. Listes fermées.
class DriverFragment : Fragment() {
    private var vehicules: List<OwnedVehicle> = emptyList()
    private var editing = false

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_driver, container, false)
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
                vehicules = res.vehicules
                if (vehicules.isEmpty()) {
                    view.findViewById<TextView>(R.id.tvErr).text = "Ajoute d'abord un véhicule (onglet Véhicule)"
                    return@launch
                }
                val ch = vehicules[0].chauffeur
                if (ch != null) showFiche(view, session) else showForm(view, session)
            } catch (e: Exception) {
                view.findViewById<TextView>(R.id.tvErr).text = "Serveur injoignable : ${e.message}"
            }
        }
    }

    private fun wilayaAdapter(): ArrayAdapter<String> =
        ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, Ref.WILAYAS).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

    private fun showFiche(view: View, session: SessionManager) {
        val ch = vehicules[0].chauffeur ?: return
        view.findViewById<LinearLayout>(R.id.formCh).visibility = View.GONE
        view.findViewById<LinearLayout>(R.id.ficheCh).visibility = View.VISIBLE
        majFiche(view)
        view.findViewById<Spinner>(R.id.spWilaya2).adapter = wilayaAdapter()
        view.findViewById<Button>(R.id.btnEditCh).setOnClickListener {
            if (!editing) {
                editing = true
                view.findViewById<LinearLayout>(R.id.editCh).visibility = View.VISIBLE
                view.findViewById<EditText>(R.id.etNom2).setText(ch.nom)
                view.findViewById<EditText>(R.id.etPrenom2).setText(ch.prenom)
                view.findViewById<EditText>(R.id.etTel2).setText(ch.telephone)
                view.findViewById<EditText>(R.id.etPermis2).setText(ch.numeroPermis)
                (it as Button).text = "Enregistrer"
            } else {
                val nom = view.findViewById<EditText>(R.id.etNom2).text.toString().trim()
                val prenom = view.findViewById<EditText>(R.id.etPrenom2).text.toString().trim()
                val tel = view.findViewById<EditText>(R.id.etTel2).text.toString().trim()
                if (nom.isEmpty() || prenom.isEmpty() || tel.isEmpty()) {
                    view.findViewById<TextView>(R.id.tvErr).text = "Nom, prénom, téléphone requis"
                    return@setOnClickListener
                }
                view.findViewById<TextView>(R.id.tvErr).text = "Enregistrement…"
                val spWilaya2: Spinner = view.findViewById(R.id.spWilaya2)
                if (spWilaya2.adapter == null) spWilaya2.adapter = wilayaAdapter()
                lifecycleScope.launch {
                    try {
                        val wil2 = Ref.WILAYAS[spWilaya2.selectedItemPosition]
                        ApiClient.service().patchDriver(session.authHeader, mapOf(
                            "nom" to nom, "prenom" to prenom, "telephone" to tel,
                            "numeroPermis" to view.findViewById<EditText>(R.id.etPermis2).text.toString().trim().ifBlank { null },
                            "wilaya" to wil2.substringAfter("- ")
                        ))
                        editing = false
                        view.findViewById<LinearLayout>(R.id.editCh).visibility = View.GONE
                        view.findViewById<Button>(R.id.btnEditCh).text = "Modifier"
                        view.findViewById<TextView>(R.id.tvErr).text = ""
                        val res = ApiClient.service().myVehicles(session.authHeader)
                        vehicules = res.vehicules
                        majFiche(view)
                    } catch (e: Exception) {
                        view.findViewById<TextView>(R.id.tvErr).text = "Échec : ${e.message}"
                    }
                }
            }
        }
    }

    private fun majFiche(view: View) {
        val ch = vehicules[0].chauffeur
        view.findViewById<TextView>(R.id.tvFiche).text =
            "🧑‍✈️ ${ch?.prenom} ${ch?.nom}\n📱 ${ch?.telephone ?: "—"}\n🪪 Permis : ${ch?.numeroPermis ?: "—"}"
    }

    private fun showForm(view: View, session: SessionManager) {
        view.findViewById<LinearLayout>(R.id.ficheCh).visibility = View.GONE
        view.findViewById<LinearLayout>(R.id.formCh).visibility = View.VISIBLE
        view.findViewById<Spinner>(R.id.spWilaya).adapter = wilayaAdapter()
        view.findViewById<Button>(R.id.btnAdd).setOnClickListener {
            val etNom: EditText = view.findViewById(R.id.etNom)
            val etPrenom: EditText = view.findViewById(R.id.etPrenom)
            val etTel: EditText = view.findViewById(R.id.etTel)
            val etPermis: EditText = view.findViewById(R.id.etPermis)
            val spWilaya: Spinner = view.findViewById(R.id.spWilaya)
            val nom = etNom.text.toString().trim()
            val prenom = etPrenom.text.toString().trim()
            val tel = etTel.text.toString().trim()
            if (nom.isEmpty() || prenom.isEmpty() || tel.isEmpty()) {
                view.findViewById<TextView>(R.id.tvErr).text = "Nom, prénom et téléphone requis"
                return@setOnClickListener
            }
            val wil = Ref.WILAYAS[spWilaya.selectedItemPosition]
            lifecycleScope.launch {
                try {
                    ApiClient.service().addDriver(
                        session.authHeader,
                        AddDriverRequest(vehicules[0].id, nom, prenom, tel,
                            etPermis.text.toString().trim().ifBlank { null },
                            wil.substringAfter("- "))
                    )
                    view.findViewById<TextView>(R.id.tvErr).text = ""
                    Toast.makeText(context, "$prenom $nom désigné", Toast.LENGTH_LONG).show()
                    val res = ApiClient.service().myVehicles(session.authHeader)
                    vehicules = res.vehicules
                    showFiche(view, session)
                } catch (e: Exception) {
                    view.findViewById<TextView>(R.id.tvErr).text = "Échec : ${e.message}"
                }
            }
        }
    }
}
