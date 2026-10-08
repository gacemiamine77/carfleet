import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comptesProprietaires, sessionsProprietaires, proprietaires, voitures } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/admin/comptes-proprietaires — comptes + proprio + nb véhicules
export async function GET() {
  try {
    const rows = await db.select({ compte: comptesProprietaires, proprio: proprietaires })
      .from(comptesProprietaires)
      .innerJoin(proprietaires, eq(comptesProprietaires.proprietaireId, proprietaires.id))
      .orderBy(comptesProprietaires.id);
    const out: any[] = [];
    for (const r of rows) {
      const n = await db.select({ n: sql<number>`count(*)` }).from(voitures).where(eq(voitures.proprietaireId, r.proprio.id));
      out.push({
        id: r.compte.id, username: r.compte.username, actif: r.compte.actif, createdAt: r.compte.createdAt,
        proprietaire: {
          id: r.proprio.id,
          nom: r.proprio.type === "physique" ? `${r.proprio.prenom || ""} ${r.proprio.nom || ""}`.trim() : (r.proprio.raisonSociale || ""),
          telephone: r.proprio.telephone, wilaya: r.proprio.wilaya,
        },
        nbVehicules: Number(n[0]?.n || 0),
      });
    }
    return NextResponse.json({ comptes: out });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// PATCH {id, actif} — bloquer / réactiver (coupe aussi les sessions)
export async function PATCH(req: NextRequest) {
  try {
    const { id, actif } = await req.json();
    if (!id || typeof actif !== "boolean") return NextResponse.json({ error: "id + actif requis" }, { status: 400 });
    await db.update(comptesProprietaires).set({ actif }).where(eq(comptesProprietaires.id, Number(id)));
    if (!actif) await db.delete(sessionsProprietaires).where(eq(sessionsProprietaires.compteId, Number(id)));
    return NextResponse.json({ ok: true, id, actif });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// DELETE?id= — supprime le COMPTE d'accès uniquement (données propriétaire/véhicules conservées)
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await db.delete(sessionsProprietaires).where(eq(sessionsProprietaires.compteId, Number(id)));
    await db.delete(comptesProprietaires).where(eq(comptesProprietaires.id, Number(id)));
    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
