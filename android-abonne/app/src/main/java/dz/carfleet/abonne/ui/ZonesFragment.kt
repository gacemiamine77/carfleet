package dz.carfleet.abonne.ui

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
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.api.OwnerVehicle
import dz.carfleet.abonne.api.Zone
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon

// Zones de géorepérage : création tactile (cercle/polygone), assignation, événements.
class ZonesFragment : Fragment() {
    private var map: MapView? = null
    private var zones: List<Zone> = emptyList()
    private var registre: List<OwnerVehicle> = emptyList()
    private var centre: GeoPoint? = null
    private val sommets = mutableListOf<GeoPoint>()
    private val brouillon = mutableListOf<org.osmdroid.views.overlay.Overlay>()
    private val traceZones = mutableListOf<org.osmdroid.views.overlay.Overlay>()
    private var etRayon: EditText? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "📍 Zones de géorepérage"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)

        val etNom = Ui.champ(ctx, "Nom*")
        val spType = Ui.liste(ctx, listOf("Cercle", "Polygone"))
        val etRayonLocal = Ui.champ(ctx, "Rayon (m)", numeric = true).apply { setText("500") }
        etRayon = etRayonLocal
        val etRayon = etRayonLocal
        val btnTerminer = Ui.bouton(ctx, "Terminer le polygone")
        val btnCreer = Ui.bouton(ctx, "Créer la zone")
        val mv = MapView(ctx).apply { layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(ctx, 320)) }
        map = mv
        Tiles.appliquer(mv, 0)
        mv.setMultiTouchControls(true)
        mv.controller.setZoom(6.0)
        mv.controller.setCenter(GeoPoint(35.8, 3.0))
        mv.overlays.add(
            MapEventsOverlay(object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean {
                    if (p == null) return false
                    if (spType.selectedItemPosition == 0) {
                        centre = p
                        redessinerBrouillon()
                    } else {
                        sommets.add(p)
                        redessinerBrouillon()
                    }
                    return true
                }
                override fun longPressHelper(p: GeoPoint?): Boolean = false
            })
        )
        val listZones = Ui.box(ctx)
        val spVehEvents = Ui.liste(ctx, listOf("Tous"))
        val btnEvents = Ui.bouton(ctx, "Charger les événements (7 j)")
        val listEvents = Ui.box(ctx)
        box.addView(Ui.texte(ctx, "Touchez la carte : centre du cercle, ou sommets du polygone."))
        box.addView(etNom)
        box.addView(spType)
        box.addView(etRayon)
        val rowBtn = Ui.row(ctx)
        rowBtn.addView(btnTerminer)
        rowBtn.addView(btnCreer)
        box.addView(rowBtn)
        box.addView(Tiles.spinner(ctx, 0) { Tiles.appliquer(mv, it) })
        box.addView(mv)
        box.addView(Ui.titre(ctx, "Mes zones", 16f))
        box.addView(listZones)
        box.addView(Ui.titre(ctx, "Événements entrée / sortie", 16f))
        box.addView(spVehEvents)
        box.addView(btnEvents)
        box.addView(listEvents)

        fun chargerRegistre() {
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().ownerVehicles(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        registre = r.v.vehicules
                        val items = mutableListOf("Tous")
                        items.addAll(registre.map { it.immatriculation ?: "—" })
                        spVehEvents.adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, items).apply {
                            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                        }
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }

        fun charger() {
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().zones(session.authHeader) }) {
                    is ApiResult.Ok -> {
                        zones = r.v.zones
                        tvErr.text = ""
                        dessinerZones()
                        listZones.removeAllViews()
                        if (zones.isEmpty()) listZones.addView(Ui.texte(ctx, "Aucune zone."))
                        for (z in zones) listZones.addView(ligneZone(view, session, z, tvErr, { charger() }))
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }

        btnTerminer.setOnClickListener {
            sommets.clear()
            centre = null
            redessinerBrouillon()
        }
        btnCreer.setOnClickListener {
            if (etNom.text.isBlank()) {
                tvErr.text = "Nom requis"
                return@setOnClickListener
            }
            lifecycleScope.launch {
                val body: Map<String, Any?> = if (spType.selectedItemPosition == 0) {
                    val c = centre
                    if (c == null) {
                        tvErr.text = "Touchez la carte pour placer le centre."
                        return@launch
                    }
                    mapOf(
                        "nom" to etNom.text.toString().trim(), "type" to "cercle",
                        "centreLat" to c.latitude, "centreLon" to c.longitude,
                        "rayonM" to (etRayon.text.toString().toDoubleOrNull() ?: 500.0)
                    )
                } else {
                    if (sommets.size < 3) {
                        tvErr.text = "Ajoutez au moins 3 sommets."
                        return@launch
                    }
                    mapOf(
                        "nom" to etNom.text.toString().trim(), "type" to "polygone",
                        "points" to sommets.map { listOf(it.latitude, it.longitude) }
                    )
                }
                when (val r = ApiHelper.run { ApiClient.service().creerZone(session.authHeader, body) }) {
                    is ApiResult.Ok -> {
                        etNom.text.clear()
                        sommets.clear()
                        centre = null
                        redessinerBrouillon()
                        charger()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnEvents.setOnClickListener {
            lifecycleScope.launch {
                val vid = if (spVehEvents.selectedItemPosition == 0) null else registre.getOrNull(spVehEvents.selectedItemPosition - 1)?.id
                when (val r = ApiHelper.run { ApiClient.service().evenementsZones(session.authHeader, vid) }) {
                    is ApiResult.Ok -> {
                        listEvents.removeAllViews()
                        if (r.v.evenements.isEmpty()) listEvents.addView(Ui.texte(ctx, "Aucun événement."))
                        for (e in r.v.evenements) {
                            listEvents.addView(
                                Ui.texte(ctx, "${if (e.type == "entree") "➡️ Entrée" else "⬅️ Sortie"} — ${e.immatriculation ?: ""} · ${e.zone ?: ""} · ${e.occurredAt?.take(16)?.replace('T', ' ') ?: ""}")
                            )
                        }
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        chargerRegistre()
        charger()
    }

    private fun redessinerBrouillon() {
        val mv = map ?: return
        brouillon.forEach { mv.overlays.remove(it) }
        brouillon.clear()
        centre?.let { c ->
            val rayon = etRayon?.text.toString().toDoubleOrNull() ?: 500.0
            val circle = Polygon().apply { points = Polygon.pointsAsCircle(c, rayon) }
            mv.overlays.add(circle)
            brouillon.add(circle)
        }
        if (sommets.isNotEmpty()) {
            for (p in sommets) {
                val m = Marker(mv).apply {
                    position = p
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                }
                mv.overlays.add(m)
                brouillon.add(m)
            }
            if (sommets.size >= 3) {
                val poly = Polygon().apply { points = sommets }
                mv.overlays.add(poly)
                brouillon.add(poly)
            }
        }
        mv.invalidate()
    }

    private fun dessinerZones() {
        val mv = map ?: return
        traceZones.forEach { mv.overlays.remove(it) }
        traceZones.clear()
        val bornes = mutableListOf<GeoPoint>()
        for (z in zones) {
            if (z.type == "cercle" && z.centreLat != null && z.centreLon != null) {
                val circle = Polygon().apply {
                    points = Polygon.pointsAsCircle(GeoPoint(z.centreLat, z.centreLon), z.rayonM ?: 500.0)
                }
                mv.overlays.add(circle)
                traceZones.add(circle)
                bornes.add(GeoPoint(z.centreLat, z.centreLon))
            } else {
                val pts = z.sommets()
                if (pts.size >= 3) {
                    val poly = Polygon().apply { points = pts }
                    mv.overlays.add(poly)
                    traceZones.add(poly)
                    bornes.addAll(pts)
                }
            }
        }
        if (bornes.size > 1) mv.zoomToBoundingBox(BoundingBox.fromGeoPoints(bornes), false, 80)
        mv.invalidate()
    }

    private fun ligneZone(view: View, session: SessionManager, z: Zone, tvErr: TextView, recharge: () -> Unit): View {
        val ctx = requireContext()
        val card = Ui.carte(ctx, "📍 ${z.nom ?: ""} (${z.type})${if (z.actif == false) " — inactif" else ""}")
        val assignes = (z.vehicules ?: emptyList()).filter { it.actif }.mapNotNull { a -> registre.find { it.id == a.vehicleId }?.immatriculation }
        card.addView(Ui.texte(ctx, if (assignes.isEmpty()) "Aucun véhicule lié." else "Liés : " + assignes.joinToString(", "), 13f))
        val spV = Ui.liste(ctx, registre.map { it.immatriculation ?: "—" })
        val btnLier = Ui.bouton(ctx, "Lier / Délier")
        btnLier.setOnClickListener {
            val v = registre.getOrNull(spV.selectedItemPosition) ?: return@setOnClickListener
            val deja = (z.vehicules ?: emptyList()).any { it.vehicleId == v.id && it.actif }
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().assignerZone(
                        session.authHeader,
                        mapOf("geofenceId" to z.id, "vehicleId" to v.id, "actif" to !deja)
                    )
                }) {
                    is ApiResult.Ok -> recharge()
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        val btnSuppr = Ui.bouton(ctx, "Supprimer")
        btnSuppr.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run { ApiClient.service().supprimerZone(session.authHeader, z.id) }) {
                    is ApiResult.Ok -> recharge()
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        card.addView(spV)
        val row = Ui.row(ctx)
        row.addView(btnLier)
        row.addView(btnSuppr)
        card.addView(row)
        return card
    }

    override fun onResume() { super.onResume(); map?.onResume() }
    override fun onPause() { super.onPause(); map?.onPause() }
    override fun onDestroyView() { super.onDestroyView(); map?.onDetach(); map = null }
}
