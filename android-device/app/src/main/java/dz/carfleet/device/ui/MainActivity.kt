package dz.carfleet.device.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.google.android.material.bottomnavigation.BottomNavigationView
import dz.carfleet.device.R
import dz.carfleet.device.api.ApiClient
import dz.carfleet.device.data.SessionManager

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        org.osmdroid.config.Configuration.getInstance().load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        setContentView(R.layout.activity_main)
        val session = SessionManager(this)
        ApiClient.init(session.baseUrl)
        val nav = findViewById<BottomNavigationView>(R.id.bottomNav)
        nav.setOnItemSelectedListener { item ->
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
        nav.selectedItemId = if (session.isLogged) R.id.nav_status else R.id.nav_account
    }

    fun goStatus() {
        findViewById<BottomNavigationView>(R.id.bottomNav).selectedItemId = R.id.nav_status
    }
}
