import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { voitures, conducteurs, affectations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthProprio } from "@/lib/auth-proprio";

// POST /api/proprietaires/chauffeurs {voitureId, nom, prenom, telephone, numeroPermis?, commune?, wilaya?}
// Crée le conducteur et le désigne chauffeur du véhicule (désactive le précédent).
export async function POST(req: NextRequest) {
  const auth = await getAuthProprio(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.voitureId || !b.nom || !b.prenom || !b.telephone) {
      return NextResponse.json({ error: "voitureId, nom, prenom, telephone requis" }, { status: 400 });
    }
    const v = await db.select().from(voitures).where(eq(voitures.id, Number(b.voitureId))).limit(1);
    if (!v.length || v[0].proprietaireId !== auth.proprietaire.id) {
      return NextResponse.json({ error: "Véhicule introuvable" }, { status: 404 });
    }
    const nin = `CH-${Date.now()}`.slice(0, 20);
    const [cond] = await db.insert(conducteurs).values({
      nin, nom: String(b.nom).slice(0, 100), prenom: String(b.prenom).slice(0, 100),
      telephone: String(b.telephone).slice(0, 32),
      numeroPermis: b.numeroPermis?.slice(0, 30) || null,
      commune: b.commune?.slice(0, 100) || null, wilaya: b.wilaya?.slice(0, 100) || null,
    } as any).returning();
    await db.update(affectations).set({ actif: false as any, finAt: new Date() } as any)
      .where(and(eq(affectations.voitureId, v[0].id), eq(affectations.actif, true as any)));
    const [aff] = await db.insert(affectations).values({
      voitureId: v[0].id, conducteurId: cond.id, actif: true,
    } as any).returning();
    const res = NextResponse.json({
      ok: true, chauffeur: { id: cond.id, nom: cond.nom, prenom: cond.prenom }, affectationId: aff.id,
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
