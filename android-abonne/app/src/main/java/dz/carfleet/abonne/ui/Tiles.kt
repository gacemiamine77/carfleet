package dz.carfleet.abonne.ui

import android.content.Context
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Spinner
import org.osmdroid.tileprovider.tilesource.ITileSource
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.MapTileIndex
import org.osmdroid.views.MapView

// Fonds de carte : plan, satellite (Esri, ordre z/y/x), relief, clair.
class EsriSatellite : XYTileSource(
    "EsriSat", 0, 19, 256, ".png",
    arrayOf("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/")
) {
    override fun getTileURLString(pTileIndex: Long): String {
        return baseUrl + MapTileIndex.getZoom(pTileIndex) + "/" +
            MapTileIndex.getY(pTileIndex) + "/" + MapTileIndex.getX(pTileIndex) + mImageFilenameEnding
    }
}

object Tiles {
    val NOMS = listOf("Plan (France)", "Plan (monde)", "Satellite", "Relief", "Clair")

    fun source(i: Int): ITileSource = when (i) {
        1 -> XYTileSource(
            "OSMStd", 0, 19, 256, ".png",
            arrayOf("https://tile.openstreetmap.org/")
        )
        2 -> EsriSatellite()
        3 -> XYTileSource(
            "Topo", 0, 17, 256, ".png",
            arrayOf("https://a.tile.opentopomap.org/", "https://b.tile.opentopomap.org/", "https://c.tile.opentopomap.org/")
        )
        4 -> XYTileSource(
            "Carto clair", 0, 20, 256, ".png",
            arrayOf("https://a.basemaps.cartocdn.com/light_all/", "https://b.basemaps.cartocdn.com/light_all/", "https://c.basemaps.cartocdn.com/light_all/", "https://d.basemaps.cartocdn.com/light_all/")
        )
        else -> XYTileSource(
            "OSMFrance", 0, 20, 256, ".png",
            arrayOf("https://a.tile.openstreetmap.fr/osmfr/", "https://b.tile.openstreetmap.fr/osmfr/", "https://c.tile.openstreetmap.fr/osmfr/")
        )
    }

    // Sélecteur à poser au-dessus d'une carte ; mémorise le choix par écran via [memorise].
    fun spinner(ctx: Context, initial: Int = 0, onChoix: (Int) -> Unit): Spinner {
        return Spinner(ctx).apply {
            adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_item, NOMS).apply {
                setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            }
            setSelection(initial)
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) = onChoix(pos)
                override fun onNothingSelected(p: AdapterView<*>?) {}
            }
        }
    }

    fun appliquer(carte: MapView, i: Int) {
        carte.setTileSource(source(i))
    }
}
