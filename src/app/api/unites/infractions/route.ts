import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { infractionsConstatees } from "@/db/schema";
import { eq, desc, sql, inArray, gte, and } from "drizzle-orm";
import { resolveWilayaForPosition } from "@/lib/unites";

export const dynamic = "force-dynamic";

// Score de gravité (même formule côté Android pour le tri local)
export function scoreGravite(infraction: string, exces: number | null): number {
  switch (infraction) {
    case "circulation à contresens": return 100;
    case "zone interdite": return 80;
    case "conduite longue sans arrêt": return 50;
    case "exces de vitesse": return 40 + Math.min(Number(exces) || 0, 60);
    case "arrêt interdit":
    case "stationnement interdit": return 30;
    case "impossible de comparée": return 10;
    default: return 20;
  }
}

function havKm(a: number, b: number, c: number, d: number): number {
  const R = 6371, t = Math.PI / 180;
  const s1 = Math.sin(((c - a) * t) / 2), s2 = Math.sin(((d - b) * t) / 2);
  const h = s1 * s1 + Math.cos(a * t) * Math.cos(c * t) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// GET /api/unites/infractions?codeWilaya=16&infraction=exces de vitesse&categorieVehicule=lourd&statut=nouveau&periode=7d&q=1234&lat=36.7&lon=3.0&rayon=10000&tri=gravite&format=json|geojson
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
  const periodeF = searchParams.get("periode") || "all"; // today | 7d | 30d | all
  const qF = (searchParams.get("q") || "").trim().toLowerCase();
  // Attention : Number(null) === 0 — un paramètre absent donnerait (0,0) au large du Ghana !
  const latParam = searchParams.get("lat"), lonParam = searchParams.get("lon");
  const latF = latParam == null || latParam === "" ? NaN : Number(latParam);
  const lonF = lonParam == null || lonParam === "" ? NaN : Number(lonParam);
  const rayonF = Math.min(100000, Math.max(100, Number(searchParams.get("rayon") || 10000)));
  const triF = searchParams.get("tri") || "recent"; // recent | gravite | distance
  const hasPos = Number.isFinite(latF) && Number.isFinite(lonF);
  const format = searchParams.get("format") || "json";
  const limit = Math.min(2000, Math.max(1, Number(searchParams.get("limit") || 500)));
  // Export CSV = rapports : on veut le maximum de lignes du territoire.
  const effLimit = format === "csv" ? 2000 : limit;

  // 1. PAS de dispatch ici (le tick s'en charge déjà en incrémental) :
  // le faire à chaque lecture bloquait la réponse (N requêtes Neon avant de répondre).
  // Lecture directe de la DB persistée.
  let rows: any[] = [];
  try {
    rows = await db.select().from(infractionsConstatees).orderBy(desc(infractionsConstatees.recordedAt)).limit(effLimit * 2);
  } catch (e: any) {
    return NextResponse.json({ error: "table manquante ? lancez drizzle migrate", details: String(e) }, { status: 500 });
  }
  let filtered = rows;
  if (codeWilaya && codeWilaya !== "00" && codeWilaya !== "all") filtered = filtered.filter((r) => r.codeWilaya === codeWilaya);
  if (infractionF !== "all") filtered = filtered.filter((r) => r.infraction === infractionF);
  if (catF !== "all") filtered = filtered.filter((r) => (r.categorieVehicule || "leger") === catF);
  if (statutF !== "all") filtered = filtered.filter((r) => r.statut === statutF);
  if (periodeF !== "all") {
    const now = new Date();
    const start = new Date(now);
    if (periodeF === "today") start.setHours(0, 0, 0, 0);
    else if (periodeF === "7d") start.setTime(now.getTime() - 7 * 86400 * 1000);
    else if (periodeF === "30d") start.setTime(now.getTime() - 30 * 86400 * 1000);
    filtered = filtered.filter((r) => new Date(r.recordedAt) >= start);
  }
  if (qF) {
    filtered = filtered.filter((r) =>
      String(r.immatriculation || "").toLowerCase().includes(qF) ||
      String(r.carId || "").toLowerCase().includes(qF) ||
      String(r.conducteurNom || "").toLowerCase().includes(qF));
  }
  let withDist = filtered.map((r) => ({ r, distM: hasPos ? Math.round(havKm(latF, lonF, r.latitude, r.longitude) * 1000) : null as number | null }));
  if (hasPos) withDist = withDist.filter((x) => (x.distM as number) <= rayonF);
  if (triF === "gravite") withDist.sort((a, b) => scoreGravite(b.r.infraction, b.r.exces) - scoreGravite(a.r.infraction, a.r.exces));
  else if (triF === "distance" && hasPos) withDist.sort((a, b) => (a.distM as number) - (b.distM as number));
  else withDist.sort((a, b) => new Date(b.r.recordedAt).getTime() - new Date(a.r.recordedAt).getTime());
  filtered = withDist.slice(0, effLimit).map((x) => (hasPos ? { ...x.r, distM: x.distM } : x.r));

  // 2b. Détails conducteur (nom, prénom, âge, tél) via la table conducteurs
  let condParNom = new Map<string, any>();
  try {
    const { conducteurs } = await import("@/db/schema");
    const tous = await db.select().from(conducteurs).limit(5000);
    const age = (d: any) => {
      if (!d) return null;
      const dn = new Date(d), now = new Date();
      let a = now.getFullYear() - dn.getFullYear();
      const m = now.getMonth() - dn.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dn.getDate())) a--;
      return a;
    };
    for (const c of tous) {
      condParNom.set(`${(c.prenom || "").toLowerCase()}|${(c.nom || "").toLowerCase()}`, {
        nom: c.nom, prenom: c.prenom, age: age(c.dateNaissance), telephone: c.telephone,
        numeroPermis: (c as any).numeroPermis || null,
      });
    }
  } catch {}
  const avecCond = filtered.map((r) => {
    const parts = String(r.conducteurNom || "").trim().split(/\s+/);
    const prenom = parts[0] || "", nom = parts.slice(1).join(" ");
    const hit = condParNom.get(`${prenom.toLowerCase()}|${nom.toLowerCase()}`);
    return { ...r, conducteur: hit || { nom: nom || null, prenom: prenom || null, age: null, telephone: null } };
  });
  filtered = avecCond as any;

  // 2c. Infos véhicule (marque/modèle/couleur) — résumé « par véhicule » côté apps
  try {
    const { voitures } = await import("@/db/schema");
    const carIds = [...new Set(filtered.map((r: any) => r.carId).filter(Boolean))];
    if (carIds.length) {
      const vs = await db.select({ carId: voitures.carId, marque: voitures.marque, modele: voitures.modele, couleur: voitures.couleur }).from(voitures);
      const vmap = new Map(vs.map((v) => [v.carId, v]));
      filtered = filtered.map((r: any) => {
        const v: any = vmap.get(r.carId);
        return { ...r, marque: v?.marque || null, modele: v?.modele || null, couleur: v?.couleur || null };
      });
    }
  } catch {}

  // 2d. Récidive : nb d'infractions (total + graves ≥50) du même véhicule sur 30 jours
  try {
    const carIds = [...new Set((filtered as any[]).map((r) => r.carId).filter(Boolean))];
    if (carIds.length) {
      const rec = await db.select({
        carId: infractionsConstatees.carId,
        total: sql<number>`count(*)::int`,
        graves: sql<number>`count(*) filter (where (case infraction
          when 'circulation à contresens' then 100
          when 'zone interdite' then 80
          when 'conduite longue sans arrêt' then 50
          when 'exces de vitesse' then (40 + least(coalesce(exces, 0), 60))
          when 'arrêt interdit' then 30
          when 'stationnement interdit' then 30
          else 20 end) >= 50)::int`,
      }).from(infractionsConstatees)
        .where(and(inArray(infractionsConstatees.carId, carIds as any), gte(infractionsConstatees.recordedAt, new Date(Date.now() - 30 * 86400000))))
        .groupBy(infractionsConstatees.carId);
      const rmap = new Map(rec.map((x) => [x.carId, x]));
      filtered = filtered.map((r: any) => ({
        ...r,
        recidive30: rmap.get(r.carId)?.total ?? 0,
        recidiveGrave: rmap.get(r.carId)?.graves ?? 0,
      }));
    }
  } catch {}

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

  if (format === "csv") {
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ["recordedAt", "immatriculation", "carId", "marque", "modele", "couleur", "categorieVehicule", "infraction", "vitesse", "vitesseLimite", "exces", "conducteur", "wilaya", "codeWilaya", "statut", "resultat", "latitude", "longitude", "recidive30", "recidiveGrave"];
    const lines = [head.join(";")];
    for (const r of filtered as any[]) {
      lines.push([
        r.recordedAt, r.immatriculation, r.carId, r.marque, r.modele, r.couleur, r.categorieVehicule,
        r.infraction, r.vitesse, r.vitesseLimite, r.exces, r.conducteurNom, r.wilaya, r.codeWilaya,
        r.statut, r.resultat, r.latitude, r.longitude, r.recidive30 ?? 0, r.recidiveGrave ?? 0,
      ].map(esc).join(";"));
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="infractions-${codeWilaya || "all"}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
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
        ...(r.distM != null ? { distM: r.distM } : {}),
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
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

// DELETE /api/unites/infractions — supprime TOUTES les infractions persistées (action irréversible)
export async function DELETE() {
  try {
    const { db } = await import("@/db");
    const { infractionsConstatees } = await import("@/db/schema");
    await db.delete(infractionsConstatees);
    const res = NextResponse.json({ ok: true, cleared: true });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
