package dz.carfleet.abonne.api

import org.json.JSONObject
import retrofit2.HttpException

// Erreurs API : expose le message serveur ({error}) + le code HTTP.
sealed interface ApiResult<out T> {
    data class Ok<T>(val v: T) : ApiResult<T>
    data class Err(val msg: String, val code: Int) : ApiResult<Nothing>
}

object ApiHelper {
    suspend fun <T> run(block: suspend () -> T): ApiResult<T> {
        return try {
            ApiResult.Ok(block())
        } catch (e: HttpException) {
            val msg = try {
                JSONObject(e.response()?.errorBody()?.string() ?: "")
                    .optString("error")
                    .ifBlank { "Erreur ${e.code()}" }
            } catch (_: Exception) {
                "Erreur ${e.code()}"
            }
            ApiResult.Err(msg, e.code())
        } catch (e: Exception) {
            ApiResult.Err("Serveur injoignable : ${e.message}", -1)
        }
    }
}
