import { db } from "@/db";
import { sql } from "drizzle-orm";

// Helpers géospatiaux PostGIS (best-effort : null si PostGIS indisponible).
// Nécessite CREATE EXTENSION postgis (migration 0001) + colonne footprints.geog
// remplie à l'ingestion (NULL pour l'historique antérieur).

export async function postgisOk(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT ST_AsText(ST_MakePoint(3.04, 36.75)::geography)`);
    return true;
  } catch {
    return false;
  }
}

// Distance parcourue (km) d'un véhicule depuis une date (trajectoire réelle OSM via geog).
export async function trajetDistanceKm(voitureId: number, sinceIso?: string): Promise<number | null> {
  try {
    const since = sinceIso ? new Date(sinceIso) : new Date(Date.now() - 24 * 3600 * 1000);
    const r = await db.execute(sql`
      SELECT COALESCE(ST_Length(ST_MakeLine(geog::geometry ORDER BY recorded_at)::geography), 0) / 1000.0 AS km
      FROM footprints WHERE voiture_id = ${voitureId} AND geog IS NOT NULL AND recorded_at >= ${since}`);
    const row: any = (r as any).rows?.[0] ?? (r as any)[0];
    return Number(row?.km ?? 0);
  } catch {
    return null;
  }
}

// Véhicules (temps réel) dans un rayon : géofencing / proximité d'un point / sortie de corridor.
export async function vehiculesDansRayon(lon: number, lat: number, rayonM: number, limite = 100): Promise<Array<{ carId: string; distM: number }> | null> {
  try {
    const r = await db.execute(sql`
      SELECT car_id AS "carId",
             ST_Distance(ST_MakePoint(${lon}, ${lat})::geography,
                         ST_MakePoint(longitude, latitude)::geography) AS "distM"
      FROM vehicle_current_position
      WHERE ST_DWithin(ST_MakePoint(${lon}, ${lat})::geography,
                       ST_MakePoint(longitude, latitude)::geography, ${rayonM})
      ORDER BY "distM" LIMIT ${limite}`);
    const rows: any[] = (r as any).rows ?? (r as any);
    return rows.map((x) => ({ carId: String(x.carId), distM: Number(x.distM) }));
  } catch {
    return null;
  }
}

// Infractions constatées proches d'un point (carte unités : "quoi autour de moi ?").
export async function infractionsProches(lon: number, lat: number, rayonM: number, limite = 100) {
  try {
    const r = await db.execute(sql`
      SELECT id, car_id AS "carId", infraction, vitesse, latitude, longitude, recorded_at AS "recordedAt",
             ST_Distance(ST_MakePoint(${lon}, ${lat})::geography,
                         ST_MakePoint(longitude, latitude)::geography) AS "distM"
      FROM infractions_constatees
      WHERE ST_DWithin(ST_MakePoint(${lon}, ${lat})::geography,
                       ST_MakePoint(longitude, latitude)::geography, ${rayonM})
      ORDER BY "distM" LIMIT ${limite}`);
    return ((r as any).rows ?? (r as any)) as any[];
  } catch {
    return null;
  }
}
