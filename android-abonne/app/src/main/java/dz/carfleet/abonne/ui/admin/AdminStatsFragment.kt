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
import java.text.NumberFormat
import java.util.Locale

// Indicateurs : cartes KPI + maintenance expirations.
class AdminStatsFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "📊 Indicateurs"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val btnExpire = Ui.bouton(ctx, "Figer les abonnements expirés")
        box.addView(btnExpire)

        fun charger() {
            tvErr.text = "Chargement…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().adminStats(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        tvErr.text = ""
                        val c = r.v.comptes
                        val a = r.v.abonnements
                        val total = (c?.particuliers ?: 0) + (c?.entreprises ?: 0)
                        val recettes = NumberFormat.getInstance(Locale.FRANCE).format(r.v.recettesConfirmees)
                        box.removeAllViews()
                        val cartes = listOf(
                            "Comptes : $total" to "${c?.particuliers ?: 0} particuliers · ${c?.entreprises ?: 0} entreprises",
                            "Actifs : ${c?.actifs ?: 0}" to "suivi en service",
                            "En attente : ${c?.enAttente ?: 0}" to "inscription · paiement · validation",
                            "Suspendus : ${c?.suspendus ?: 0}" to "${c?.expires ?: 0} expirés",
                            "Abonnements en cours : ${a?.enCours ?: 0}" to "${a?.expirentBientot ?: 0} expirent sous 14 jours",
                            "Paiements à vérifier : ${r.v.paiementsAVerifier}" to "onglet Paiements",
                            "Recettes confirmées : $recettes" to "tous paiements validés"
                        )
                        for ((t, d) in cartes) {
                            val card = Ui.carte(ctx, t)
                            card.addView(Ui.texte(ctx, d, 13f))
                            box.addView(card)
                        }
                        box.addView(btnExpire)
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnExpire.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().adminExpirations(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        tvErr.text = "${r.v.traites} abonnement(s) expiré(s)."
                        charger()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        charger()
    }
}
