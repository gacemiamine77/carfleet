package dz.sr.units.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import dz.sr.units.R
import dz.sr.units.api.Infraction
import dz.sr.units.data.CachedUnite
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

// 🗺️ Carte : infractions du territoire + unités (cache de tuiles osmdroid = hors-ligne partiel)
class MapFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()
    private var map: MapView? = null
    private val markers = mutableMapOf<Int, Marker>()
    private val uniteMarkers = mutableListOf<Marker>()
    private var lastSignature: List<Pair<Int, String>>? = null
    private var cible: Infraction? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_map, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val mv = view.findViewById<MapView>(R.id.osmMap)
        map = mv
        // Fond OSM France + cache local osmdroid. Attribution affichée dans le layout.
        mv.setTileSource(XYTileSource(
            "OSMFrance", 0, 20, 256, ".png",
            arrayOf(
                "https://a.tile.openstreetmap.fr/osmfr/",
                "https://b.tile.openstreetmap.fr/osmfr/",
                "https://c.tile.openstreetmap.fr/osmfr/"
            )
        ))
        mv.setMultiTouchControls(true)
        // Zoom par défaut sur la wilaya du compte connecté
        val c = Wilayas.centre(vm.session.unite?.codeWilaya)
        mv.controller.setZoom(9.0)
        mv.controller.setCenter(GeoPoint(c[0], c[1]))

        val btnNav = view.findViewById<Button>(R.id.btnNav)
        btnNav.setOnClickListener { naviguer() }
        vm.items.observe(viewLifecycleOwner) { drawInfractions() }
        vm.unites.observe(viewLifecycleOwner) { drawUnites(it) }
        vm.selected.observe(viewLifecycleOwner) { sel ->
            if (sel != null) {
                cible = sel
                btnNav.visibility = View.VISIBLE
                map?.controller?.setZoom(15.0)
                map?.controller?.setCenter(GeoPoint(sel.latitude, sel.longitude))
                markers[sel.id]?.showInfoWindow()
                vm.selected.value = null   // consommé : ne recentre plus aux prochains retours sur l'onglet
            }
        }
        pollWhileStarted(vm)
    }

    private fun drawInfractions() {
        val mv = map ?: return
        val list = vm.items.value.orEmpty().take(500)
        // Ne redessine que si quelque chose a changé (sinon la bulle d'info ouverte se ferme toutes les 5 s)
        val signature = list.map { it.id to it.statut }
        if (signature == lastSignature) return
        lastSignature = signature

        markers.values.forEach { mv.overlays.remove(it) }
        markers.clear()
        list.forEach { x ->
            val m = Marker(mv)
            m.position = GeoPoint(x.latitude, x.longitude)
            m.title = "${x.infraction} — ${x.immatriculation ?: x.carId ?: "—"}"
            m.snippet = "${x.recordedAt.take(16).replace("T", " ")} · ${x.vitesse?.toInt() ?: 0} km/h · ${x.statut}"
            m.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            mv.overlays.add(m)
            markers[x.id] = m
        }
        mv.invalidate()
    }

    private fun drawUnites(list: List<CachedUnite>) {
        val mv = map ?: return
        uniteMarkers.forEach { mv.overlays.remove(it) }
        uniteMarkers.clear()
        list.forEach { u ->
            val m = Marker(mv)
            m.position = GeoPoint(u.latitude, u.longitude)
            m.title = "🚓 ${u.nom}"
            m.snippet = "${u.type} · ${u.moyen}"
            m.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            // Icône dédiée (l'icône par défaut d'osmdroid est partagée : la teinter colorierait tous les marqueurs)
            m.icon = ContextCompat.getDrawable(requireContext(), R.drawable.ic_unit_marker)
            mv.overlays.add(m)
            uniteMarkers.add(m)
        }
        mv.invalidate()
    }

    /** Ouvre l'itinéraire vers le point (Google Maps/Waze si présents, sinon carte générique). */
    private fun naviguer() {
        val c = cible ?: return
        val label = Uri.encode("${c.infraction} ${c.immatriculation ?: ""}".trim())
        val tries = listOf(
            Uri.parse("google.navigation:q=${c.latitude},${c.longitude}"),
            Uri.parse("geo:${c.latitude},${c.longitude}?q=${c.latitude},${c.longitude}($label)")
        )
        for (uri in tries) {
            val i = Intent(Intent.ACTION_VIEW, uri)
            if (i.resolveActivity(requireContext().packageManager) != null) {
                startActivity(i)
                return
            }
        }
    }

    override fun onResume() { super.onResume(); map?.onResume() }
    override fun onPause() { super.onPause(); map?.onPause() }
    override fun onDestroyView() {
        super.onDestroyView()
        markers.clear()
        uniteMarkers.clear()
        map?.onDetach()
        map = null
    }
}
