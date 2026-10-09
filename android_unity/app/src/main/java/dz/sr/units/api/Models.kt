package dz.sr.units.api

data class Unite(
    val id: Int = 0,
    val code: String = "",
    val nom: String = "",
    val type: String = "",
    val moyen: String = "",
    val codeWilaya: String = "",
    val wilaya: String = "",
    val telephone: String? = null
)

data class LoginRequest(val username: String, val password: String)
data class LoginResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val expiresAt: String? = null,
    val unite: Unite? = null,
    val error: String? = null
)

data class MeResponse(
    val ok: Boolean = false,
    val username: String? = null,
    val unite: Unite? = null
)

data class Infraction(
    val id: Int = 0,
    val carId: String? = null,
    val immatriculation: String? = null,
    val conducteurNom: String? = null,
    val categorieVehicule: String? = null,
    val infraction: String = "",
    val restriction: String? = null,
    val roadName: String? = null,
    val troncon: String? = null,
    val vitesse: Double? = null,
    val vitesseLimite: Double? = null,
    val exces: Double? = null,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val codeWilaya: String? = null,
    val wilaya: String? = null,
    val statut: String = "nouveau",
    val recordedAt: String = "",
    val distM: Double? = null
)

data class Stats(
    val parType: Map<String, Int> = emptyMap(),
    val parCategorie: Map<String, Int> = emptyMap(),
    val parWilaya: Map<String, Int> = emptyMap(),
    val parStatut: Map<String, Int> = emptyMap()
)

data class InfractionsResponse(
    val infractions: List<Infraction> = emptyList(),
    val total: Int = 0,
    val stats: Stats? = null,
    val unite: Unite? = null,
    val error: String? = null
)

data class PatchStatutRequest(val id: Int, val statut: String)

data class UnitFeature(
    val geometry: UnitGeometry?,
    val properties: Unite?
)

data class UnitGeometry(val coordinates: List<Double>?)

data class UnitsGeoJson(val features: List<UnitFeature> = emptyList())
