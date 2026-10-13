package dz.carfleet.abonne.ui

import android.app.AlertDialog
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
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch

// Profil : abonnement, paiement, infos (adresse incluse), mot de passe, notifications.
class ProfileFragment : Fragment() {
    private var forfaits: List<Forfait> = emptyList()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_profile, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        val tvProfil: TextView = view.findViewById(R.id.tvProfil)
        val tvAbo: TextView = view.findViewById(R.id.tvAbo)
        val tvErr = Ui.err(ctx)
        val box = Ui.box(ctx)

        val btnNotif = Ui.bouton(ctx, "🔔 Notifications")
        val listNotif = Ui.box(ctx).apply { visibility = View.GONE }
        val spPlan = Ui.liste(ctx, listOf("Chargement…"))
        val spMethode = Ui.liste(ctx, listOf("Virement bancaire", "Espèces", "Autre"))
        val btnSouscrire = Ui.bouton(ctx, "Souscrire")
        val btnPayer = Ui.bouton(ctx, "J'ai payé (virement)")
        val etNom = Ui.champ(ctx, "Nom")
        val etPrenom = Ui.champ(ctx, "Prénom")
        val etTel = Ui.champ(ctx, "Téléphone")
        val etEmail = Ui.champ(ctx, "Email")
        val etAdresse = Ui.champ(ctx, "Adresse")
        val btnSaveProfil = Ui.bouton(ctx, "Enregistrer le profil")
        val etPwOld = Ui.champ(ctx, "Ancien mot de passe", password = true)
        val etPwNew = Ui.champ(ctx, "Nouveau (6+)", password = true)
        val btnPw = Ui.bouton(ctx, "Changer le mot de passe")

        val root = view.findViewById<Button>(R.id.btnLogout).parent as LinearLayout
        root.addView(btnNotif, 3)
        root.addView(listNotif, 4)
        root.addView(Ui.titre(ctx, "Forfait", 16f))
        root.addView(spPlan)
        root.addView(spMethode)
        val rowAbo = Ui.row(ctx)
        rowAbo.addView(btnSouscrire)
        rowAbo.addView(btnPayer)
        root.addView(rowAbo)
        root.addView(Ui.titre(ctx, "Modifier le profil", 16f))
        root.addView(etNom)
        root.addView(etPrenom)
        root.addView(etTel)
        root.addView(etEmail)
        root.addView(etAdresse)
        root.addView(btnSaveProfil)
        root.addView(Ui.titre(ctx, "Mot de passe", 16f))
        root.addView(etPwOld)
        root.addView(etPwNew)
        root.addView(btnPw)
        root.addView(Ui.titre(ctx, "Arrêter / supprimer", 16f))
        val btnResilier = Ui.bouton(ctx, "Arrêter l'abonnement")
        val btnSuppr = Ui.bouton(ctx, "Supprimer mon compte…")
        val btnAnnulSuppr = Ui.bouton(ctx, "Annuler ma demande de suppression").apply { visibility = View.GONE }
        root.addView(btnResilier)
        root.addView(btnSuppr)
        root.addView(btnAnnulSuppr)
        root.addView(tvErr)
        root.addView(box)

        fun charger() {
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().profil(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        val p = r.v.proprietaire
                        val nom = p?.raisonSociale ?: listOfNotNull(p?.prenom, p?.nom).joinToString(" ")
                        tvProfil.text = "$nom\nTél : ${p?.telephone ?: "—"}\nStatut : ${p?.statutCompte ?: "—"}\nVéhicules : ${p?.nbVehicules ?: 0}"
                        val a = r.v.abonnement
                        tvAbo.text = if (a != null) {
                            "Forfait : ${a.plan ?: "—"} (${a.statut}) · ${a.prix} ${a.devise}" +
                                (if (a.fin != null) "\nValide jusqu'au : ${a.fin.take(10)}" else "")
                        } else "Aucun abonnement."
                        etNom.setText(p?.nom ?: "")
                        etPrenom.setText(p?.prenom ?: "")
                        etTel.setText(p?.telephone ?: "")
                        etEmail.setText(p?.email ?: "")
                        etAdresse.setText(p?.adresse ?: "")
                        btnAnnulSuppr.visibility = if (p?.statutCompte == "suppression_demandee") View.VISIBLE else View.GONE
                        val type = if (p?.type == "morale") "entreprise" else "particulier"
                        when (val rp = ApiHelper.run { ApiClient.service().plans(type) }) {
                            is ApiResult.Ok -> {
                                forfaits = rp.v.forfaits
                                spPlan.adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item,
                                    forfaits.map { "${it.nom} — ${it.prix} ${it.devise} (${it.duree})" }).apply {
                                    setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                                }
                            }
                            is ApiResult.Err -> tvErr.text = rp.msg
                        }
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }

