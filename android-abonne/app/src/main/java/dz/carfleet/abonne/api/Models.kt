package dz.carfleet.abonne.api

import com.google.gson.annotations.SerializedName

data class LoginRequest(val username: String, val password: String)

data class Proprietaire(
    val id: Int = 0,
    val type: String? = null,
    val nom: String? = null,
    val prenom: String? = null,
    val raisonSociale: String? = null,
    val adresse: String? = null,
    val wilaya: String? = null,
    val telephone: String? = null,
    val email: String? = null,
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

// ---------- Réponse générique {ok, error} ----------
data class OkResponse(val ok: Boolean = false, val error: String? = null)

// ---------- Inscription ----------
data class RegisterResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val expiresAt: String? = null,
    val proprietaire: Proprietaire? = null,
    val error: String? = null
)

// ---------- Forfaits ----------
data class Forfait(
    val id: Int = 0,
    val nom: String? = null,
    @SerializedName("type_compte") val typeCompte: String? = null,
    val prix: Double? = null,
    val devise: String? = null,
    val duree: String? = null,
    @SerializedName("limite_vehicules") val limiteVehicules: Int? = null,
    val georeperage: Boolean? = null,
    val actif: Boolean? = null
)

data class PlansResponse(val forfaits: List<Forfait> = emptyList(), val error: String? = null)

// ---------- Couleurs ----------
data class CouleursResponse(val couleurs: List<String> = emptyList(), val error: String? = null)

// ---------- Registre véhicules (fiches, sans suivi) ----------
data class OwnerVehicle(
    val id: Int = 0,
    val carId: String? = null,
    val numeroSerie: String? = null,
    val immatriculation: String? = null,
    val marque: String? = null,
    val modele: String? = null,
    val couleur: String? = null,
    val annee: Int? = null,
    val categorieVehicule: String? = null,
    val vin: String? = null,
    val longueur: Double? = null,
    val largeur: Double? = null,
    val hauteur: Double? = null,
    val telPrincipal: String? = null,
    val telSecondaire: String? = null,
    val nomInterne: String? = null,
    val service: String? = null,
    val responsable: String? = null,
    val actif: Boolean? = null,
    val isStolen: Boolean = false,
    val chauffeur: ChauffeurInfo? = null
)

data class OwnerVehiclesResponse(val vehicules: List<OwnerVehicle> = emptyList(), val error: String? = null)

data class VehiculeRef(
    val id: Int = 0,
    val carId: String? = null,
    val immatriculation: String? = null,
    val numeroSerie: String? = null
)

data class AddVehicleResponse(
    val ok: Boolean = false,
    val relie: Boolean = false,
    val vehicule: VehiculeRef? = null,
    val error: String? = null
)

