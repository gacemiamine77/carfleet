import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { unitesSecurite, infractionsConstatees } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { ensureUnitesSeed } from "@/lib/unites";

export const dynamic = "force-dynamic";

// GET /api/unites?codeWilaya=16&type=police → liste unités + compteurs
export async function GET(req: NextRequest) {
  await ensureUnitesSeed();
  const { searchParams } = new URL(req.url);
  const codeWilaya = searchParams.get("codeWilaya") || searchParams.get("wilaya") || "";
  const type = searchParams.get("type") || "";

  let rows = await db.select().from(unitesSecurite).orderBy(unitesSecurite.codeWilaya, unitesSecurite.type);
  if (codeWilaya) rows = rows.filter((r) => r.codeWilaya === codeWilaya.padStart(2, "0"));
  if (type) rows = rows.filter((r) => r.type === type);

  // compteurs par unité (via wilaya)
  const counts: Record<string, number> = {};
  try {
    const all = await db.select({ codeWilaya: infractionsConstatees.codeWilaya }).from(infractionsConstatees);
    for (const a of all) if (a.codeWilaya) counts[a.codeWilaya] = (counts[a.codeWilaya] || 0) + 1;
  } catch {}

  return NextResponse.json({
    unites: rows.map((u) => ({ ...u, nbInfractions: counts[u.codeWilaya] || 0 })),
    total: rows.length,
  }, { headers: { "Access-Control-Allow-Origin": "*" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
