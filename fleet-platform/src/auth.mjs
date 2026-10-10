import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { query } from "./db.mjs";

export function sessionDays() {
  const days = Number(process.env.FLEET_SESSION_DAYS || 30);
  return Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 30;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  try {
    const candidate = scryptSync(String(password), salt, 64);
    const reference = Buffer.from(hash, "hex");
    return candidate.length === reference.length && timingSafeEqual(candidate, reference);
  } catch {
    return false;
  }
}

export function bearerToken(header) {
  const value = String(header || "");
  if (!value.startsWith("Bearer ")) return "";
  return value.slice(7).trim();
}

export function newSessionToken() {
  return randomBytes(48).toString("hex");
}

export async function createSession(accountId) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + sessionDays() * 24 * 3600 * 1000);
  await query(`INSERT INTO fleet_owner_sessions(token, account_id, expires_at) VALUES($1, $2, $3)`, [token, accountId, expiresAt]);
  return { token, expiresAt };
}

export async function requireOwner(req) {
  const token = bearerToken(req.headers.authorization);
  if (!token) return null;
  const { rows } = await query(
    `SELECT a.id AS account_id, a.username, a.role, a.actif,
            o.id AS owner_id, o.type, o.nom, o.prenom, o.raison_sociale, o.nin, o.telephone, o.wilaya,
            o.statut_compte, o.limite_vehicules, o.email
       FROM fleet_owner_sessions s
       JOIN fleet_owner_accounts a ON a.id = s.account_id
       JOIN fleet_owners o ON o.id = a.owner_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  if (!rows.length || !rows[0].actif) return null;
  const row = rows[0];
  return {
    accountId: row.account_id,
    username: row.username,
    role: row.role,
    owner: {
      id: row.owner_id,
      type: row.type,
      nom: row.nom,
      prenom: row.prenom,
      raisonSociale: row.raison_sociale,
      nin: row.nin,
      telephone: row.telephone,
      wilaya: row.wilaya,
      statutCompte: row.statut_compte,
      limiteVehicules: row.limite_vehicules,
      email: row.email
    }
  };
}
