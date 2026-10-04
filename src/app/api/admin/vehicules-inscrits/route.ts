import { NextResponse } from "next/server";
import { db } from "@/db";
import { voitures, proprietaires, conducteurs, affectations, comptesProprietaires } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/admin/vehicules-inscrits — tous les véhicules du registre
// (propriétaires INSCRITS avec compte + chauffeur désigné). Pour l'onglet plateforme.
export async function GET() {
  try {
    const rows = await db.select({ voiture: voitures, proprio: proprietaires })
      .from(voitures)
      .innerJoin(proprietaires, eq(voitures.proprietaireId, proprietaires.id))
      .innerJoin(comptesProprietaires, eq(comptesProprietaires.proprietaireId, proprietaires.id))
      .orderBy(desc(voitures.id));
    const out: any[] = [];
    for (const { voiture: v, proprio: p } of rows) {
      const aff = await db.select({ cond: conducteurs }).from(affectations)
        .innerJoin(conducteurs, eq(affectations.conducteurId, conducteurs.id))
        .where(and(eq(affectations.voitureId, v.id), eq(affectations.actif, true as any)))
        .orderBy(desc(affectations.id)).limit(1);
      out.push({
        id: v.id, carId: v.carId, immatriculation: v.immatriculation,
        marque: v.marque, modele: v.modele, couleur: v.couleur,
        categorieVehicule: (v as any).categorieVehicule,
        proprietaire: p.type === "physique" ? `${p.prenom || ""} ${p.nom || ""}`.trim() : (p.raisonSociale || ""),
        proprietaireTel: p.telephone, wilaya: p.wilaya, codeWilaya: p.codeWilaya,
        chauffeur: aff[0] ? `${aff[0].cond.prenom} ${aff[0].cond.nom}` : null,
        chauffeurTel: aff[0]?.cond.telephone || null,
      });
    }
    return NextResponse.json({ vehicules: out, total: out.length });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
