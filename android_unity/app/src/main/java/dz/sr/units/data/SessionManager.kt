package dz.sr.units.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.google.gson.Gson
import dz.sr.units.api.Unite
import java.time.Instant

/** Session stockée dans des SharedPreferences CHIFFRÉES (Android Keystore). Singleton. */
class SessionManager private constructor(private val prefs: SharedPreferences) {
    private val gson = Gson()

    fun save(baseUrl: String, token: String, unite: Unite, expiresAt: String?) {
        prefs.edit()
            .putString(KEY_URL, baseUrl)
            .putString(KEY_TOKEN, token)
            .putString(KEY_UNITE, gson.toJson(unite))
            .putString(KEY_EXP, expiresAt)
            .apply()
    }

    /** Efface la session mais conserve l'URL serveur saisie. */
    fun clear() {
        val url = prefs.getString(KEY_URL, null)
        prefs.edit().clear().apply()
        if (url != null) prefs.edit().putString(KEY_URL, url).apply()
    }

    val isLogged: Boolean get() = prefs.getString(KEY_TOKEN, null) != null

    /** true si la date d'expiration renvoyée par le serveur est dépassée (si absente/illisible : false). */
    val isExpired: Boolean
        get() {
            val exp = prefs.getString(KEY_EXP, null) ?: return false
            return try { Instant.parse(exp).isBefore(Instant.now()) } catch (_: Exception) { false }
        }

    val baseUrl: String get() = prefs.getString(KEY_URL, DEFAULT_URL) ?: DEFAULT_URL
    val token: String? get() = prefs.getString(KEY_TOKEN, null)
    val authHeader: String get() = "Bearer ${token.orEmpty()}"
    val unite: Unite? get() = prefs.getString(KEY_UNITE, null)?.let { gson.fromJson(it, Unite::class.java) }

    companion object {
        private const val FILE = "sr_units_secure"
        private const val LEGACY_FILE = "sr_units"
        private const val KEY_URL = "baseUrl"
        private const val KEY_TOKEN = "token"
        private const val KEY_UNITE = "unite"
        private const val KEY_EXP = "expiresAt"
        const val DEFAULT_URL = "https://carfleet-75dh.onrender.com"

        @Volatile private var instance: SessionManager? = null

        fun get(ctx: Context): SessionManager =
            instance ?: synchronized(this) {
                instance ?: SessionManager(open(ctx.applicationContext)).also { instance = it }
            }

        private fun open(ctx: Context): SharedPreferences {
            // L'ancienne version stockait le token en clair : on le supprime
            ctx.deleteSharedPreferences(LEGACY_FILE)
            fun create(): SharedPreferences {
                // security-crypto 1.0.0 : MasterKeys (alias String). Passer en 1.1.0+ pour MasterKey.Builder.
                val alias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
                return EncryptedSharedPreferences.create(
                    FILE, alias, ctx,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            }
            return try {
                create()
            } catch (_: Exception) {
                // Keystore invalidé (changement de verrouillage, restauration…) : repartir de zéro
                ctx.deleteSharedPreferences(FILE)
                create()
            }
        }
    }
}
