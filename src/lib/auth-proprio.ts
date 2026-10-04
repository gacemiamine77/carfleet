import { db } from "@/db";
import { comptesProprietaires, sessionsProprietaires, proprietaires } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newToken } from "./auth-unites";

export interface AuthProprio {
  compteId: number;
  username: string;
  proprietaire: { id: number; nin: string; type: string; nom: string | null; prenom: string | null; raisonSociale: string | null; wilaya: string | null };
}

export async function getAuthProprio(req: Request): Promise<AuthProprio | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const sess = await db.select().from(sessionsProprietaires).where(eq(sessionsProprietaires.token, token)).limit(1);
  if (!sess.length || new Date(sess[0].expiresAt) < new Date()) return null;
  const rows = await db.select({ compte: comptesProprietaires, proprio: proprietaires })
    .from(comptesProprietaires)
    .innerJoin(proprietaires, eq(comptesProprietaires.proprietaireId, proprietaires.id))
    .where(eq(comptesProprietaires.id, sess[0].compteId)).limit(1);
  if (!rows.length || !(rows[0].compte.actif)) return null;
  const { compte, proprio } = rows[0];
  return {
    compteId: compte.id, username: compte.username,
    proprietaire: { id: proprio.id, nin: proprio.nin, type: proprio.type, nom: proprio.nom, prenom: proprio.prenom, raisonSociale: proprio.raisonSociale, wilaya: proprio.wilaya },
  };
}

export async function createSession(compteId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db.insert(sessionsProprietaires).values({ token, compteId, expiresAt } as any).onConflictDoNothing();
  return { token, expiresAt };
}
