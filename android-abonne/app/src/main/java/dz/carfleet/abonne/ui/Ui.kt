package dz.carfleet.abonne.ui

import android.content.Context
import android.text.InputType
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView

// Petites briques UI : écrans construits en code (même logique que le web).
object Ui {
    fun box(ctx: Context): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        )
    }

    fun row(ctx: Context): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        )
    }

    fun titre(ctx: Context, texte: String, taille: Float = 18f): TextView = TextView(ctx).apply {
        text = texte
        textSize = taille
        setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    fun texte(ctx: Context, texte: String = "", taille: Float = 14f): TextView = TextView(ctx).apply {
        text = texte
        textSize = taille
    }

    fun err(ctx: Context): TextView = TextView(ctx).apply { textSize = 13f }

    fun champ(ctx: Context, hint: String, password: Boolean = false, numeric: Boolean = false): EditText =
        EditText(ctx).apply {
            this.hint = hint
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
            if (password) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            if (numeric) inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }

    fun bouton(ctx: Context, texte: String): Button = Button(ctx).apply { text = texte }

    fun liste(ctx: Context, items: List<String>): Spinner = Spinner(ctx).apply {
        adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, items).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        )
    }

    fun carte(ctx: Context, texte: String): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(24, 24, 24, 24)
        addView(titre(ctx, texte, 16f))
    }

    fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()
}