// ---------- État compte / abonnement / paiements (abonné) ----------
data class PaiementOwner(
    val id: Int = 0,
    val montant: Double? = null,
    val devise: String? = null,
    val methode: String? = null,
    val reference: String? = null,
    val statut: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class StatutResponse(
    val actif: Boolean = false,
    val abonnement: Abonnement? = null,
    val paiements: List<PaiementOwner> = emptyList(),
    val error: String? = null
)

// ---------- Notifications ----------
data class Notif(
    val id: Int = 0,
    val type: String? = null,
    val titre: String? = null,
    val corps: String? = null,
    val lu: Boolean? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class NotifsResponse(
    val notifications: List<Notif> = emptyList(),
    val nonLues: Int = 0,
    val error: String? = null
)

// ---------- Zones ----------
data class ZoneAssign(@SerializedName("vehicle_id") val vehicleId: Int = 0, val actif: Boolean = false)

data class Zone(
    val id: Int = 0,
    val nom: String? = null,
    val type: String? = null,
    val actif: Boolean? = null,
    @SerializedName("centre_lat") val centreLat: Double? = null,
    @SerializedName("centre_lon") val centreLon: Double? = null,
    @SerializedName("rayon_m") val rayonM: Double? = null,
    val points: String? = null,
    val vehicules: List<ZoneAssign>? = null
) {
    fun sommets(): List<org.osmdroid.util.GeoPoint> {
        val raw = points ?: return emptyList()
        return try {
            val arr = org.json.JSONArray(raw)
            (0 until arr.length()).mapNotNull {
                val p = arr.optJSONArray(it) ?: return@mapNotNull null
                org.osmdroid.util.GeoPoint(p.optDouble(0), p.optDouble(1))
            }
        } catch (_: Exception) { emptyList() }
    }
}

data class ZonesResponse(val zones: List<Zone> = emptyList(), val error: String? = null)

data class ZoneEvent(
    val type: String? = null,
    val immatriculation: String? = null,
    val zone: String? = null,
    @SerializedName("occurred_at") val occurredAt: String? = null
)

data class ZoneEventsResponse(val evenements: List<ZoneEvent> = emptyList(), val error: String? = null)

// ---------- Admin ----------
data class AdminLoginResponse(
    val ok: Boolean = false,
    val token: String? = null,
    val username: String? = null,
    val role: String? = null,
    val error: String? = null
)

data class StatsComptes(
    val particuliers: Int = 0,
    val entreprises: Int = 0,
    @SerializedName("en_attente") val enAttente: Int = 0,
    val actifs: Int = 0,
    val suspendus: Int = 0,
    val expires: Int = 0
)

data class StatsAbo(
    @SerializedName("en_cours") val enCours: Int = 0,
    @SerializedName("expirent_bientot") val expirentBientot: Int = 0
)

data class StatsResponse(
    val comptes: StatsComptes? = null,
    val abonnements: StatsAbo? = null,
    @SerializedName("paiementsAVefifier") val paiementsAVerifier: Int = 0,
    val recettesConfirmees: Double = 0.0,
    val error: String? = null
)

data class AdminSubInfo(
    val id: Int = 0,
    val statut: String? = null,
    @SerializedName("debut_at") val debutAt: String? = null,
    @SerializedName("fin_at") val finAt: String? = null,
    val plan: String? = null,
    val prix: Double? = null,
    val devise: String? = null
)

data class AdminPayInfo(
    val id: Int = 0,
    val statut: String? = null,
    val montant: Double? = null,
    val devise: String? = null,
    val methode: String? = null,
    val reference: String? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class AdminCompte(
    val id: Int = 0,
    val type: String? = null,
    val nom: String? = null,
    val prenom: String? = null,
    @SerializedName("raison_sociale") val raisonSociale: String? = null,
    val telephone: String? = null,
    @SerializedName("statut_compte") val statutCompte: String? = null,
    val motif: String? = null,
    val username: String? = null,
    @SerializedName("nb_vehicules") val nbVehicules: Int = 0,
    val abonnement: AdminSubInfo? = null,
    val paiement: AdminPayInfo? = null
)

data class ComptesResponse(val comptes: List<AdminCompte> = emptyList(), val error: String? = null)

data class AdminPaiement(
    val id: Int = 0,
    val montant: Double? = null,
    val devise: String? = null,
    val methode: String? = null,
    val reference: String? = null,
    val statut: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    val plan: String? = null,
    val nom: String? = null,
    val prenom: String? = null,
    @SerializedName("raison_sociale") val raisonSociale: String? = null,
    val telephone: String? = null
)

data class PaiementsResponse(val paiements: List<AdminPaiement> = emptyList(), val error: String? = null)

data class VolAdmin(
    val dossier: Int = 0,
    val status: String? = null,
    @SerializedName("reported_at") val reportedAt: String? = null,
    @SerializedName("resolved_at") val resolvedAt: String? = null,
    val note: String? = null,
    @SerializedName("vu_par_admin") val vuParAdmin: Boolean = true,
    @SerializedName("vehicle_id") val vehicleId: Int = 0,
    val immatriculation: String? = null,
    val marque: String? = null,
    val modele: String? = null,
    val couleur: String? = null,
    val nom: String? = null,
    val prenom: String? = null,
    @SerializedName("raison_sociale") val raisonSociale: String? = null,
    val telephone: String? = null,
    @SerializedName("statut_compte") val statutCompte: String? = null,
    val username: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val speed: Double? = null,
    @SerializedName("position_at") val positionAt: String? = null
)

data class VolsResponse(val vols: List<VolAdmin> = emptyList(), val error: String? = null)

data class AdminVehicule(
    val id: Int = 0,
    val immatriculation: String? = null,
    val marque: String? = null,
    val modele: String? = null,
    val couleur: String? = null,
    val isStolen: Boolean = false,
    val nom: String? = null,
    val prenom: String? = null,
    @SerializedName("raison_sociale") val raisonSociale: String? = null,
    val telephone: String? = null,
    @SerializedName("statut_compte") val statutCompte: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val speed: Double? = null,
    @SerializedName("position_at") val positionAt: String? = null,
    @SerializedName("vol_ouvert") val volOuvert: Boolean = false,
    @SerializedName("zones_hors") val zonesHors: List<String> = emptyList()
)

data class AdminVehiculesResponse(val vehicules: List<AdminVehicule> = emptyList(), val error: String? = null)

data class AdminItVehicule(
    val id: Int = 0,
    val immatriculation: String? = null,
    val marque: String? = null,
    val modele: String? = null,
    @SerializedName("is_stolen") val isStolen: Boolean = false
)

data class AdminPositionsResponse(
    val vehicule: AdminItVehicule? = null,
    val distanceKm: Double = 0.0,
    val points: List<HistPoint> = emptyList(),
    val error: String? = null
)

data class AuditItem(
    val action: String? = null,
    val admin: String? = null,
    @SerializedName("cible_type") val cibleType: String? = null,
    @SerializedName("cible_id") val cibleId: Int? = null,
    @SerializedName("created_at") val createdAt: String? = null
)

data class AuditResponse(val journal: List<AuditItem> = emptyList(), val error: String? = null)

data class AdminUser(
    val id: Int = 0,
    val username: String? = null,
    val role: String? = null,
    val actif: Boolean = false,
    @SerializedName("created_at") val createdAt: String? = null
)

data class AdminsResponse(val admins: List<AdminUser> = emptyList(), val error: String? = null)

data class ReglagesResponse(
    val activationAuto: Boolean = false,
    val couleurs: List<String> = emptyList(),
    val error: String? = null
)

data class ExpirationsResponse(val ok: Boolean = false, val traites: Int = 0, val error: String? = null)
