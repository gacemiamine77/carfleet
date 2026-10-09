package dz.sr.units.ui

import dz.sr.units.api.Infraction

/** Score de gravité — même formule que le serveur (route /api/unites/infractions). */
object Gravite {
    fun score(infraction: String, exces: Double?): Int = when (infraction) {
        "circulation à contresens" -> 100
        "zone interdite" -> 80
        "conduite longue sans arrêt" -> 50
        "exces de vitesse" -> 40 + minOf(exces?.toInt() ?: 0, 60)
        "arrêt interdit", "stationnement interdit" -> 30
        "impossible de comparée" -> 10
        else -> 20
    }

    fun score(x: Infraction): Int = score(x.infraction, x.exces)

    fun pastille(x: Infraction): String = when {
        score(x) >= 80 -> "🔴"
        score(x) >= 50 -> "🟠"
        else -> "🟡"
    }

    /** Marqueur carte : grave = rouge, moyen = orange, sinon vert. */
    fun icone(x: Infraction): Int = when {
        score(x) >= 80 -> dz.sr.units.R.drawable.ic_marker_grave
        score(x) >= 50 -> dz.sr.units.R.drawable.ic_marker_moyen
        else -> dz.sr.units.R.drawable.ic_marker_faible
    }

    fun formatDist(m: Double?): String {
        if (m == null) return ""
        return if (m < 1000) "à ${m.toInt()} m" else "à ${"%.1f".format(m / 1000)} km"
    }
}
