package dz.sr.units.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

// Cache hors-ligne : dernières infractions du territoire + unités
@Entity(tableName = "cached_infractions")
data class CachedInfraction(
    @PrimaryKey val id: Int,
    val carId: String?,
    val immatriculation: String?,
    val conducteurNom: String?,
    val categorieVehicule: String?,
    val infraction: String,
    val vitesse: Double?,
    val vitesseLimite: Double?,
    val latitude: Double,
    val longitude: Double,
    val statut: String,
    val recordedAt: String
)

@Entity(tableName = "cached_unites")
data class CachedUnite(
    @PrimaryKey val code: String,
    val nom: String,
    val type: String,
    val moyen: String,
    val latitude: Double,
    val longitude: Double
)

// Changements de statut faits hors-ligne, rejoués à la reconnexion
@Entity(tableName = "pending_statuts")
data class PendingStatut(
    @PrimaryKey val id: Int,
    val statut: String
)

@Dao
interface SrDao {
    @Query("DELETE FROM cached_infractions")
    suspend fun clearInfractions()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<CachedInfraction>)

    @Query("SELECT * FROM cached_infractions ORDER BY recordedAt DESC LIMIT 500")
    suspend fun all(): List<CachedInfraction>

    @Query("UPDATE cached_infractions SET statut = :statut WHERE id = :id")
    suspend fun setStatut(id: Int, statut: String)

    @Query("DELETE FROM cached_unites")
    suspend fun clearUnites()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUnites(items: List<CachedUnite>)

    @Query("SELECT * FROM cached_unites")
    suspend fun unites(): List<CachedUnite>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addPending(p: PendingStatut)

    @Query("SELECT * FROM pending_statuts")
    suspend fun pending(): List<PendingStatut>

    @Query("DELETE FROM pending_statuts WHERE id = :id")
    suspend fun removePending(id: Int)
}

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `pending_statuts` (`id` INTEGER NOT NULL, `statut` TEXT NOT NULL, PRIMARY KEY(`id`))")
    }
}

@Database(entities = [CachedInfraction::class, CachedUnite::class, PendingStatut::class], version = 2, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun dao(): SrDao

    companion object {
        @Volatile private var instance: AppDatabase? = null
        fun get(ctx: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(ctx.applicationContext, AppDatabase::class.java, "sr_units.db")
                    .addMigrations(MIGRATION_1_2)
                    .build().also { instance = it }
            }
    }
}
