package dz.carfleet.abonne.ui.admin

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
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
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Forfaits : création / modification / activation / suppression.
class AdminForfaitsFragment : Fragment() {
    private var editingId = 0

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "📦 Forfaits"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)

        val liste = Ui.box(ctx)
        val etNom = Ui.champ(ctx, "Nom")
        val spType = Ui.liste(ctx, listOf("Particulier", "Entreprise"))
        val etPrix = Ui.champ(ctx, "Prix", numeric = true)
        val spDuree = Ui.liste(ctx, listOf("Mensuelle", "Trimestrielle", "Annuelle"))
        val etLimite = Ui.champ(ctx, "Véhicules max (vide = illimité)", numeric = true)
        val cbGeo = CheckBox(ctx).apply { text = "Géorepérage inclus" }
        val btnSave = Ui.bouton(ctx, "Enregistrer")
        val btnNew = Ui.bouton(ctx, "Nouveau")
        box.addView(Ui.titre(ctx, "Liste", 16f))
        box.addView(liste)
        box.addView(Ui.titre(ctx, "Nouveau / modifier", 16f))
        box.addView(etNom)
        box.addView(spType)
        box.addView(etPrix)
        box.addView(spDuree)
        box.addView(etLimite)
        box.addView(cbGeo)
        val row = Ui.row(ctx)
        row.addView(btnSave)
        row.addView(btnNew)
        box.addView(row)

        val durees = listOf("mensuel", "trimestriel", "annuel")
        fun reset() {
            editingId = 0
            etNom.text.clear()
            spType.setSelection(0)
            etPrix.text.clear()
            spDuree.setSelection(0)
            etLimite.text.clear()
            cbGeo.isChecked = false
        }
        val remplir: (Forfait) -> Unit = { p ->
            editingId = p.id
            etNom.setText(p.nom ?: "")
            spType.setSelection(if (p.typeCompte == "entreprise") 1 else 0)
            etPrix.setText((p.prix ?: 0.0).toString())
            spDuree.setSelection(durees.indexOf(p.duree).takeIf { it >= 0 } ?: 0)
            etLimite.setText(p.limiteVehicules?.toString() ?: "")
            cbGeo.isChecked = p.georeperage == true
            tvErr.text = "Modification de « ${p.nom} »."
        }
        fun charger() {
            tvErr.text = "Chargement…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().adminForfaits(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        tvErr.text = ""
                        liste.removeAllViews()
                        if (r.v.forfaits.isEmpty()) liste.addView(Ui.texte(ctx, "Aucun forfait."))
                        for (p in r.v.forfaits) liste.addView(ligne(p, tvErr, { charger() }, remplir, { reset() }))
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnNew.setOnClickListener {
            reset()
            tvErr.text = "Nouveau forfait."
        }
        btnSave.setOnClickListener {
            if (etNom.text.isBlank()) {
                tvErr.text = "Nom requis"
                return@setOnClickListener
            }
            val body = mutableMapOf<String, Any?>(
                "nom" to etNom.text.toString().trim(),
                "type_compte" to if (spType.selectedItemPosition == 1) "entreprise" else "particulier",
                "prix" to (etPrix.text.toString().toDoubleOrNull() ?: 0.0),
                "duree" to durees[spDuree.selectedItemPosition],
                "limite_vehicules" to etLimite.text.toString().toIntOrNull(),
                "georeperage" to cbGeo.isChecked
            )
            lifecycleScope.launch {
                val res = if (editingId != 0) {
                    body["id"] = editingId
                    ApiHelper.run { ApiClient.service().adminModifierForfait(session.authHeader, body) }
                } else {
                    ApiHelper.run { ApiClient.service().adminCreerForfait(session.authHeader, body) }
                }
                when (res) {
                    is ApiResult.Ok -> {
                        tvErr.text = "Forfait enregistré."
                        reset()
                        charger()
                    }
                    is ApiResult.Err -> tvErr.text = res.msg
                }
            }
        }
        charger()
    }

    private fun ligne(p: Forfait, tvErr: TextView, recharge: () -> Unit, remplir: (Forfait) -> Unit, reset: () -> Unit): View {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        val card = Ui.carte(ctx, "📦 ${p.nom ?: ""}")
        card.addView(Ui.texte(ctx, "(${p.typeCompte}) — ${p.prix} ${p.devise}/${p.duree} · ${p.limiteVehicules?.let { "$it véh." } ?: "illimité"}${if (p.georeperage == true) " · zones" else ""}${if (p.actif == false) " · INACTIF" else ""}", 13f))
        val row = Ui.row(ctx)
        row.addView(Button(ctx).apply {
            text = "Modifier"
            setOnClickListener { remplir(p) }
        })
        row.addView(Button(ctx).apply {
            text = if (p.actif == false) "Activer" else "Désactiver"
            setOnClickListener {
                viewLifecycleOwner.lifecycleScope.launch {
                    when (val r = ApiHelper.run {
                        ApiClient.service().adminModifierForfait(session.authHeader, mapOf("id" to p.id, "actif" to (p.actif == false)))
                    }) {
                        is ApiResult.Ok -> {
                            tvErr.text = "Forfait mis à jour."
                            recharge()
                        }
                        is ApiResult.Err -> tvErr.text = r.msg
                    }
                }
            }
        })
        row.addView(Button(ctx).apply {
            text = "Supprimer"
            setOnClickListener {
                AlertDialog.Builder(ctx)
                    .setTitle("Supprimer « ${p.nom} » ?")
                    .setMessage("Impossible si des abonnements l'utilisent.")
                    .setPositiveButton("Supprimer") { _, _ ->
                        viewLifecycleOwner.lifecycleScope.launch {
                            when (val r = ApiHelper.run { ApiClient.service().adminSupprimerForfait(session.authHeader, p.id) }) {
                                is ApiResult.Ok -> {
                                    tvErr.text = "Forfait supprimé."
                                    reset()
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
