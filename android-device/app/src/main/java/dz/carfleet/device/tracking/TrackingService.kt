package dz.carfleet.device.tracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.gson.Gson
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.data.PendingDb
import dz.carfleet.device.data.PendingPoint
import dz.carfleet.device.data.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.atan2

/**
 * Envoi continu GPS + accéléromètre + gyroscope vers POST /api/external/track.
 * Si le serveur est injoignable/occupé : le point est stocké dans une file
 * locale (Room) et renvoyé dans l'ordre dès que la connexion est rétablie.
 */
class TrackingService : Service(), SensorEventListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var sendJob: Job? = null
    private lateinit var session: SessionManager
    private val gson = Gson()
    private val sendMutex = Mutex()

    // Dernières valeurs capteurs
    @Volatile private var ax = 0.0
    @Volatile private var ay = 0.0
    @Volatile private var az = 9.81
    @Volatile private var gx = 0.0
    @Volatile private var gy = 0.0
    @Volatile private var gz = 0.0
    @Volatile private var lastLoc: Location? = null
    @Volatile private var lastSend: String = "—"
    @Volatile private var lastCode: String = "—"
    @Volatile private var sent = 0

    private lateinit var sensorManager: SensorManager
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            lastLoc = result.lastLocation
            State.lastLat = result.lastLocation?.latitude
            State.lastLon = result.lastLocation?.longitude
            State.lastSpeed = result.lastLocation?.let { it.speed * 3.6 }
            maybeSend()
        }
    }

    override fun onCreate() {
        super.onCreate()
        session = SessionManager(this)
        ApiClient.init(session.baseUrl)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.also {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)?.also {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
        }
        scope.launch {
            // Points de plus de 7 jours : périmés, on les jette
            PendingDb.get(this@TrackingService).dao()
                .purgeOlderThan(System.currentTimeMillis() - 7 * 86400_000L)
        }
        startForegroundService()
        startLocation()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        try {
            LocationServices.getFusedLocationProviderClient(this).removeLocationUpdates(locationCallback)
        } catch (_: SecurityException) { }
        sensorManager.unregisterListener(this)
        sendJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                ax = event.values[0].toDouble()
                ay = event.values[1].toDouble()
                az = event.values[2].toDouble()
            }
            Sensor.TYPE_GYROSCOPE -> {
                gx = event.values[0].toDouble()
                gy = event.values[1].toDouble()
                gz = event.values[2].toDouble()
            }
        }
        State.ax = ax; State.ay = ay; State.az = az
        State.gx = gx; State.gy = gy; State.gz = gz
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun startForegroundService() {
        val mgr = getSystemService(NotificationManager::class.java)
        mgr.createNotificationChannel(NotificationChannel(CHANNEL, "Suivi GPS", NotificationManager.IMPORTANCE_LOW))
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("CarFleet — envoi GPS actif")
            .setContentText("Positions envoyées toutes les ${session.intervalSec} s")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
        startForeground(1, notif)
    }

    private fun startLocation() {
        val intervalMs = (session.intervalSec.coerceIn(2, 120) * 1000).toLong()
        val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateIntervalMillis(intervalMs)
            .build()
        try {
            LocationServices.getFusedLocationProviderClient(this)
                .requestLocationUpdates(req, locationCallback, Looper.getMainLooper())
        } catch (_: SecurityException) {
            stopSelf()
        }
        // Filet de sécurité : cycle périodique même sans nouveau fix GPS
        sendJob = scope.launch {
            while (true) {
                kotlinx.coroutines.delay(intervalMs)
                maybeSend(force = true)
            }
        }
    }

    private var lastSentAt = 0L

    private fun maybeSend(force: Boolean = false) {
        val loc = lastLoc ?: return
        val now = System.currentTimeMillis()
        val minGap = (session.intervalSec.coerceIn(2, 120) * 1000).toLong() - 500
        if (!force && now - lastSentAt < minGap) return
        lastSentAt = now
        scope.launch { sendCycle(buildPoint(loc)) }
    }

    private fun buildPoint(loc: Location): Map<String, Any> {
        val ts = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
        val speedKmh = if (loc.hasSpeed()) loc.speed * 3.6 else 0.0
        val heading = if (loc.hasBearing()) loc.bearing.toDouble() else lastHeading(loc)
        return mapOf(
            "vehicle_id" to session.carId,
            "serial" to session.serial,
            "timestamp" to ts,
            "lat" to loc.latitude,
            "lon" to loc.longitude,
            "speed" to Math.round(speedKmh * 10) / 10.0,
            "heading" to Math.round(heading * 10) / 10.0,
            "nom" to session.nom,
            "prenom" to session.prenom,
            "age" to session.age,
            "marque" to session.marque,
            "modele" to session.modele,
            "immatriculation" to session.immat,
            // Aliases requis par /api/external/track (rejet si manquant)
            "proprietaireNom" to session.nom,
            "proprietairePrenom" to session.prenom,
            "proprietaireTel" to session.tel,
            "conducteurNom" to session.nom,
            "conducteurPrenom" to session.prenom,
            "conducteurTel" to session.tel,
            "ax" to ax, "ay" to ay, "az" to az,
            "gx" to gx, "gy" to gy, "gz" to gz
        )
    }

    /** 1) renvoie la file d'attente (par lots de 50), 2) envoie le point courant. */
    private suspend fun sendCycle(point: Map<String, Any>) {
        sendMutex.withLock {
            val dao = PendingDb.get(this).dao()
            // 1. Vider la file d'abord (ordre chronologique conservé)
            var flushed = 0
            while (true) {
                val batch = dao.first(50)
                if (batch.isEmpty()) break
                try {
                    val cars = batch.map { gson.fromJson(it.json, Map::class.java) as Map<String, Any> }
                    val res = ApiClient.service().track(mapOf("cars" to cars))
                    if (!res.ok) break
                    dao.remove(batch.map { it.id })
                    flushed += batch.size
                } catch (_: Exception) {
                    break // toujours pas de réseau : on garde tout
                }
            }
            // 2. Point courant
            try {
                val res = ApiClient.service().track(mapOf("cars" to listOf(point)))
                if (res.ok) {
                    sent++
                    lastSend = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
                    lastCode = "200"
                    State.online = true
                } else {
                    dao.add(PendingPoint(json = gson.toJson(point)))
                    lastCode = "ERR serveur"
                    State.online = false
                }
            } catch (_: Exception) {
                dao.add(PendingPoint(json = gson.toJson(point)))
                lastCode = "ERR réseau"
                State.online = false
            }
            State.lastSend = lastSend
            State.lastCode = lastCode
            State.sent = sent
            State.pending = dao.count()
        }
    }

    private var prevLat: Double? = null
    private var prevLon: Double? = null

    private fun lastHeading(loc: Location): Double {
        val pl = prevLat
        val pn = prevLon
        prevLat = loc.latitude
        prevLon = loc.longitude
        if (pl == null || pn == null) return 0.0
        val dLon = Math.toRadians(loc.longitude - pn)
        val y = Math.sin(dLon) * Math.cos(Math.toRadians(loc.latitude))
        val x = Math.cos(Math.toRadians(pl)) * Math.sin(Math.toRadians(loc.latitude)) -
            Math.sin(Math.toRadians(pl)) * Math.cos(Math.toRadians(loc.latitude)) * Math.cos(dLon)
        return (Math.toDegrees(atan2(y, x)) + 360) % 360
    }

    companion object {
        const val CHANNEL = "carfleet_tracking"
    }
}

/** État observable par l'écran Statut (sans binding de service). */
object State {
    @Volatile var lastLat: Double? = null
    @Volatile var lastLon: Double? = null
    @Volatile var lastSpeed: Double? = null
    @Volatile var ax = 0.0
    @Volatile var ay = 0.0
    @Volatile var az = 9.81
    @Volatile var gx = 0.0
    @Volatile var gy = 0.0
    @Volatile var gz = 0.0
    @Volatile var lastSend: String = "—"
    @Volatile var lastCode: String = "—"
    @Volatile var sent: Int = 0
    @Volatile var pending: Int = 0
    @Volatile var online: Boolean = false
}
