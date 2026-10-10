package dz.carfleet.abonne.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.data.SessionManager
import kotlinx.coroutines.launch

// Profil : infos compte + abonnement + déconnexion.
class ProfileFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_profile, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val session = SessionManager(requireContext())
        ApiClient.init(session.baseUrl)
        val tvProfil: TextView = view.findViewById(R.id.tvProfil)
        val tvAbo: TextView = view.findViewById(R.id.tvAbo)
        tvProfil.text = session.displayName.ifBlank { session.username }
        lifecycleScope.launch {
            try {
                val res = ApiClient.service().profil(session.authHeader)
                val p = res.proprietaire
                tvProfil.text = "${p?.raisonSociale ?: listOfNotNull(p?.prenom, p?.nom).joinToString(" ")}\n" +
                    "Tél : ${p?.telephone ?: "—"}\nStatut : ${p?.statutCompte ?: "—"}\nVéhicules : ${p?.nbVehicules ?: 0}"
                val a = res.abonnement
                tvAbo.text = if (a != null) {
                    "Forfait : ${a.plan ?: "—"} (${a.statut})\n" +
                        (if (a.fin != null) "Valide jusqu'au : ${a.fin.take(10)}" else "")
                } else {
                    "Aucun abonnement — choisissez un forfait sur la plateforme."
                }
            } catch (e: Exception) {
                tvAbo.text = "Échec : ${e.message}"
            }
        }
        view.findViewById<Button>(R.id.btnLogout).setOnClickListener {
            session.clearAccount()
            (activity as MainActivity).applyLock()
        }
    }
}
