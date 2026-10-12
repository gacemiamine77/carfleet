package dz.carfleet.abonne.ui.admin

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
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.MainActivity
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Accueil admin : menu de pilotage + pastille vols non vus.
class AdminHomeFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "🛠️ Pilotage — ${session.username} (${session.role})"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val act = activity as MainActivity

        val btnVols = Ui.bouton(ctx, "🚨 Vols")
        val entrees = listOf(
            "📊 Indicateurs" to { act.open(AdminStatsFragment()) },
            "👥 Comptes" to { act.open(AdminComptesFragment()) },
            "📦 Forfaits" to { act.open(AdminForfaitsFragment()) },
            "💳 Paiements" to { act.open(AdminPaiementsFragment()) },
            "🗺️ Carte" to { act.open(AdminMapFragment()) },
            "📜 Journal" to { act.open(AdminAuditFragment()) },
            "🔑 Admins (superadmin)" to { act.open(AdminAdminsFragment()) },
            "⚙️ Réglages" to { act.open(AdminSettingsFragment()) }
        )
        for ((label, go) in entrees.subList(0, 4)) {
            box.addView(Ui.bouton(ctx, label).apply { setOnClickListener { go() } })
        }
        btnVols.setOnClickListener { act.open(AdminVolsFragment()) }
        box.addView(btnVols)
        for ((label, go) in entrees.subList(4, entrees.size)) {
            box.addView(Ui.bouton(ctx, label).apply { setOnClickListener { go() } })
        }
        box.addView(Ui.bouton(ctx, "Déconnexion").apply {
            setOnClickListener {
                lifecycleScope.launch {
                    try { ApiClient.service().adminLogout(session.authHeader) } catch (_: Exception) {}
                    session.clearAccount()
                    act.applyLock()
                }
            }
        })
        lifecycleScope.launch {
            when (val r = ApiHelper.run { ApiClient.service().adminVols(session.authHeader) }) {
                is ApiResult.Ok -> {
                    val n = r.v.vols.count { !it.vuParAdmin }
                    if (n > 0) btnVols.text = "🚨 Vols ($n)"
                }
                is ApiResult.Err -> tvErr.text = r.msg
            }
        }
    }
}
