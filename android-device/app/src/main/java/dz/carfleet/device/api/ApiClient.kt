package dz.carfleet.device.api

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

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
        val log = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val client = OkHttpClient.Builder()
            .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .addInterceptor(log).build()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
