package dz.carfleet.device.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import dz.carfleet.device.R
import dz.carfleet.device.tracking.State
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline

// Carte : déplacement en direct (position + trace), fond OSM France
class DeviceMapFragment : Fragment() {
    private var map: MapView? = null
    private var me: Marker? = null
    private var trail: Polyline? = null
    private val pts = mutableListOf<GeoPoint>()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_map, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
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
        mv.controller.setZoom(15.0)
        val info = view.findViewById<TextView>(R.id.tvInfo)
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                var centered = false
                while (true) {
                    val lat = State.lastLat
                    val lon = State.lastLon
                    if (lat != null && lon != null) {
                        val gp = GeoPoint(lat, lon)
                        if (me == null) {
                            me = Marker(mv).apply {
                                position = gp
                                title = "Moi"
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                            }
                            mv.overlays.add(me)
                            trail = Polyline().apply { outlinePaint.strokeWidth = 8f }
                            mv.overlays.add(trail)
                        } else {
                            me!!.position = gp
                        }
                        val last = pts.lastOrNull()
                        if (last == null || last.distanceToAsDouble(gp) > 5) {
                            pts.add(gp)
                            if (pts.size > 500) pts.removeAt(0)
                            trail?.setPoints(pts.toList())
                        }
                        if (!centered) {
                            mv.controller.setCenter(gp)
                            centered = true
                        }
                        mv.invalidate()
                        info.text = "%.5f, %.5f — %.0f km/h".format(lat, lon, State.lastSpeed ?: 0.0)
                    } else {
                        info.text = "— en attente GPS (démarre l'envoi dans Statut) —"
                    }
                    delay(1000)
                }
            }
        }
    }

    override fun onResume() { super.onResume(); map?.onResume() }
    override fun onPause() { super.onPause(); map?.onPause() }
    override fun onDestroyView() { super.onDestroyView(); map?.onDetach(); map = null; me = null; trail = null }
}
