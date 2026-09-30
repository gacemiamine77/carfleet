import { NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";
import JSZip from "jszip";

// GET - Export current simulation data directly from memory (no DB needed)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "geojson";
  const carId = searchParams.get("carId");

  const state = getSimulation();
  if (!state) {
    return NextResponse.json({ error: "Aucune simulation en cours" }, { status: 404 });
  }

  // Collect all footprint records from memory
  const allRecords: any[] = [];
  for (const [cid, records] of state.footprintRecords) {
    if (carId && cid !== carId) continue;
    const car = state.cars.find(c => c.voiture.carId === cid);
    if (!car) continue;
    
    for (const r of records) {
      allRecords.push({
        ...r,
        carId: cid,
        marque: car.voiture.marque,
        modele: car.voiture.modele,
        immatriculation: car.voiture.immatriculation,
        conducteur: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
        proprietaire: car.voiture.proprietaire.type === "physique" 
          ? `${car.voiture.proprietaire.prenom} ${car.voiture.proprietaire.nom}`
          : car.voiture.proprietaire.raisonSociale,
      });
    }
  }

  if (allRecords.length === 0) {
    return NextResponse.json({ error: "Aucune donnée en mémoire. Lancez la simulation d'abord." }, { status: 404 });
  }

  // Build GeoJSON
  const features = allRecords.map((r) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [r.longitude, r.latitude],
    },
    properties: {
      car_id: r.carId,
      vehicule: `${r.marque} ${r.modele}`,
      immat: r.immatriculation,
      vitesse: r.vitesse,
      acceleration: r.acceleration,
      cap: r.cap,
      conducteur: r.conducteur,
      proprietaire: r.proprietaire,
      date: r.recordedAt,
      statut: r.statut,
    },
  }));

  const geojson = {
    type: "FeatureCollection" as const,
    features,
  };

  const filenameBase = `simulation-export-${new Date().toISOString().split('T')[0]}`;

  if (format === "geojson") {
    return new NextResponse(JSON.stringify(geojson, null, 2), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="${filenameBase}.geojson"`,
      },
    });
  }

  if (format === "shapefile") {
    const zip = new JSZip();
    zip.file("data.geojson", JSON.stringify(geojson, null, 2));
    zip.file("projection.prj", `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]`);
    zip.file("README.txt", `Export Simulation Flotte Algerie\nRecords: ${features.length}\nImportez data.geojson dans QGIS.`);
    
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filenameBase}.zip"`,
      },
    });
  }

  return NextResponse.json({ error: "Format non supporte" }, { status: 400 });
}
