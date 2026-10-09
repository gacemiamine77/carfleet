package dz.sr.units.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import com.google.gson.Gson
import dz.sr.units.R
import dz.sr.units.api.ApiClient
import dz.sr.units.api.LoginRequest
import dz.sr.units.api.LoginResponse
import dz.sr.units.data.SessionManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import retrofit2.Response

class LoginFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_login, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val etUrl = view.findViewById<EditText>(R.id.etUrl)
        val etUser = view.findViewById<EditText>(R.id.etUser)
        val etPass = view.findViewById<EditText>(R.id.etPass)
        val btn = view.findViewById<Button>(R.id.btnLogin)
        val err = view.findViewById<TextView>(R.id.tvError)
        val session = SessionManager.get(requireContext())
        etUrl.setText(session.baseUrl)

        btn.setOnClickListener {
            val base = etUrl.text.toString().trim().trimEnd('/')
            val user = etUser.text.toString().trim()
            val pass = etPass.text.toString()
            if (base.toHttpUrlOrNull() == null) { err.text = "URL invalide (ex. https://serveur:3000)"; return@setOnClickListener }
            if (user.isEmpty() || pass.isEmpty()) { err.text = "Nom d'utilisateur + mot de passe requis"; return@setOnClickListener }
            btn.isEnabled = false
            err.text = "Connexion…"
            ApiClient.init(base)
            viewLifecycleOwner.lifecycleScope.launch {
                try {
                    val resp = ApiClient.service().login(LoginRequest(user, pass))
                    val body = resp.body()
                    if (resp.isSuccessful && body?.ok == true && body.token != null && body.unite != null) {
                        vm.logout()   // repart d'un état vierge (aucun cache d'une autre unité)
                        session.save(base, body.token, body.unite, body.expiresAt)
                        (activity as? MainActivity)?.showApp()
                    } else {
                        err.text = body?.error ?: errorMessage(resp)
                            ?: if (resp.code() == 401) "Identifiants incorrects" else "Erreur serveur (${resp.code()})"
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    err.text = if (e.message?.contains("CLEARTEXT", ignoreCase = true) == true)
                        "Connexion HTTP non autorisée : utilisez HTTPS (ou déclarez l'hôte dans network_security_config.xml)"
                    else "Serveur injoignable (${e.javaClass.simpleName})"
                }
                btn.isEnabled = true
            }
        }
    }

    private fun errorMessage(resp: Response<LoginResponse>): String? = try {
        Gson().fromJson(resp.errorBody()?.string(), LoginResponse::class.java)?.error
    } catch (_: Exception) { null }
}
