import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comptesProprietaires, proprietaires, voitures } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth-unites";
import { createSession } from "@/lib/auth-proprio";

// POST /api/proprietaires/auth/login {username, password}
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) return NextResponse.json({ error: "username + password requis" }, { status: 400 });
    const rows = await db.select({ compte: comptesProprietaires, proprio: proprietaires })
      .from(comptesProprietaires)
      .innerJoin(proprietaires, eq(comptesProprietaires.proprietaireId, proprietaires.id))
      .where(eq(comptesProprietaires.username, String(username))).limit(1);
    if (!rows.length || !rows[0].compte.actif || !verifyPassword(String(password), rows[0].compte.passwordHash)) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }
    const { token, expiresAt } = await createSession(rows[0].compte.id);
    const nb = await db.select({ n: sql<number>`count(*)` }).from(voitures).where(eq(voitures.proprietaireId, rows[0].proprio.id));
    const p = rows[0].proprio;
    let age: number | null = null;
    if (p.dateNaissance) {
      const dn = new Date(p.dateNaissance as any), now = new Date();
      age = now.getFullYear() - dn.getFullYear();
      const m = now.getMonth() - dn.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dn.getDate())) age--;
    }
    const res = NextResponse.json({
      ok: true, token, expiresAt,
      proprietaire: { id: p.id, type: p.type, nom: p.nom, prenom: p.prenom, raisonSociale: p.raisonSociale, wilaya: p.wilaya, telephone: p.telephone, age, nbVehicules: Number(nb[0]?.n || 0) },
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
