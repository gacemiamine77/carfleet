import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { voitures, itineraires, footprints } from "@/db/schema";
import { eq, and, gte, lte, inArray, sql } from "drizzle-orm";
import { getAuthProprio } from "@/lib/auth-proprio";

export const dynamic = "force-dynamic";

// GET /api/proprietaires/stats?carId=&groupby=jour|mois&debut=2026-09-01&fin=2026-09-30
// Km (Σ max-min distanceCumulee par itinéraire et par jour, /1000), nb trajets, vitesse moyenne.
export async function GET(req: NextRequest) {
  const auth = await getAuthProprio(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const q = new URL(req.url).searchParams;
    const carId = q.get("carId") || "";
    const groupby = q.get("groupby") === "mois" ? "mois" : "jour";
    const fin = q.get("fin") ? new Date(q.get("fin") as string) : new Date();
    const debut = q.get("debut") ? new Date(q.get("debut") as string)
      : new Date(fin.getTime() - (groupby === "mois" ? 365 : 30) * 86400 * 1000);

    const mesVoitures = await db.select({ id: voitures.id, carId: voitures.carId })
      .from(voitures).where(eq(voitures.proprietaireId, auth.proprietaire.id));
    const vids = mesVoitures.filter((v) => !carId || v.carId === carId).map((v) => v.id);
    if (!vids.length) {
      const res = NextResponse.json({ series: [], totalKm: 0, totalTrajets: 0, vitesseMoyenne: 0 });
      res.headers.set("Access-Control-Allow-Origin", "*");
      return res;
    }
    const bucket = groupby === "mois"
      ? sql<string>`to_char(recorded_at, 'YYYY-MM')`
      : sql<string>`to_char(recorded_at, 'YYYY-MM-DD')`;

    // Une passe SQL par (itineraire, période), agrégation JS (volumes d'un proprio limités)
    const pts = await db.select({
      itineraireId: footprints.itineraireId,
      jour: bucket,
      dmin: sql<number>`MIN(distance_cumulee)`,
      dmax: sql<number>`MAX(distance_cumulee)`,
      vmoy: sql<number>`AVG(vitesse)`,
    }).from(footprints)
      .where(and(inArray(footprints.voitureId, vids), gte(footprints.recordedAt, debut), lte(footprints.recordedAt, fin)))
      .groupBy(footprints.itineraireId, bucket);

    const parJour = new Map<string, { km: number; trajets: Set<number>; v: number[] }>();
    for (const p of pts as any[]) {
      const key = String(p.jour);
      let e = parJour.get(key);
      if (!e) { e = { km: 0, trajets: new Set(), v: [] }; parJour.set(key, e); }
      e.km += Math.max(0, (Number(p.dmax) || 0) - (Number(p.dmin) || 0)) / 1000;
      e.trajets.add(p.itineraireId);
      e.v.push(Number(p.vmoy) || 0);
    }
    const series = [...parJour.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([periode, e]) => ({
      periode, km: Math.round(e.km * 10) / 10, trajets: e.trajets.size,
      vitesseMoyenne: e.v.length ? Math.round(e.v.reduce((a, b) => a + b, 0) / e.v.length) : 0,
    }));
    const totalKm = Math.round(series.reduce((a, s) => a + s.km, 0) * 10) / 10;
    const totalTrajets = series.reduce((a, s) => a + s.trajets, 0);
    const res = NextResponse.json({
      series, totalKm, totalTrajets,
      vitesseMoyenne: series.length ? Math.round(series.reduce((a, s) => a + s.vitesseMoyenne, 0) / series.length) : 0,
      debut, fin, groupby,
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
