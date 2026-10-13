package dz.carfleet.abonne.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {
    // ---------- Abonné : auth ----------
    @POST("api/proprietaires/auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("api/proprietaires/auth/register")
    suspend fun register(@Body body: Map<String, @JvmSuppressWildcards Any?>): RegisterResponse

    @GET("api/proprietaires/profil")
    suspend fun profil(@Header("Authorization") auth: String): ProfilResponse

    @PATCH("api/proprietaires/profil")
    suspend fun patchProfil(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    // ---------- Abonné : catalogue / abonnement ----------
    @GET("api/fleet/plans")
    suspend fun plans(@Query("type") type: String? = null): PlansResponse

    @GET("api/fleet/couleurs")
    suspend fun couleurs(): CouleursResponse

    @POST("api/fleet/abonnement")
    suspend fun choisirAbonnement(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @POST("api/fleet/abonnement/annuler")
    suspend fun annulerAbonnement(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @POST("api/fleet/compte/suppression")
    suspend fun demanderSuppression(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @POST("api/fleet/compte/suppression/annuler")
    suspend fun annulerSuppression(
        @Header("Authorization") auth: String
    ): OkResponse

    @POST("api/fleet/paiement/declarer")
    suspend fun declarerPaiement(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @GET("api/fleet/statut")
    suspend fun statut(@Header("Authorization") auth: String): StatutResponse

    @GET("api/proprietaires/notifications")
    suspend fun notifications(@Header("Authorization") auth: String): NotifsResponse

    @PATCH("api/proprietaires/notifications")
    suspend fun lireNotifications(@Header("Authorization") auth: String): OkResponse

    // ---------- Abonné : véhicules ----------
    @GET("api/proprietaires/vehicules")
    suspend fun ownerVehicles(@Header("Authorization") auth: String): OwnerVehiclesResponse

    @POST("api/proprietaires/vehicules")
    suspend fun addVehicle(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): AddVehicleResponse

    @PATCH("api/proprietaires/vehicules")
    suspend fun patchVehicle(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @DELETE("api/proprietaires/vehicules")
    suspend fun deleteVehicle(
        @Header("Authorization") auth: String,
        @Query("id") id: Int
    ): OkResponse

    // ---------- Abonné : suivi ----------
    @GET("api/fleet/live")
    suspend fun live(@Header("Authorization") auth: String): LiveResponse

    @GET("api/fleet/history")
    suspend fun history(
        @Header("Authorization") auth: String,
        @Query("vehicleId") vehicleId: Int,
        @Query("debut") debut: String? = null,
        @Query("fin") fin: String? = null,
        @Query("limit") limit: Int = 3000
    ): HistoryResponse

    @POST("api/fleet/theft/report")
    suspend fun reportTheft(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Map<String, Any>

    @POST("api/fleet/theft/resolve")
    suspend fun resolveTheft(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): Map<String, Any>

    // ---------- Abonné : zones ----------
    @GET("api/fleet/geofences")
    suspend fun zones(@Header("Authorization") auth: String): ZonesResponse

    @POST("api/fleet/geofences")
    suspend fun creerZone(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @PATCH("api/fleet/geofences")
    suspend fun modifierZone(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @DELETE("api/fleet/geofences")
    suspend fun supprimerZone(
        @Header("Authorization") auth: String,
        @Query("id") id: Int
    ): OkResponse

    @POST("api/fleet/geofences/assigner")
    suspend fun assignerZone(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @GET("api/fleet/geofence-events")
    suspend fun evenementsZones(
        @Header("Authorization") auth: String,
        @Query("vehicleId") vehicleId: Int? = null,
        @Query("limit") limit: Int = 200
    ): ZoneEventsResponse

    // ---------- Admin ----------
    @POST("api/admin/auth/login")
    suspend fun adminLogin(@Body body: Map<String, @JvmSuppressWildcards Any?>): AdminLoginResponse

    @POST("api/admin/auth/logout")
    suspend fun adminLogout(@Header("Authorization") auth: String): OkResponse

    @POST("api/admin/auth/password")
    suspend fun adminPassword(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @GET("api/admin/stats")
    suspend fun adminStats(@Header("Authorization") auth: String): StatsResponse

    @GET("api/admin/comptes")
    suspend fun adminComptes(
        @Header("Authorization") auth: String,
        @Query("type") type: String? = null,
        @Query("statut") statut: String? = null,
        @Query("q") q: String? = null
    ): ComptesResponse

    @PATCH("api/admin/comptes")
    suspend fun adminGererCompte(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @GET("api/admin/forfaits")
    suspend fun adminForfaits(@Header("Authorization") auth: String): PlansResponse

    @POST("api/admin/forfaits")
    suspend fun adminCreerForfait(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @PATCH("api/admin/forfaits")
    suspend fun adminModifierForfait(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @HTTP(method = "DELETE", path = "api/admin/forfaits", hasBody = false)
    suspend fun adminSupprimerForfait(
        @Header("Authorization") auth: String,
        @Query("id") id: Int
    ): OkResponse

    @GET("api/admin/paiements")
    suspend fun adminPaiements(
        @Header("Authorization") auth: String,
        @Query("statut") statut: String? = "a_verifier"
    ): PaiementsResponse

    @PATCH("api/admin/paiements")
    suspend fun adminGererPaiement(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @GET("api/admin/vols")
    suspend fun adminVols(@Header("Authorization") auth: String): VolsResponse

    @POST("api/admin/vols/vus")
    suspend fun adminVolsVus(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @GET("api/admin/vehicules")
    suspend fun adminVehicules(
        @Header("Authorization") auth: String,
        @Query("vole") vole: String? = null,
        @Query("horsZone") horsZone: String? = null,
        @Query("q") q: String? = null
    ): AdminVehiculesResponse

    @GET("api/admin/positions")
    suspend fun adminPositions(
        @Header("Authorization") auth: String,
        @Query("vehicleId") vehicleId: Int,
        @Query("debut") debut: String? = null,
        @Query("fin") fin: String? = null
    ): AdminPositionsResponse

    @GET("api/admin/audit")
    suspend fun adminAudit(@Header("Authorization") auth: String): AuditResponse

    @GET("api/admin/admins")
    suspend fun adminAdmins(@Header("Authorization") auth: String): AdminsResponse

    @POST("api/admin/admins")
    suspend fun adminCreerAdmin(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @PATCH("api/admin/admins")
    suspend fun adminGererAdmin(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @GET("api/admin/reglages")
    suspend fun adminReglages(@Header("Authorization") auth: String): ReglagesResponse

    @PATCH("api/admin/reglages")
    suspend fun adminSauverReglages(
        @Header("Authorization") auth: String,
        @Body body: Map<String, @JvmSuppressWildcards Any?>
    ): OkResponse

    @POST("api/admin/maintenance/expirations")
    suspend fun adminExpirations(@Header("Authorization") auth: String): ExpirationsResponse
}
