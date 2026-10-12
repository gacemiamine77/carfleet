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
import dz.carfleet.abonne.api.VolAdmin
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.MainActivity
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Vols déclarés : dossiers + dernière position + accès carte.
class AdminVolsFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "🚨 Vols déclarés"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val liste = Ui.box(ctx)
        val btnReload = Ui.bouton(ctx, "Actualiser")
        box.addView(btnReload)
        box.addView(liste)

        fun marquerVus() {
            lifecycleScope.launch {
                ApiHelper.run { ApiClient.service().adminVolsVus(session.authHeader, emptyMap()) }
            }
        }
        fun charger() {
            tvErr.text = "Chargement…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().adminVols(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        tvErr.text = ""
                        liste.removeAllViews()
                        if (r.v.vols.isEmpty()) liste.addView(Ui.texte(ctx, "Aucun vol signalé."))
                        for (v in r.v.vols) liste.addView(ligne(v))
                        marquerVus()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnReload.setOnClickListener { charger() }
        charger()
    }

    private fun ligne(v: VolAdmin): View {
        val ctx = requireContext()
        val ouvert = v.status == "open"
        val abonne = v.raisonSociale ?: listOfNotNull(v.prenom, v.nom).joinToString(" ").ifBlank { "—" }
        val card = Ui.carte(ctx, "${if (ouvert) "🔴 Ouvert" else "⚪ Résolu"} — n° ${v.dossier}")
        card.addView(Ui.texte(ctx, "${v.immatriculation ?: ""} ${listOfNotNull(v.marque, v.modele, v.couleur).joinToString(" ")}\n$abonne · ${v.telephone ?: ""} · ${v.statutCompte ?: ""}\nDéclaré : ${v.reportedAt?.take(16)?.replace('T', ' ') ?: ""}", 13f))
        if (v.latitude != null && v.longitude != null) {
            card.addView(Ui.texte(ctx, "📍 ${v.latitude}, ${v.longitude} · ${v.speed?.toInt() ?: 0} km/h · ${v.positionAt?.take(16)?.replace('T', ' ') ?: ""}", 13f))
        } else {
            card.addView(Ui.texte(ctx, "Aucune position connue.", 13f))
        }
        if (!v.note.isNullOrBlank()) card.addView(Ui.texte(ctx, "Note : ${v.note}", 13f))
        card.addView(Button(ctx).apply {
            text = "Voir sur la carte"
            setOnClickListener { (activity as MainActivity).open(AdminMapFragment.pourVehicule(v.vehicleId)) }
        })
        return card
    }
}
