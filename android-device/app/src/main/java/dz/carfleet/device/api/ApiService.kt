package dz.carfleet.device.api

import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

interface ApiService {
    @POST("api/proprietaires/auth/register")
    suspend fun register(@Body body: RegisterRequest): RegisterResponse

    @POST("api/proprietaires/auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("api/proprietaires/vehicules")
    suspend fun addVehicle(
        @Header("Authorization") auth: String,
        @Body body: AddVehicleRequest
    ): AddVehicleResponse

    @POST("api/external/track")
    suspend fun track(@Body body: Map<String, @JvmSuppressWildcards Any>): TrackResponse
}
