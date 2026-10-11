package dz.carfleet.abonne.api

import com.google.gson.annotations.SerializedName

data class LoginRequest(val username: String, val password: String)

data class Proprietaire(
    val id: Int = 0,
    val type: String? = null,
    val nom: String? = null,
    val prenom: String? = null,
    val raisonSociale: String? = null,
    val telephone: String? = null,
    val statutCompte: String? = null,
    val nbVehicules: Int? = null
)

data class Abonnement(
    val id: Int = 0,
    val plan: String? = null,
    val statut: String? = null,
    val debut: String? = null,
    val fin: String? = null,
    val prix: Double? = null,
    val devise: String? = null
)

data class LoginResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val expiresAt: String? = null,
    val proprietaire: Proprietaire? = null,
    val actif: Boolean = false,
    val abonnement: Abonnement? = null,
    val error: String? = null
)

data class ProfilResponse(
    val proprietaire: Proprietaire? = null,
    val actif: Boolean = false,
    val abonnement: Abonnement? = null,
    val error: String? = null
)

data class ChauffeurInfo(
    val id: Int = 0,
    val nom: String? = null,
    val prenom: String? = null,
    val telephone: String? = null
)

data class LiveInfo(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val speed: Double? = null,
    val heading: Double? = null,
    val recordedAt: String? = null
)

data class LiveVehicle(
    val id: Int = 0,
    val carId: String? = null,
    val immatriculation: String? = null,
    val marque: String? = null,
    val modele: String? = null,
    val couleur: String? = null,
    val isStolen: Boolean = false,
    val live: LiveInfo? = null,
    val chauffeur: ChauffeurInfo? = null
)

data class LiveResponse(
    val vehicules: List<LiveVehicle> = emptyList(),
    val error: String? = null
)

data class HistPoint(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val speed: Double? = null,
    val heading: Double? = null,
    @SerializedName("recorded_at") val recordedAt: String? = null,
    @SerializedName("distance_m") val distanceM: Double? = null
)

data class HistoryResponse(
    val distanceKm: Double = 0.0,
    val points: List<HistPoint> = emptyList(),
    val error: String? = null
)
