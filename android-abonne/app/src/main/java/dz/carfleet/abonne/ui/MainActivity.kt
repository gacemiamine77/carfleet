package dz.carfleet.abonne.ui

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.google.android.material.bottomnavigation.BottomNavigationView
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.data.SessionManager

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
            if (!session.isLogged && item.itemId != R.id.nav_account) {
                nav.selectedItemId = R.id.nav_account
                return@setOnItemSelectedListener false
            }
            val f: Fragment = when (item.itemId) {
                R.id.nav_account -> AccountFragment()
                R.id.nav_vehicles -> VehiclesFragment()
                R.id.nav_map -> FleetMapFragment()
                R.id.nav_trips -> HistoryFragment()
                R.id.nav_profile -> ProfileFragment()
                else -> VehiclesFragment()
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

    fun applyLock() {
        val nav = findViewById<BottomNavigationView>(R.id.bottomNav)
        if (session.isLogged) {
            nav.visibility = View.VISIBLE
        } else {
            nav.visibility = View.GONE
            supportFragmentManager.beginTransaction().replace(R.id.container, AccountFragment()).commit()
        }
    }

    fun goVehicles() {
        applyLock()
        findViewById<BottomNavigationView>(R.id.bottomNav).selectedItemId = R.id.nav_vehicles
    }
}
