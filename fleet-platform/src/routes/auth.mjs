import { query } from "../db.mjs";
import { createSession, hashPassword, requireOwner, verifyPassword } from "../auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { dernierAbonnement, finAbonnement, notifier, verifierExpiration } from "../lifecycle.mjs";
import { optionalText, ownerNin, text } from "../validation.mjs";

function publicOwner(owner) {
  return {
    id: owner.id,
    type: owner.type,
    nom: owner.nom,
    prenom: owner.prenom,
    raisonSociale: owner.raison_sociale,
    wilaya: owner.wilaya,
    telephone: owner.telephone,
    email: owner.email || null,
    statutCompte: owner.statut_compte,
    limiteVehicules: owner.limite_vehicules,
    age: null,
    nbVehicules: 0
  };
}

async function creerAbonnement(ownerId, planId, methode = "virement") {
  const plan = (await query(`SELECT * FROM fleet_plans WHERE id = $1 AND actif LIMIT 1`, [Number(planId)])).rows[0];
  if (!plan) throw new Error("Forfait inconnu ou inactif");
  const sub = (
    await query(
      `INSERT INTO fleet_subscriptions(owner_id, plan_id, statut) VALUES($1,$2,'en_attente_paiement') RETURNING *`,
      [ownerId, plan.id]
    )
  ).rows[0];
  const payment = (
    await query(
      `INSERT INTO fleet_payments(subscription_id, montant, devise, methode, statut)
       VALUES($1,$2,$3,$4,'en_attente') RETURNING *`,
      [sub.id, plan.prix, plan.devise, methode]
    )
  ).rows[0];
  await query(`UPDATE fleet_owners SET statut_compte = 'en_attente_paiement' WHERE id = $1`, [ownerId]);
  return { sub, payment, plan };
}

// POST /api/proprietaires/auth/register
// { username, password, typeCompte: "particulier"|"entreprise", ... }
export async function register(req, res) {
  try {
    const body = await readJson(req);
    const username = text(body.username, 64, { required: true });
    const password = text(body.password, 255, { required: true });
    if (password.length < 6) return sendJson(res, 400, { error: "6 caractères minimum" });
    const telephone = text(body.telephone, 32, { required: true });
    const typeCompte = body.typeCompte === "entreprise" ? "entreprise" : "particulier";
    const type = typeCompte === "entreprise" ? "morale" : "physique";
    if (typeCompte === "entreprise" && !String(body.raisonSociale || "").trim()) {
      return sendJson(res, 400, { error: "Raison sociale requise pour un compte entreprise" });
    }
    const existing = await query(`SELECT id FROM fleet_owner_accounts WHERE username = $1 LIMIT 1`, [username]);
    if (existing.rowCount) return sendJson(res, 409, { error: "Nom d'utilisateur déjà pris" });

    const ownerResult = await query(
      `INSERT INTO fleet_owners(type, nom, prenom, raison_sociale, nin, telephone, email, adresse, commune, wilaya, code_wilaya, statut_compte, limite_vehicules)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'inscription_recue',$12) RETURNING *`,
      [
        type,
        optionalText(body.nom, 100),
        optionalText(body.prenom, 100),
        optionalText(body.raisonSociale, 200),
        String(body.nin || ownerNin()).slice(0, 32),
        telephone,
        optionalText(body.email, 160),
        optionalText(body.adresse, 500),
        optionalText(body.commune, 100),
        optionalText(body.wilaya, 100),
        optionalText(body.codeWilaya, 4),
        typeCompte === "entreprise" ? null : 3
      ]
    );
    const owner = ownerResult.rows[0];
    const accountResult = await query(
      `INSERT INTO fleet_owner_accounts(owner_id, username, password_hash, actif)
       VALUES($1,$2,$3,TRUE) RETURNING id`,
      [owner.id, username, hashPassword(password)]
    );
    // Forfait choisi à l'inscription (optionnel) → abonnement + paiement créés aussitôt.
    let abonnement = null;
    if (body.planId) {
      try {
        const created = await creerAbonnement(owner.id, body.planId, body.methodePaiement || "virement");
        abonnement = { id: created.sub.id, plan: created.plan.nom, statut: created.sub.statut };
      } catch (error) {
        return sendJson(res, 400, { error: String(error.message || error) });
      }
    }
    await notifier(owner.id, {
      type: "inscription",
      titre: "Inscription reçue",
      corps: typeCompte === "entreprise"
        ? "Votre demande de compte entreprise est enregistrée. Choisissez un forfait pour continuer."
        : "Votre demande de compte particulier est enregistrée. Choisissez un forfait pour continuer."
    });
    const { token, expiresAt } = await createSession(accountResult.rows[0].id);
    return sendJson(res, 200, { ok: true, token, expiresAt, proprietaire: publicOwner(owner), abonnement });
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
      `SELECT a.id AS account_id, a.password_hash, a.actif, o.*
         FROM fleet_owner_accounts a
         JOIN fleet_owners o ON o.id = a.owner_id
        WHERE a.username = $1 LIMIT 1`,
      [username]
    );
    const row = rows[0];
    if (!row || !row.actif || !verifyPassword(password, row.password_hash)) {
      return sendJson(res, 401, { error: "Identifiants invalides" });
    }
    await verifierExpiration(row.id);
    const fresh = (await query(`SELECT * FROM fleet_owners WHERE id = $1 LIMIT 1`, [row.id])).rows[0];
    const vehicles = await query(`SELECT COUNT(*)::int AS n FROM fleet_vehicles WHERE owner_id = $1`, [row.id]);
    const sub = await dernierAbonnement(row.id);
    const { token, expiresAt } = await createSession(row.account_id);
    const proprietaire = publicOwner(fresh);
    proprietaire.nbVehicules = vehicles.rows[0]?.n || 0;
    return sendJson(res, 200, {
      ok: true,
      token,
      expiresAt,
      proprietaire,
      actif: fresh.statut_compte === "actif",
      abonnement: sub
        ? { id: sub.id, plan: sub.plan_nom, statut: sub.statut, debut: sub.debut_at, fin: sub.fin_at, prix: sub.plan_prix, devise: sub.plan_devise }
        : null
    });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function logout(req, res) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    try {
      await query(`DELETE FROM fleet_owner_sessions WHERE token = $1`, [token]);
    } catch {}
  }
  return sendJson(res, 200, { ok: true });
}

