package dz.carfleet.abonne.data

import android.content.Context

class SessionManager(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("carfleet_abonne", Context.MODE_PRIVATE)

    fun saveAccount(baseUrl: String, token: String, username: String, displayName: String) {
        prefs.edit()
            .putString("baseUrl", baseUrl)
            .putString("mode", "abonne")
            .putString("token", token)
            .putString("username", username)
            .putString("displayName", displayName)
            .putString("role", "")
            .apply()
    }

    fun saveAdmin(baseUrl: String, token: String, username: String, role: String) {
        prefs.edit()
            .putString("baseUrl", baseUrl)
            .putString("mode", "admin")
            .putString("token", token)
            .putString("username", username)
            .putString("displayName", username)
            .putString("role", role)
            .apply()
    }

    fun clearAccount() {
        val base = baseUrl
        prefs.edit().clear().apply()
        prefs.edit().putString("baseUrl", base).apply()
    }

    val isLogged: Boolean get() = prefs.getString("token", null) != null && mode == "abonne"
    val isAdmin: Boolean get() = prefs.getString("token", null) != null && mode == "admin"
    val mode: String get() = prefs.getString("mode", "abonne") ?: "abonne"
    val baseUrl: String get() = prefs.getString("baseUrl", "https://fleet-platform-kvfg.onrender.com") ?: "https://fleet-platform-kvfg.onrender.com"
    val token: String? get() = prefs.getString("token", null)
    val authHeader: String get() = "Bearer ${token.orEmpty()}"
    val username: String get() = prefs.getString("username", "") ?: ""
    val displayName: String get() = prefs.getString("displayName", "") ?: ""
    val role: String get() = prefs.getString("role", "") ?: ""
}
