package dz.sr.units.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import dz.sr.units.R

// 📊 Statistiques du territoire : chiffres serveur quand on est en ligne, calcul local sur le cache sinon
class StatsFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_stats, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val tvTotal: TextView = view.findViewById(R.id.tvTotal)
        val tvNew: TextView = view.findViewById(R.id.tvNew)
        val tvTypes: TextView = view.findViewById(R.id.tvTypes)
        val tvCats: TextView = view.findViewById(R.id.tvCats)

        fun fmt(m: Map<String, Int>) =
            m.entries.sortedByDescending { it.value }.joinToString("\n") { "${it.key} : ${it.value}" }.ifEmpty { "—" }

        fun render() {
            val list = vm.items.value.orEmpty()
            val total = vm.total.value ?: list.size
            val s = vm.stats.value.takeIf { vm.offline.value != true }

            tvTotal.text = if (total > list.size) "$total (${list.size} affichées)" else total.toString()
            tvNew.text = (if (s != null && s.parStatut.isNotEmpty()) s.parStatut["nouveau"] ?: 0
                          else list.count { it.statut == "nouveau" }).toString()
            tvTypes.text = fmt(if (s != null && s.parType.isNotEmpty()) s.parType
                               else list.groupingBy { it.infraction }.eachCount())
            tvCats.text = fmt(if (s != null && s.parCategorie.isNotEmpty()) s.parCategorie
                              else list.groupingBy { it.categorieVehicule ?: "leger" }.eachCount())
        }

        vm.items.observe(viewLifecycleOwner) { render() }
        vm.total.observe(viewLifecycleOwner) { render() }
        vm.stats.observe(viewLifecycleOwner) { render() }
        vm.offline.observe(viewLifecycleOwner) { render() }
        pollWhileStarted(vm)
    }
}
