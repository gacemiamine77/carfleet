import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { infractionsConstatees } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getAuthUnite } from "@/lib/auth-unites";

export const dynamic = "force-dynamic";

// GET /api/unites/interceptions?statut=all|notifie|en_cours|terminee|abandonnee
// → interceptions liées à l'unité connectée (assigneUniteId = moi).
// Sans compte unité (opérateur plateforme) : toutes les interceptions (toutes wilayas).
export async function GET(req: NextRequest) {
  const auth = await getAuthUnite(req);
  const q = new URL(req.url).searchParams;
  const statutF = q.get("statut") || "all";
  try {
    const base = [];
    const where = auth ? eq(infractionsConstatees.assigneUniteId, auth.unite.id) : undefined;
    if (statutF !== "all" && ["notifie", "en_cours", "terminee", "abandonnee"].includes(statutF)) {
      base.push(eq(infractionsConstatees.statut, statutF as any));
    }
    const cond = where ? and(where, ...base as any) : (base.length ? and(...base as any) : undefined);
    const rows = cond
      ? await db.select().from(infractionsConstatees).where(cond).orderBy(desc(infractionsConstatees.recordedAt)).limit(200)
      : await db.select().from(infractionsConstatees).orderBy(desc(infractionsConstatees.recordedAt)).limit(200);
    const res = NextResponse.json({
      ok: true,
      interceptions: rows.map((r) => ({
        id: r.id, carId: r.carId, immatriculation: r.immatriculation,
        infraction: r.infraction, vitesse: r.vitesse, vitesseLimite: r.vitesseLimite,
        latitude: r.latitude, longitude: r.longitude,
        pourWilaya: `${r.codeWilaya} - ${r.wilaya}`,
        statut: r.statut, assigneUniteId: r.assigneUniteId, accepteUniteId: r.accepteUniteId,
        notifieAt: r.notifieAt, accepteAt: r.accepteAt, clotureAt: r.clotureAt,
        resultat: r.resultat, compteRendu: r.compteRendu,
        recordedAt: r.recordedAt,
      })),
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    const res = NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}