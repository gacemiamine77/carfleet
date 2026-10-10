package dz.carfleet.abonne.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.LoginRequest
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch

// Compte abonné : URL plateforme flotte + username/password.
class AccountFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_account, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        val viewLogin: LinearLayout = view.findViewById(R.id.viewLogin)
        val etUrl: EditText = view.findViewById(R.id.etUrl)
        val etUser: EditText = view.findViewById(R.id.etUser)
        val etPass: EditText = view.findViewById(R.id.etPass)
        val tvInfo: TextView = view.findViewById(R.id.tvInfo)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val btnLogout: Button = view.findViewById(R.id.btnLogout)
        etUrl.setText(session.baseUrl)
        if (session.isLogged) {
            tvInfo.text = "Connecté : ${session.displayName} (${session.username})"
            viewLogin.visibility = View.GONE
            btnLogout.visibility = View.VISIBLE
        } else {
            viewLogin.visibility = View.VISIBLE
            btnLogout.visibility = View.GONE
        }
        btnLogout.setOnClickListener {
            session.clearAccount()
            tvInfo.text = ""
            viewLogin.visibility = View.VISIBLE
            btnLogout.visibility = View.GONE
            etPass.text.clear()
            tvErr.text = ""
            (activity as MainActivity).applyLock()
        }
        view.findViewById<Button>(R.id.btnLogin).setOnClickListener {
            val base = etUrl.text.toString().trim().trimEnd('/')
            if (etUser.text.isBlank() || etPass.text.isEmpty()) {
                tvErr.text = "Utilisateur + mot de passe requis"
                return@setOnClickListener
            }
            tvErr.text = "Connexion…"
            ApiClient.init(base)
            lifecycleScope.launch {
                try {
                    val res = ApiClient.service().login(LoginRequest(etUser.text.toString().trim(), etPass.text.toString()))
                    if (res.ok && res.token != null) {
                        val p = res.proprietaire
                        val nom = p?.raisonSociale
                            ?: listOfNotNull(p?.prenom, p?.nom).joinToString(" ").ifBlank { etUser.text.toString().trim() }
                        session.saveAccount(base, res.token, etUser.text.toString().trim(), nom)
                        tvInfo.text = "Connecté : $nom"
                        viewLogin.visibility = View.GONE
                        btnLogout.visibility = View.VISIBLE
                        tvErr.text = if (res.actif) "" else "⚠️ Compte non activé : finalisez l'abonnement sur la plateforme."
                        (activity as MainActivity).goVehicles()
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
