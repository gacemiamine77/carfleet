import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { voitures, conducteurs, affectations } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthProprio } from "@/lib/auth-proprio";

async function myCars(proprioId: number) {
  const rows = await db.select({ voiture: voitures }).from(voitures)
    .where(eq(voitures.proprietaireId, proprioId)).orderBy(desc(voitures.id));
  const out: any[] = [];
  for (const { voiture: v } of rows) {
    const aff = await db.select({ aff: affectations, cond: conducteurs }).from(affectations)
      .innerJoin(conducteurs, eq(affectations.conducteurId, conducteurs.id))
      .where(and(eq(affectations.voitureId, v.id), eq(affectations.actif, true as any)))
      .orderBy(desc(affectations.id)).limit(1);
    out.push({
      id: v.id, carId: v.carId, immatriculation: v.immatriculation, marque: v.marque, modele: v.modele,
      couleur: v.couleur, annee: v.annee, categorieVehicule: (v as any).categorieVehicule,
      hauteur: (v as any).hauteur, largeur: (v as any).largeur, poids: (v as any).poids,
      chauffeur: aff[0] ? {
        id: aff[0].cond.id, nom: aff[0].cond.nom, prenom: aff[0].cond.prenom,
        telephone: aff[0].cond.telephone, numeroPermis: aff[0].cond.numeroPermis, depuis: aff[0].aff.debutAt,
      } : null,
    });
  }
  return out;
}

// GET /api/proprietaires/vehicules (mes véhicules + chauffeur désigné)
export async function GET(req: NextRequest) {
  const auth = await getAuthProprio(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const res = NextResponse.json({ vehicules: await myCars(auth.proprietaire.id) });
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

// POST /api/proprietaires/vehicules {immatriculation, marque?, modele?, ...} (ajouter un véhicule)
export async function POST(req: NextRequest) {
  const auth = await getAuthProprio(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.immatriculation) return NextResponse.json({ error: "immatriculation requise" }, { status: 400 });
    const ex = await db.select({ id: voitures.id }).from(voitures).where(eq(voitures.immatriculation, String(b.immatriculation))).limit(1);
    if (ex.length) return NextResponse.json({ error: "Immatriculation déjà enregistrée" }, { status: 409 });
    const count = await db.select().from(voitures).where(eq(voitures.proprietaireId, auth.proprietaire.id));
    const [v] = await db.insert(voitures).values({
      carId: `PROP-${auth.proprietaire.id}-${count.length + 1}-${Date.now().toString(36).toUpperCase()}`.slice(0, 64),
      proprietaireId: auth.proprietaire.id,
      immatriculation: String(b.immatriculation).slice(0, 20),
      marque: b.marque?.slice(0, 50) || null, modele: b.modele?.slice(0, 50) || null,
      couleur: b.couleur?.slice(0, 30) || null, annee: b.annee ? Number(b.annee) : null,
      categorieVehicule: b.categorieVehicule || "leger",
      hauteur: b.hauteur ? Number(b.hauteur) : null, largeur: b.largeur ? Number(b.largeur) : null,
      poids: b.poids ? Number(b.poids) : null, convoiSpecial: !!b.convoiSpecial,
    } as any).returning();
    const res = NextResponse.json({ ok: true, vehicule: { id: v.id, carId: v.carId, immatriculation: v.immatriculation } });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
