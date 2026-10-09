package dz.sr.units.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import dz.sr.units.R
import dz.sr.units.api.Infraction
import dz.sr.units.api.TrajetResponse
import dz.sr.units.data.CachedUnite
import kotlinx.coroutines.launch
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Overlay
import org.osmdroid.views.overlay.Polyline

// 🗺️ Carte : infractions du territoire + unités (cache de tuiles osmdroid = hors-ligne partiel)
// + route empruntée d'un véhicule poursuivi + bouton « Chasser » (alerte unités proches).
class MapFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()
    private var map: MapView? = null
    private val markers = mutableMapOf<Int, Marker>()
    private val uniteMarkers = mutableListOf<Marker>()
    private val routeOverlays = mutableListOf<Overlay>()
    private var lastSignature: List<Pair<Int, String>>? = null
    private var cible: Infraction? = null
    private var chasseCarId: String? = null
    private var chasseVehicule: Vehicule? = null

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
        val btnChasser = view.findViewById<Button>(R.id.btnChasser)
        btnNav.setOnClickListener { naviguer() }
        btnChasser.setOnClickListener { ouvrirChasse() }

        vm.items.observe(viewLifecycleOwner) { drawInfractions() }
        vm.unites.observe(viewLifecycleOwner) { drawUnites(it) }
        vm.selected.observe(viewLifecycleOwner) { sel ->
            if (sel != null) {
                vm.selectedVehicule.value = null
                cible = sel
                btnNav.visibility = View.VISIBLE
                btnChasser.visibility = View.GONE
                effacerRoute()
                map?.controller?.setZoom(15.0)
                map?.controller?.setCenter(GeoPoint(sel.latitude, sel.longitude))
                markers[sel.id]?.showInfoWindow()
            }
        }
        vm.selectedVehicule.observe(viewLifecycleOwner) { v ->
            if (v != null) {
                vm.selected.value = null
                cible = null
                chasseCarId = v.carId
                chasseVehicule = v
                btnNav.visibility = View.GONE
                btnChasser.visibility = View.VISIBLE
                map?.controller?.setZoom(14.0)
                map?.controller?.setCenter(GeoPoint(v.lat, v.lon))
                viewLifecycleOwner.lifecycleScope.launch {
                    val tr = try { vm.trajet(v.carId) } catch (e: Exception) { null }
                    if (tr != null && tr.points.isNotEmpty()) dessinerRoute(tr)
                }
                if (vm.chasserAuto.value == true) {
                    vm.chasserAuto.value = false
                    ouvrirChasse()
                }
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
            m.icon = ContextCompat.getDrawable(requireContext(), Gravite.icone(x))
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

    /** Trace la route empruntée (polyline rouge + départ/arrivée) et cadre dessus. */
    private fun dessinerRoute(tr: TrajetResponse) {
        val mv = map ?: return
        effacerRoute()
        val pts = tr.points.filter { it.lat != 0.0 || it.lon != 0.0 }.map { GeoPoint(it.lat, it.lon) }
        if (pts.size >= 2) {
            val line = Polyline(mv)
            line.setPoints(pts)
            line.outlinePaint.color = 0xFFDC2626.toInt()
            line.outlinePaint.strokeWidth = 8f
            line.title = "Trajet ${tr.immatriculation ?: tr.carId}"
            mv.overlays.add(line)
            routeOverlays.add(line)
        }
        if (pts.isNotEmpty()) {
            val start = Marker(mv)
            start.position = pts.first()
            start.title = "Départ"
            start.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            mv.overlays.add(start); routeOverlays.add(start)

            val end = Marker(mv)
            end.position = pts.last()
            end.title = "Position actuelle"
            end.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            mv.overlays.add(end); routeOverlays.add(end)

            try { mv.zoomToBoundingBox(BoundingBox.fromGeoPoints(pts), true, 60) } catch (_: Exception) {}
        }
        mv.invalidate()
    }

    private fun effacerRoute() {
        val mv = map ?: return
        routeOverlays.forEach { mv.overlays.remove(it) }
        routeOverlays.clear()
    }

    /** Récupère les unités mobiles proches et propose de les alerter. */
    private fun ouvrirChasse() {
        val carId = chasseCarId ?: return
        val v = chasseVehicule
        val act = activity ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            val resp = try { vm.interception(carId) } catch (e: Exception) { null }
            if (resp == null) { Toast.makeText(context, "Chasse indisponible (réseau)", Toast.LENGTH_LONG).show(); return@launch }
            if (resp.error != null) { Toast.makeText(context, resp.error, Toast.LENGTH_LONG).show(); return@launch }
            if (resp.unites.isEmpty()) { Toast.makeText(context, "Aucune unité mobile à proximité", Toast.LENGTH_LONG).show(); return@launch }
            val labels = resp.unites.map { u ->
                "${u.nom ?: u.code} · ${u.distKm ?: "?"} km · ETA ${u.etaMin ?: "?"} min"
            }.toTypedArray()
            android.app.AlertDialog.Builder(act)
                .setTitle("🚨 Chasser — ${v?.libelle ?: carId}")
                .setItems(labels) { _, which ->
                    val u = resp.unites[which]
                    val infId = v?.derniereInfractionId ?: 0
                    viewLifecycleOwner.lifecycleScope.launch {
                        val ok = if (infId > 0) vm.assignerInterception(infId, u.id) else false
                        Toast.makeText(context, if (ok) "🚨 Unité ${u.code} alertée" else "Échec de l'alerte", Toast.LENGTH_LONG).show()
                    }
                }
                .setNegativeButton("Annuler", null)
                .show()
        }
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
        routeOverlays.clear()
        map?.onDetach()
        map = null
    }
}
