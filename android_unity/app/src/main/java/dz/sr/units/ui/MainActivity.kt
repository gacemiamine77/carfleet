package dz.sr.units.ui

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.google.android.material.bottomnavigation.BottomNavigationView
import dz.sr.units.R
import dz.sr.units.api.ApiClient
import dz.sr.units.data.SessionManager
import org.osmdroid.config.Configuration

class MainActivity : AppCompatActivity() {
    private lateinit var session: SessionManager
    private lateinit var nav: BottomNavigationView
    private val vm: SharedViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Configuration.getInstance().load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        Configuration.getInstance().userAgentValue = packageName   // exigé par les serveurs de tuiles
        setContentView(R.layout.activity_main)
        nav = findViewById(R.id.bottomNav)
        session = SessionManager.get(this)
        ApiClient.init(session.baseUrl)

        vm.authExpired.observe(this) { expired ->
            if (expired) {
                vm.logout()
                showLogin()
                Toast.makeText(this, "Session expirée, reconnectez-vous", Toast.LENGTH_LONG).show()
            }
        }
        vm.message.observe(this) { msg ->
            if (msg != null) {
                Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                vm.clearMessage()
            }
        }

        if (session.isLogged && session.isExpired) vm.logout()

        if (session.isLogged) {
            setupNav()
            nav.visibility = View.VISIBLE
            if (savedInstanceState == null) nav.selectedItemId = R.id.nav_alerts
        } else {
            nav.visibility = View.GONE
            if (savedInstanceState == null) showLogin()
        }
    }

    fun showLogin() {
        nav.visibility = View.GONE
        supportFragmentManager.beginTransaction().replace(R.id.container, LoginFragment()).commit()
    }

    fun showApp() {
        ApiClient.init(session.baseUrl)
        setupNav()
        nav.visibility = View.VISIBLE
        navigateTo(R.id.nav_alerts)
    }

    /** Sélectionne un onglet, même s'il est déjà sélectionné (ex. après une reconnexion). */
    fun navigateTo(itemId: Int) {
        if (nav.selectedItemId == itemId) show(fragmentFor(itemId)) else nav.selectedItemId = itemId
    }

    private fun setupNav() {
        nav.setOnItemSelectedListener { item ->
            show(fragmentFor(item.itemId))
            true
        }
    }

    private fun fragmentFor(itemId: Int): Fragment = when (itemId) {
        R.id.nav_map -> MapFragment()
        R.id.nav_alerts -> AlertsFragment()
        R.id.nav_stats -> StatsFragment()
        R.id.nav_treat -> TreatmentFragment()
        R.id.nav_unit -> UnitFragment()
        else -> AlertsFragment()
    }

    private fun show(f: Fragment) {
        supportFragmentManager.beginTransaction().replace(R.id.container, f).commit()
    }
}
