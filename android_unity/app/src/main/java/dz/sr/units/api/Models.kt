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
    val marque: String? = null,
    val modele: String? = null,
    val couleur: String? = null,
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
    val assigneUniteId: Int? = null,
    val notifieAt: String? = null,
    val accepteUniteId: Int? = null,
    val accepteAt: String? = null,
    val clotureAt: String? = null,
    val resultat: String? = null,
    val compteRendu: String? = null,
    val recidive30: Int? = null,
    val recidiveGrave: Int? = null,
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

// ─── Route empruntée (trajet) ───────────────────────────────────
data class TrajetPoint(
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val vitesse: Double? = null,
    val cap: Double? = null,
    val recordedAt: String? = null
)

data class TrajetResponse(
    val ok: Boolean = false,
    val carId: String? = null,
    val immatriculation: String? = null,
    val marque: String? = null,
    val modele: String? = null,
    val couleur: String? = null,
    val total: Int = 0,
    val points: List<TrajetPoint> = emptyList(),
    val error: String? = null
)

// ─── Interception / chasse ──────────────────────────────────────
data class InterceptionUnite(
    val id: Int = 0,
    val code: String? = null,
    val nom: String? = null,
    val type: String? = null,
    val moyen: String? = null,
    val telephone: String? = null,
    val distKm: Double? = null,
    val etaMin: Int? = null,
    val latitude: Double? = null,
    val longitude: Double? = null
)

data class InterceptionCible(
    val carId: String? = null,
    val immatriculation: String? = null,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val vitesse: Double = 0.0,
    val recordedAt: String? = null
)

data class InterceptionPrediction(
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val methode: String? = null,
    val horizonMin: Int = 5
)

data class InterceptionResponse(
    val cible: InterceptionCible? = null,
    val prediction: InterceptionPrediction? = null,
    val wilaya: String? = null,
    val codeWilaya: String? = null,
    val unites: List<InterceptionUnite> = emptyList(),
    val error: String? = null
)

data class InterceptionAssignRequest(
    val infractionId: Int,
    val uniteId: Int? = null,
    val action: String? = null,
    val resultat: String? = null,
    val compteRendu: String? = null
)

data class NotificationUnite(
    val id: Int = 0,
    val type: String? = null,
    val titre: String? = null,
    val corps: String? = null,
    val infractionId: Int? = null,
    val uniteSourceId: Int? = null,
    val lu: Boolean = false,
    val createdAt: String? = null
)

data class NotificationsResponse(
    val ok: Boolean = false,
    val notifications: List<NotificationUnite> = emptyList(),
    val nonLues: Int = 0,
    val error: String? = null
)

data class MarquerLuesRequest(
    val id: Int? = null,
    val all: Boolean? = null,
    val lu: Boolean = true
)
