import { db } from "@/db";
import { notificationsUnites } from "@/db/schema";

/** Crée une notification pour une unité (cloche in-app / SMS-ready). */
export async function notifierUnite(
  uniteId: number,
  opts: {
    type?: string;
    titre: string;
    corps?: string;
    infractionId?: number | null;
    uniteSourceId?: number | null;
  },
) {
  try {
    await db.insert(notificationsUnites).values({
      uniteId,
      type: opts.type || "info",
      titre: opts.titre,
      corps: opts.corps || null,
      infractionId: opts.infractionId ?? null,
      uniteSourceId: opts.uniteSourceId ?? null,
    });
  } catch {}
}