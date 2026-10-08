import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proprietaires } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthProprio } from "@/lib/auth-proprio";

function cors(r: NextResponse) {
  r.headers.set("Access-Control-Allow-Origin", "*");
  return r;
}

// GET /api/proprietaires/profil — ma fiche (auto-chargée par les formulaires)
export async function GET(req: NextRequest) {
  const auth = await getAuthProprio(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const rows = await db.select().from(proprietaires).where(eq(proprietaires.id, auth.proprietaire.id)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const p = rows[0];
  let age: number | null = null;
  if (p.dateNaissance) {
    const dn = new Date(p.dateNaissance as any), now = new Date();
    age = now.getFullYear() - dn.getFullYear();
    const m = now.getMonth() - dn.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dn.getDate())) age--;
  }
  return cors(NextResponse.json({
    proprietaire: {
      id: p.id, type: p.type, nom: p.nom, prenom: p.prenom, raisonSociale: p.raisonSociale,
      nin: p.nin, telephone: p.telephone, adresse: p.adresse, commune: p.commune,
      wilaya: p.wilaya, codeWilaya: p.codeWilaya, age,
    },
  }));
}

// PATCH /api/proprietaires/profil — modifie ma fiche
export async function PATCH(req: NextRequest) {
  const auth = await getAuthProprio(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  try {
    const b = await req.json();
    const patch: any = {};
    for (const k of ["nom", "prenom", "raisonSociale", "telephone", "adresse", "commune", "wilaya", "codeWilaya"]) {
      if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, k === "telephone" ? 32 : k === "raisonSociale" ? 200 : 100) || null;
    }
    if (b.age != null && Number.isFinite(Number(b.age))) {
      patch.dateNaissance = new Date(new Date().getFullYear() - Math.max(16, Math.min(100, Number(b.age))), 0, 1) as any;
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "rien à changer" }, { status: 400 });
    await db.update(proprietaires).set(patch).where(eq(proprietaires.id, auth.proprietaire.id));
    return cors(NextResponse.json({ ok: true }));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
