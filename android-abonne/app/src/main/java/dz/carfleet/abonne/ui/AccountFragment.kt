package dz.carfleet.abonne.ui

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
import dz.carfleet.abonne.api.Forfait
import dz.carfleet.abonne.api.LoginRequest
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch

// Compte : mode Abonné/Admin + connexion + inscription abonné.
class AccountFragment : Fragment() {
    private var forfaits: List<Forfait> = emptyList()

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
        val btnLogin: Button = view.findViewById(R.id.btnLogin)
        etUrl.setText(session.baseUrl)

        val ctx = requireContext()
        val spMode = Spinner(ctx).apply {
            adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, listOf("Abonné", "Administrateur")).apply {
                setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            }
        }
        val etCode = Ui.champ(ctx, "Code 2FA (si activé)").apply { visibility = View.GONE }
        viewLogin.addView(spMode, 0)
        viewLogin.addView(etCode, 4)

        // ---- Inscription (abonné) ----
        val btnToggleRegister = Ui.bouton(ctx, "Créer un compte").apply { visibility = View.GONE }
        val boxRegister = Ui.box(ctx).apply { visibility = View.GONE }
        spMode.setSelection(0)
        spMode.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
                etCode.visibility = if (pos == 1) View.VISIBLE else View.GONE
                btnToggleRegister.visibility = if (pos == 0 && !session.isLogged) View.VISIBLE else View.GONE
                if (pos == 1) boxRegister.visibility = View.GONE
            }
            override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        }
        val spType = Ui.liste(ctx, listOf("Particulier", "Entreprise"))
        val etRUser = Ui.champ(ctx, "Utilisateur")
        val etRPass = Ui.champ(ctx, "Mot de passe (6+)", password = true)
        val etNom = Ui.champ(ctx, "Nom")
        val etPrenom = Ui.champ(ctx, "Prénom")
        val etTel = Ui.champ(ctx, "Téléphone")
        val etWilaya = Ui.champ(ctx, "Wilaya")
        val etAdresse = Ui.champ(ctx, "Adresse (particulier)")
        val etRaison = Ui.champ(ctx, "Raison sociale*").apply { visibility = View.GONE }
        val etEmail = Ui.champ(ctx, "Email").apply { visibility = View.GONE }
        val spPlan = Ui.liste(ctx, listOf("— Choisir plus tard —"))
        val spMethode = Ui.liste(ctx, listOf("Virement bancaire", "Espèces", "Autre"))
        val btnRegister = Ui.bouton(ctx, "Créer mon compte")
        boxRegister.addView(Ui.texte(ctx, "Inscription", 16f))
        boxRegister.addView(spType)
        boxRegister.addView(etRUser)
        boxRegister.addView(etRPass)
        boxRegister.addView(etNom)
        boxRegister.addView(etPrenom)
        boxRegister.addView(etTel)
        boxRegister.addView(etWilaya)
        boxRegister.addView(etAdresse)
        boxRegister.addView(etRaison)
        boxRegister.addView(etEmail)
        boxRegister.addView(spPlan)
        boxRegister.addView(spMethode)
        boxRegister.addView(btnRegister)
        viewLogin.addView(btnToggleRegister)
        viewLogin.addView(boxRegister)

        fun refreshPlans() {
            val ent = spType.selectedItemPosition == 1
            etRaison.visibility = if (ent) View.VISIBLE else View.GONE
            etEmail.visibility = if (ent) View.VISIBLE else View.GONE
            etAdresse.visibility = if (ent) View.GONE else View.VISIBLE
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().plans(if (ent) "entreprise" else "particulier") }) {
                    is ApiResult.Ok -> {
                        forfaits = r.v.forfaits
                        val items = mutableListOf("— Choisir plus tard —")
                        items.addAll(forfaits.map { "${it.nom} — ${it.prix} ${it.devise} (${it.duree})" })
                        spPlan.adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, items).apply {
                            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                        }
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        spType.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) = refreshPlans()
            override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
        }
        btnToggleRegister.setOnClickListener {
            val show = boxRegister.visibility != View.VISIBLE
            boxRegister.visibility = if (show) View.VISIBLE else View.GONE
            if (show) refreshPlans()
        }
        btnRegister.setOnClickListener {
            val ent = spType.selectedItemPosition == 1
            val methodes = listOf("virement", "especes", "autre")
            val body = mutableMapOf<String, Any?>(
                "username" to etRUser.text.toString().trim(),
                "password" to etRPass.text.toString(),
                "typeCompte" to if (ent) "entreprise" else "particulier",
                "telephone" to etTel.text.toString().trim(),
                "wilaya" to etWilaya.text.toString().trim(),
                "methodePaiement" to methodes[spMethode.selectedItemPosition]
            )
            if (ent) {
                body["raisonSociale"] = etRaison.text.toString().trim()
                body["nom"] = etNom.text.toString().trim()
                body["prenom"] = etPrenom.text.toString().trim()
                body["email"] = etEmail.text.toString().trim()
            } else {
                body["nom"] = etNom.text.toString().trim()
                body["prenom"] = etPrenom.text.toString().trim()
                body["adresse"] = etAdresse.text.toString().trim()
            }
            if (spPlan.selectedItemPosition > 0) body["planId"] = forfaits[spPlan.selectedItemPosition - 1].id
            tvErr.text = "Création…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().register(body) }) {
                    is ApiResult.Ok -> {
                        val res = r.v
                        if (res.ok && res.token != null) {
                            val p = res.proprietaire
                            val nom = p?.raisonSociale
                                ?: listOfNotNull(p?.prenom, p?.nom).joinToString(" ").ifBlank { etRUser.text.toString().trim() }
                            session.saveAccount(etUrl.text.toString().trim().trimEnd('/'), res.token, etRUser.text.toString().trim(), nom)
                            tvInfo.text = "Compte créé : inscription reçue."
                            viewLogin.visibility = View.GONE
                            btnLogout.visibility = View.VISIBLE
                            tvErr.text = ""
                            (activity as MainActivity).goVehicles()
                        } else tvErr.text = res.error ?: "Échec"
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }

        // ---- État connecté ----
        if (session.isLogged || session.isAdmin) {
            tvInfo.text = "Connecté : ${session.displayName} (${session.username})"
            viewLogin.visibility = View.GONE
            btnLogout.visibility = View.VISIBLE
        } else {
            viewLogin.visibility = View.VISIBLE
            btnLogout.visibility = View.GONE
            btnToggleRegister.visibility = View.VISIBLE
        }
        btnLogout.setOnClickListener {
            session.clearAccount()
            tvInfo.text = ""
            viewLogin.visibility = View.VISIBLE
            btnLogout.visibility = View.GONE
            btnToggleRegister.visibility = if (spMode.selectedItemPosition == 0) View.VISIBLE else View.GONE
            etPass.text.clear()
            tvErr.text = ""
            (activity as MainActivity).applyLock()
        }
        btnLogin.setOnClickListener {
            val base = etUrl.text.toString().trim().trimEnd('/')
            if (etUser.text.isBlank() || etPass.text.isEmpty()) {
                tvErr.text = "Utilisateur + mot de passe requis"
                return@setOnClickListener
            }
            tvErr.text = "Connexion…"
            ApiClient.init(base)
            val admin = spMode.selectedItemPosition == 1
            lifecycleScope.launch {
                if (admin) {
                    when (val r = ApiHelper.run {
                        ApiClient.service().adminLogin(
                            mapOf(
                                "username" to etUser.text.toString().trim(),
                                "password" to etPass.text.toString(),
                                "code" to etCode.text.toString().trim()
                            )
                        )
                    }) {
                        is ApiResult.Ok -> {
                            val res = r.v
                            if (res.ok && res.token != null) {
                                session.saveAdmin(base, res.token, etUser.text.toString().trim(), res.role ?: "admin")
                                tvErr.text = ""
                                (activity as MainActivity).openAdminHome()
                            } else tvErr.text = res.error ?: "Échec"
                        }
                        is ApiResult.Err -> tvErr.text = r.msg
                    }
                } else {
                    when (val r = ApiHelper.run { ApiClient.service().login(LoginRequest(etUser.text.toString().trim(), etPass.text.toString())) }) {
                        is ApiResult.Ok -> {
                            val res = r.v
                            if (res.ok && res.token != null) {
                                val p = res.proprietaire
                                val nom = p?.raisonSociale
                                    ?: listOfNotNull(p?.prenom, p?.nom).joinToString(" ").ifBlank { etUser.text.toString().trim() }
                                session.saveAccount(base, res.token, etUser.text.toString().trim(), nom)
                                tvInfo.text = "Connecté : $nom"
                                viewLogin.visibility = View.GONE
                                btnLogout.visibility = View.VISIBLE
                                tvErr.text = if (res.actif) "" else "⚠️ Compte non activé : finalisez l'abonnement."
                                (activity as MainActivity).goVehicles()
                            } else tvErr.text = res.error ?: "Échec"
                        }
                        is ApiResult.Err -> tvErr.text = r.msg
                    }
                }
            }
        }
    }
}
