import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { voitures, conducteurs, affectations } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
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
    // Règle : un seul chauffeur par dispositif (même remplacé, l'historique reste)
    const deja = await db.select({ id: affectations.id }).from(affectations).where(eq(affectations.voitureId, v[0].id)).limit(1);
    if (deja.length) {
      return NextResponse.json({ error: "Un seul chauffeur par dispositif (déjà désigné)" }, { status: 409 });
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
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}

// PATCH /api/proprietaires/chauffeurs {nom?, prenom?, telephone?, numeroPermis?, commune?, wilaya?}
// Modifie le chauffeur désigné (le seul autorisé) sans en créer un nouveau.
export async function PATCH(req: NextRequest) {
  const auth = await getAuthProprio(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const b = await req.json();
    const vs = await db.select().from(voitures).where(eq(voitures.proprietaireId, auth.proprietaire.id)).limit(1);
    if (!vs.length) return NextResponse.json({ error: "Aucun véhicule" }, { status: 404 });
    const aff = await db.select().from(affectations)
      .where(and(eq(affectations.voitureId, vs[0].id), eq(affectations.actif, true as any)))
      .orderBy(desc(affectations.id)).limit(1);
    if (!aff.length) return NextResponse.json({ error: "Aucun chauffeur désigné" }, { status: 404 });
    const patch: any = {};
    for (const k of ["nom", "prenom"]) {
      if (b[k] !== undefined) {
        if (!String(b[k]).trim()) return NextResponse.json({ error: k + " requis" }, { status: 400 });
        patch[k] = String(b[k]).slice(0, 100);
      }
    }
    if (b.telephone !== undefined) {
      if (!String(b.telephone).trim()) return NextResponse.json({ error: "telephone requis" }, { status: 400 });
      patch.telephone = String(b.telephone).slice(0, 32);
    }
    for (const k of ["numeroPermis"]) {
      if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 30) || null;
    }
    for (const k of ["commune", "wilaya"]) {
      if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 100) || null;
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "rien à changer" }, { status: 400 });
    await db.update(conducteurs).set(patch).where(eq(conducteurs.id, aff[0].conducteurId));
    const res = NextResponse.json({ ok: true });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
