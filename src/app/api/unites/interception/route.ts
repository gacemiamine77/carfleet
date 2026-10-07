import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleCurrentPosition, voitures, unitesSecurite, infractionsConstatees } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthUnite } from "@/lib/auth-unites";
import { resolveWilayaForPosition } from "@/lib/unites";
import { getSimulation } from "@/lib/simulationManager";

export const dynamic = "force-dynamic";

function havKm(a: number, b: number, c: number, d: number): number {
  const R = 6371, t = Math.PI / 180;
  const s1 = Math.sin(((c - a) * t) / 2), s2 = Math.sin(((d - b) * t) / 2);
  const h = s1 * s1 + Math.cos(a * t) * Math.cos(c * t) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Projection +5 min le long des routePoints (sim), sinon balistique cap/vitesse
function predire(lat: number, lon: number, cap: number, vitesseKmh: number, route?: Array<{ lat: number; lon: number }>): { lat: number; lon: number; methode: string } {
  const aheadKm = Math.max(0.5, (vitesseKmh || 40) * (5 / 60));
  if (route && route.length >= 2) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = havKm(lat, lon, route[i].lat, route[i].lon);
      if (d < bd) { bd = d; best = i; }
    }
    let rest = aheadKm;
    for (let i = best; i < route.length - 1 && rest > 0; i++) {
      const seg = havKm(route[i].lat, route[i].lon, route[i + 1].lat, route[i + 1].lon);
      if (seg <= rest) { rest -= seg; continue; }
      const f = seg > 0 ? rest / seg : 0;
      return { lat: route[i].lat + (route[i + 1].lat - route[i].lat) * f, lon: route[i].lon + (route[i + 1].lon - route[i].lon) * f, methode: "route" };
    }
    const last = route[route.length - 1];
    return { lat: last.lat, lon: last.lon, methode: "arrivee" };
  }
  const t = Math.PI / 180, distDeg = aheadKm / 111;
  return {
    lat: lat + Math.cos(cap * t) * distDeg,
    lon: lon + Math.sin(cap * t) * distDeg / Math.max(0.5, Math.cos(lat * t)),
    methode: "cap",
  };
}

// GET /api/unites/interception?carId=XXX|infractionId=N
// → position live, point prédit +5 min, unités MOBILES de la wilaya triées par ETA.
export async function GET(req: NextRequest) {
  const auth = await getAuthUnite(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const carId = q.get("carId") || "";
  const infId = Number(q.get("infractionId") || 0);
  try {
    let live: any = null;
    if (carId) {
      const rows = await db.select({ pos: vehicleCurrentPosition, v: voitures })
        .from(vehicleCurrentPosition).innerJoin(voitures, eq(vehicleCurrentPosition.voitureId, voitures.id))
        .where(eq(vehicleCurrentPosition.carId, carId)).limit(1);
      if (rows.length) live = { ...rows[0].pos, immatriculation: rows[0].v.immatriculation, marque: rows[0].v.marque, modele: rows[0].v.modele };
    }
    if (!live && infId) {
      const rows = await db.select().from(infractionsConstatees).where(eq(infractionsConstatees.id, infId)).limit(1);
      if (rows.length) {
        const r = rows[0];
        live = { latitude: r.latitude, longitude: r.longitude, vitesse: r.vitesse, cap: 0, carId: r.carId, immatriculation: r.immatriculation, recordedAt: r.recordedAt };
      }
    }
    // Voitures simu : la mémoire sim est plus fraîche que toute base → écrase le statique
    let simRoute: Array<{ lat: number; lon: number }> | undefined;
    try {
      const sim = getSimulation();
      const car = live?.carId ? sim?.cars.find((c: any) => c.voiture.carId === live.carId) : undefined;
      if (car) {
        live = {
          latitude: car.lat, longitude: car.lon, vitesse: car.speed, cap: car.heading,
          carId: car.voiture.carId, immatriculation: car.voiture.immatriculation,
          marque: car.voiture.marque, modele: car.voiture.modele, recordedAt: new Date().toISOString(),
        };
        if (car.routePoints?.length >= 2) simRoute = car.routePoints;
      }
    } catch {}
    if (!live) return NextResponse.json({ error: "Véhicule introuvable" }, { status: 404 });
    const { code, name } = resolveWilayaForPosition(Number(live.latitude), Number(live.longitude));
    if (code !== auth.unite.codeWilaya) {
      return NextResponse.json({ error: "Hors de votre territoire", wilaya: name, codeWilaya: code }, { status: 403 });
    }
    const pred = predire(Number(live.latitude), Number(live.longitude), Number(live.cap) || 0, Number(live.vitesse) || 40, simRoute);
    const units = await db.select().from(unitesSecurite)
      .where(and(eq(unitesSecurite.codeWilaya, code), eq(unitesSecurite.mobile, true as any)));
    const VITESSE_INTERVENTION = 50; // km/h moyens en intervention
    const sorted = units.map((u: any) => {
      const distKm = u.latitude != null ? havKm(pred.lat, pred.lon, u.latitude, u.longitude) : 9999;
      return {
        id: u.id, code: u.code, nom: u.nom, type: u.type, moyen: u.moyen,
        latitude: u.latitude, longitude: u.longitude, telephone: u.telephone,
        distKm: Math.round(distKm * 10) / 10,
        etaMin: Math.round((distKm / VITESSE_INTERVENTION) * 60),
      };
    }).sort((a, b) => a.distKm - b.distKm).slice(0, 5);
    const res = NextResponse.json({
      cible: {
        carId: live.carId, immatriculation: live.immatriculation,
        latitude: Number(live.latitude), longitude: Number(live.longitude),
        vitesse: Number(live.vitesse) || 0, recordedAt: live.recordedAt,
      },
      prediction: { ...pred, horizonMin: 5 },
      wilaya: name, codeWilaya: code,
      unites: sorted,
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// PATCH /api/unites/interception {infractionId, uniteId} — assigne l'interception (statut notifie)
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUnite(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const { infractionId, uniteId } = await req.json();
    if (!infractionId || !uniteId) return NextResponse.json({ error: "infractionId + uniteId requis" }, { status: 400 });
    const u = await db.select().from(unitesSecurite).where(eq(unitesSecurite.id, Number(uniteId))).limit(1);
    if (!u.length || u[0].codeWilaya !== auth.unite.codeWilaya) {
      return NextResponse.json({ error: "Unité hors territoire" }, { status: 403 });
    }
    const r = await db.select().from(infractionsConstatees).where(eq(infractionsConstatees.id, Number(infractionId))).limit(1);
    if (!r.length || r[0].codeWilaya !== auth.unite.codeWilaya) {
      return NextResponse.json({ error: "Infraction hors territoire" }, { status: 403 });
    }
    await db.update(infractionsConstatees).set({ assigneUniteId: u[0].id, statut: "notifie" as any })
      .where(eq(infractionsConstatees.id, Number(infractionId)));
    const res = NextResponse.json({ ok: true, infractionId, unite: { code: u[0].code, nom: u[0].nom, telephone: u[0].telephone } });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
