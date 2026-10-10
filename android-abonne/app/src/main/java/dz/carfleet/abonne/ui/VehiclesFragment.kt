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
import dz.carfleet.abonne.api.LiveVehicle
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Mes véhicules : état + antivol.
class VehiclesFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_vehicles, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        ApiClient.init(session.baseUrl)
        view.findViewById<Button>(R.id.btnReload).setOnClickListener { charger(view, session) }
        charger(view, session)
    }

    private fun charger(view: View, session: SessionManager) {
        val list: LinearLayout = view.findViewById(R.id.listVeh)
        val tvErr: TextView = view.findViewById(R.id.tvErr)
        tvErr.text = "Chargement…"
        lifecycleScope.launch {
            try {
                val res = ApiClient.service().live(session.authHeader)
                tvErr.text = ""
                list.removeAllViews()
                if (res.vehicules.isEmpty()) {
                    tvErr.text = "Aucun véhicule sur ce compte."
                    return@launch
                }
                for (v in res.vehicules) list.addView(ligne(view, session, v))
            } catch (e: Exception) {
                tvErr.text = "Échec : ${e.message}"
            }
        }
    }

    private fun ligne(view: View, session: SessionManager, v: LiveVehicle): View {
        val ctx = requireContext()
        val box = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        val titre = "${v.marque ?: ""} ${v.modele ?: ""}".trim().ifBlank { v.immatriculation ?: "—" }
        val etat = etatDe(v)
        box.addView(TextView(ctx).apply {
            text = "🚗 $titre\nMatricule : ${v.immatriculation ?: "—"}\n$etat" +
                (v.chauffeur?.let { "\n🧑‍✈️ ${it.prenom ?: ""} ${it.nom ?: ""}".trim() } ?: "") +
                if (v.isStolen) "\n🔴 VOL DÉCLARÉ" else ""
            textSize = 15f
        })
        val boutons = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        val btnVol = Button(ctx).apply { text = if (v.isStolen) "✅ Résoudre" else "🚨 Vol" }
        btnVol.setOnClickListener {
            if (v.isStolen) {
                lifecycleScope.launch {
                    try {
                        ApiClient.service().resolveTheft(session.authHeader, mapOf("vehicleId" to v.id))
                        charger(view, session)
                    } catch (e: Exception) {
                        view.findViewById<TextView>(R.id.tvErr).text = "Échec : ${e.message}"
                    }
                }
            } else {
                AlertDialog.Builder(ctx)
                    .setTitle("Déclarer le vol ?")
                    .setMessage("${v.immatriculation} sera marqué volé et partageable avec la police.")
                    .setPositiveButton("Déclarer") { _, _ ->
                        lifecycleScope.launch {
                            try {
                                ApiClient.service().reportTheft(
                                    session.authHeader,
                                    mapOf("vehicleId" to v.id, "share" to true, "dureeJours" to 7)
                                )
                                charger(view, session)
                            } catch (e: Exception) {
                                view.findViewById<TextView>(R.id.tvErr).text = "Échec : ${e.message}"
                            }
                        }
                    }
                    .setNegativeButton("Annuler", null)
                    .show()
            }
        }
        boutons.addView(btnVol)
        box.addView(boutons)
        return box
    }

    private fun etatDe(v: LiveVehicle): String {
        val live = v.live ?: return "⚪ Hors ligne (aucune position)"
        val ageMin = try {
            val ts = live.recordedAt ?: return "⚪ Hors ligne"
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            (System.currentTimeMillis() - (fmt.parse(ts.take(19))?.time ?: 0)) / 60000.0
        } catch (_: Exception) { return "⚪ Hors ligne" }
        if (ageMin > 10) return "⚪ Hors ligne (dernière position il y a ${ageMin.toInt()} min)"
        if ((live.speed ?: 0.0) >= 5) return "🟢 En mouvement (${live.speed?.toInt() ?: 0} km/h)"
        return "🟠 À l'arrêt"
    }
}
