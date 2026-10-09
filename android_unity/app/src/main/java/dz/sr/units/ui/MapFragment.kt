package dz.sr.units.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import com.google.gson.Gson
import dz.sr.units.R
import dz.sr.units.api.Infraction
import dz.sr.units.api.InterceptionResponse
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
import retrofit2.HttpException

// 🗺️ Carte : infractions du territoire (marqueurs colorés par gravité) + unités (icône par type)
// + fond de carte multiple + couches activables (Tuiles/Unités/Trajet) + légende + bouton « Chasser ».
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
    private var chasseLastError: String? = null

    private var visInfractions = true
    private var visUnites = true
    private var visRoute = true

    /** Fonds de carte proposés (nom ↔ constructeur de source de tuiles). */
    private val fonds = listOf(
        "OSM" to { XYTileSource("OSMFrance", 0, 20, 256, ".png",
            arrayOf("https://a.tile.openstreetmap.fr/osmfr/", "https://b.tile.openstreetmap.fr/osmfr/", "https://c.tile.openstreetmap.fr/osmfr/")) },
        "Voyager" to { XYTileSource("CartoVoyager", 0, 20, 256, ".png",
            arrayOf("https://a.basemaps.cartocdn.com/rastertiles/voyager/")) },
        "Clair" to { XYTileSource("CartoLight", 0, 20, 256, ".png",
            arrayOf("https://a.basemaps.cartocdn.com/light_all/")) },
        "Relief" to { XYTileSource("OpenTopo", 0, 17, 256, ".png",
            arrayOf("https://tile.opentopomap.org/")) },
    )
    private val attributions = mapOf(
        "OSM" to "© OpenStreetMap contributors © OSM France",
        "Voyager" to "© OpenStreetMap contributors © CARTO",
        "Clair" to "© OpenStreetMap contributors © CARTO",
        "Relief" to "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)",
    )

    /** Icône d'une unité selon son moyen (motards, barrage…). */
    private fun iconeUnite(moyen: String?): Int = when (moyen?.trim()) {
        "motards" -> R.drawable.ic_unit_motards
        "barrage_fixe" -> R.drawable.ic_unit_barrage_fixe
        "barrage_mobile" -> R.drawable.ic_unit_barrage_mobile
        "vehicule_mobile" -> R.drawable.ic_unit_vehicule_mobile
        "poste_fixe" -> R.drawable.ic_unit_poste_fixe
        else -> R.drawable.ic_unit_marker
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_map, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val mv = view.findViewById<MapView>(R.id.osmMap)
        map = mv
        val tvAttr = view.findViewById<TextView>(R.id.tvAttributions)
        // Fond par défaut : OSM France + cache local osmdroid.
        setFond(0, tvAttr)

        mv.setMultiTouchControls(true)
        val c = Wilayas.centre(vm.session.unite?.codeWilaya)
        mv.controller.setZoom(9.0)
        mv.controller.setCenter(GeoPoint(c[0], c[1]))

        val btnNav = view.findViewById<Button>(R.id.btnNav)
        val btnChasser = view.findViewById<Button>(R.id.btnChasser)
        val btnBg = view.findViewById<Button>(R.id.btnBg)
        val panel = view.findViewById<LinearLayout>(R.id.panelLayers)
        btnNav.setOnClickListener { naviguer() }
        btnChasser.setOnClickListener { ouvrirChasse() }
        btnBg.setOnClickListener {
            panel.visibility = if (panel.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }

        view.findViewById<RadioGroup>(R.id.rgFond).setOnCheckedChangeListener { _, id ->
            when (id) {
                R.id.rbVoyager -> setFond(1, tvAttr)
                R.id.rbLight -> setFond(2, tvAttr)
                R.id.rbTopo -> setFond(3, tvAttr)
                else -> setFond(0, tvAttr)
            }
        }
        val cbInf = view.findViewById<CheckBox>(R.id.cbInfractions)
        val cbUni = view.findViewById<CheckBox>(R.id.cbUnites)
        val cbRou = view.findViewById<CheckBox>(R.id.cbRoute)
        cbInf.setOnCheckedChangeListener { _, b -> visInfractions = b; appliquerVisibilite() }
        cbUni.setOnCheckedChangeListener { _, b -> visUnites = b; appliquerVisibilite() }
        cbRou.setOnCheckedChangeListener { _, b -> visRoute = b; appliquerVisibilite() }

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

    private fun setFond(index: Int, tvAttr: TextView) {
        val mv = map ?: return
        val (nom, build) = fonds[index]
        mv.setTileSource(build())
        tvAttr.text = attributions[nom] ?: ""
        mv.invalidate()
    }

    /** Masque/affiche les couches selon les cases du panneau. */
    private fun appliquerVisibilite() {
        markers.values.forEach { it.setEnabled(visInfractions) }
        uniteMarkers.forEach { it.setEnabled(visUnites) }
        routeOverlays.forEach { it.setEnabled(visRoute) }
        map?.invalidate()
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
            m.setEnabled(visInfractions)
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
            m.snippet = "${u.type} · ${u.moyen} — ${u.code}"
            m.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            m.icon = ContextCompat.getDrawable(requireContext(), iconeUnite(u.moyen))
            m.setEnabled(visUnites)
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
            line.setEnabled(visRoute)
            mv.overlays.add(line)
            routeOverlays.add(line)
        }
        if (pts.isNotEmpty()) {
            val start = Marker(mv)
            start.position = pts.first()
            start.title = "Départ"
            start.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            start.setEnabled(visRoute)
            mv.overlays.add(start); routeOverlays.add(start)

            val end = Marker(mv)
            end.position = pts.last()
            end.title = "Position actuelle"
            end.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            end.setEnabled(visRoute)
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
            val infId = v?.derniereInfractionId ?: 0
            chasseLastError = null
            val resp = try { vm.interception(carId, infId.takeIf { it > 0 }) }
            catch (e: HttpException) {
                chasseLastError = try {
                    Gson().fromJson(e.response()?.errorBody()?.string(), InterceptionResponse::class.java)?.error
                } catch (_: Exception) { null }
                null
            }
            catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { null }
            if (resp == null && chasseLastError != null) {
                Toast.makeText(context, chasseLastError, Toast.LENGTH_LONG).show()
                return@launch
            }
            if (resp == null) {
                Toast.makeText(context, "Chasse impossible — serveur/session injoignable, réessayez", Toast.LENGTH_LONG).show()
                return@launch
            }
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