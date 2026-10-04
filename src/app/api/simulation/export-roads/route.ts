import { NextRequest, NextResponse } from "next/server";
import { getSimulation } from "@/lib/simulationManager";
import JSZip from "jszip";
// @ts-ignore - no types for shp-write
import shpwrite from "@mapbox/shp-write";

export const dynamic = "force-dynamic";

// GET - export road network used by cars
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "geojson";

  const state = getSimulation();
  if (!state) {
    return NextResponse.json({ error: "No simulation running" }, { status: 404 });
  }

  // Collect all routes from all cars
  const allRoutes: GeoJSON.Feature[] = [];
  const allPoints: GeoJSON.Feature[] = [];

  for (const car of state.cars) {
    if (car.routePoints.length < 2) continue;

    // Route as LineString
    const routeLine: GeoJSON.Feature = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: car.routePoints.map((p) => [p.lon, p.lat]),
      },
      properties: {
        car_id: car.voiture.carId,
        immatriculation: car.voiture.immatriculation,
        marque: car.voiture.marque,
        modele: car.voiture.modele,
        proprietaire: car.voiture.proprietaire.type === "physique"
          ? `${car.voiture.proprietaire.prenom} ${car.voiture.proprietaire.nom}`
          : car.voiture.proprietaire.raisonSociale,
        conducteur: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
        conducteur_tel: car.conducteurActuel.telephone,
        origin_city: car.originCity,
        dest_city: car.destinationCity,
        color: car.voiture.mapColor,
        num_points: car.routePoints.length,
      },
    };
    allRoutes.push(routeLine);

    // Origin point
    const originPt: GeoJSON.Feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [car.routePoints[0].lon, car.routePoints[0].lat],
      },
      properties: {
        type: "origin",
        car_id: car.voiture.carId,
        city: car.originCity,
      },
    };
    allPoints.push(originPt);

    // Destination point
    const destPt: GeoJSON.Feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          car.routePoints[car.routePoints.length - 1].lon,
          car.routePoints[car.routePoints.length - 1].lat,
        ],
      },
      properties: {
        type: "destination",
        car_id: car.voiture.carId,
        city: car.destinationCity,
      },
    };
    allPoints.push(destPt);
  }

  // Build GeoJSON FeatureCollection
  const routesGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: allRoutes,
  };

  const pointsGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: allPoints,
  };

  const combinedGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [...allRoutes, ...allPoints],
  };

  // Return based on format
  if (format === "geojson") {
    return new NextResponse(JSON.stringify(combinedGeoJSON, null, 2), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": `attachment; filename="algeria-road-network.geojson"`,
      },
    });
  }

  if (format === "geojson-split") {
    const zip = new JSZip();
    zip.file("routes.geojson", JSON.stringify(routesGeoJSON, null, 2));
    zip.file("points.geojson", JSON.stringify(pointsGeoJSON, null, 2));

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="algeria-road-network-geojson.zip"`,
      },
    });
  }

  if (format === "shapefile") {
    // Génère 2 shapefiles séparés (évite "nombre de format != nombre d'enregistrement" dû au mixte)
    const toRouteProps = (p: any) => ({
      car_id: String(p.car_id || "").slice(0, 10),
      immat: String(p.immatriculation || "").slice(0, 10),
      marque: String(p.marque || "").slice(0, 12),
      modele: String(p.modele || "").slice(0, 12),
      propr: String(p.proprietaire || "").slice(0, 20).replace(/[^A-Za-z0-9 _-]/g, ""),
      conduct: String(p.conducteur || "").slice(0, 20).replace(/[^A-Za-z0-9 _-]/g, ""),
      tel: String(p.conducteur_tel || "").slice(0, 14),
      origin: String(p.origin_city || "").slice(0, 20).replace(/[^A-Za-z0-9 _-]/g, ""),
      dest: String(p.dest_city || "").slice(0, 20).replace(/[^A-Za-z0-9 _-]/g, ""),
      color: String(p.color || ""),
      n_pts: Number(p.num_points || 0),
    });
    const toPointProps = (p: any) => ({
      car_id: String(p.car_id || "").slice(0, 10),
      type: String(p.type || "").slice(0, 10),
      city: String(p.city || "").slice(0, 20).replace(/[^A-Za-z0-9 _-]/g, ""),
    });
    const shpRoutes: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: allRoutes.map(f => ({ type: "Feature" as const, geometry: f.geometry as any, properties: toRouteProps(f.properties as any) })),
    };
    const shpPoints: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: allPoints.map(f => ({ type: "Feature" as const, geometry: f.geometry as any, properties: toPointProps(f.properties as any) })),
    };
    const finalZip = new JSZip();
    // Génère chaque couche séparément (2 shapefiles distincts) — même si 0 entités, on crée un shp vide lisible
    const genLayer = async (fc: GeoJSON.FeatureCollection, folderName: string, baseName: string) => {
      if (!fc.features.length) {
        // Crée un shapefile vide minimal (DBF vide) pour que QGIS l'ouvre sans erreur "nombre de forme"
        const emptyFc: GeoJSON.FeatureCollection = { type:"FeatureCollection", features:[] };
        try {
          // @ts-ignore
          const b:any = await (shpwrite as any).zip(emptyFc, { outputType:"arraybuffer" });
          const a = b instanceof ArrayBuffer ? new Uint8Array(b) : Buffer.from(b as string, "base64");
          const t = await JSZip.loadAsync(a);
          const f = finalZip.folder(folderName);
          for (const [n,file] of Object.entries(t.files)) if (!(file as any).dir) f!.file((n as string).replace(/^POINT\.|^POLYLINE\./, `${baseName}.`), await (file as any).async("nodebuffer"));
        } catch {}
        return;
      }
      // @ts-ignore
      const buf: any = await (shpwrite as any).zip(fc, { outputType: "arraybuffer" });
      const arr = buf instanceof ArrayBuffer ? new Uint8Array(buf) : Buffer.from(buf as string, "base64");
      const tmp = await JSZip.loadAsync(arr);
      const folder = finalZip.folder(folderName);
      for (const [name, file] of Object.entries(tmp.files)) {
        if ((file as any).dir) continue;
        const data = await (file as any).async("nodebuffer");
        const newName = name.replace(/^POLYLINE\./, `${baseName}.`).replace(/^LINESTRING\./, `${baseName}.`).replace(/^POINT\./, `${baseName}.`);
        folder!.file(newName, data);
      }
    };
    await genLayer(shpRoutes, "routes", "routes");
    await genLayer(shpPoints, "points", "points");
    finalZip.file("README.txt", `Algeria Road Network Shapefile\nGenerated: ${new Date().toISOString()}\nCars: ${state.cars.length}\nRoutes: ${allRoutes.length} (LINESTRING)\nPoints: ${allPoints.length} (POINT)\n\nDossiers:\n- routes/routes.shp (Polyline)\n- points/points.shp (Point)\n\nCRS: WGS84 EPSG:4326\nDans QGIS : Vetor -> Ajouter couche -> routes/routes.shp ET points/points.shp (2 couches). Si routes=0, patiente que OSRM finisse (bandeau amber).\n`);
    const outBuf = await finalZip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    return new NextResponse(new Uint8Array(outBuf), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="algeria-road-network-shapefile.zip"` },
    });
  }

  if (format === "gpkg-sql") {
    const sql = generateGeoPackageSQL(routesGeoJSON, pointsGeoJSON);

    return new NextResponse(sql, {
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="algeria-road-network.sql"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown format" }, { status: 400 });
}

function getPrjContent(): string {
  return `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]`;
}

function generateGeoPackageSQL(
  routes: GeoJSON.FeatureCollection,
  points: GeoJSON.FeatureCollection
): string {
  let sql = `-- Algeria Road Network - GeoPackage SQL
-- Run this in SpatiaLite or SQLite with SpatiaLite extension
-- Generated: ${new Date().toISOString()}

-- Initialize SpatiaLite
SELECT InitSpatialMetaData(1);

-- Create routes table
CREATE TABLE routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  car_id TEXT,
  immatriculation TEXT,
  proprietaire TEXT,
  conducteur TEXT,
  origin_city TEXT,
  dest_city TEXT,
  color TEXT
);
SELECT AddGeometryColumn('routes', 'geom', 4326, 'LINESTRING', 'XY');

-- Create points table
CREATE TABLE points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  car_id TEXT,
  city TEXT
);
SELECT AddGeometryColumn('points', 'geom', 4326, 'POINT', 'XY');

-- Insert routes
`;

  for (const f of routes.features) {
    if (f.geometry.type !== "LineString") continue;
    const coords = f.geometry.coordinates.map(([x, y]) => `${x} ${y}`).join(", ");
    const p = f.properties || {};
    sql += `INSERT INTO routes (car_id, immatriculation, proprietaire, conducteur, origin_city, dest_city, color, geom) VALUES ('${p.car_id || ""}', '${p.immatriculation || ""}', '${(p.proprietaire || "").replace(/'/g, "''")}', '${(p.conducteur || "").replace(/'/g, "''")}', '${p.origin_city || ""}', '${p.dest_city || ""}', '${p.color || ""}', GeomFromText('LINESTRING(${coords})', 4326));\n`;
  }

  sql += `\n-- Insert points\n`;

  for (const f of points.features) {
    if (f.geometry.type !== "Point") continue;
    const [x, y] = f.geometry.coordinates;
    const p = f.properties || {};
    sql += `INSERT INTO points (type, car_id, city, geom) VALUES ('${p.type || ""}', '${p.car_id || ""}', '${p.city || ""}', GeomFromText('POINT(${x} ${y})', 4326));\n`;
  }

  sql += `
-- Create spatial indexes
SELECT CreateSpatialIndex('routes', 'geom');
SELECT CreateSpatialIndex('points', 'geom');

-- Done!
SELECT 'Import complete. Routes: ' || COUNT(*) FROM routes;
`;

  return sql;
}
