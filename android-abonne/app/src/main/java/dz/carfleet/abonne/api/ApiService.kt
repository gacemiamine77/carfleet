package dz.carfleet.abonne.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {
    @POST("api/proprietaires/auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

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

    @GET("api/proprietaires/profil")
    suspend fun profil(@Header("Authorization") auth: String): ProfilResponse

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
}