export async function profile(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    if (req.method === "GET") {
      const { rows } = await query(`SELECT * FROM fleet_owners WHERE id = $1 LIMIT 1`, [session.owner.id]);
      const vehicles = await query(`SELECT COUNT(*)::int AS n FROM fleet_vehicles WHERE owner_id = $1`, [session.owner.id]);
      const proprietaire = publicOwner(rows[0]);
      proprietaire.nbVehicules = vehicles.rows[0]?.n || 0;
      const sub = await dernierAbonnement(session.owner.id);
      return sendJson(res, 200, {
        proprietaire,
        actif: rows[0].statut_compte === "actif",
        abonnement: sub
          ? { id: sub.id, plan: sub.plan_nom, statut: sub.statut, debut: sub.debut_at, fin: sub.fin_at, prix: sub.plan_prix, devise: sub.plan_devise }
          : null
      });
    }
    const body = await readJson(req);
    // Changement de mot de passe.
    if (body.nouveauMotDePasse !== undefined) {
      const account = (
        await query(`SELECT password_hash FROM fleet_owner_accounts WHERE id = $1 LIMIT 1`, [session.accountId])
      ).rows[0];
      if (!account || !verifyPassword(String(body.ancienMotDePasse || ""), account.password_hash)) {
        return sendJson(res, 403, { error: "Ancien mot de passe incorrect" });
      }
      if (String(body.nouveauMotDePasse || "").length < 6) {
        return sendJson(res, 400, { error: "6 caractères minimum" });
      }
      await query(`UPDATE fleet_owner_accounts SET password_hash = $1 WHERE id = $2`, [
        hashPassword(String(body.nouveauMotDePasse)),
        session.accountId
      ]);
      return sendJson(res, 200, { ok: true });
    }
    const patch = {
      nom: body.nom === undefined ? undefined : optionalText(body.nom, 100),
      prenom: body.prenom === undefined ? undefined : optionalText(body.prenom, 100),
      email: body.email === undefined ? undefined : optionalText(body.email, 160),
      adresse: body.adresse === undefined ? undefined : optionalText(body.adresse, 500),
      commune: body.commune === undefined ? undefined : optionalText(body.commune, 100),
      wilaya: body.wilaya === undefined ? undefined : optionalText(body.wilaya, 100)
    };
    if (body.telephone !== undefined) patch.telephone = text(body.telephone, 32, { required: true });
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

export { finAbonnement };
