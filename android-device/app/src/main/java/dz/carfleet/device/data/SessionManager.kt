package dz.carfleet.device.data

import android.content.Context
import com.google.gson.Gson
import dz.carfleet.device.api.Proprietaire
import dz.carfleet.device.api.VehiculeInfo

class SessionManager(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("carfleet_device", Context.MODE_PRIVATE)
    private val gson = Gson()

    fun saveAccount(baseUrl: String, token: String, username: String, nom: String, prenom: String, age: Int, telephone: String = "") {
        prefs.edit()
            .putString("baseUrl", baseUrl)
            .putString("token", token)
            .putString("username", username)
            .putString("nom", nom)
            .putString("prenom", prenom)
            .putInt("age", age)
            .putString("tel", telephone)
            .remove("carId").remove("serial").remove("marque").remove("modele").remove("immat")
            .remove("interval").remove("tracking")
            .apply()
    }

    fun updateProfile(nom: String, prenom: String, age: Int, telephone: String) {
        prefs.edit()
            .putString("nom", nom)
            .putString("prenom", prenom)
            .putInt("age", age)
            .putString("tel", telephone)
            .apply()
    }

    fun saveVehicle(v: VehiculeInfo, marque: String, modele: String, immatriculation: String) {
        prefs.edit()
            .putString("carId", v.carId)
            .putString("serial", v.numeroSerie)
            .putString("marque", marque)
            .putString("modele", modele)
            .putString("immat", immatriculation)
            .apply()
    }

    fun setIntervalSec(s: Int) = prefs.edit().putInt("interval", s).apply()
    fun setTracking(on: Boolean) = prefs.edit().putBoolean("tracking", on).apply()

    fun clearAccount() {
        val base = baseUrl
        prefs.edit().clear().apply()
        prefs.edit().putString("baseUrl", base).apply()
    }

    val isLogged: Boolean get() = prefs.getString("token", null) != null
    val hasVehicle: Boolean get() = prefs.getString("carId", null) != null
    val baseUrl: String get() = prefs.getString("baseUrl", "https://carfleet-75dh.onrender.com") ?: "https://carfleet-75dh.onrender.com"
    val token: String? get() = prefs.getString("token", null)
    val authHeader: String get() = "Bearer ${token.orEmpty()}"
    val username: String get() = prefs.getString("username", "") ?: ""
    val nom: String get() = prefs.getString("nom", "") ?: ""
    val prenom: String get() = prefs.getString("prenom", "") ?: ""
    val age: Int get() = prefs.getInt("age", 0)
    val tel: String get() = prefs.getString("tel", "") ?: ""
    val carId: String get() = prefs.getString("carId", "") ?: ""
    val serial: String get() = prefs.getString("serial", "") ?: ""
    val marque: String get() = prefs.getString("marque", "") ?: ""
    val modele: String get() = prefs.getString("modele", "") ?: ""
    val immat: String get() = prefs.getString("immat", "") ?: ""
    val intervalSec: Int get() = prefs.getInt("interval", 10)
    val tracking: Boolean get() = prefs.getBoolean("tracking", false)

    fun proprietaire(): Proprietaire = Proprietaire(nom = nom.ifBlank { null }, prenom = prenom.ifBlank { null })
}
