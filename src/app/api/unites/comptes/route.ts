import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comptesUnites, sessionsUnites, unitesSecurite } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth-unites";

// GET /api/unites/comptes → tous les comptes avec leur unité
export async function GET() {
  try {
    const rows = await db.select({ compte: comptesUnites, unite: unitesSecurite })
      .from(comptesUnites)
      .innerJoin(unitesSecurite, eq(comptesUnites.uniteId, unitesSecurite.id))
      .orderBy(comptesUnites.id);
    return NextResponse.json({
      comptes: rows.map((r) => ({
        id: r.compte.id, username: r.compte.username, actif: r.compte.actif, createdAt: r.compte.createdAt,
        unite: { id: r.unite.id, code: r.unite.code, nom: r.unite.nom, type: r.unite.type, moyen: (r.unite as any).moyen, codeWilaya: r.unite.codeWilaya, wilaya: r.unite.wilaya },
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// PATCH /api/unites/comptes {id, actif?, password?} → activer/désactiver / réinitialiser le mot de passe
export async function PATCH(req: NextRequest) {
  try {
    const { id, actif, password } = await req.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    const patch: any = {};
    if (typeof actif === "boolean") patch.actif = actif;
    if (password) {
      if (String(password).length < 6) return NextResponse.json({ error: "6 caractères minimum" }, { status: 400 });
      patch.passwordHash = hashPassword(String(password));
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "rien à changer" }, { status: 400 });
    await db.update(comptesUnites).set(patch).where(eq(comptesUnites.id, Number(id)));
    if (typeof actif === "boolean" && !actif) {
      // Déconnecte les sessions existantes
      await db.delete(sessionsUnites).where(eq(sessionsUnites.compteId, Number(id)));
    }
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// DELETE /api/unites/comptes?id= → supprime le compte (+ sessions)
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await db.delete(sessionsUnites).where(eq(sessionsUnites.compteId, Number(id)));
    await db.delete(comptesUnites).where(eq(comptesUnites.id, Number(id)));
    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
