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
import dz.carfleet.abonne.api.AdminPaiement
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Paiements : tableau par statut + confirmation / refus.
class AdminPaiementsFragment : Fragment() {
    companion object {
        val STATUTS = listOf("a_verifier" to "À vérifier", "en_attente" to "En attente", "confirme" to "Confirmés", "refuse" to "Refusés")
        val METHODES = mapOf("virement" to "Virement", "especes" to "Espèces", "passerelle" to "En ligne", "autre" to "Autre")
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "💳 Paiements"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val spStatut = Ui.liste(ctx, STATUTS.map { it.second })
        val btnFiltrer = Ui.bouton(ctx, "Filtrer")
        val liste = Ui.box(ctx)
        box.addView(spStatut)
        box.addView(btnFiltrer)
        box.addView(liste)

        fun charger() {
            tvErr.text = "Chargement…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().adminPaiements(session.authHeader, STATUTS[spStatut.selectedItemPosition].first) }) {
                    is ApiResult.Ok -> {
                        tvErr.text = ""
                        liste.removeAllViews()
                        if (r.v.paiements.isEmpty()) liste.addView(Ui.texte(ctx, "Aucun paiement."))
                        for (p in r.v.paiements) liste.addView(ligne(p, tvErr, { charger() }))
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnFiltrer.setOnClickListener { charger() }
        charger()
    }

    private fun ligne(p: AdminPaiement, tvErr: TextView, recharge: () -> Unit): View {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        val abonne = p.raisonSociale ?: listOfNotNull(p.prenom, p.nom).joinToString(" ").ifBlank { "—" }
        val card = Ui.carte(ctx, "💰 ${p.montant} ${p.devise ?: ""}")
        card.addView(Ui.texte(ctx, "$abonne (${p.telephone ?: "—"})\n${p.plan ?: "—"} · ${METHODES[p.methode] ?: p.methode ?: "—"} · réf ${p.reference ?: "—"}\nStatut : ${STATUTS.find { it.first == p.statut }?.second ?: p.statut} · ${p.createdAt?.take(16)?.replace('T', ' ') ?: ""}", 13f))
        if (p.statut == "a_verifier") {
            val row = Ui.row(ctx)
            row.addView(Button(ctx).apply {
                text = "Confirmer"
                setOnClickListener {
                    viewLifecycleOwner.lifecycleScope.launch {
                        when (val r = ApiHelper.run {
                            ApiClient.service().adminGererPaiement(session.authHeader, mapOf("paymentId" to p.id, "action" to "confirmer"))
                        }) {
                            is ApiResult.Ok -> {
                                tvErr.text = "Paiement confirmé."
                                recharge()
                            }
                            is ApiResult.Err -> tvErr.text = r.msg
                        }
                    }
                }
            })
            row.addView(Button(ctx).apply {
                text = "Refuser"
                setOnClickListener {
                    val et = Ui.champ(ctx, "Motif du refus")
                    AlertDialog.Builder(ctx).setTitle("Refuser le paiement").setView(et)
                        .setPositiveButton("Refuser") { _, _ ->
                            viewLifecycleOwner.lifecycleScope.launch {
                                when (val r = ApiHelper.run {
                                    ApiClient.service().adminGererPaiement(
                                        session.authHeader,
                                        mapOf("paymentId" to p.id, "action" to "refuser", "motif" to et.text.toString())
                                    )
                                }) {
                                    is ApiResult.Ok -> {
                                        tvErr.text = "Paiement refusé."
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
        }
        return card
    }
}
