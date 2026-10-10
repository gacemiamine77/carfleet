package dz.sr.units.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import dz.sr.units.R

class VehiculeAdapter(
    private var items: List<Vehicule>,
    private val onTap: (Vehicule) -> Unit,
    private val onChasser: (Vehicule) -> Unit
) : RecyclerView.Adapter<VehiculeAdapter.Holder>() {

    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val title: TextView = v.findViewById(R.id.tvVehTitle)
        val sub: TextView = v.findViewById(R.id.tvVehSub)
        val types: TextView = v.findViewById(R.id.tvVehTypes)
        val meta: TextView = v.findViewById(R.id.tvVehMeta)
        val btn: Button = v.findViewById(R.id.btnVehChasser)
    }

    fun submit(list: List<Vehicule>) {
        items = list
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_vehicule, parent, false)
        return Holder(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: Holder, position: Int) {
        val v = items[position]
        h.title.text = "🚗 ${v.libelle}"
        h.sub.text = listOfNotNull(
            v.carId.takeIf { it.isNotBlank() && it != v.immatriculation },
            v.conducteurNom,
            v.categorieVehicule
        ).joinToString(" · ")

        val graves = v.parType.sumOf { it.graves }
        val recidive = if (v.recidive >= 3) " · ⚠️ ${v.recidive}/30j" else ""
        h.types.text = v.parType.joinToString("\n") { t ->
            "• ${t.count} ${t.type}" + if (t.graves > 0) " (${t.graves} graves)" else ""
        }
        h.meta.text = "${v.total} infraction(s)" + if (graves > 0) " · $graves graves" else "" + recidive +
            " · ${v.lastAt.take(16).replace("T", " ")}"

        h.itemView.setOnClickListener { onTap(v) }
        h.btn.setOnClickListener { onChasser(v) }
    }
}
