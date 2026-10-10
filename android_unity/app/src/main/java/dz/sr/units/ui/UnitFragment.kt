package dz.sr.units.ui

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
import androidx.fragment.app.activityViewModels
import dz.sr.units.R
import dz.sr.units.api.Infraction
import dz.sr.units.api.NotificationUnite

// ⚙️ Mon unité + notifications + mes interventions + déconnexion
class UnitFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_unit, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val u = vm.session.unite
        view.findViewById<TextView>(R.id.tvUnite).text =
            "${u?.nom ?: "—"}\n${u?.code ?: ""} · ${u?.type ?: ""} · ${u?.moyen ?: ""}\nWilaya ${u?.codeWilaya ?: ""} — ${u?.wilaya ?: ""}"
        val tvNotifs = view.findViewById<TextView>(R.id.tvNotifs)
        val llNotifs = view.findViewById<LinearLayout>(R.id.llNotifs)
        val btnLues = view.findViewById<Button>(R.id.btnLireNotifs)
        val tvInterventions = view.findViewById<TextView>(R.id.tvInterventions)
        val llInterventions = view.findViewById<LinearLayout>(R.id.llInterventions)

        btnLues.setOnClickListener { vm.marquerNotificationsLues() }
        vm.notifications.observe(viewLifecycleOwner) { afficherNotifications(it, llNotifs, btnLues) }
        vm.nonLues.observe(viewLifecycleOwner) { n ->
            tvNotifs.text = if (n > 0) "🔔 Notifications ($n non lues)" else "🔔 Notifications"
        }
        vm.items.observe(viewLifecycleOwner) { afficherInterventions(it, tvInterventions, llInterventions) }
        vm.refreshNotifications()
        pollWhileStarted(vm)

        view.findViewById<Button>(R.id.btnLogout).setOnClickListener {
            vm.logout()
            (activity as? MainActivity)?.showLogin()
        }
    }

    private fun texteDate(iso: String?): String =
        iso?.take(16)?.replace("T", " ") ?: "—"

    private fun afficherNotifications(
        list: List<NotificationUnite>,
        conteneur: LinearLayout,
        btnLues: Button
    ) {
        conteneur.removeAllViews()
        btnLues.visibility = if (list.isEmpty()) View.GONE else View.VISIBLE
        if (list.isEmpty()) {
            conteneur.addView(TextView(requireContext()).apply { text = "Aucune notification." })
            return
        }
        for (n in list.take(20)) {
            conteneur.addView(TextView(requireContext()).apply {
                text = "${if (n.lu) "•" else "🔴"} ${n.titre ?: "Notification"}\n" +
                    "${n.corps ?: ""}\n${texteDate(n.createdAt)}"
            })
        }
    }

    private fun afficherInterventions(
        items: List<Infraction>,
        titre: TextView,
        conteneur: LinearLayout
    ) {
        val monId = vm.session.unite?.id
        val actives = items
            .filter { monId != null && monId != 0 && it.assigneUniteId == monId }
            .filter { it.statut == "notifie" || it.statut == "en_cours" }
            .sortedByDescending { it.recordedAt }
        titre.text = "🧭 Mes interventions (${actives.size})"
        conteneur.removeAllViews()
        if (actives.isEmpty()) {
            conteneur.addView(TextView(requireContext()).apply { text = "Aucune intervention assignée." })
            return
        }
        for (x in actives.take(20)) {
            val ctx = requireContext()
            val ligne = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
            ligne.addView(TextView(ctx).apply {
                text = "🚨 ${x.infraction} — ${x.immatriculation ?: x.carId ?: "—"}\n" +
                    "${x.statut}${if (!x.resultat.isNullOrBlank()) " · ${x.resultat}" else ""} · ${texteDate(x.recordedAt)}"
            })
            val boutons = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
            if (x.statut == "notifie") {
                boutons.addView(Button(ctx).apply {
                    text = "✅ Accepter"
                    setOnClickListener { vm.accepterInterception(x.id) }
                })
            }
            if (x.statut == "en_cours") {
                boutons.addView(Button(ctx).apply {
                    text = "🏁 Clôturer"
                    setOnClickListener { demanderCloture(x.id) }
                })
            }
            boutons.addView(Button(ctx).apply {
                text = "Voir"
                setOnClickListener { (activity as? MainActivity)?.navigateTo(R.id.nav_treat) }
            })
            ligne.addView(boutons)
            conteneur.addView(ligne)
        }
    }

    private fun demanderCloture(id: Int) {
        val ctx = requireContext()
        val resultats = listOf(
            "verbalisation" to "Verbalisation",
            "pv" to "Procès-verbal",
            "controle_ok" to "Contrôle OK",
            "fausse_alerte" to "Fausse alerte",
            "abandonnee" to "Abandonnée"
        )
        val conteneur = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val marge = (16 * resources.displayMetrics.density).toInt()
            setPadding(marge, marge / 2, marge, 0)
        }
        val choix = Spinner(ctx).apply {
            adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, resultats.map { it.second }).apply {
                setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            }
        }
        val note = EditText(ctx).apply { hint = "Compte rendu (lieu, heure, plaque…)" }
        conteneur.addView(choix)
        conteneur.addView(note)
        AlertDialog.Builder(ctx)
            .setTitle("🏁 Clôturer l'intervention #$id")
            .setView(conteneur)
            .setPositiveButton("Clôturer") { _, _ ->
                vm.cloturerInterception(id, resultats[choix.selectedItemPosition].first, note.text.toString().trim())
            }
            .setNegativeButton("Annuler", null)
            .show()
    }
}
