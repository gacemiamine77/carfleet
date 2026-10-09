package dz.sr.units.ui

import dz.sr.units.api.Infraction

/** Comptage d'un type d'infraction pour un véhicule. */
data class TypeCompte(val type: String, val count: Int, val graves: Int)

/** Véhicule ayant commis au moins une infraction (regroupement). */
data class Vehicule(
    val carId: String,
    val immatriculation: String?,
    val marque: String?,
    val modele: String?,
    val couleur: String?,
    val conducteurNom: String?,
    val categorieVehicule: String?,
    val total: Int,
    val parType: List<TypeCompte>,
    val lastAt: String,
    val lat: Double,
    val lon: Double,
    val derniereInfractionId: Int
) {
    /** « Doblo gris, 125487-125-48 » */
    val libelle: String get() = buildString {
        val veh = listOfNotNull(
            marque?.takeIf { it.isNotBlank() },
            modele?.takeIf { it.isNotBlank() },
            couleur?.takeIf { it.isNotBlank() }
        ).joinToString(" ")
        if (veh.isNotBlank()) append(veh)
        if (!immatriculation.isNullOrBlank()) {
            if (isNotEmpty()) append(", ")
            append(immatriculation)
        }
        if (isEmpty()) append(carId)
    }
}

object Vehicules {
    /** Une infraction est « grave » à partir du palier orange (score ≥ 50). */
    fun grave(x: Infraction): Boolean = Gravite.score(x) >= 50

    fun grouper(items: List<Infraction>): List<Vehicule> {
        return items.groupBy { it.carId ?: it.immatriculation ?: "?" }.map { (carId, list) ->
            val dernier = list.maxByOrNull { it.recordedAt }!!
            val parType = list.groupBy { it.infraction }.map { (t, l) ->
                TypeCompte(t, l.size, l.count { grave(it) })
            }.sortedByDescending { it.count }
            Vehicule(
                carId = carId,
                immatriculation = list.firstNotNullOfOrNull { it.immatriculation?.takeIf { s -> s.isNotBlank() } },
                marque = list.firstNotNullOfOrNull { it.marque?.takeIf { s -> s.isNotBlank() } },
                modele = list.firstNotNullOfOrNull { it.modele?.takeIf { s -> s.isNotBlank() } },
                couleur = list.firstNotNullOfOrNull { it.couleur?.takeIf { s -> s.isNotBlank() } },
                conducteurNom = list.firstNotNullOfOrNull { it.conducteurNom?.takeIf { s -> s.isNotBlank() } },
                categorieVehicule = list.firstNotNullOfOrNull { it.categorieVehicule },
                total = list.size,
                parType = parType,
                lastAt = dernier.recordedAt,
                lat = dernier.latitude,
                lon = dernier.longitude,
                derniereInfractionId = dernier.id
            )
        }.sortedByDescending { it.lastAt }
    }
}
