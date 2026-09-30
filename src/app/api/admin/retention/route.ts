import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

// POST /api/admin/retention { days?: number (défaut 30), dryRun?: boolean, batch?: number }
// Purge le brut footprints au-delà de la rétention (par lots, utilise l'index BRIN).
// Sur Neon, préférer le job pg_cron (drizzle/retention-neon.sql) ; cette route sert
// pour le local/dev ou un cron externe (cron-job.org → POST).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(3650, Number(body.days ?? 30)));
    const batch = Math.max(100, Math.min(50000, Number(body.batch ?? 5000)));
    const dryRun = !!body.dryRun;
    const cutoff = new Date(Date.now() - days * 86400 * 1000);

    if (dryRun) {
      const r = await db.execute(sql`SELECT count(*)::int AS n FROM footprints WHERE recorded_at < ${cutoff}`);
      const n = (r as any).rows?.[0]?.n ?? (r as any)[0]?.n ?? 0;
      return NextResponse.json({ ok: true, dryRun: true, days, olderThan: cutoff, count: Number(n) });
    }

    let deleted = 0;
    for (let i = 0; i < 200; i++) {
      const r = await db.execute(sql`
        DELETE FROM footprints WHERE id IN (
          SELECT id FROM footprints WHERE recorded_at < ${cutoff} ORDER BY recorded_at LIMIT ${batch}
        )`);
      const n = Number((r as any).rowCount ?? 0);
      deleted += n;
      if (n < batch) break;
    }
    try {
      await db.execute(sql`VACUUM ANALYZE footprints`);
    } catch {}
    return NextResponse.json({ ok: true, days, olderThan: cutoff, deleted });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
