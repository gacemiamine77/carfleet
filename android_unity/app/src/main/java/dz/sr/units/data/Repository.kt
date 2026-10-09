package dz.sr.units.data

import androidx.room.withTransaction
import dz.sr.units.api.ApiClient
import dz.sr.units.api.Infraction
import dz.sr.units.api.InterceptionAssignRequest
import dz.sr.units.api.InterceptionResponse
import dz.sr.units.api.PatchStatutRequest
import dz.sr.units.api.Stats
import dz.sr.units.api.TrajetResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.HttpException

class Repository(
    private val session: SessionManager,
    private val db: AppDatabase
) {
    private val dao get() = db.dao()
    private val auth get() = session.authHeader
    private var lastUnites = 0L

    data class Refresh(
        val items: List<Infraction>,
        val offline: Boolean,
        val authExpired: Boolean = false,
        val total: Int = items.size,
        val stats: Stats? = null
    )

    enum class StatutResult { SYNCED, QUEUED, REJECTED, AUTH_EXPIRED }

    /** Filtres V1 : période, recherche plaque, autour de moi (GPS), tri. */
    data class Filtre(
        val periode: String = "all",   // all | today | 7d | 30d
        val q: String = "",            // plaque / véhicule / conducteur
        val tri: String = "recent",    // recent | gravite | distance
        val lat: Double? = null,
        val lon: Double? = null,
        val rayon: Int = 10000
    )

    /**
     * Réseau -> cache. Distingue : session expirée (401), hors-ligne / erreur serveur (cache),
     * et rejoue d'abord les changements de statut en attente.
     */
    suspend fun refreshInfractions(f: Filtre = Filtre()): Refresh {
        return try {
            if (flushPending()) return Refresh(emptyList(), offline = false, authExpired = true)

            val res = ApiClient.service().infractions(
                auth,
                periode = f.periode.takeIf { it != "all" },
                q = f.q.takeIf { it.isNotBlank() },
                lat = f.lat, lon = f.lon,
                rayon = f.rayon.takeIf { f.lat != null },
                tri = f.tri
            )
            val pending = dao.pending().associate { it.id to it.statut }
            val raw: List<Infraction>? = res.infractions
            val list = raw.orEmpty().map { it.sanitized() }
                .map { x -> pending[x.id]?.let { x.copy(statut = it) } ?: x }

            db.withTransaction {
                dao.clearInfractions()
                dao.insertAll(list.map { it.toCached() })
            }
            refreshUnitesIfDue()
            Refresh(
                items = list,
                offline = false,
                total = maxOf(res.total, list.size),
                stats = if (pending.isEmpty()) res.stats else null
            )
        } catch (e: HttpException) {
            if (e.code() == 401) Refresh(emptyList(), offline = false, authExpired = true) else cached()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            cached()   // réseau, timeout, JSON invalide…
        }
    }

    private suspend fun cached(): Refresh {
        val list = dao.all().map { it.toApi() }
        return Refresh(list, offline = true)
    }

    /** Rejoue les statuts en attente. Retourne true si la session est expirée (401). */
    private suspend fun flushPending(): Boolean {
        for (p in dao.pending()) {
            try {
                ApiClient.service().patchStatut(auth, PatchStatutRequest(p.id, p.statut))
                dao.removePending(p.id)
            } catch (e: HttpException) {
                when (e.code()) {
                    401 -> return true
                    in 400..499 -> dao.removePending(p.id)   // refusé définitivement (ex. hors territoire)
                    else -> return false                      // erreur serveur : on réessaiera
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                return false                                  // hors-ligne : on réessaiera
            }
        }
        return false
    }

    private suspend fun refreshUnitesIfDue() {
        val now = System.currentTimeMillis()
        if (now - lastUnites < 60_000 && dao.unites().isNotEmpty()) return
        try {
            val geo = ApiClient.service().unites(auth)
            val units = geo.features.mapNotNull { f ->
                val p = f.properties ?: return@mapNotNull null
                val c = f.geometry?.coordinates ?: return@mapNotNull null
                if (c.size < 2) return@mapNotNull null
                CachedUnite(p.code, p.nom, p.type, p.moyen, c[1], c[0])
            }
            db.withTransaction {
                dao.clearUnites()
                dao.insertUnites(units)
            }
            lastUnites = now
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) { }
    }

    suspend fun cachedUnites(): List<CachedUnite> = dao.unites()

    /** Route empruntée par un véhicule (points GPS) — app chasse. */
    suspend fun trajet(carId: String): TrajetResponse = ApiClient.service().trajet(auth, carId)

    /** Unités mobiles proches de la cible + prédiction. */
    suspend fun interception(carId: String, infractionId: Int? = null): InterceptionResponse =
        ApiClient.service().interception(auth, carId, infractionId)

    /** Assigne l'interception d'une infraction à une unité (statut → notifie). */
    suspend fun assignerInterception(infractionId: Int, uniteId: Int): Boolean = try {
        ApiClient.service().assignerInterception(auth, InterceptionAssignRequest(infractionId, uniteId))
        true
    } catch (e: Exception) {
        false
    }

    /** Applique localement puis tente d'envoyer ; en cas d'échec réseau, met en file d'attente. */
    suspend fun setStatut(id: Int, statut: String): StatutResult {
        dao.setStatut(id, statut)
        return try {
            ApiClient.service().patchStatut(auth, PatchStatutRequest(id, statut))
            dao.removePending(id)
            StatutResult.SYNCED
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> StatutResult.AUTH_EXPIRED
                in 400..499 -> { dao.removePending(id); StatutResult.REJECTED }
                else -> { dao.addPending(PendingStatut(id, statut)); StatutResult.QUEUED }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            dao.addPending(PendingStatut(id, statut))
            StatutResult.QUEUED
        }
    }

    /** Vide tout le cache local (infractions, unités, file d'attente) — appelé à la déconnexion. */
    suspend fun clearAll() {
        withContext(Dispatchers.IO) { db.clearAllTables() }
        lastUnites = 0L
    }

    private fun Infraction.sanitized(): Infraction {
        // Gson peut injecter null dans des champs Kotlin non-nuls si le JSON contient null
        val inf: String? = infraction
        val st: String? = statut
        val rec: String? = recordedAt
        return copy(infraction = inf ?: "", statut = st ?: "nouveau", recordedAt = rec ?: "")
    }

    private fun Infraction.toCached() = CachedInfraction(
        id = id, carId = carId, immatriculation = immatriculation, conducteurNom = conducteurNom,
        categorieVehicule = categorieVehicule, infraction = infraction,
        vitesse = vitesse, vitesseLimite = vitesseLimite, latitude = latitude,
        longitude = longitude, statut = statut, recordedAt = recordedAt
    )

    private fun CachedInfraction.toApi() = Infraction(
        id = id, carId = carId, immatriculation = immatriculation, conducteurNom = conducteurNom,
        categorieVehicule = categorieVehicule, infraction = infraction,
        vitesse = vitesse, vitesseLimite = vitesseLimite,
        latitude = latitude, longitude = longitude, statut = statut, recordedAt = recordedAt
    )
}
