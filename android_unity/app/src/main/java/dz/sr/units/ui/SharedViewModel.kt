package dz.sr.units.ui

import android.app.Application
import androidx.fragment.app.Fragment
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import dz.sr.units.api.ApiClient
import dz.sr.units.api.Infraction
import dz.sr.units.api.Stats
import dz.sr.units.data.AppDatabase
import dz.sr.units.data.CachedUnite
import dz.sr.units.data.Repository
import dz.sr.units.data.Repository.StatutResult
import dz.sr.units.data.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SharedViewModel(app: Application) : AndroidViewModel(app) {
    val session = SessionManager.get(app)
    private val repo: Repository by lazy {
        ApiClient.init(session.baseUrl)
        Repository(session, AppDatabase.get(app))
    }

    private val _items = MutableLiveData<List<Infraction>>(emptyList())
    val items: LiveData<List<Infraction>> = _items

    private val _total = MutableLiveData(0)
    val total: LiveData<Int> = _total

    private val _stats = MutableLiveData<Stats?>(null)
    val stats: LiveData<Stats?> = _stats

    private val _unites = MutableLiveData<List<CachedUnite>>(emptyList())
    val unites: LiveData<List<CachedUnite>> = _unites

    private val _offline = MutableLiveData(false)
    val offline: LiveData<Boolean> = _offline

    private val _loading = MutableLiveData(false)
    val loading: LiveData<Boolean> = _loading

    private val _message = MutableLiveData<String?>(null)
    val message: LiveData<String?> = _message

    private val _authExpired = MutableLiveData(false)
    val authExpired: LiveData<Boolean> = _authExpired

    /** Infraction à centrer sur la carte (consommée par MapFragment puis remise à null). */
    val selected = MutableLiveData<Infraction?>(null)

    /** Véhicule à chasser : affiche sa route + bouton « Chasser » sur la carte. */
    val selectedVehicule = MutableLiveData<Vehicule?>(null)

    /** Ouvre automatiquement la boîte de chasse à l'arrivée sur la carte. */
    val chasserAuto = MutableLiveData(false)

    /** Filtres V1 (Alertes). Toute modification relance un rafraîchissement. */
    data class FiltreUI(
        var periode: String = "all",
        var q: String = "",
        var tri: String = "recent",
        var lat: Double? = null,
        var lon: Double? = null,
        var rayon: Int = 10000
    )
    val filtre = MutableLiveData(FiltreUI())

    fun setFiltre(f: FiltreUI) {
        filtre.value = f
        refresh()
    }

    private val mutex = Mutex()
    private var manualJob: Job? = null

    /** Un cycle de rafraîchissement (sérialisé : jamais deux en parallèle). */
    suspend fun refreshNow(showLoading: Boolean = false) {
        mutex.withLock {
            if (!session.isLogged) return@withLock
            if (session.isExpired) { _authExpired.value = true; return@withLock }
            if (showLoading) _loading.value = true
            try {
                val ff = filtre.value ?: FiltreUI()
                val r = repo.refreshInfractions(
                    Repository.Filtre(ff.periode, ff.q, ff.tri, ff.lat, ff.lon, ff.rayon)
                )
                if (!session.isLogged) return@withLock          // déconnecté pendant l'appel
                if (r.authExpired) { _authExpired.value = true; return@withLock }
                // "Impossible de comparée" n'est pas une infraction : jamais affichée.
                // En ligne : ordre serveur (tri demandé). Hors-ligne (cache) : tri local.
                val sansComparaison = r.items.filter { it.infraction != "impossible de comparée" }
                val list = if (r.offline) triLocal(sansComparaison, ff) else sansComparaison
                if (list != _items.value) _items.value = list
                _offline.value = r.offline
                _total.value = r.total
                _stats.value = r.stats
                _unites.value = repo.cachedUnites()
            } finally {
                if (showLoading) _loading.value = false
            }
        }
    }

    /** Tri local (cache hors-ligne) : même ordre que le serveur. */
    private fun triLocal(items: List<Infraction>, f: FiltreUI): List<Infraction> {
        var list = items
        if (f.q.isNotBlank()) {
            val q = f.q.lowercase()
            list = list.filter {
                (it.immatriculation ?: "").lowercase().contains(q) ||
                    (it.carId ?: "").lowercase().contains(q) ||
                    (it.conducteurNom ?: "").lowercase().contains(q)
            }
        }
        return when (f.tri) {
            "gravite" -> list.sortedByDescending { Gravite.score(it) }
            "distance" -> if (f.lat != null && f.lon != null)
                list.sortedBy { havKm(f.lat!!, f.lon!!, it.latitude, it.longitude) }
            else list.sortedByDescending { it.recordedAt }
            else -> list.sortedByDescending { it.recordedAt }
        }
    }

    private fun havKm(a: Double, b: Double, c: Double, d: Double): Double {
        val r = 6371.0
        val t = Math.PI / 180
        val s1 = Math.sin((c - a) * t / 2)
        val s2 = Math.sin((d - b) * t / 2)
        val h = s1 * s1 + Math.cos(a * t) * Math.cos(c * t) * s2 * s2
        return 2 * r * Math.asin(Math.sqrt(h))
    }

    /** Rafraîchissement manuel (pull-to-refresh). */
    fun refresh() {
        manualJob?.cancel()
        manualJob = viewModelScope.launch { refreshNow(showLoading = true) }
    }

    /** Boucle de polling : à lancer via [pollWhileStarted] (s'arrête quand l'écran n'est plus visible). */
    suspend fun pollLoop() {
        while (true) {
            refreshNow()
            delay(if (_offline.value == true) 15_000L else 5_000L)   // ralentit hors-ligne
        }
    }

    fun setStatut(id: Int, statut: String) {
        fun applyLocal() {
            _items.value = _items.value?.map { if (it.id == id) it.copy(statut = statut) else it }
        }
        viewModelScope.launch {
            applyLocal()
            val result = mutex.withLock { repo.setStatut(id, statut) }
            applyLocal()   // ré-applique si un rafraîchissement en cours a écrasé la liste
            when (result) {
                StatutResult.SYNCED -> {}
                StatutResult.QUEUED -> _message.value = "Hors-ligne : sera synchronisé à la reconnexion"
                StatutResult.REJECTED -> { _message.value = "Modification refusée par le serveur"; refreshNow() }
                StatutResult.AUTH_EXPIRED -> _authExpired.value = true
            }
        }
    }

    fun clearMessage() { _message.value = null }

    /** Route empruntée (points GPS) d'un véhicule — pour la carte. */
    suspend fun trajet(carId: String) = repo.trajet(carId)

    /** Unités mobiles proches de la cible (chasse). */
    suspend fun interception(carId: String) = repo.interception(carId)

    /** Assigne l'interception d'une infraction à une unité. */
    suspend fun assignerInterception(infractionId: Int, uniteId: Int) =
        repo.assignerInterception(infractionId, uniteId)

    /** Déconnexion : session + cache local + états en mémoire (aucune donnée ne survit à l'unité précédente). */
    fun logout() {
        manualJob?.cancel()
        session.clear()
        _items.value = emptyList()
        _stats.value = null
        _unites.value = emptyList()
        _total.value = 0
        _offline.value = false
        _authExpired.value = false
        selected.value = null
        selectedVehicule.value = null
        chasserAuto.value = false
        viewModelScope.launch { mutex.withLock { repo.clearAll() } }
    }
}

/** Lance le polling tant que le fragment est visible (STARTED), l'arrête sinon. */
fun Fragment.pollWhileStarted(vm: SharedViewModel) {
    viewLifecycleOwner.lifecycleScope.launch {
        viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) { vm.pollLoop() }
    }
}
