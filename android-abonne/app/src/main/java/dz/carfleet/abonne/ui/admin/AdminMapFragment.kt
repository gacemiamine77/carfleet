package dz.carfleet.abonne.ui.admin

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.AdminVehicule
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.Tiles
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Carte admin : positions (volés / hors zone au choix) + itinéraires.
class AdminMapFragment : Fragment() {
    private var map: MapView? = null
    private var spVeh: Spinner? = null
    private var vehicules: List<AdminVehicule> = emptyList()
    private var fitted = false

    companion object {
        fun pourVehicule(id: Int) = AdminMapFragment().apply {
            arguments = Bundle().apply { putInt("vehicleId", id) }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "🗺️ Carte admin"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)

        val cbVoles = CheckBox(ctx).apply { text = "Volés uniquement" }
        val cbHorsZone = CheckBox(ctx).apply { text = "Hors zone uniquement" }
        val etQ = Ui.champ(ctx, "Recherche (immat, nom, téléphone)")
        val btnAfficher = Ui.bouton(ctx, "Afficher")
        val spVehLocal = Ui.liste(ctx, listOf("—"))
        spVeh = spVehLocal
        val spVeh = spVehLocal
        val btnItineraire = Ui.bouton(ctx, "Itinéraire (24 h)")
        val tvInfo = Ui.texte(ctx, "🔴 volé · 🟠 hors zone · 🟢 en règle", 13f)
        val mv = MapView(ctx).apply { layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, Ui.dp(ctx, 340)) }
        map = mv
        Tiles.appliquer(mv, 0)
        mv.setMultiTouchControls(true)
        mv.controller.setZoom(6.0)
        mv.controller.setCenter(GeoPoint(35.8, 3.0))
        box.addView(cbVoles)
        box.addView(cbHorsZone)
        box.addView(etQ)
        box.addView(btnAfficher)
        box.addView(Tiles.spinner(ctx, 0) { Tiles.appliquer(mv, it) })
        box.addView(mv)
        box.addView(spVeh)
        box.addView(btnItineraire)
        box.addView(tvInfo)

        fun charger(preselect: Int = 0) {
            tvErr.text = "Chargement…"
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().adminVehicules(
                        session.authHeader,
                        if (cbVoles.isChecked) "1" else null,
                        if (cbHorsZone.isChecked) "1" else null,
                        etQ.text.toString().trim().ifBlank { null }
                    )
                }) {
                    is ApiResult.Ok -> {
                        tvErr.text = ""
                        vehicules = r.v.vehicules
                        spVeh.adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item,
                            vehicules.map {
                                "${if (it.volOuvert || it.isStolen) "🚨 " else ""}${if (it.zonesHors.isNotEmpty()) "⚠️ " else ""}${it.immatriculation} — ${it.raisonSociale ?: listOfNotNull(it.prenom, it.nom).joinToString(" ")}"
                            }).apply { setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item) }
                        dessiner()
                        tvInfo.text = "${vehicules.size} véhicule(s) · 🔴 volé · 🟠 hors zone · 🟢 en règle"
                        val pre = arguments?.getInt("vehicleId", 0) ?: preselect
                        if (pre != 0) {
                            val i = vehicules.indexOfFirst { it.id == pre }
                            if (i >= 0) {
                                spVeh.setSelection(i)
                                itineraire(tvErr, tvInfo)
                            }
                        }
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnAfficher.setOnClickListener { fitted = false; charger() }
        btnItineraire.setOnClickListener { itineraire(tvErr, tvInfo) }
        charger()
    }

    private fun dot(couleur: String): android.graphics.drawable.Drawable {
        val d = GradientDrawable()
        d.shape = GradientDrawable.OVAL
        d.setColor(Color.parseColor(couleur))
        d.setStroke(4, Color.WHITE)
        d.setSize(44, 44)
        return d
    }

    private fun dessiner() {
        val mv = map ?: return
        mv.overlays.clear()
        val bornes = mutableListOf<GeoPoint>()
        for (v in vehicules) {
            if (v.latitude == null || v.longitude == null) continue
            val gp = GeoPoint(v.latitude, v.longitude)
            bornes.add(gp)
            val vole = v.volOuvert || v.isStolen
            val hz = v.zonesHors.isNotEmpty()
            val m = Marker(mv).apply {
                position = gp
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                title = "${v.immatriculation ?: ""} — ${v.speed?.toInt() ?: 0} km/h"
                snippet = "${v.raisonSociale ?: listOfNotNull(v.prenom, v.nom).joinToString(" ")} · ${v.telephone ?: ""}" +
                    (if (hz) "\nHors : ${v.zonesHors.joinToString(", ")}" else "")
                icon = dot(if (vole) "#dc2626" else if (hz) "#f59e0b" else "#16a34a")
            }
            mv.overlays.add(m)
        }
        if (!fitted && bornes.size > 1) {
            fitted = true
            mv.zoomToBoundingBox(BoundingBox.fromGeoPoints(bornes), false, 80)
        } else if (!fitted && bornes.size == 1) {
            fitted = true
            mv.controller.setCenter(bornes[0])
            mv.controller.setZoom(13.0)
        }
        mv.invalidate()
    }

    private fun itineraire(tvErr: TextView, tvInfo: TextView) {
        val sp = spVeh ?: return
        val v = vehicules.getOrNull(sp.selectedItemPosition) ?: return
        val session = SessionManager(requireContext())
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val fin = Date()
        val debut = Date(fin.time - 86400_000L)
        tvInfo.text = "Chargement de l'itinéraire…"
        viewLifecycleOwner.lifecycleScope.launch {
            when (val r = ApiHelper.run {
                ApiClient.service().adminPositions(session.authHeader, v.id, fmt.format(debut), fmt.format(fin))
            }) {
                is ApiResult.Ok -> {
                    val pts = r.v.points.map { GeoPoint(it.latitude, it.longitude) }
                    tvInfo.text = "${v.immatriculation} : ${pts.size} positions · ${r.v.distanceKm} km (24 h)"
                    val mv = map ?: return@launch
                    mv.overlays.removeAll { it is Polyline }
                    if (pts.size >= 2) {
                        val line = Polyline().apply {
                            setPoints(pts)
                            outlinePaint.strokeWidth = 8f
                            outlinePaint.color = if (v.volOuvert || v.isStolen) Color.parseColor("#dc2626") else Color.parseColor("#0f3d2e")
                        }
                        mv.overlays.add(line)
                        mv.zoomToBoundingBox(BoundingBox.fromGeoPoints(pts), false, 80)
                    } else if (pts.size == 1) {
                        mv.controller.setCenter(pts[0])
                        mv.controller.setZoom(13.0)
                    }
                    mv.invalidate()
                }
                is ApiResult.Err -> tvErr.text = r.msg
            }
        }
    }

    override fun onResume() { super.onResume(); map?.onResume() }
    override fun onPause() { super.onPause(); map?.onPause() }
    override fun onDestroyView() { super.onDestroyView(); map?.onDetach(); map = null }
}
