import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notificationsUnites } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getAuthUnite } from "@/lib/auth-unites";

export const dynamic = "force-dynamic";

// GET /api/unites/notifications?limit=50 → notifications de l'unité connectée + non-lues.
export async function GET(req: NextRequest) {
  const auth = await getAuthUnite(req);
  if (!auth) return NextResponse.json({ error: "Connexion unité requise" }, { status: 401 });
  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get("limit") || 50)));
  try {
    const rows = await db.select().from(notificationsUnites)
      .where(eq(notificationsUnites.uniteId, auth.unite.id))
      .orderBy(desc(notificationsUnites.createdAt)).limit(limit);
    const res = NextResponse.json({
      ok: true,
      notifications: rows.map((n) => ({
        id: n.id, type: n.type, titre: n.titre, corps: n.corps,
        infractionId: n.infractionId, uniteSourceId: n.uniteSourceId,
        lu: !!n.lu, createdAt: n.createdAt,
      })),
      nonLues: rows.filter((n) => !n.lu).length,
    });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// PATCH /api/unites/notifications {id?|all, lu} → marque lue(s).
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUnite(req);
  if (!auth) return NextResponse.json({ error: "Connexion unité requise" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id || 0);
  try {
    if (id) {
      await db.update(notificationsUnites).set({ lu: true })
        .where(and(eq(notificationsUnites.id, id), eq(notificationsUnites.uniteId, auth.unite.id)));
    } else {
      await db.update(notificationsUnites).set({ lu: true }).where(eq(notificationsUnites.uniteId, auth.unite.id));
    }
    const res = NextResponse.json({ ok: true });
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}