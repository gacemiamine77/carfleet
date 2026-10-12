package dz.carfleet.abonne.ui.admin

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.AdminCompte
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Comptes abonnés : filtres + validation / refus / suspension / réactivation.
class AdminComptesFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "👥 Comptes"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)

        val spType = Ui.liste(ctx, listOf("Tous", "Particulier", "Entreprise"))
        val spStatut = Ui.liste(ctx, listOf("Tous", "inscription_recue", "en_attente_paiement", "paiement_a_verifier", "en_attente_validation", "actif", "expire", "suspendu", "refuse"))
        val etQ = Ui.champ(ctx, "Recherche (nom, téléphone, utilisateur)")
        val btnFiltrer = Ui.bouton(ctx, "Filtrer")
        val liste = Ui.box(ctx)
        box.addView(spType)
        box.addView(spStatut)
        box.addView(etQ)
        box.addView(btnFiltrer)
        box.addView(liste)

        fun charger() {
            val types = listOf<String?>(null, "particulier", "entreprise")
            val stats = listOf<String?>(null, "inscription_recue", "en_attente_paiement", "paiement_a_verifier", "en_attente_validation", "actif", "expire", "suspendu", "refuse")
            tvErr.text = "Chargement…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().adminComptes(
                        session.authHeader,
                        types[spType.selectedItemPosition],
                        stats[spStatut.selectedItemPosition],
                        etQ.text.toString().trim().ifBlank { null }
                    )
                }) {
                    is ApiResult.Ok -> {
                        tvErr.text = ""
                        liste.removeAllViews()
                        if (r.v.comptes.isEmpty()) liste.addView(Ui.texte(ctx, "Aucun compte."))
                        for (c in r.v.comptes) liste.addView(ligne(c, tvErr, { charger() }))
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }

        btnFiltrer.setOnClickListener { charger() }
        charger()
    }

    private fun ligne(c: AdminCompte, tvErr: TextView, recharge: () -> Unit): View {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        val nom = c.raisonSociale ?: listOfNotNull(c.prenom, c.nom).joinToString(" ")
        val card = Ui.carte(ctx, "👤 $nom")
        val abo = c.abonnement?.let { "${it.plan} (${it.statut})" } ?: "—"
        val pay = c.paiement?.let { "${it.montant} ${it.devise} · ${it.statut}" } ?: "—"
        card.addView(Ui.texte(ctx, "${c.username ?: ""} · ${c.telephone ?: ""} · ${c.nbVehicules} véh.\n${if (c.type == "morale") "Entreprise" else "Particulier"} · ${c.statutCompte}" + (c.motif?.let { "\nMotif : $it" } ?: "") + "\n$abo\n$pay", 13f))
        val row = Ui.row(ctx)
        fun action(label: String, act: String, motifObligatoire: Boolean) {
            row.addView(Button(ctx).apply {
                text = label
                setOnClickListener {
                    fun executer(motif: String) {
                        viewLifecycleOwner.lifecycleScope.launch {
                            when (val r = ApiHelper.run {
                                ApiClient.service().adminGererCompte(
                                    session.authHeader,
                                    mapOf("ownerId" to c.id, "action" to act, "motif" to motif)
                                )
                            }) {
                                is ApiResult.Ok -> {
                                    tvErr.text = "Action effectuée."
                                    recharge()
                                }
                                is ApiResult.Err -> tvErr.text = r.msg
                            }
                        }
                    }
                    if (motifObligatoire) {
                        val et = Ui.champ(ctx, "Motif (obligatoire)")
                        AlertDialog.Builder(ctx).setTitle(label).setView(et)
                            .setPositiveButton("OK") { _, _ ->
                                if (et.text.isBlank()) tvErr.text = "Motif requis"
                                else executer(et.text.toString())
                            }
                            .setNegativeButton("Annuler", null).show()
                    } else executer("")
                }
            })
        }
        action("Valider", "valider", false)
        action("Refuser", "refuser", true)
        action("Suspendre", "suspendre", true)
        action("Réactiver", "reactiver", false)
        card.addView(row)
        return card
    }
}
