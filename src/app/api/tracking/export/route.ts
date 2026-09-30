import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { 
  footprints, 
  voitures, 
  conducteurs, 
  itineraires,
  proprietaires
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import JSZip from "jszip";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "geojson";
  const carId = searchParams.get("carId");

  try {
    // 1. Fetch data using LEFT JOINs so even partial data works
    let query = db
      .select({
        id: footprints.id,
        latitude: footprints.latitude,
        longitude: footprints.longitude,
        vitesse: footprints.vitesse,
        acceleration: footprints.acceleration,
        cap: footprints.cap,
        recordedAt: footprints.recordedAt,
        statut: footprints.statut,
        carId: voitures.carId,
        immatriculation: voitures.immatriculation,
        marque: voitures.marque,
        modele: voitures.modele,
        condNom: conducteurs.nom,
        condPrenom: conducteurs.prenom,
        propRS: proprietaires.raisonSociale,
        propNom: proprietaires.nom,
        propPrenom: proprietaires.prenom,
      })
      .from(footprints)
      .leftJoin(voitures, eq(footprints.voitureId, voitures.id))
      .leftJoin(itineraires, eq(footprints.itineraireId, itineraires.id))
      .leftJoin(conducteurs, eq(itineraires.conducteurId, conducteurs.id))
      .leftJoin(proprietaires, eq(voitures.proprietaireId, proprietaires.id))
      .orderBy(desc(footprints.recordedAt))
      .limit(50000);

    if (carId) {
      query = query.where(eq(voitures.carId, carId)) as typeof query;
    }

    const data = await query;

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "La base de données est vide. Lancez la simulation et faites 'Flush DB' d'abord." },
        { status: 400 }
      );
    }

    // 2. Build GeoJSON
    const features: GeoJSON.Feature[] = data.map((r) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [r.longitude || 0, r.latitude || 0],
      },
      properties: {
        id: r.id,
        vehicule: `${r.marque || ""} ${r.modele || ""}`.trim() || "N/A",
        immat: r.immatriculation || "N/A",
        car_id: r.carId || "N/A",
        vitesse: r.vitesse,
        conducteur: r.condNom ? `${r.condPrenom} ${r.condNom}` : "Inconnu",
        proprietaire: r.propRS || (r.propNom ? `${r.propPrenom} ${r.propNom}` : "Inconnu"),
        date: r.recordedAt ? new Date(r.recordedAt).toISOString() : "N/A",
        statut: r.statut,
      },
    }));

    const geojson = {
      type: "FeatureCollection",
      features,
    };

    const filenameBase = `export-algeria-fleet-${new Date().toISOString().split('T')[0]}`;

    // 3. Return GeoJSON directly
    if (format === "geojson") {
      const content = JSON.stringify(geojson, null, 2);
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filenameBase}.geojson"`,
          "Content-Length": Buffer.byteLength(content).toString(),
        },
      });
    }

    // 4. Return Shapefile-ready ZIP
    if (format === "shapefile") {
      const zip = new JSZip();
      zip.file("data.geojson", JSON.stringify(geojson, null, 2));
      zip.file("projection.prj", `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]`);
      zip.file("README.txt", `Export SIG - Flotte Algérie\nFormat GeoJSON haute compatibilité.\nImportez data.geojson dans QGIS.`);
      
      const zipBuffer = await zip.generateAsync({ type: "blob" });
      const arrayBuffer = await zipBuffer.arrayBuffer();
      
      return new NextResponse(arrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filenameBase}.zip"`,
          "Content-Length": arrayBuffer.byteLength.toString(),
        },
      });
    }

    return NextResponse.json({ error: "Format non supporté" }, { status: 400 });
  } catch (error: any) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la lecture en base de données", details: error.message },
      { status: 500 }
    );
  }
}
