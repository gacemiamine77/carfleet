import { query } from "../db.mjs";
import { requireOwner } from "../auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { dernierAbonnement, lireCouleurs, notifier, verifierExpiration } from "../lifecycle.mjs";

// GET /api/fleet/plans?type=particulier|entreprise → forfaits actifs (public).
export async function plans(req, res) {
  const url = new URL(req.url, "http://localhost");
  const type = url.searchParams.get("type");
  const values = [];
  let where = `actif`;
  if (type === "particulier" || type === "entreprise") {
    values.push(type);
    where += ` AND type_compte = $1`;
  }
  const { rows } = await query(`SELECT * FROM fleet_plans WHERE ${where} ORDER BY prix ASC`, values);
  return sendJson(res, 200, { forfaits: rows });
}

// GET /api/fleet/couleurs → couleurs de véhicules proposées (réglage admin, public).
export async function couleurs(req, res) {
  return sendJson(res, 200, { couleurs: await lireCouleurs() });
}

// POST /api/fleet/abonnement {planId, methode?} → crée abonnement + paiement.
export async function choisir(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const plan = (
      await query(`SELECT * FROM fleet_plans WHERE id = $1 AND actif LIMIT 1`, [Number(body.planId)])
    ).rows[0];
    if (!plan) return sendJson(res, 400, { error: "Forfait inconnu ou inactif" });
    const owner = (await query(`SELECT type FROM fleet_owners WHERE id = $1 LIMIT 1`, [session.owner.id])).rows[0];
    const attendu = owner.type === "morale" ? "entreprise" : "particulier";
    if (plan.type_compte !== attendu) return sendJson(res, 400, { error: "Forfait incompatible avec le type de compte" });
    const ouvert = (
      await query(
        `SELECT id FROM fleet_subscriptions WHERE owner_id = $1 AND statut IN ('en_attente_paiement','paiement_a_verifier','en_attente_validation') LIMIT 1`,
        [session.owner.id]
      )
    ).rows[0];
    if (ouvert) return sendJson(res, 409, { error: "Un abonnement est déjà en cours de traitement" });
    const sub = (
      await query(`INSERT INTO fleet_subscriptions(owner_id, plan_id, statut) VALUES($1,$2,'en_attente_paiement') RETURNING *`, [
        session.owner.id,
        plan.id
      ])
    ).rows[0];
    const methode = ["virement", "especes", "passerelle", "autre"].includes(body.methode) ? body.methode : "virement";
    await query(`INSERT INTO fleet_payments(subscription_id, montant, devise, methode, statut) VALUES($1,$2,$3,$4,'en_attente')`, [
      sub.id,
      plan.prix,
      plan.devise,
      methode
    ]);
    await query(`UPDATE fleet_owners SET statut_compte = 'en_attente_paiement' WHERE id = $1`, [session.owner.id]);
    return sendJson(res, 200, { ok: true, abonnement: sub.id });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// POST /api/fleet/paiement/declarer {abonnementId?, reference?} → paiement à vérifier (virement).
export async function declarer(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const sub = body.abonnementId
      ? (await query(`SELECT * FROM fleet_subscriptions WHERE id = $1 AND owner_id = $2 LIMIT 1`, [Number(body.abonnementId), session.owner.id])).rows[0]
      : (await query(`SELECT * FROM fleet_subscriptions WHERE owner_id = $1 ORDER BY id DESC LIMIT 1`, [session.owner.id])).rows[0];
    if (!sub) return sendJson(res, 404, { error: "Aucun abonnement" });
    const payment = (
      await query(`SELECT * FROM fleet_payments WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`, [sub.id])
    ).rows[0];
    if (!payment) return sendJson(res, 404, { error: "Aucun paiement" });
    await query(`UPDATE fleet_payments SET statut = 'a_verifier', reference = $1, updated_at = now() WHERE id = $2`, [
      body.reference ? String(body.reference).slice(0, 100) : payment.reference,
      payment.id
    ]);
    await query(`UPDATE fleet_subscriptions SET statut = 'paiement_a_verifier', updated_at = now() WHERE id = $1`, [sub.id]);
    await query(`UPDATE fleet_owners SET statut_compte = 'paiement_a_verifier' WHERE id = $1`, [session.owner.id]);
    await notifier(session.owner.id, { type: "paiement", titre: "Paiement transmis", corps: "Votre justificatif sera vérifié par l'administrateur." });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// GET /api/fleet/statut → état du compte + abonnement + paiements.
export async function statut(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  await verifierExpiration(session.owner.id);
  const owner = (await query(`SELECT * FROM fleet_owners WHERE id = $1 LIMIT 1`, [session.owner.id])).rows[0];
  const sub = await dernierAbonnement(session.owner.id);
  const paiements = sub
    ? (await query(`SELECT id, montant, devise, methode, reference, statut, created_at FROM fleet_payments WHERE subscription_id = $1 ORDER BY id DESC`, [sub.id])).rows
    : [];
  return sendJson(res, 200, {
    compte: { statut: owner.statut_compte, motif: owner.motif, type: owner.type },
    actif: owner.statut_compte === "actif",
    abonnement: sub
      ? { id: sub.id, plan: sub.plan_nom, statut: sub.statut, debut: sub.debut_at, fin: sub.fin_at, prix: sub.plan_prix, devise: sub.plan_devise, georeperage: sub.plan_georeperage, limiteVehicules: sub.plan_limite }
      : null,
    paiements
  });
}

// GET /api/proprietaires/notifications → notifications du compte.
export async function notifications(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const { rows } = await query(`SELECT * FROM fleet_notifications WHERE owner_id = $1 ORDER BY id DESC LIMIT $2`, [
    session.owner.id,
    limit
  ]);
  return sendJson(res, 200, {
    notifications: rows,
    nonLues: rows.filter((row) => !row.lu).length
  });
}

// PATCH /api/proprietaires/notifications → tout marquer lu.
export async function lireNotifications(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  await query(`UPDATE fleet_notifications SET lu = TRUE WHERE owner_id = $1`, [session.owner.id]);
  return sendJson(res, 200, { ok: true });
}
