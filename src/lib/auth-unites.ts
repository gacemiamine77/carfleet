import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { comptesUnites, sessionsUnites, unitesSecurite } from "@/db/schema";
import { eq } from "drizzle-orm";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const h = scryptSync(pw, salt, 64);
    const ref = Buffer.from(hash, "hex");
    return h.length === ref.length && timingSafeEqual(h, ref);
  } catch { return false; }
}

export function newToken(): string {
  return randomBytes(48).toString("hex");
}

export interface AuthUnite {
  compteId: number;
  username: string;
  unite: { id: number; code: string; nom: string; type: string; moyen: string; codeWilaya: string; wilaya: string };
}

// Résout le compte depuis "Authorization: Bearer <token>" (null si absent/invalide/expiré)
export async function getAuthUnite(req: Request): Promise<AuthUnite | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return null;
  const sess = await db.select().from(sessionsUnites).where(eq(sessionsUnites.token, token)).limit(1);
  if (!sess.length || new Date(sess[0].expiresAt) < new Date()) return null;
  const rows = await db.select({ compte: comptesUnites, unite: unitesSecurite })
    .from(comptesUnites)
    .innerJoin(unitesSecurite, eq(comptesUnites.uniteId, unitesSecurite.id))
    .where(eq(comptesUnites.id, sess[0].compteId)).limit(1);
  if (!rows.length || !(rows[0].compte.actif)) return null;
  const { compte, unite } = rows[0];
  return {
    compteId: compte.id, username: compte.username,
    unite: { id: unite.id, code: unite.code, nom: unite.nom, type: unite.type, moyen: (unite as any).moyen || "poste_fixe", codeWilaya: unite.codeWilaya, wilaya: unite.wilaya },
  };
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}
