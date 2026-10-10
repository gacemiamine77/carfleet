package dz.sr.units.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import dz.sr.units.R
import dz.sr.units.api.Infraction

class InfractionAdapter(
    private var items: List<Infraction>,
    private val onTap: (Infraction) -> Unit,
    private val onStatut: ((Infraction, String) -> Unit)? = null,
    private val monUniteId: Int? = null,
    private val onFlux: ((Infraction, String) -> Unit)? = null
) : RecyclerView.Adapter<InfractionAdapter.Holder>() {

    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val title: TextView = v.findViewById(R.id.tvTitle)
        val sub: TextView = v.findViewById(R.id.tvSub)
        val meta: TextView = v.findViewById(R.id.tvMeta)
        val btn: Button = v.findViewById(R.id.btnDone)
        val btnFlux: Button = v.findViewById(R.id.btnFlux)
    }

    fun submit(list: List<Infraction>) {
        items = list
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_infraction, parent, false)
        return Holder(v)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: Holder, position: Int) {
        val x = items[position]
        val dist = Gravite.formatDist(x.distM)
        val recidive = (x.recidive30 ?: 0).takeIf { it >= 3 }?.let { " ⚠️ $it/30j" } ?: ""
        h.title.text = "${Gravite.pastille(x)} ${x.infraction} — ${x.immatriculation ?: x.carId ?: "—"}$recidive"
        h.sub.text = listOf(
            x.conducteurNom ?: "", x.categorieVehicule ?: "",
            "${x.vitesse?.toInt() ?: 0} km/h", dist
        ).filter { it.isNotBlank() }.joinToString(" · ")
        val resultat = if (!x.resultat.isNullOrBlank()) " · ${x.resultat}" else ""
        h.meta.text = "${x.recordedAt.take(16).replace("T", " ")} · ${x.statut}$resultat"
        h.itemView.setOnClickListener { onTap(x) }
        val mienne = monUniteId != null && monUniteId != 0 && x.assigneUniteId == monUniteId
        val flux = when {
            onFlux != null && mienne && x.statut == "notifie" -> "accepter"
            onFlux != null && mienne && x.statut == "en_cours" -> "cloturer"
            else -> null
        }
        if (flux != null) {
            h.btnFlux.visibility = View.VISIBLE
            h.btnFlux.text = if (flux == "accepter") "✅ Accepter" else "🏁 Clôturer"
            h.btnFlux.setOnClickListener { onFlux?.invoke(x, flux) }
        } else {
            h.btnFlux.visibility = View.GONE
        }
        val terminee = x.statut == "traite" || x.statut == "terminee" || x.statut == "abandonnee"
        if (onStatut != null && !terminee) {
            h.btn.visibility = View.VISIBLE
            h.btn.setOnClickListener { onStatut.invoke(x, "traite") }
        } else {
            h.btn.visibility = View.GONE
        }
    }
}
