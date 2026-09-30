import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { infractionsConstatees } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getSimulation } from "@/lib/simulationManager";
import { dispatchInfractions, resolveWilayaForPosition } from "@/lib/unites";

// GET /api/unites/infractions?codeWilaya=16&infraction=exces de vitesse&categorieVehicule=lourd&statut=nouveau&format=json|geojson
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Compte unité connecté → territoire imposé (ignore le paramètre client)
  let auth: any = null;
  try {
    const { getAuthUnite } = await import("@/lib/auth-unites");
    auth = await getAuthUnite(req);
  } catch {}
  let codeWilaya = (searchParams.get("codeWilaya") || "").padStart(2, "0");
  if (auth) codeWilaya = auth.unite.codeWilaya;
  const infractionF = searchParams.get("infraction") || "all";
  const catF = searchParams.get("categorieVehicule") || searchParams.get("categorie") || "all";
  const statutF = searchParams.get("statut") || "all";
  const format = searchParams.get("format") || "json";
  const limit = Math.min(2000, Math.max(1, Number(searchParams.get("limit") || 500)));

  // 1. Dispatche d'abord la mémoire vers la DB (temps réel pour les unités)
  try {
    const state = getSimulation();
    if (state?.infractions?.length) await dispatchInfractions(state.infractions as any);
  } catch {}

  // 2. Lit la DB persistée
  let rows: any[] = [];
  try {
    rows = await db.select().from(infractionsConstatees).orderBy(desc(infractionsConstatees.recordedAt)).limit(limit * 2);
  } catch (e: any) {
    return NextResponse.json({ error: "table manquante ? lancez drizzle migrate", details: String(e) }, { status: 500 });
  }
  let filtered = rows;
  if (codeWilaya && codeWilaya !== "00" && codeWilaya !== "all") filtered = filtered.filter((r) => r.codeWilaya === codeWilaya);
  if (infractionF !== "all") filtered = filtered.filter((r) => r.infraction === infractionF);
  if (catF !== "all") filtered = filtered.filter((r) => (r.categorieVehicule || "leger") === catF);
  if (statutF !== "all") filtered = filtered.filter((r) => r.statut === statutF);
  filtered = filtered.slice(0, limit);

  // 3. Stats pour le territoire filtré
  const parType: Record<string, number> = {};
  const parCategorie: Record<string, number> = {};
  const parWilaya: Record<string, number> = {};
  const parStatut: Record<string, number> = {};
  for (const r of filtered) {
    parType[r.infraction] = (parType[r.infraction] || 0) + 1;
    parCategorie[r.categorieVehicule || "leger"] = (parCategorie[r.categorieVehicule || "leger"] || 0) + 1;
    parWilaya[`${r.codeWilaya} - ${r.wilaya}`] = (parWilaya[`${r.codeWilaya} - ${r.wilaya}`] || 0) + 1;
    parStatut[r.statut] = (parStatut[r.statut] || 0) + 1;
  }

  if (format === "geojson") {
    const features = filtered.map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r.longitude, r.latitude] as [number, number] },
      properties: {
        id: r.id, carId: r.carId, immatriculation: r.immatriculation, conducteur: r.conducteurNom,
        infraction: r.infraction, categorieVehicule: r.categorieVehicule, restriction: r.restriction,
        speed: r.vitesse, speedLimit: r.vitesseLimite, excess: r.exces,
        wilaya: r.wilaya, codeWilaya: r.codeWilaya, statut: r.statut, recordedAt: r.recordedAt,
      },
    }));
    return new NextResponse(JSON.stringify({ type: "FeatureCollection", features }, null, 2), {
      headers: { "Content-Type": "application/geo+json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const res = NextResponse.json({
    infractions: filtered, total: filtered.length,
    stats: { parType, parCategorie, parWilaya, parStatut },
    ...(auth ? { unite: auth.unite } : {}),
  });
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

// PATCH /api/unites/infractions {id, statut} → notifie/traite (territoire imposé si compte connecté)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, statut } = body as { id: number; statut: "nouveau" | "notifie" | "traite" };
  if (!id || !statut) return NextResponse.json({ error: "id + statut requis" }, { status: 400 });
  try {
    const { getAuthUnite } = await import("@/lib/auth-unites");
    const auth = await getAuthUnite(req);
    if (auth) {
      const row = await db.select({ codeWilaya: infractionsConstatees.codeWilaya }).from(infractionsConstatees).where(eq(infractionsConstatees.id, Number(id))).limit(1);
      if (!row.length) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
      if (row[0].codeWilaya !== auth.unite.codeWilaya) return NextResponse.json({ error: "Hors de votre territoire" }, { status: 403 });
    }
  } catch (e: any) {
    if (e?.status === 403 || e?.status === 404) throw e;
  }
  await db.update(infractionsConstatees).set({ statut: statut as any }).where(eq(infractionsConstatees.id, Number(id)));
  const res = NextResponse.json({ ok: true, id, statut });
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