        btnNotif.setOnClickListener {
            if (listNotif.visibility == View.VISIBLE) {
                listNotif.visibility = View.GONE
                return@setOnClickListener
            }
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().notifications(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        listNotif.removeAllViews()
                        if (r.v.notifications.isEmpty()) listNotif.addView(Ui.texte(ctx, "Aucune notification."))
                        for (n in r.v.notifications) {
                            listNotif.addView(Ui.texte(ctx, "• ${n.titre ?: ""}\n${n.corps ?: ""}\n${n.createdAt?.take(16)?.replace('T', ' ') ?: ""}", 13f))
                        }
                        listNotif.visibility = View.VISIBLE
                        btnNotif.text = "🔔 Notifications (${r.v.nonLues})"
                        if (r.v.nonLues > 0) ApiHelper.run { ApiClient.service().lireNotifications(session.authHeader) }
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnSouscrire.setOnClickListener {
            val f = forfaits.getOrNull(spPlan.selectedItemPosition) ?: return@setOnClickListener
            val methodes = listOf("virement", "especes", "autre")
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().choisirAbonnement(
                        session.authHeader,
                        mapOf("planId" to f.id, "methode" to methodes[spMethode.selectedItemPosition])
                    )
                }) {
                    is ApiResult.Ok -> {
                        tvErr.text = "Forfait souscrit : réglez puis déclarez votre paiement."
                        charger()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnPayer.setOnClickListener {
            val etRef = Ui.champ(ctx, "Référence du virement (optionnel)")
            AlertDialog.Builder(ctx)
                .setTitle("Déclarer le paiement")
                .setView(etRef)
                .setPositiveButton("Transmettre") { _, _ ->
                    lifecycleScope.launch {
                        when (val r = ApiHelper.run {
                            ApiClient.service().declarerPaiement(
                                session.authHeader,
                                mapOf("reference" to etRef.text.toString())
                            )
                        }) {
                            is ApiResult.Ok -> {
                                tvErr.text = "Paiement transmis pour vérification."
                                charger()
                            }
                            is ApiResult.Err -> tvErr.text = r.msg
                        }
                    }
                }
                .setNegativeButton("Annuler", null)
                .show()
        }
        btnSaveProfil.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().patchProfil(
                        session.authHeader,
                        mapOf(
                            "nom" to etNom.text.toString(),
                            "prenom" to etPrenom.text.toString(),
                            "telephone" to etTel.text.toString(),
                            "email" to etEmail.text.toString(),
                            "adresse" to etAdresse.text.toString()
                        )
                    )
                }) {
                    is ApiResult.Ok -> {
                        tvErr.text = "Profil enregistré."
                        charger()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnPw.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().patchProfil(
                        session.authHeader,
                        mapOf("ancienMotDePasse" to etPwOld.text.toString(), "nouveauMotDePasse" to etPwNew.text.toString())
                    )
                }) {
                    is ApiResult.Ok -> {
                        tvErr.text = "Mot de passe changé."
                        etPwOld.text.clear()
                        etPwNew.text.clear()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnResilier.setOnClickListener {
            AlertDialog.Builder(ctx)
                .setTitle("Arrêter l'abonnement ?")
                .setMessage("Le suivi sera interrompu immédiatement. En cas de paiement déjà effectué, aucun remboursement.")
                .setPositiveButton("Arrêter") { _, _ ->
                    lifecycleScope.launch {
                        when (val r = ApiHelper.run { ApiClient.service().annulerAbonnement(session.authHeader, emptyMap()) }) {
                            is ApiResult.Ok -> {
                                tvErr.text = "Abonnement arrêté."
                                charger()
                            }
                            is ApiResult.Err -> tvErr.text = r.msg
                        }
                    }
                }
                .setNegativeButton("Annuler", null).show()
        }
        btnSuppr.setOnClickListener {
            val etPass = Ui.champ(ctx, "Mot de passe (confirmation)", password = true)
            AlertDialog.Builder(ctx)
                .setTitle("Supprimer mon compte ?")
                .setMessage("Effacement définitif (compte, véhicules, positions, historique, zones, paiements) après validation admin. Le suivi sera interrompu.")
                .setView(etPass)
                .setPositiveButton("Confirmer") { _, _ ->
                    lifecycleScope.launch {
                        when (val r = ApiHelper.run {
                            ApiClient.service().demanderSuppression(session.authHeader, mapOf("password" to etPass.text.toString()))
                        }) {
                            is ApiResult.Ok -> {
                                tvErr.text = "Demande transmise à l'administrateur."
                                charger()
                            }
                            is ApiResult.Err -> tvErr.text = r.msg
                        }
                    }
                }
                .setNegativeButton("Annuler", null).show()
        }
        btnAnnulSuppr.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().annulerSuppression(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        tvErr.text = "Demande de suppression annulée."
                        charger()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        view.findViewById<Button>(R.id.btnLogout).setOnClickListener {
            session.clearAccount()
            (activity as MainActivity).applyLock()
        }
        tvProfil.text = session.displayName.ifBlank { session.username }
        charger()
    }
}
