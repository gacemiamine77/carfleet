package dz.carfleet.device.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.device.R
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.api.LoginRequest
import dz.carfleet.device.api.RegisterRequest
import dz.carfleet.device.data.SessionManager
import kotlinx.coroutines.launch

// Compte : fiche CONNEXION (username + password + bouton inscription),
// bouton inscription → fiche INSCRIPTION (infos propriétaire).
class AccountFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_account, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        val viewLogin: LinearLayout = view.findViewById(R.id.viewLogin)
        val viewRegister: LinearLayout = view.findViewById(R.id.viewRegister)
        val etUrl: EditText = view.findViewById(R.id.etUrl)
        val etUser: EditText = view.findViewById(R.id.etUser)
        val etPass: EditText = view.findViewById(R.id.etPass)
        val tvInfo: TextView = view.findViewById(R.id.tvInfo)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        etUrl.setText(session.baseUrl)
        if (session.isLogged) {
            tvInfo.text = "Connecté : ${session.prenom} ${session.nom} (${session.username})"
            refreshProfile(view, session)
        }
        view.findViewById<Button>(R.id.btnToRegister).setOnClickListener {
            // Pré-remplit l'URL pour la fiche inscription
            viewLogin.visibility = View.GONE
            viewRegister.visibility = View.VISIBLE
        }
        view.findViewById<Button>(R.id.btnBack).setOnClickListener {
            viewRegister.visibility = View.GONE
            viewLogin.visibility = View.VISIBLE
        }

        // --- Fiche inscription ---
        val etNom: EditText = view.findViewById(R.id.etNom)
        val etPrenom: EditText = view.findViewById(R.id.etPrenom)
        val etAge: EditText = view.findViewById(R.id.etAge)
        val etTel: EditText = view.findViewById(R.id.etTel)
        val spWilaya: Spinner = view.findViewById(R.id.spWilaya)
        spWilaya.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, Ref.WILAYAS).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        view.findViewById<Button>(R.id.btnRegister).setOnClickListener {
            val base = etUrl.text.toString().trim().trimEnd('/')
            val nom = etNom.text.toString().trim()
            val prenom = etPrenom.text.toString().trim()
            val age = etAge.text.toString().toIntOrNull() ?: 0
            if (etUser.text.isBlank() || etPass.text.length < 6 || nom.isEmpty() || prenom.isEmpty() || age !in 16..100 || etTel.text.isBlank()) {
                tvErr.text = "Nom, prénom, âge (16-100), téléphone, utilisateur + mot de passe (6+) requis"
                return@setOnClickListener
            }
            val wil = Ref.WILAYAS[spWilaya.selectedItemPosition]
            tvErr.text = "Inscription…"
            ApiClient.init(base)
            lifecycleScope.launch {
                try {
                    val res = ApiClient.service().register(
                        RegisterRequest(etUser.text.toString().trim(), etPass.text.toString(), "physique", nom, prenom, age, etTel.text.toString().trim(), wil.substringAfter("- "), wil.substring(0, 2))
                    )
                    if (res.ok && res.token != null) {
                        session.saveAccount(base, res.token, etUser.text.toString().trim(), nom, prenom, age, etTel.text.toString().trim())
                        tvInfo.text = "Compte créé et connecté : $prenom $nom"
                        refreshProfile(view, session)
                        tvErr.text = ""
                        viewRegister.visibility = View.GONE
                        viewLogin.visibility = View.VISIBLE
                        (activity as MainActivity).goStatus()
                    } else {
                        tvErr.text = res.error ?: "Échec"
                    }
                } catch (e: Exception) {
                    tvErr.text = "Serveur injoignable : ${e.message}"
                }
            }
        }

        // --- Fiche connexion ---
        view.findViewById<Button>(R.id.btnLogin).setOnClickListener {
            val base = etUrl.text.toString().trim().trimEnd('/')
            tvErr.text = "Connexion…"
            ApiClient.init(base)
            lifecycleScope.launch {
                try {
                    val res = ApiClient.service().login(LoginRequest(etUser.text.toString().trim(), etPass.text.toString()))
                    if (res.ok && res.token != null) {
                        val p = res.proprietaire
                        session.saveAccount(base, res.token, etUser.text.toString().trim(), p?.nom ?: "", p?.prenom ?: "", p?.age ?: 0, p?.telephone ?: "")
                        tvInfo.text = "Connecté"
                        refreshProfile(view, session)
                        tvErr.text = ""
                        (activity as MainActivity).goStatus()
                    } else {
                        tvErr.text = res.error ?: "Échec"
                    }
                } catch (e: Exception) {
                    tvErr.text = "Serveur injoignable : ${e.message}"
                }
            }
        }
    }
}
