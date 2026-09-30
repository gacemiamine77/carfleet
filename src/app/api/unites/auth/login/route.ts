import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comptesUnites, sessionsUnites, unitesSecurite } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, newToken } from "@/lib/auth-unites";

// POST /api/unites/auth/login {username, password} → {token, unite}
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) return NextResponse.json({ error: "username + password requis" }, { status: 400 });
    const rows = await db.select({ compte: comptesUnites, unite: unitesSecurite })
      .from(comptesUnites)
      .innerJoin(unitesSecurite, eq(comptesUnites.uniteId, unitesSecurite.id))
      .where(eq(comptesUnites.username, String(username))).limit(1);
    if (!rows.length || !rows[0].compte.actif || !verifyPassword(String(password), rows[0].compte.passwordHash)) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }
    const token = newToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 jours
    await db.insert(sessionsUnites).values({ token, compteId: rows[0].compte.id, expiresAt } as any).onConflictDoNothing();
    const u = rows[0].unite;
    const res = NextResponse.json({
      ok: true, token, expiresAt,
      unite: { id: u.id, code: u.code, nom: u.nom, type: u.type, moyen: (u as any).moyen, codeWilaya: u.codeWilaya, wilaya: u.wilaya, telephone: u.telephone },
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
