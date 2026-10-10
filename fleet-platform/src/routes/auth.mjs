import { query } from "../db.mjs";
import { createSession, hashPassword, requireOwner, verifyPassword } from "../auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { optionalText, ownerNin, text } from "../validation.mjs";

function publicOwner(owner) {
  let age = null;
  return {
    id: owner.id,
    type: owner.type,
    nom: owner.nom,
    prenom: owner.prenom,
    raisonSociale: owner.raison_sociale,
    wilaya: owner.wilaya,
    telephone: owner.telephone,
    age,
    nbVehicules: 0
  };
}

export async function register(req, res) {
  try {
    const body = await readJson(req);
    const username = text(body.username, 64, { required: true });
    const password = text(body.password, 255, { required: true });
    if (password.length < 6) return sendJson(res, 400, { error: "6 caractères minimum" });
    const telephone = text(body.telephone, 32, { required: true });
    const type = body.type === "morale" ? "morale" : "physique";
    const existing = await query(`SELECT id FROM fleet_owner_accounts WHERE username = $1 LIMIT 1`, [username]);
    if (existing.rowCount) return sendJson(res, 409, { error: "Nom d'utilisateur déjà pris" });

    const ownerResult = await query(
      `INSERT INTO fleet_owners(type, nom, prenom, raison_sociale, nin, telephone, adresse, commune, wilaya, code_wilaya)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        type,
        optionalText(body.nom, 100),
        optionalText(body.prenom, 100),
        optionalText(body.raisonSociale, 200),
        String(body.nin || ownerNin()).slice(0, 32),
        telephone,
        optionalText(body.adresse, 500),
        optionalText(body.commune, 100),
        optionalText(body.wilaya, 100),
        optionalText(body.codeWilaya, 4)
      ]
    );
    const owner = ownerResult.rows[0];
    const accountResult = await query(
      `INSERT INTO fleet_owner_accounts(owner_id, username, password_hash, actif)
       VALUES($1,$2,$3,TRUE) RETURNING id`,
      [owner.id, username, hashPassword(password)]
    );
    const { token, expiresAt } = await createSession(accountResult.rows[0].id);
    return sendJson(res, 200, { ok: true, token, expiresAt, proprietaire: publicOwner(owner) });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function login(req, res) {
  try {
    const body = await readJson(req);
    const username = text(body.username, 64, { required: true });
    const password = text(body.password, 255, { required: true });
    const { rows } = await query(
      `SELECT a.id AS account_id, a.password_hash, a.actif,
              o.*
         FROM fleet_owner_accounts a
         JOIN fleet_owners o ON o.id = a.owner_id
        WHERE a.username = $1 LIMIT 1`,
      [username]
    );
    const row = rows[0];
    if (!row || !row.actif || !verifyPassword(password, row.password_hash)) {
      return sendJson(res, 401, { error: "Identifiants invalides" });
    }
    const vehicles = await query(`SELECT COUNT(*)::int AS n FROM fleet_vehicles WHERE owner_id = $1`, [row.id]);
    const { token, expiresAt } = await createSession(row.account_id);
    const proprietaire = publicOwner(row);
    proprietaire.nbVehicules = vehicles.rows[0]?.n || 0;
    return sendJson(res, 200, { ok: true, token, expiresAt, proprietaire });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function profile(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    if (req.method === "GET") {
      const { rows } = await query(`SELECT * FROM fleet_owners WHERE id = $1 LIMIT 1`, [session.owner.id]);
      return sendJson(res, 200, { proprietaire: publicOwner(rows[0]) });
    }
    const body = await readJson(req);
    const patch = {
      nom: optionalText(body.nom, 100),
      prenom: optionalText(body.prenom, 100),
      telephone: body.telephone === undefined ? undefined : text(body.telephone, 32, { required: true })
    };
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) return sendJson(res, 400, { error: "rien à changer" });
    params.push(session.owner.id);
    await query(`UPDATE fleet_owners SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}
