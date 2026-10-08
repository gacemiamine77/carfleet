import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { comptesProprietaires, proprietaires } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth-unites";
import { createSession } from "@/lib/auth-proprio";

// POST /api/proprietaires/auth/register
// { username, password, type: "physique"|"morale", nom?, prenom?, raisonSociale?, nin?, telephone, adresse?, commune?, wilaya?, codeWilaya? }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const { username, password } = b;
    if (!username || !password) return NextResponse.json({ error: "username + password requis" }, { status: 400 });
    if (String(password).length < 6) return NextResponse.json({ error: "6 caractères minimum" }, { status: 400 });
    if (!b.telephone) return NextResponse.json({ error: "telephone requis" }, { status: 400 });
    const ex = await db.select({ id: comptesProprietaires.id }).from(comptesProprietaires).where(eq(comptesProprietaires.username, String(username))).limit(1);
    if (ex.length) return NextResponse.json({ error: "Nom d'utilisateur déjà pris" }, { status: 409 });

    const type = b.type === "morale" ? "morale" : "physique";
    const nin = String(b.nin || `PROP-${Date.now()}`).slice(0, 20);
    // L'app dispositif envoie l'âge → converti en date de naissance (1er janvier)
    let dateNaissance: Date | null = null;
    if (b.dateNaissance) {
      const d = new Date(b.dateNaissance);
      if (!isNaN(d.getTime())) dateNaissance = d;
    } else if (b.age != null && Number.isFinite(Number(b.age))) {
      dateNaissance = new Date(new Date().getFullYear() - Math.max(16, Math.min(100, Number(b.age))), 0, 1);
    }
    const [prop] = await db.insert(proprietaires).values({
      nin, type: type as any,
      nom: b.nom?.slice(0, 100) || null, prenom: b.prenom?.slice(0, 100) || null,
      dateNaissance: dateNaissance as any,
      raisonSociale: b.raisonSociale?.slice(0, 200) || null,
      telephone: String(b.telephone).slice(0, 32),
      adresse: b.adresse?.slice(0, 500) || null, commune: b.commune?.slice(0, 100) || null,
      wilaya: b.wilaya?.slice(0, 100) || null, codeWilaya: b.codeWilaya?.slice(0, 4) || null,
    } as any).returning();
    const [compte] = await db.insert(comptesProprietaires).values({
      proprietaireId: prop.id, username: String(username).slice(0, 64), passwordHash: hashPassword(String(password)), actif: true,
    } as any).returning();
    const { token, expiresAt } = await createSession(compte.id);
    const res = NextResponse.json({
      ok: true, token, expiresAt,
      proprietaire: { id: prop.id, type: prop.type, nom: prop.nom, prenom: prop.prenom, raisonSociale: prop.raisonSociale },
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
