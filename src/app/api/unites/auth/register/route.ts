import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comptesUnites, unitesSecurite } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth-unites";

// POST /api/unites/auth/register {username, password, uniteCode|uniteId} — crée le compte d'une unité
export async function POST(req: NextRequest) {
  try {
    const { username, password, uniteCode, uniteId } = await req.json();
    if (!username || !password || (!uniteCode && !uniteId)) {
      return NextResponse.json({ error: "username, password + uniteCode (ou uniteId) requis" }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: "Mot de passe : 6 caractères minimum" }, { status: 400 });
    }
    const u = uniteId
      ? (await db.select().from(unitesSecurite).where(eq(unitesSecurite.id, Number(uniteId))).limit(1))[0]
      : (await db.select().from(unitesSecurite).where(eq(unitesSecurite.code, String(uniteCode))).limit(1))[0];
    if (!u) return NextResponse.json({ error: "Unité introuvable" }, { status: 404 });
    const ex = await db.select({ id: comptesUnites.id }).from(comptesUnites).where(eq(comptesUnites.username, String(username))).limit(1);
    if (ex.length) return NextResponse.json({ error: "Nom d'utilisateur déjà pris" }, { status: 409 });
    const [row] = await db.insert(comptesUnites).values({ uniteId: u.id, username: String(username).slice(0, 64), passwordHash: hashPassword(String(password)), actif: true } as any).returning();
    const res = NextResponse.json({ ok: true, id: row.id, username: row.username, unite: { code: u.code, nom: u.nom, codeWilaya: u.codeWilaya } });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
