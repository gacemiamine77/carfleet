package dz.carfleet.abonne.ui.admin

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Journal d'audit.
class AdminAuditFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "📜 Journal d'audit"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        tvErr.text = "Chargement…"
        lifecycleScope.launch {
            when (val r = ApiHelper.run { ApiClient.service().adminAudit(session.authHeader) }) {
                is ApiResult.Ok -> {
                    tvErr.text = ""
                    if (r.v.journal.isEmpty()) box.addView(Ui.texte(ctx, "Vide."))
                    for (a in r.v.journal) {
                        box.addView(Ui.texte(ctx, "• ${a.action ?: ""} par ${a.admin ?: "?"} — ${a.cibleType ?: ""} ${a.cibleId ?: ""}\n${a.createdAt?.take(16)?.replace('T', ' ') ?: ""}", 13f))
                    }
                }
                is ApiResult.Err -> tvErr.text = r.msg
            }
        }
    }
}
