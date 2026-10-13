package dz.carfleet.abonne.ui

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
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.api.LiveVehicle
import dz.carfleet.abonne.api.OwnerVehicle
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

// Mes véhicules : fiches toujours visibles, suivi verrouillé sans abonnement actif.
class VehiclesFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_vehicles, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        ApiClient.init(session.baseUrl)
        view.findViewById<Button>(R.id.btnReload).setOnClickListener { charger(view, session) }
        view.findViewById<Button>(R.id.btnZones).setOnClickListener {
            (activity as MainActivity).open(ZonesFragment())
        }
        view.findViewById<Button>(R.id.btnAdd).setOnClickListener {
            (activity as MainActivity).open(VehicleFormFragment.nouveau())
        }
        charger(view, session)
    }

    private fun charger(view: View, session: SessionManager) {
        val list: LinearLayout = view.findViewById(R.id.listVeh)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        val tvLock: TextView = view.findViewById(R.id.tvLock)
        tvErr.text = "Chargement…"
        tvLock.visibility = View.GONE
        lifecycleScope.launch {
            val reg = ApiHelper.run { ApiClient.service().ownerVehicles(session.authHeader) }
            if (reg is ApiResult.Err) {
                tvErr.text = reg.msg
                return@launch
            }
            val registre = (reg as ApiResult.Ok).v.vehicules
            var verrouille = false
            var motif = ""
            val liveParId = mutableMapOf<Int, LiveVehicle>()
            when (val lv = ApiHelper.run { ApiClient.service().live(session.authHeader) }) {
                is ApiResult.Ok -> lv.v.vehicules.forEach { liveParId[it.id] = it }
                is ApiResult.Err -> if (lv.code == 403) {
                    verrouille = true
                    motif = lv.msg
                } else tvErr.text = "Suivi : ${lv.msg}"
            }
            if (tvErr.text.toString() == "Chargement…") tvErr.text = ""
            if (verrouille) {
                tvLock.text = "🔒 Suivi temps réel désactivé : $motif. Finalisez le paiement dans Profil."
                tvLock.visibility = View.VISIBLE
            }
            list.removeAllViews()
            if (registre.isEmpty()) {
                tvErr.text = "Aucun véhicule. Ajoutez-en un avec ＋."
                return@launch
            }
            for (v in registre) list.addView(ligne(view, session, v, liveParId[v.id], verrouille))
        }
    }

    private fun ligne(view: View, session: SessionManager, v: OwnerVehicle, live: LiveVehicle?, verrouille: Boolean): View {
        val ctx = requireContext()
        val box = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        val titre = "${v.marque ?: ""} ${v.modele ?: ""} ${v.couleur ?: ""}".trim().ifBlank { v.immatriculation ?: "—" }
        val etat = if (live?.live != null) etatDe(live) else if (verrouille) "Suivi inactif (paiement requis)" else "⚪ Hors ligne"
        val li = live?.live
        val gps = li?.speed ?: 0.0
        val heure = li?.recordedAt?.take(16)?.replace('T', ' ')?.substring(5) ?: ""
        val vit = if (li == null) "" else "Vitesse : ${(if (gps > 0) gps else li.computedSpeed ?: 0.0).toInt()} km/h · $heure"
        box.addView(TextView(ctx).apply {
            text = "🚗 $titre\nMatricule : ${v.immatriculation ?: "—"}\n$etat" +
                (if (vit.isNotBlank()) "\n$vit" else "") +
                (v.chauffeur?.let { "\n🧑‍✈️ ${it.prenom ?: ""} ${it.nom ?: ""}".trim() } ?: "") +
                if (v.isStolen) "\n🔴 VOL DÉCLARÉ" else ""
            textSize = 15f
        })
        val boutons = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        val btnGerer = Button(ctx).apply { text = "Gérer" }
        btnGerer.setOnClickListener { (activity as MainActivity).open(VehicleFormFragment.existant(v.id)) }
        val btnVol = Button(ctx).apply { text = if (v.isStolen) "✅ Résoudre" else "🚨 Vol" }
        btnVol.setOnClickListener {
            if (v.isStolen) {
                lifecycleScope.launch {
                    when (val r = ApiHelper.run {
                        ApiClient.service().resolveTheft(session.authHeader, mapOf("vehicleId" to v.id))
                    }) {
                        is ApiResult.Ok -> {
                            view.findViewById<TextView>(R.id.tvErr).text = "Dossier de vol refermé."
                            charger(view, session)
                        }
                        is ApiResult.Err -> view.findViewById<TextView>(R.id.tvErr).text = r.msg
                    }
                }
            } else {
                AlertDialog.Builder(ctx)
                    .setTitle("Déclarer le vol ?")
                    .setMessage("${v.immatriculation} sera marqué volé. L'administrateur sera alerté et la localisation restera suivie pour les recherches.")
                    .setPositiveButton("Déclarer") { _, _ ->
                        lifecycleScope.launch {
                            when (val r = ApiHelper.run {
                                ApiClient.service().reportTheft(
                                    session.authHeader,
                                    mapOf("vehicleId" to v.id, "share" to true, "dureeJours" to 7)
                                )
                            }) {
                                is ApiResult.Ok -> {
                                    view.findViewById<TextView>(R.id.tvErr).text = "Vol déclaré : l'administrateur a été alerté."
                                    charger(view, session)
                                }
                                is ApiResult.Err -> view.findViewById<TextView>(R.id.tvErr).text = r.msg
                            }
                        }
                    }
                    .setNegativeButton("Annuler", null)
                    .show()
            }
        }
        boutons.addView(btnGerer)
        boutons.addView(btnVol)
        box.addView(boutons)
        return box
    }

    private fun vitesseDe(live: dz.carfleet.abonne.api.LiveInfo): Double {
        val gps = live.speed ?: 0.0
        return if (gps > 0) gps else live.computedSpeed ?: 0.0
    }

    private fun etatDe(v: LiveVehicle): String {
        val live = v.live ?: return "⚪ Hors ligne (aucune position)"
        val ageMin = try {
            val ts = live.recordedAt ?: return "⚪ Hors ligne"
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            (System.currentTimeMillis() - (fmt.parse(ts.take(19))?.time ?: 0)) / 60000.0
        } catch (_: Exception) { return "⚪ Hors ligne" }
        if (ageMin > 10) return "⚪ Hors ligne (dernière position il y a ${ageMin.toInt()} min)"
        val vit = vitesseDe(live)
        if (vit >= 5) return "🟢 En mouvement (${vit.toInt()} km/h)"
        return "🟠 À l'arrêt"
    }
}
