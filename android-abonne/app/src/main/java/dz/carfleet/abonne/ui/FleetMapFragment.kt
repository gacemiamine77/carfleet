package dz.carfleet.abonne.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.LiveVehicle
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

// Carte : positions temps réel de mes véhicules (polling 10 s).
class FleetMapFragment : Fragment() {
    private var map: MapView? = null
    private val markers = mutableMapOf<Int, Marker>()
    private var fitted = false

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_map, container, false)
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
        val info = view.findViewById<TextView>(R.id.tvInfo)
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    try {
                        val res = ApiClient.service().live(session.authHeader)
                        dessiner(res.vehicules)
                        val n = res.vehicules.count { it.live != null }
                        info.text = "${res.vehicules.size} véhicule(s) · $n en ligne"
                    } catch (e: Exception) {
                        info.text = "Échec : ${e.message}"
                    }
                    delay(10000)
                }
            }
        }
    }

    private fun dessiner(vehicules: List<LiveVehicle>) {
        val mv = map ?: return
        val vus = mutableSetOf<Int>()
        val bornes = mutableListOf<GeoPoint>()
        for (v in vehicules) {
            val live = v.live ?: continue
            val gp = GeoPoint(live.latitude, live.longitude)
            bornes.add(gp)
            val m = markers[v.id] ?: Marker(mv).apply {
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                mv.overlays.add(this)
                markers[v.id] = this
            }
            m.position = gp
            m.title = "${v.immatriculation ?: ""} — ${live.speed?.toInt() ?: 0} km/h"
            m.icon = dot(if (ageMin(live.recordedAt) > 10) "#94a3b8" else if ((live.speed ?: 0.0) >= 5) "#16a34a" else "#f59e0b")
            vus.add(v.id)
        }
        for ((id, m) in markers.toMap()) {
            if (id !in vus) {
                mv.overlays.remove(m)
                markers.remove(id)
            }
        }
        if (!fitted && bornes.isNotEmpty()) {
            fitted = true
            mv.zoomToBoundingBox(BoundingBox.fromGeoPoints(bornes), false, 80)
        }
        mv.invalidate()
    }

    private fun ageMin(iso: String?): Double {
        if (iso == null) return Double.MAX_VALUE
        return try {
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            (System.currentTimeMillis() - (fmt.parse(iso.take(19))?.time ?: 0)) / 60000.0
        } catch (_: Exception) { Double.MAX_VALUE }
    }

    private fun dot(couleur: String): android.graphics.drawable.Drawable {
        val d = android.graphics.drawable.GradientDrawable()
        d.shape = android.graphics.drawable.GradientDrawable.OVAL
        d.setColor(android.graphics.Color.parseColor(couleur))
        d.setStroke(4, android.graphics.Color.WHITE)
        d.setSize(44, 44)
        return d
    }

    override fun onResume() { super.onResume(); map?.onResume() }
    override fun onPause() { super.onPause(); map?.onPause() }
    override fun onDestroyView() { super.onDestroyView(); map?.onDetach(); map = null; markers.clear() }
}
