import { db } from "@/db";
import { unitesSecurite, infractionsConstatees } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { WILAYAS, WILAYA_CENTERS } from "./algeriaData";
import type { SpeedInfraction } from "./simulation";

function havKm(a: number, b: number, c: number, d: number): number {
  const R = 6371, t = Math.PI / 180;
  const s1 = Math.sin(((c - a) * t) / 2), s2 = Math.sin(((d - b) * t) / 2);
  const h = s1 * s1 + Math.cos(a * t) * Math.cos(c * t) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Périmètre = wilaya la plus proche du point d'infraction (limites administratives)
export function resolveWilayaForPosition(lat: number, lon: number): { code: string; name: string } {
  let best = "16", bestD = Infinity;
  for (const [code, [clat, clon]] of Object.entries(WILAYA_CENTERS)) {
    const d = havKm(lat, lon, clat, clon);
    if (d < bestD) { bestD = d; best = code; }
  }
  const w = WILAYAS.find((x) => x.code === best);
  return { code: best, name: w?.name || "Alger" };
}

export const MOYENS = [
  { moyen: "barrage_fixe", label: "Barrage fixe", mobile: false, dx: 0, dy: 0 },
  { moyen: "barrage_mobile", label: "Barrage mobile", mobile: true, dx: 0.012, dy: 0.012 },
  { moyen: "motards", label: "Motards", mobile: true, dx: -0.01, dy: 0.009 },
  { moyen: "vehicule_mobile", label: "Véhicule mobile", mobile: true, dx: 0.006, dy: -0.011 },
] as const;

export type MoyenUnite = (typeof MOYENS)[number]["moyen"];

// Seed : 8 unités par wilaya = 2 corps (police/gendarmerie) × 4 moyens.
// Rejouable : convertit les anciennes lignes (POL-xx/GND-xx) et complète les manquants.
export async function ensureUnitesSeed(): Promise<void> {
  const { NORTH_ALGERIA_CITIES } = await import("./algeriaData");
  const townFor = (code: string): { lat: number; lon: number } => {
    const city: any = (NORTH_ALGERIA_CITIES as any[]).find((c) => c[3] === code);
    if (city) return { lat: city[1], lon: city[2] };
    const c = (WILAYA_CENTERS as any)[code] || [36.75, 3.04];
    return { lat: c[0], lon: c[1] };
  };
  // 1. Convertit l'ancien seed (POL-xx → barrage_fixe, GND-xx → barrage_mobile)
  try {
    const legacy = await db.select().from(unitesSecurite);
    for (const u of legacy as any[]) {
      if (!u.moyen || u.moyen === "poste_fixe") {
        const m = u.code.startsWith("GND-") ? "barrage_mobile" : "barrage_fixe";
        await db.update(unitesSecurite).set({ moyen: m as any, mobile: m !== "barrage_fixe" } as any).where(eq(unitesSecurite.id, u.id));
      }
    }
  } catch {}
  // 2. Complète les combinaisons manquantes
  const corps: Array<"police" | "gendarmerie"> = ["police", "gendarmerie"];
  const prefix = { police: "POL", gendarmerie: "GND" } as const;
  const tag = { barrage_fixe: "FIXE", barrage_mobile: "MOB", motards: "MOTO", vehicule_mobile: "VEHI" } as const;
  let have: any[] = [];
  try { have = await db.select({ code: unitesSecurite.code }).from(unitesSecurite); } catch { return; }
  const haveSet = new Set(have.map((h) => h.code));
  const rows: any[] = [];
  for (const w of WILAYAS) {
    const t = townFor(w.code);
    for (const c of corps) {
      for (const m of MOYENS) {
        const code = `${prefix[c]}-${tag[m.moyen as keyof typeof tag]}-${w.code}`;
        if (haveSet.has(code)) continue;
        // Les anciens POL-xx / GND-xx couvrent déjà (police,barrage_fixe) et (gendarmerie,barrage_mobile)
        if (c === "police" && m.moyen === "barrage_fixe" && haveSet.has(`POL-${w.code}`)) continue;
        if (c === "gendarmerie" && m.moyen === "barrage_mobile" && haveSet.has(`GND-${w.code}`)) continue;
        const corpsLbl = c === "police" ? "Police" : "Gendarmerie";
        rows.push({
          code, nom: `${m.label} — ${corpsLbl} — ${w.name}`,
          type: c, codeWilaya: w.code, wilaya: w.name,
          moyen: m.moyen, mobile: m.mobile,
          latitude: t.lat + m.dx, longitude: t.lon + m.dy,
          telephone: `+213 0${w.code} 00 00 00`, actif: true,
        });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 20) {
    try {
      await db.insert(unitesSecurite).values(rows.slice(i, i + 20) as any).onConflictDoNothing();
    } catch {}
  }
}

// Envoie les infractions mémoire vers les unités (persist + dispatch wilaya).
// Appelé à chaque tick : on ne traite que les NOUVELLES (sinon N requêtes × latence Neon à chaque tick → freeze).
const dispatchedIds = new Set<string>();
export async function dispatchInfractions(infractions: (SpeedInfraction & { categorieVehicule?: string })[]): Promise<{ inserted: number }> {
  const fresh = infractions.filter((i) => !dispatchedIds.has(i.id));
  if (!fresh.length) return { inserted: 0 };
  if (dispatchedIds.size > 20000) dispatchedIds.clear();
  await ensureUnitesSeed();
  let inserted = 0;
  let errors = 0;
  let firstError: string | null = null;
  for (const inf of fresh) {
    try {
      const already = await db.select({ id: infractionsConstatees.id }).from(infractionsConstatees).where(eq(infractionsConstatees.externalId, inf.id)).limit(1);
      dispatchedIds.add(inf.id);
      if (already.length) continue;
      const { code, name } = resolveWilayaForPosition(inf.lat, inf.lon);
      // Catégorie véhicule depuis mémoire ou DB
      let cat = (inf as any).categorieVehicule || "leger";
      if (cat === "leger" && inf.carId) {
        try {
          const { voitures } = await import("@/db/schema");
          const v = await db.select({ c: voitures.categorieVehicule }).from(voitures).where(eq(voitures.carId, inf.carId)).limit(1);
          if (v[0]?.c) cat = v[0].c;
        } catch {}
      }
      const unite = await db.select().from(unitesSecurite).where(and(eq(unitesSecurite.codeWilaya, code), eq(unitesSecurite.type, "gendarmerie" as any))).limit(1);
      await db.insert(infractionsConstatees).values({
        externalId: inf.id, carId: inf.carId, immatriculation: inf.immatriculation,
        conducteurNom: inf.conducteurNom, categorieVehicule: cat,
        infraction: inf.infraction, restriction: (inf as any).restriction || null,
        roadName: inf.roadName, troncon: inf.troncon,
        vitesse: inf.speed, vitesseLimite: inf.speedLimit === 9999 ? null : inf.speedLimit, exces: inf.excess,
        latitude: inf.lat, longitude: inf.lon, codeWilaya: code, wilaya: name,
        uniteId: unite[0]?.id ?? null, statut: "nouveau" as const, recordedAt: new Date(inf.recordedAt),
      } as any).onConflictDoNothing();
      inserted++;
    } catch (e: any) {
      errors++;
      if (!firstError) firstError = String(e?.message || e).slice(0, 200);
    }
  }
  if (errors && !inserted) throw new Error(`dispatch: ${errors} erreurs (ex: ${firstError})`);
  return { inserted };
}
