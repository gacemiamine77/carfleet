package dz.carfleet.device.ui

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.google.android.material.bottomnavigation.BottomNavigationView
import dz.carfleet.device.R
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.data.SessionManager

class MainActivity : AppCompatActivity() {
    private lateinit var session: SessionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        org.osmdroid.config.Configuration.getInstance().load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        setContentView(R.layout.activity_main)
        session = SessionManager(this)
        ApiClient.init(session.baseUrl)
        val nav = findViewById<BottomNavigationView>(R.id.bottomNav)
        nav.setOnItemSelectedListener { item ->
            // Verrou : sans connexion, seul l'onglet Compte est accessible
            if (!session.isLogged && item.itemId != R.id.nav_account) {
                nav.selectedItemId = R.id.nav_account
                return@setOnItemSelectedListener false
            }
            val f: Fragment = when (item.itemId) {
                R.id.nav_account -> AccountFragment()
                R.id.nav_vehicle -> VehicleFragment()
                R.id.nav_driver -> DriverFragment()
                R.id.nav_map -> DeviceMapFragment()
                R.id.nav_status -> StatusFragment()
                else -> StatusFragment()
            }
            supportFragmentManager.beginTransaction().replace(R.id.container, f).commit()
            true
        }
        applyLock()
    }

    override fun onResume() {
        super.onResume()
        applyLock()
    }

    /** Sans login : barre masquée + écran Compte forcé. */
    fun applyLock() {
        val nav = findViewById<BottomNavigationView>(R.id.bottomNav)
        if (session.isLogged) {
            nav.visibility = View.VISIBLE
            if (nav.selectedItemId == R.id.nav_account && supportFragmentManager.findFragmentById(R.id.container) is AccountFragment) {
                // reste où il est si déjà connecté et sur Compte
            }
        } else {
            nav.visibility = View.GONE
            supportFragmentManager.beginTransaction().replace(R.id.container, AccountFragment()).commit()
        }
    }

    fun goStatus() {
        applyLock()
        findViewById<BottomNavigationView>(R.id.bottomNav).selectedItemId = R.id.nav_status
    }
}
