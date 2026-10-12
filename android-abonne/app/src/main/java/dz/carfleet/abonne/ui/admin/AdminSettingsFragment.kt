package dz.carfleet.abonne.ui.admin

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import dz.carfleet.abonne.R
import dz.carfleet.abonne.api.ApiClient
import dz.carfleet.abonne.api.ApiHelper
import dz.carfleet.abonne.api.ApiResult
import dz.carfleet.abonne.data.SessionManager
import dz.carfleet.abonne.ui.Ui
import kotlinx.coroutines.launch

// Réglages : activation auto, couleurs proposées + mon mot de passe.
class AdminSettingsFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.fragment_container, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val ctx = requireContext()
        val session = SessionManager(ctx)
        ApiClient.init(session.baseUrl)
        view.findViewById<TextView>(R.id.tvTitle).text = "⚙️ Réglages"
        val box: LinearLayout = view.findViewById(R.id.box)
        val tvErr: TextView = view.findViewById(R.id.tvErr)

        val cbAuto = CheckBox(ctx).apply { text = "Activation automatique après paiement confirmé" }
        val etCouleurs = EditText(ctx).apply {
            hint = "Couleurs proposées (une par ligne)"
            minLines = 4
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        val btnSave = Ui.bouton(ctx, "Enregistrer")
        val etOld = Ui.champ(ctx, "Ancien mot de passe", password = true)
        val etNew = Ui.champ(ctx, "Nouveau (10+)", password = true)
        val btnPw = Ui.bouton(ctx, "Changer mon mot de passe")
        box.addView(cbAuto)
        box.addView(Ui.titre(ctx, "Couleurs proposées aux abonnés", 16f))
        box.addView(etCouleurs)
        box.addView(btnSave)
        box.addView(Ui.titre(ctx, "Mon mot de passe", 16f))
        box.addView(etOld)
        box.addView(etNew)
        box.addView(btnPw)

        lifecycleScope.launch {
            when (val r = ApiHelper.run { ApiClient.service().adminReglages(session.authHeader) }) {
                is ApiResult.Ok -> {
                    cbAuto.isChecked = r.v.activationAuto
                    etCouleurs.setText(r.v.couleurs.joinToString("\n"))
                }
                is ApiResult.Err -> tvErr.text = r.msg
            }
        }
        btnSave.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().adminSauverReglages(
                        session.authHeader,
                        mapOf("activationAuto" to cbAuto.isChecked, "couleurs" to etCouleurs.text.toString().split("\n"))
                    )
                }) {
                    is ApiResult.Ok -> tvErr.text = "Réglages enregistrés."
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
        btnPw.setOnClickListener {
            lifecycleScope.launch {
                when (val r = ApiHelper.run {
                    ApiClient.service().adminPassword(
                        session.authHeader,
                        mapOf("ancienMotDePasse" to etOld.text.toString(), "nouveauMotDePasse" to etNew.text.toString())
                    )
                }) {
                    is ApiResult.Ok -> {
                        tvErr.text = "Mot de passe redéfini, reconnectez-vous."
                        etOld.text.clear()
                        etNew.text.clear()
                    }
                    is ApiResult.Err -> tvErr.text = r.msg
                }
            }
        }
    }
}
