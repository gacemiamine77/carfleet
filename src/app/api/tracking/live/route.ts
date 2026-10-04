import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleCurrentPosition, voitures } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/tracking/live?carId=XXX — dernières positions (1 ligne/véhicule).
// C'est CET endpoint que lisent la carte opérateur et les apps, jamais footprints en direct.
export async function GET(req: NextRequest) {
  const carId = new URL(req.url).searchParams.get("carId");
  try {
    const base = db.select({
      carId: vehicleCurrentPosition.carId,
      immatriculation: voitures.immatriculation,
      marque: voitures.marque,
      modele: voitures.modele,
      categorieVehicule: voitures.categorieVehicule,
      mapColor: voitures.mapColor,
      latitude: vehicleCurrentPosition.latitude,
      longitude: vehicleCurrentPosition.longitude,
      vitesse: vehicleCurrentPosition.vitesse,
      cap: vehicleCurrentPosition.cap,
      carburant: vehicleCurrentPosition.carburant,
      recordedAt: vehicleCurrentPosition.recordedAt,
      updatedAt: vehicleCurrentPosition.updatedAt,
    })
      .from(vehicleCurrentPosition)
      .innerJoin(voitures, eq(vehicleCurrentPosition.voitureId, voitures.id))
      .orderBy(desc(vehicleCurrentPosition.updatedAt));
    const rows = carId
      ? await base.where(eq(vehicleCurrentPosition.carId, carId))
      : await base;
    const res = NextResponse.json({ positions: rows, total: rows.length });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    const resErr = NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
    resErr.headers.set("Access-Control-Allow-Origin", "*");
    return resErr;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
