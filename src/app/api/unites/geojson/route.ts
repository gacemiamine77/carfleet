import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { unitesSecurite } from "@/db/schema";
import { ensureUnitesSeed } from "@/lib/unites";
import { NORTH_ALGERIA_CITIES, WILAYA_CENTERS } from "@/lib/algeriaData";

const OSRM = [
  "https://router.project-osrm.org",
  "https://routing.openstreetmap.de/routed-car",
  "https://osrm.cherrycache.org",
];
const snapCache = new Map<string, { lat: number; lon: number }>();

async function snapToRoad(lat: number, lon: number): Promise<{ lat: number; lon: number }> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = snapCache.get(key);
  if (hit) return hit;
  for (const base of OSRM) {
    try {
      const r = await fetch(`${base}/nearest/v1/driving/${lon},${lat}?number=1`, { signal: AbortSignal.timeout(5000) });
      const j: any = await r.json();
      const loc = j?.waypoints?.[0]?.location;
      if (j?.code === "Ok" && loc) {
        const p = { lat: loc[1], lon: loc[0] };
        snapCache.set(key, p);
        return p;
      }
    } catch { continue; }
  }
  return { lat, lon };
}

// Positionne chaque unité sur une ville réelle (donc sur le réseau routier),
// police au centre-ville, gendarmerie décalée de ~900m (autre côté de la route),
// puis snap OSRM nearest quand le lot est petit (filtre wilaya).
function townForWilaya(code: string): { lat: number; lon: number } {
  const city = NORTH_ALGERIA_CITIES.find((c) => c[3] === code);
  if (city) return { lat: city[1], lon: city[2] };
  const c = WILAYA_CENTERS[code];
  if (c) return { lat: c[0], lon: c[1] };
  return { lat: 36.75, lon: 3.04 };
}

// GET /api/unites/geojson?codeWilaya=16&type=gendarmerie&moyen=barrage_fixe → unités sur les routes
export async function GET(req: NextRequest) {
  await ensureUnitesSeed();
  const { searchParams } = new URL(req.url);
  let codeWilaya = (searchParams.get("codeWilaya") || "").padStart(2, "0");
  const type = searchParams.get("type") || "all";
  const moyen = searchParams.get("moyen") || "all";
  try {
    const { getAuthUnite } = await import("@/lib/auth-unites");
    const auth = await getAuthUnite(req);
    if (auth) codeWilaya = auth.unite.codeWilaya;
  } catch {}

  let rows = await db.select().from(unitesSecurite).orderBy(unitesSecurite.codeWilaya, unitesSecurite.type);
  if (codeWilaya && codeWilaya !== "00") rows = rows.filter((r) => r.codeWilaya === codeWilaya);
  if (type !== "all") rows = rows.filter((r) => r.type === type);
  if (moyen !== "all") rows = rows.filter((r) => (r as any).moyen === moyen);

  const features: GeoJSON.Feature[] = [];
  const doSnap = rows.length <= 12; // snap OSRM seulement sur petits lots (rapide)
  for (const u of rows as any[]) {
    const town = townForWilaya(u.codeWilaya);
    const raw = u.latitude != null && u.longitude != null
      ? { lat: u.latitude, lon: u.longitude }
      : town;
    const p = doSnap ? await snapToRoad(raw.lat, raw.lon) : raw;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] } as GeoJSON.Point,
      properties: {
        id: u.id, code: u.code, nom: u.nom, type: u.type,
        moyen: u.moyen, mobile: u.mobile,
        wilaya: u.wilaya, codeWilaya: u.codeWilaya, telephone: u.telephone,
        snapped: doSnap,
      },
    });
  }

  return new NextResponse(JSON.stringify({ type: "FeatureCollection", features }, null, 2), {
    headers: { "Content-Type": "application/geo+json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
