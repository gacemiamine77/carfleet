import { NextRequest, NextResponse } from "next/server";
import { getAuthUnite } from "@/lib/auth-unites";

export const dynamic = "force-dynamic";

// GET /api/unites/auth/me (Authorization: Bearer <token>) → compte + unité
export async function GET(req: NextRequest) {
  const auth = await getAuthUnite(req);
  if (!auth) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const res = NextResponse.json({ ok: true, username: auth.username, unite: auth.unite });
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
