package dz.carfleet.abonne.ui.admin

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.AdminUser
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Administrateurs (superadmin) : liste, création, rôle, activation, reset MDP.
class AdminAdminsFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "🔑 Administrateurs (superadmin)"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val liste = Ui.box(ctx)
        val etUser = Ui.champ(ctx, "Utilisateur")
        val etPass = Ui.champ(ctx, "Mot de passe (10+)", password = true)
        val spRole = Ui.liste(ctx, listOf("admin", "superadmin"))
        val btnCreer = Ui.bouton(ctx, "Créer")
        box.addView(Ui.titre(ctx, "Liste", 16f))
        box.addView(liste)
        box.addView(Ui.titre(ctx, "Nouvel administrateur", 16f))
        box.addView(etUser)
        box.addView(etPass)
        box.addView(spRole)
        box.addView(btnCreer)

        fun charger() {
            tvErr.text = "Chargement…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().adminAdmins(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        tvErr.text = ""
                        liste.removeAllViews()
                        for (a in r.v.admins) liste.addView(ligne(a, tvErr, { charger() }))
                    }
                    is ApiResult.Err -> tvErr.text = "${r.msg} (réservé superadmin ?)"
                }
            }
        }
        btnCreer.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().adminCreerAdmin(
                        session.authHeader,
                        mapOf(
                            "username" to etUser.text.toString().trim(),
                            "password" to etPass.text.toString(),
                            "role" to if (spRole.selectedItemPosition == 1) "superadmin" else "admin"
                        )
                    )
                }) {
                    is ApiResult.Ok -> {
                        etUser.text.clear()
                        etPass.text.clear()
                        tvErr.text = "Administrateur créé."
                        charger()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        charger()
    }

    private fun ligne(a: AdminUser, tvErr: TextView, recharge: () -> Unit): View {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        val card = Ui.carte(ctx, "👤 ${a.username ?: ""}")
        card.addView(Ui.texte(ctx, "${a.role} · ${if (a.actif) "actif" else "inactif"} · créé le ${a.createdAt?.take(10) ?: ""}", 13f))
        val row = Ui.row(ctx)
        row.addView(Button(ctx).apply {
            text = if (a.role == "superadmin") "→ admin" else "→ superadmin"
            setOnClickListener {
                viewLifecycleOwner.lifecycleScope.launch {
                    when (val r = ApiHelper.run {
                        ApiClient.service().adminGererAdmin(
                            session.authHeader,
                            mapOf("id" to a.id, "role" to if (a.role == "superadmin") "admin" else "superadmin")
                        )
                    }) {
                        is ApiResult.Ok -> {
                            tvErr.text = "Rôle mis à jour."
                            recharge()
                        }
                        is ApiResult.Err -> tvErr.text = r.msg
                    }
                }
            }
        })
        row.addView(Button(ctx).apply {
            text = if (a.actif) "Désactiver" else "Activer"
            setOnClickListener {
                viewLifecycleOwner.lifecycleScope.launch {
                    when (val r = ApiHelper.run {
                        ApiClient.service().adminGererAdmin(session.authHeader, mapOf("id" to a.id, "actif" to !a.actif))
                    }) {
                        is ApiResult.Ok -> {
                            tvErr.text = "Statut mis à jour."
                            recharge()
                        }
                        is ApiResult.Err -> tvErr.text = r.msg
                    }
                }
            }
        })
        row.addView(Button(ctx).apply {
            text = "Nouv. MDP"
            setOnClickListener {
                val et = Ui.champ(ctx, "Nouveau mot de passe (10+)")
                AlertDialog.Builder(ctx).setTitle("Redéfinir le mot de passe").setView(et)
                    .setPositiveButton("OK") { _, _ ->
                        viewLifecycleOwner.lifecycleScope.launch {
                            when (val r = ApiHelper.run {
                                ApiClient.service().adminGererAdmin(session.authHeader, mapOf("id" to a.id, "password" to et.text.toString()))
                            }) {
                                is ApiResult.Ok -> {
                                    tvErr.text = "Mot de passe redéfini."
                                    recharge()
                                }
                                is ApiResult.Err -> tvErr.text = r.msg
                            }
                        }
                    }
                    .setNegativeButton("Annuler", null).show()
            }
        })
        card.addView(row)
        return card
    }
}
