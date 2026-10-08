package dz.carfleet.device.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

// File d'attente locale : points non envoyés (serveur occupé/coupé),
// renvoyés dans l'ordre dès que la connexion est rétablie.
@Entity(tableName = "pending_points")
data class PendingPoint(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val json: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Dao
interface PendingDao {
    @Insert
    suspend fun add(p: PendingPoint)

    @Query("SELECT * FROM pending_points ORDER BY id ASC LIMIT :n")
    suspend fun first(n: Int): List<PendingPoint>

    @Query("DELETE FROM pending_points WHERE id IN (:ids)")
    suspend fun remove(ids: List<Long>)

    @Query("SELECT COUNT(*) FROM pending_points")
    suspend fun count(): Int

    @Query("DELETE FROM pending_points WHERE createdAt < :olderThan")
    suspend fun purgeOlderThan(olderThan: Long)
}

@Database(entities = [PendingPoint::class], version = 1, exportSchema = false)
abstract class PendingDb : RoomDatabase() {
    abstract fun dao(): PendingDao

    companion object {
        @Volatile private var instance: PendingDb? = null
        fun get(ctx: Context): PendingDb =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(ctx.applicationContext, PendingDb::class.java, "carfleet_pending.db").build().also { instance = it }
            }
    }
}
