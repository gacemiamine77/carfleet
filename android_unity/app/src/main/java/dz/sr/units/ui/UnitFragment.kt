package dz.sr.units.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import dz.sr.units.R

// ⚙️ Mon unité + déconnexion
class UnitFragment : Fragment() {
    private val vm: SharedViewModel by activityViewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_unit, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val u = vm.session.unite
        view.findViewById<TextView>(R.id.tvUnite).text =
            "${u?.nom ?: "—"}\n${u?.code ?: ""} · ${u?.type ?: ""} · ${u?.moyen ?: ""}\nWilaya ${u?.codeWilaya ?: ""} — ${u?.wilaya ?: ""}"
        view.findViewById<Button>(R.id.btnLogout).setOnClickListener {
            vm.logout()
            (activity as? MainActivity)?.showLogin()
        }
    }
}
