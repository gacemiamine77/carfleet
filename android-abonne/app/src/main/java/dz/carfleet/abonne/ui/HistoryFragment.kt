package dz.carfleet.abonne.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.LiveVehicle
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Polyline
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Trajets : historique d'un véhicule (24 h / 7 j) tracé sur la carte.
class HistoryFragment : Fragment() {
    private var map: MapView? = null
    private var vehicules: List<LiveVehicle> = emptyList()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_history, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        ApiClient.init(session.baseUrl)
        val mv = view.findViewById<MapView>(R.id.osmMap)
        map = mv
        mv.setTileSource(XYTileSource(
            "OSMFrance", 0, 20, 256, ".png",
            arrayOf(
                "https://a.tile.openstreetmap.fr/osmfr/",
                "https://b.tile.openstreetmap.fr/osmfr/",
                "https://c.tile.openstreetmap.fr/osmfr/"
            )
        ))
        mv.setMultiTouchControls(true)
        mv.controller.setZoom(6.0)
        mv.controller.setCenter(GeoPoint(35.8, 3.0))
        val sp: Spinner = view.findViewById(R.id.spVeh)
        val info: TextView = view.findViewById(R.id.tvInfo)
        lifecycleScope.launch {
            try {
                vehicules = ApiClient.service().live(session.authHeader).vehicules
                sp.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item,
                    vehicules.map { it.immatriculation ?: it.carId ?: "—" }).apply {
                    setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                }
            } catch (e: Exception) {
                info.text = "Échec : ${e.message}"
            }
        }
        view.findViewById<Button>(R.id.btn24).setOnClickListener { charger(view, session, sp, info, 1) }
        view.findViewById<Button>(R.id.btn7j).setOnClickListener { charger(view, session, sp, info, 7) }
    }

    private fun charger(view: View, session: SessionManager, sp: Spinner, info: TextView, jours: Int) {
        val v = vehicules.getOrNull(sp.selectedItemPosition) ?: return
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val fin = Date()
        val debut = Date(fin.time - jours * 86400_000L)
        info.text = "Chargement…"
        lifecycleScope.launch {
            try {
                val res = ApiClient.service().history(session.authHeader, v.id, fmt.format(debut), fmt.format(fin))
                val pts = res.points.map { GeoPoint(it.latitude, it.longitude) }
                info.text = "${pts.size} positions · ${res.distanceKm} km"
                val mv = map ?: return@launch
                mv.overlays.clear()
                if (pts.size >= 2) {
                    val line = Polyline().apply { setPoints(pts); outlinePaint.strokeWidth = 8f }
                    mv.overlays.add(line)
                    mv.zoomToBoundingBox(BoundingBox.fromGeoPoints(pts), false, 80)
                }
                mv.invalidate()
            } catch (e: Exception) {
                info.text = "Échec : ${e.message}"
            }
        }
    }

    override fun onResume() { super.onResume(); map?.onResume() }
    override fun onPause() { super.onPause(); map?.onPause() }
    override fun onDestroyView() { super.onDestroyView(); map?.onDetach(); map = null }
}
