import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { unitesSecurite } from "@/db/schema";
import { eq } from "drizzle-orm";
import { WILAYAS } from "@/lib/algeriaData";
import { resolveWilayaForPosition } from "@/lib/unites";

export const maxDuration = 60;

const MOYENS_OK = ["barrage_fixe", "barrage_mobile", "motards", "vehicule_mobile", "poste_fixe"];
const TAG: Record<string, string> = { barrage_fixe: "FIXE", barrage_mobile: "MOB", motards: "MOTO", vehicule_mobile: "VEHI", poste_fixe: "POSTE" };

// POST /api/unites/upload — charge un GeoJSON de forces de sécurité (Points)
// Feature: { geometry: {type:"Point", coordinates:[lon,lat]}, properties: {code?, nom?, type?, moyen?, codeWilaya?, wilaya?, telephone?} }
export async function POST(req: NextRequest) {
  try {
    const gj = await req.json();
    if (!gj.features || !Array.isArray(gj.features)) {
      return NextResponse.json({ error: "GeoJSON invalide : features[] attendu" }, { status: 400 });
    }
    const pts = gj.features.filter((f: any) => f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates));
    if (!pts.length) {
      return NextResponse.json({ error: "Aucun Point trouvé (unités = Points [lon,lat])" }, { status: 400 });
    }
    let inserted = 0, updated = 0, skipped = 0;
    let auto = 0;
    for (const f of pts) {
      const [lon, lat] = f.geometry.coordinates.map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skipped++; continue; }
      if (lat < 18 || lat > 38 || lon < -10 || lon > 13) { skipped++; continue; }
      const p = (f.properties || {}) as any;
      const type = p.type === "gendarmerie" ? "gendarmerie" : "police";
      const moyen = MOYENS_OK.includes(p.moyen) ? p.moyen : "poste_fixe";
      const res = resolveWilayaForPosition(lat, lon);
      const codeWilaya = String(p.codeWilaya || p.code_wilaya || res.code).padStart(2, "0");
      const wil = WILAYAS.find((w) => w.code === codeWilaya);
      const wilaya = p.wilaya || wil?.name || res.name;
      const prefix = type === "police" ? "POL" : "GND";
      const code = String(p.code || `${prefix}-${TAG[moyen]}-${codeWilaya}-U${++auto}`).slice(0, 20);
      const nom = String(p.nom || p.name || `${moyen} — ${type} — ${wilaya}`).slice(0, 200);
      const row: any = {
        code, nom, type, codeWilaya, wilaya, moyen,
        mobile: p.mobile ?? (moyen !== "barrage_fixe" && moyen !== "poste_fixe"),
        latitude: lat, longitude: lon,
        telephone: p.telephone ? String(p.telephone).slice(0, 32) : null,
        actif: true,
      };
      try {
        const ex = await db.select({ id: unitesSecurite.id }).from(unitesSecurite).where(eq(unitesSecurite.code, code)).limit(1);
        if (ex.length) {
          await db.update(unitesSecurite).set(row).where(eq(unitesSecurite.id, ex[0].id));
          updated++;
        } else {
          await db.insert(unitesSecurite).values(row).onConflictDoNothing();
          inserted++;
        }
      } catch { skipped++; }
    }
    return NextResponse.json({ ok: true, received: pts.length, inserted, updated, skipped });
  } catch {
    return NextResponse.json({ error: "GeoJSON illisible" }, { status: 400 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
