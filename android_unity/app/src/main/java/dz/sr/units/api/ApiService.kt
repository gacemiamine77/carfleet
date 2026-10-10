package dz.sr.units.api

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {
    @POST("api/unites/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    @GET("api/unites/auth/me")
    suspend fun me(@Header("Authorization") auth: String): MeResponse

    @GET("api/unites/infractions")
    suspend fun infractions(
        @Header("Authorization") auth: String,
        @Query("infraction") infraction: String? = null,
        @Query("categorieVehicule") categorie: String? = null,
        @Query("statut") statut: String? = null,
        @Query("periode") periode: String? = null,
        @Query("q") q: String? = null,
        @Query("lat") lat: Double? = null,
        @Query("lon") lon: Double? = null,
        @Query("rayon") rayon: Int? = null,
        @Query("tri") tri: String? = null,
        @Query("limit") limit: Int = 500
    ): InfractionsResponse

    @PATCH("api/unites/infractions")
    suspend fun patchStatut(
        @Header("Authorization") auth: String,
        @Body body: PatchStatutRequest
    ): Map<String, Any>

    @GET("api/unites/geojson")
    suspend fun unites(
        @Header("Authorization") auth: String,
        @Query("moyen") moyen: String? = null
    ): UnitsGeoJson

    @GET("api/unites/trajet")
    suspend fun trajet(
        @Header("Authorization") auth: String,
        @Query("carId") carId: String,
        @Query("limit") limit: Int = 2000
    ): TrajetResponse

    @GET("api/unites/interception")
    suspend fun interception(
        @Header("Authorization") auth: String,
        @Query("carId") carId: String,
        @Query("infractionId") infractionId: Int? = null
    ): InterceptionResponse

    @PATCH("api/unites/interception")
    suspend fun assignerInterception(
        @Header("Authorization") auth: String,
        @Body body: InterceptionAssignRequest
    ): Map<String, Any>

    @GET("api/unites/notifications")
    suspend fun notifications(
        @Header("Authorization") auth: String,
        @Query("limit") limit: Int = 50
    ): NotificationsResponse

    @PATCH("api/unites/notifications")
    suspend fun marquerNotificationsLues(
        @Header("Authorization") auth: String,
        @Body body: MarquerLuesRequest
    ): Map<String, Any>
}
