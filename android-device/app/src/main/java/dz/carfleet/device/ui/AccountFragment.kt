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
        // Si connecté : masque login/inscription, affiche uniquement profil
        if (session.isLogged) {
            tvInfo.text = "Connecté : ${session.prenom} ${session.nom} (${session.username})"
            viewLogin.visibility = View.GONE
            viewRegister.visibility = View.GONE
            refreshProfile(view, session)
        } else {
            viewLogin.visibility = View.VISIBLE
            viewRegister.visibility = View.GONE
            view.findViewById<LinearLayout>(R.id.viewProfile).visibility = View.GONE
        }
        // Déconnexion : efface compte + véhicule + tracking
        view.findViewById<Button>(R.id.btnLogout).setOnClickListener {
            session.clearAccount()
            // clear véhicule aussi (optionnel mais propre)
            requireContext().getSharedPreferences("carfleet_device", android.content.Context.MODE_PRIVATE).edit().remove("carId").remove("serial").apply()
            tvInfo.text = ""
            view.findViewById<LinearLayout>(R.id.viewProfile).visibility = View.GONE
            viewLogin.visibility = View.VISIBLE
            viewRegister.visibility = View.GONE
            etUser.text.clear()
            etPass.text.clear()
            tvErr.text = ""
            view.findViewById<TextView>(R.id.tvErrReg).text = ""
            (activity as MainActivity).applyLock()
        }
        view.findViewById<Button>(R.id.btnEditProfile).setOnClickListener {
            val editBox: LinearLayout = view.findViewById(R.id.editProfile)
            if (editBox.visibility == View.GONE) {
                view.findViewById<EditText>(R.id.etNom2).setText(session.nom)
                view.findViewById<EditText>(R.id.etPrenom2).setText(session.prenom)
                view.findViewById<EditText>(R.id.etAge2).setText(if (session.age > 0) session.age.toString() else "")
                view.findViewById<EditText>(R.id.etTel2).setText(session.tel)
                editBox.visibility = View.VISIBLE
                (it as Button).text = "Enregistrer"
            } else {
                val nom = view.findViewById<EditText>(R.id.etNom2).text.toString().trim()
                val prenom = view.findViewById<EditText>(R.id.etPrenom2).text.toString().trim()
                val age = view.findViewById<EditText>(R.id.etAge2).text.toString().toIntOrNull() ?: 0
                val tel = view.findViewById<EditText>(R.id.etTel2).text.toString().trim()
                if (nom.isEmpty() || prenom.isEmpty() || age !in 16..100 || tel.isEmpty()) {
                    view.findViewById<TextView>(R.id.tvProfileErr).text = "Nom, prénom, âge (16-100), téléphone requis"
                    return@setOnClickListener
                }
                view.findViewById<TextView>(R.id.tvProfileErr).text = "Enregistrement…"
                ApiClient.init(session.baseUrl)
                lifecycleScope.launch {
                    try {
                        ApiClient.service().patchProfil(session.authHeader,
                            mapOf("nom" to nom, "prenom" to prenom, "age" to age, "telephone" to tel))
                        session.updateProfile(nom, prenom, age, tel)
                        editBox.visibility = View.GONE
                        (it as Button).text = "Modifier mon profil"
                        view.findViewById<TextView>(R.id.tvProfileErr).text = ""
                        refreshProfile(view, session)
                    } catch (e: Exception) {
                        view.findViewById<TextView>(R.id.tvProfileErr).text = "Échec : ${e.message}"
                    }
                }
            }
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
        val tvErrReg: TextView = view.findViewById(R.id.tvErrReg)
        spWilaya.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, Ref.WILAYAS).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        view.findViewById<Button>(R.id.btnRegister).setOnClickListener {
            val base = etUrl.text.toString().trim().trimEnd('/')
            val nom = etNom.text.toString().trim()
            val prenom = etPrenom.text.toString().trim()
            val age = etAge.text.toString().toIntOrNull() ?: 0
            if (etUser.text.isBlank() || etPass.text.length < 6 || nom.isEmpty() || prenom.isEmpty() || age !in 16..100 || etTel.text.isBlank()) {
                tvErrReg.text = "Nom, prénom, âge (16-100), téléphone, utilisateur + mot de passe (6+) requis"
                return@setOnClickListener
            }
            val wil = Ref.WILAYAS[spWilaya.selectedItemPosition]
            tvErrReg.text = "Inscription…"
            tvErr.text = ""
            ApiClient.init(base)
            lifecycleScope.launch {
                try {
                    val res = ApiClient.service().register(
                        RegisterRequest(etUser.text.toString().trim(), etPass.text.toString(), "physique", nom, prenom, age, etTel.text.toString().trim(), wil.substringAfter("- "), wil.substring(0, 2))
                    )
                    if (res.ok && res.token != null) {
                        session.saveAccount(base, res.token, etUser.text.toString().trim(), nom, prenom, age, etTel.text.toString().trim())
                        tvInfo.text = "Compte créé et connecté : $prenom $nom"
                        viewLogin.visibility = View.GONE
                        viewRegister.visibility = View.GONE
                        refreshProfile(view, session)
                        tvErrReg.text = ""
                        tvErr.text = ""
                        (activity as MainActivity).goStatus()
                    } else {
                        tvErrReg.text = res.error ?: "Échec"
                    }
                } catch (e: Exception) {
                    tvErrReg.text = "Serveur injoignable : ${e.message}"
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
                        viewLogin.visibility = View.GONE
                        viewRegister.visibility = View.GONE
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

    private fun refreshProfile(view: View, session: SessionManager) {
        view.findViewById<LinearLayout>(R.id.viewProfile).visibility =
            if (session.isLogged) View.VISIBLE else View.GONE
        val ageTxt = if (session.age > 0) ", ${session.age} ans" else ""
        view.findViewById<TextView>(R.id.tvProfile).text =
            "${session.prenom} ${session.nom}${ageTxt}\n${session.tel}"
    }
}
