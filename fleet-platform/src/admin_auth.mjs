import { randomBytes } from "node:crypto";
import { query } from "./db.mjs";
import { hashPassword, verifyPassword } from "./auth.mjs";
import { verifyTotp } from "./totp.mjs";

export function adminSessionDays() {
  return 1; // sessions admin courtes : 24 h
}

export function bearerToken(header) {
  const value = String(header || "");
  if (!value.startsWith("Bearer ")) return "";
  return value.slice(7).trim();
}

export async function requireAdmin(req) {
  const token = bearerToken(req.headers.authorization);
  if (!token) return null;
  const { rows } = await query(
    `SELECT ad.id, ad.username, ad.actif
       FROM fleet_admin_sessions s
       JOIN fleet_admins ad ON ad.id = s.admin_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  if (!rows.length || !rows[0].actif) return null;
  return { id: rows[0].id, username: rows[0].username };
}

export async function adminLogin(username, password, code) {
  const { rows } = await query(`SELECT * FROM fleet_admins WHERE username = $1 LIMIT 1`, [String(username || "")]);
  const admin = rows[0];
  if (!admin || !admin.actif || !verifyPassword(password, admin.password_hash)) return null;
  if (admin.totp_secret) {
    if (!verifyTotp(admin.totp_secret, code)) return null;
  }
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + adminSessionDays() * 24 * 3600 * 1000);
  await query(`INSERT INTO fleet_admin_sessions(token, admin_id, expires_at) VALUES($1,$2,$3)`, [token, admin.id, expiresAt]);
  return { token, expiresAt, username: admin.username, doubleAuth: Boolean(admin.totp_secret) };
}

export async function adminLogout(token) {
  await query(`DELETE FROM fleet_admin_sessions WHERE token = $1`, [token]);
}

export { hashPassword };
