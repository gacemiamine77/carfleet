package dz.carfleet.device.api

data class RegisterRequest(
    val username: String,
    val password: String,
    val type: String = "physique",
    val nom: String,
    val prenom: String,
    val age: Int,
    val telephone: String,
    val wilaya: String? = null,
    val codeWilaya: String? = null
)

data class Proprietaire(
    val id: Int = 0,
    val type: String? = null,
    val nom: String? = null,
    val prenom: String? = null,
    val raisonSociale: String? = null
)

data class RegisterResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val expiresAt: String? = null,
    val proprietaire: Proprietaire? = null,
    val error: String? = null
)

data class LoginRequest(val username: String, val password: String)

data class LoginResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val expiresAt: String? = null,
    val proprietaire: Proprietaire? = null,
    val error: String? = null
)

data class AddVehicleRequest(
    val immatriculation: String,
    val marque: String? = null,
    val modele: String? = null,
    val couleur: String? = null,
    val categorieVehicule: String = "leger",
    val numeroSerie: String? = null
)

data class OwnedVehicle(
    val id: Int = 0,
    val carId: String = "",
    val immatriculation: String = "",
    val marque: String? = null,
    val modele: String? = null
)

data class MyVehiclesResponse(
    val vehicules: List<OwnedVehicle> = emptyList()
)

data class AddDriverRequest(
    val voitureId: Int,
    val nom: String,
    val prenom: String,
    val telephone: String,
    val numeroPermis: String? = null,
    val wilaya: String? = null
)

data class VehiculeInfo(
    val id: Int = 0,
    val carId: String = "",
    val immatriculation: String = "",
    val numeroSerie: String? = null
)

data class AddVehicleResponse(
    val ok: Boolean = false,
    val vehicule: VehiculeInfo? = null,
    val error: String? = null
)

data class TrackPayload(
    val vehicle_id: String,
    val serial: String,
    val timestamp: String,
    val lat: Double,
    val lon: Double,
    val speed: Double,
    val heading: Double,
    val nom: String,
    val prenom: String,
    val age: Int,
    val marque: String,
    val modele: String,
    val immatriculation: String,
    val ax: Double,
    val ay: Double,
    val az: Double,
    val gx: Double,
    val gy: Double,
    val gz: Double
)

data class TrackResponse(
    val ok: Boolean = false,
    val inserted: Int = 0,
    val error: String? = null
)
