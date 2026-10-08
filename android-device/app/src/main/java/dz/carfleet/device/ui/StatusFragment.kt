package dz.carfleet.device.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import dz.carfleet.device.R
import dz.carfleet.device.data.SessionManager
import dz.carfleet.device.tracking.State
import dz.carfleet.device.tracking.TrackingService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Statut : position actuelle, dernier envoi, état connexion + Start/Stop
class StatusFragment : Fragment() {
    private lateinit var session: SessionManager

    private val perms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
        refreshPermLabel()
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_status, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        session = SessionManager(requireContext())
        val tvPos: TextView = view.findViewById(R.id.tvPos)
        val tvSens: TextView = view.findViewById(R.id.tvSens)
        val tvSend: TextView = view.findViewById(R.id.tvSend)
        val tvConn: TextView = view.findViewById(R.id.tvConn)
        val tvVeh: TextView = view.findViewById(R.id.tvVeh)
        val spInterval: Spinner = view.findViewById(R.id.spInterval)
        val btnToggle: Button = view.findViewById(R.id.btnToggle)
        val btnPerms: Button = view.findViewById(R.id.btnPerms)

        val intervals = listOf("2 s", "5 s", "10 s", "30 s")
        spInterval.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, intervals).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        spInterval.setSelection(when (session.intervalSec) { 2 -> 0; 5 -> 1; 30 -> 3; else -> 2 })
        spInterval.onItemSelectedListener = posListener {
            session.setIntervalSec(listOf(2, 5, 10, 30)[spInterval.selectedItemPosition])
            if (session.tracking) restartService()
        }

        tvVeh.text = if (session.hasVehicle) "${session.marque} ${session.modele} (${session.immat})\nSérie: ${session.serial}" else "Aucun véhicule — onglet Véhicule"
        refreshPermLabel()
        btnPerms.setOnClickListener { askPerms() }
        updateToggle(btnToggle)

        btnToggle.setOnClickListener {
            if (!session.isLogged) {
                Toast.makeText(context, "Compte requis — va dans l'onglet Compte pour t'inscrire/te connecter", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (!session.hasVehicle) {
                Toast.makeText(context, "Véhicule requis — va dans l'onglet Véhicule pour l'enregistrer", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (!hasAllPerms()) {
                askPerms()
                Toast.makeText(context, "Autorise GPS + capteurs d'abord", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (session.tracking) {
                requireContext().stopService(Intent(context, TrackingService::class.java))
                session.setTracking(false)
            } else {
                restartService()
                session.setTracking(true)
            }
            updateToggle(btnToggle)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    tvPos.text = if (State.lastLat != null) "%.5f, %.5f\n%.0f km/h".format(State.lastLat, State.lastLon, State.lastSpeed ?: 0.0) else "— en attente GPS —"
                    tvSens.text = "Acc: %.1f, %.1f, %.1f\nGyro: %.2f, %.2f, %.2f".format(State.ax, State.ay, State.az, State.gx, State.gy, State.gz)
                    tvSend.text = "Dernier envoi : ${State.lastSend} (${State.lastCode}) — ${State.sent} envoyés"
                    tvConn.text = if (State.online) "🟢 En ligne" else "⚪ En attente / hors-ligne"
                    view.findViewById<TextView>(R.id.tvPending).text =
                        if (State.pending > 0) "⏳ File d'attente : ${State.pending} point(s) — renvoi auto à la reconnexion"
                        else "File d'attente : vide"
                    delay(1000)
                }
            }
        }
    }

    private fun updateToggle(btn: Button) {
        btn.text = if (session.tracking) "⏹️ Stopper l'envoi" else "▶️ Démarrer l'envoi"
    }

    private fun refreshPermLabel() {
        view?.findViewById<TextView>(R.id.tvPerms)?.text =
            if (hasAllPerms()) "✅ GPS + capteurs autorisés" else "⚠️ GPS / capteurs manquants"
    }

    private fun hasAllPerms(): Boolean {
        val c = requireContext()
        val loc = ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val sens = if (Build.VERSION.SDK_INT >= 33)
            ContextCompat.checkSelfPermission(c, Manifest.permission.BODY_SENSORS) == PackageManager.PERMISSION_GRANTED
        else true
        return loc && sens
    }

    private fun askPerms() {
        val list = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) {
            list.add(Manifest.permission.BODY_SENSORS)
            list.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        perms.launch(list.toTypedArray())
    }

    private fun restartService() {
        val ctx = requireContext()
        ctx.stopService(Intent(ctx, TrackingService::class.java))
        ContextCompat.startForegroundService(ctx, Intent(ctx, TrackingService::class.java))
    }

    private fun posListener(onPos: () -> Unit) = object : android.widget.AdapterView.OnItemSelectedListener {
        private var first = true
        override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
            if (first) { first = false; return }
            onPos()
        }
        override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
    }
}
