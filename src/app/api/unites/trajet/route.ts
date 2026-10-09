import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { footprints, voitures, infractionsConstatees } from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { getAuthUnite } from "@/lib/auth-unites";

export const dynamic = "force-dynamic";

// GET /api/unites/trajet?carId=XXX|infractionId=N&limit=2000
// → route empruntée (points GPS) du véhicule, pour l'affichage sur la carte des unités.
export async function GET(req: NextRequest) {
  // Operator (plateforme, sans token unité) : auth = null → accès lecture autorisé.
  await getAuthUnite(req);
  const q = new URL(req.url).searchParams;
  let carId = q.get("carId") || "";
  const infId = Number(q.get("infractionId") || 0);
  const limit = Math.min(5000, Math.max(10, Number(q.get("limit") || 2000)));
  try {
    if (!carId && infId) {
      const r = await db.select({ carId: infractionsConstatees.carId }).from(infractionsConstatees).where(eq(infractionsConstatees.id, infId)).limit(1);
      carId = r[0]?.carId || "";
    }
    if (!carId) return NextResponse.json({ error: "carId ou infractionId requis" }, { status: 400 });

    const v = await db.select().from(voitures).where(eq(voitures.carId, carId)).limit(1);
    if (!v.length) return NextResponse.json({ error: "Véhicule introuvable" }, { status: 404 });
    const voiture = v[0];

    const rows = await db.select({
      latitude: footprints.latitude,
      longitude: footprints.longitude,
      vitesse: footprints.vitesse,
      cap: footprints.cap,
      recordedAt: footprints.recordedAt,
    }).from(footprints)
      .where(eq(footprints.voitureId, voiture.id))
      .orderBy(desc(footprints.recordedAt))
      .limit(limit);
    const points = rows.reverse().map((p) => ({
      lat: p.latitude, lon: p.longitude, vitesse: p.vitesse, cap: p.cap,
      recordedAt: p.recordedAt,
    }));

    const res = NextResponse.json({
      ok: true,
      carId: voiture.carId,
      immatriculation: voiture.immatriculation,
      marque: voiture.marque, modele: voiture.modele, couleur: voiture.couleur,
      categorieVehicule: voiture.categorieVehicule,
      total: points.length,
      points,
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
