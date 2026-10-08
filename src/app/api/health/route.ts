import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, metrics: getMetrics() });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
