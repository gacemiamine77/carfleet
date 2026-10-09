package dz.sr.units.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.gms.location.LocationServices
import dz.sr.units.R
import dz.sr.units.ui.SharedViewModel.FiltreUI

// 🚨 Alertes : filtres V1 (période, plaque, tri, autour de moi) + tap = localiser sur carte
class AlertsFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()
    private var moiOn = false

    private val permGPS = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) activerMoi() else Toast.makeText(context, "GPS refusé : « Autour de moi » indisponible", Toast.LENGTH_SHORT).show()
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_alerts, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val rv = view.findViewById<RecyclerView>(R.id.rv)
        val swipe = view.findViewById<SwipeRefreshLayout>(R.id.swipe)
        val tvOff = view.findViewById<TextView>(R.id.tvOffline)
        val spPeriode = view.findViewById<Spinner>(R.id.spPeriode)
        val spTri = view.findViewById<Spinner>(R.id.spTri)
        val spRayon = view.findViewById<Spinner>(R.id.spRayon)
        val btnMoi = view.findViewById<Button>(R.id.btnMoi)
        val etSearch = view.findViewById<EditText>(R.id.etSearch)
        val btnSearch = view.findViewById<Button>(R.id.btnSearch)

        spPeriode.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item,
            listOf("Toutes périodes", "Aujourd'hui", "7 jours", "30 jours")).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        spTri.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item,
            listOf("Tri : récent", "Tri : gravité", "Tri : distance")).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        spRayon.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item,
            listOf("5 km", "10 km", "20 km")).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        spRayon.setSelection(1)

        // Reflète les filtres courants (retour sur l'onglet)
        val cur = vm.filtre.value ?: FiltreUI()
        spPeriode.setSelection(when (cur.periode) { "today" -> 1; "7d" -> 2; "30d" -> 3; else -> 0 })
        spTri.setSelection(when (cur.tri) { "gravite" -> 1; "distance" -> 2; else -> 0 })
        etSearch.setText(cur.q)
        moiOn = cur.lat != null
        majBoutonMoi(btnMoi, spRayon)

        spPeriode.onItemSelectedListener = posListener {
            appliquer(view, mapOf("periode" to when (spPeriode.selectedItemPosition) {
                1 -> "today"; 2 -> "7d"; 3 -> "30d"; else -> "all"
            }))
        }
        spTri.onItemSelectedListener = posListener {
            appliquer(view, mapOf("tri" to when (spTri.selectedItemPosition) {
                1 -> "gravite"; 2 -> "distance"; else -> "recent"
            }))
        }
        spRayon.onItemSelectedListener = posListener {
            if (moiOn) appliquer(view, mapOf("rayon" to when (spRayon.selectedItemPosition) {
                0 -> 5000; 2 -> 20000; else -> 10000
            }))
        }
        btnSearch.setOnClickListener { appliquer(view, mapOf("q" to etSearch.text.toString().trim())) }
        etSearch.setOnEditorActionListener { _, _, _ -> appliquer(view, mapOf("q" to etSearch.text.toString().trim())); true }
        btnMoi.setOnClickListener {
            if (moiOn) {
                moiOn = false
                majBoutonMoi(btnMoi, spRayon)
                appliquer(view, mapOf("lat" to null, "lon" to null))
            } else if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED) {
                activerMoi()
            } else {
                permGPS.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }

        rv.layoutManager = LinearLayoutManager(context)
        val adapter = InfractionAdapter(emptyList(), onTap = {
            vm.selected.value = it
            (activity as? MainActivity)?.navigateTo(R.id.nav_map)
        })
        rv.adapter = adapter

        vm.items.observe(viewLifecycleOwner) { adapter.submit(it) }
        vm.offline.observe(viewLifecycleOwner) { tvOff.visibility = if (it) View.VISIBLE else View.GONE }
        vm.loading.observe(viewLifecycleOwner) { swipe.isRefreshing = it }
        swipe.setOnRefreshListener { vm.refresh() }
        pollWhileStarted(vm)
    }

    private fun appliquer(view: View, patch: Map<String, Any?>) {
        val f = (vm.filtre.value ?: FiltreUI()).copy()
        patch.forEach { (k, v) ->
            when (k) {
                "periode" -> f.periode = v as String
                "q" -> f.q = v as String
                "tri" -> f.tri = v as String
                "rayon" -> f.rayon = v as Int
                "lat" -> f.lat = v as Double?
                "lon" -> f.lon = v as Double?
            }
        }
        vm.setFiltre(f)
    }

    private fun majBoutonMoi(btn: Button, spRayon: Spinner) {
        btn.text = if (moiOn) "📍 Autour de moi : ON" else "📍 Autour de moi : OFF"
        spRayon.visibility = if (moiOn) View.VISIBLE else View.GONE
    }

    private fun activerMoi() {
        try {
            LocationServices.getFusedLocationProviderClient(requireContext()).lastLocation
                .addOnSuccessListener { loc ->
                    if (loc != null) {
                        moiOn = true
                        view?.let { v ->
                            majBoutonMoi(v.findViewById(R.id.btnMoi), v.findViewById(R.id.spRayon))
                        }
                        val f = (vm.filtre.value ?: FiltreUI()).copy()
                        f.lat = loc.latitude; f.lon = loc.longitude
                        if (f.tri == "recent") f.tri = "distance"
                        vm.setFiltre(f)
                    } else {
                        Toast.makeText(context, "Position GPS indisponible pour le moment", Toast.LENGTH_SHORT).show()
                    }
                }
        } catch (_: SecurityException) {
            Toast.makeText(context, "GPS refusé", Toast.LENGTH_SHORT).show()
        }
    }

    private fun posListener(onPos: () -> Unit) = object : android.widget.AdapterView.OnItemSelectedListener {
        private var first = true
        override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
            if (first) { first = false; return }   // ignore l'init
            onPos()
        }
        override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
    }
}
