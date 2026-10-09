package dz.sr.units.api

import dz.sr.units.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    @Volatile private var service: ApiService? = null
    @Volatile private var baseUrl: String = "https://carfleet-75dh.onrender.com/"

    fun init(base: String) {
        var b = base.trim()
        if (!b.endsWith("/")) b += "/"
        if (b != baseUrl) {
            baseUrl = b
            service = null
        }
    }

    fun service(): ApiService {
        return service ?: synchronized(this) {
            service ?: build().also { service = it }
        }
    }

    private fun build(): ApiService {
        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .apply {
                // Journal réseau uniquement en debug (URL + code, jamais les en-têtes)
                if (BuildConfig.DEBUG) {
                    addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
                }
            }
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
