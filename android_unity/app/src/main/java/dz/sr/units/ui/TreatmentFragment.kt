package dz.sr.units.ui

import android.app.DatePickerDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import dz.sr.units.R
import java.util.Calendar

// 📋 Traitement : non traitées + filtres locaux (matricule, type, date) + « Traité » (file d'attente si hors-ligne).
// Filtres locaux (pas serveur) : la file d'attente offline reste cohérente et ça marche sans réseau.
class TreatmentFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()
    private lateinit var adapter: InfractionAdapter

    private var fType = "all"
    private var fPeriode = "all"   // all | today | 7d | 30d
    private var fJour: String? = null   // yyyy-MM-dd précis (bouton 📅), prioritaire sur fPeriode
    private var fPlaque = ""

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_treatment, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val rv = view.findViewById<RecyclerView>(R.id.rvTreat)
        val spType = view.findViewById<Spinner>(R.id.spType)
        val spPeriode = view.findViewById<Spinner>(R.id.spPeriode)
        val btnJour = view.findViewById<Button>(R.id.btnJour)
        val etPlaque = view.findViewById<EditText>(R.id.etPlaque)
        val btnPlaque = view.findViewById<Button>(R.id.btnPlaque)

        val types = listOf("Tous types", "exces de vitesse", "zone interdite",
            "circulation à contresens", "conduite longue sans arrêt",
            "arrêt interdit", "stationnement interdit", "impossible de comparée")
        spType.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, types).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        spPeriode.adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item,
            listOf("Toutes dates", "Aujourd'hui", "7 jours", "30 jours")).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

        spType.onItemSelectedListener = posListener { fType = if (spType.selectedItemPosition == 0) "all" else types[spType.selectedItemPosition]; appliquer() }
        spPeriode.onItemSelectedListener = posListener {
            fPeriode = when (spPeriode.selectedItemPosition) { 1 -> "today"; 2 -> "7d"; 3 -> "30d"; else -> "all" }
            if (fPeriode != "all") { fJour = null; btnJour.text = "📅 Jour : —" }
            appliquer()
        }
        btnJour.setOnClickListener {
            val c = Calendar.getInstance()
            DatePickerDialog(requireContext(), { _, y, m, d ->
                fJour = "%04d-%02d-%02d".format(y, m + 1, d)
                btnJour.text = "📅 Jour : $fJour ✕"
                appliquer()
            }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
        }
        btnJour.setOnLongClickListener { fJour = null; btnJour.text = "📅 Jour : —"; appliquer(); true }
        btnPlaque.setOnClickListener { fPlaque = etPlaque.text.toString().trim(); appliquer() }
        etPlaque.setOnEditorActionListener { _, _, _ -> fPlaque = etPlaque.text.toString().trim(); appliquer(); true }

        rv.layoutManager = LinearLayoutManager(context)
        adapter = InfractionAdapter(
            emptyList(),
            onTap = {
                vm.selected.value = it
                (activity as? MainActivity)?.navigateTo(R.id.nav_map)
            },
            onStatut = { x, s -> vm.setStatut(x.id, s) }
        )
        rv.adapter = adapter
        vm.items.observe(viewLifecycleOwner) { appliquer() }
        pollWhileStarted(vm)
    }

    private fun appliquer() {
        val q = fPlaque.lowercase()
        val now = System.currentTimeMillis()
        val dayMs = 86400_000L
        val debutJour = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val list = (vm.items.value.orEmpty())
            .filter { it.statut != "traite" }
            .filter { fType == "all" || it.infraction == fType }
            .filter { q.isBlank() || (it.immatriculation ?: "").lowercase().contains(q) || (it.carId ?: "").lowercase().contains(q) }
            .filter { x ->
                val t = runCatching { parseIso(x.recordedAt) }.getOrNull() ?: return@filter true
                if (fJour != null) isoDay(t) == fJour
                else when (fPeriode) {
                    "today" -> t >= debutJour
                    "7d" -> t >= now - 7 * dayMs
                    "30d" -> t >= now - 30 * dayMs
                    else -> true
                }
            }
            .sortedByDescending { it.recordedAt }
        if (::adapter.isInitialized) adapter.submit(list)
    }

    private fun parseIso(s: String): Long {
        // "2026-09-30T13:45:20(.000Z)" → epoch ms (UTC)
        val d = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        return d.parse(s.take(19))?.time ?: throw IllegalArgumentException("date")
    }

    private fun isoDay(t: Long): String {
        val d = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        return d.format(java.util.Date(t))
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
