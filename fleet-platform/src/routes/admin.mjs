import { query } from "../db.mjs";
import { adminLogin, adminLogout, bearerToken, requireAdmin } from "../admin_auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { audit, dernierAbonnement, finAbonnement, notifier, setting } from "../lifecycle.mjs";
import { text } from "../validation.mjs";

// POST /api/admin/auth/login {username, password, code?}
export async function login(req, res) {
  try {
    const body = await readJson(req);
    const session = await adminLogin(body.username, body.password, body.code);
    if (!session) return sendJson(res, 401, { error: "Identifiants ou code invalides" });
    await audit(null, "connexion_admin", "admin", null, { username: session.username });
    return sendJson(res, 200, { ok: true, ...session });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function logout(req, res) {
  await adminLogout(bearerToken(req.headers.authorization));
  return sendJson(res, 200, { ok: true });
}

// GET /api/admin/stats → indicateurs du tableau de bord.
export async function stats(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  const une = async (sql, params = []) => (await query(sql, params)).rows[0]?.n || 0;
  const comptes = await query(
    `SELECT
       COUNT(*) FILTER (WHERE type = 'physique')::int AS particuliers,
       COUNT(*) FILTER (WHERE type = 'morale')::int AS entreprises,
       COUNT(*) FILTER (WHERE statut_compte IN ('inscription_recue','en_attente_paiement','paiement_a_verifier','en_attente_validation'))::int AS en_attente,
       COUNT(*) FILTER (WHERE statut_compte = 'actif')::int AS actifs,
       COUNT(*) FILTER (WHERE statut_compte = 'suspendu')::int AS suspendus,
       COUNT(*) FILTER (WHERE statut_compte = 'expire')::int AS expires
     FROM fleet_owners`
  );
  const abonnements = await query(
    `SELECT COUNT(*) FILTER (WHERE statut = 'actif')::int AS en_cours,
            COUNT(*) FILTER (WHERE statut = 'actif' AND fin_at <= now() + interval '14 days')::int AS expirent_bientot
       FROM fleet_subscriptions`
  );
  const paiements = await query(
    `SELECT COUNT(*) FILTER (WHERE statut = 'a_verifier')::int AS a_verifier,
            COALESCE(SUM(montant) FILTER (WHERE statut = 'confirme'), 0) AS recettes
       FROM fleet_payments`
  );
  return sendJson(res, 200, {
    comptes: comptes.rows[0],
    abonnements: abonnements.rows[0],
    paiementsAVefifier: paiements.rows[0]?.a_verifier || 0,
    recettesConfirmees: Number(paiements.rows[0]?.recettes || 0)
  });
}

// GET /api/admin/comptes?type&statut&forfait&depuis&q&limit
export async function comptes(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const conditions = [];
  const values = [];
  const push = (sql, value) => {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  };
  if (url.searchParams.get("type") === "particulier") push(`o.type = ?`, "physique");
  if (url.searchParams.get("type") === "entreprise") push(`o.type = ?`, "morale");
  if (url.searchParams.get("statut")) push(`o.statut_compte = ?`, String(url.searchParams.get("statut")));
  if (url.searchParams.get("forfait")) push(`s.plan_id = ?`, Number(url.searchParams.get("forfait")));
  if (url.searchParams.get("depuis")) push(`o.created_at >= ?`, new Date(url.searchParams.get("depuis")));
  const q = (url.searchParams.get("q") || "").trim();
  if (q) {
    values.push(`%${q}%`);
    conditions.push(`(o.nom ILIKE $${values.length} OR o.raison_sociale ILIKE $${values.length} OR o.telephone ILIKE $${values.length} OR a.username ILIKE $${values.length})`);
  }
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 100)));
  const { rows } = await query(
    `SELECT o.*, a.username,
            (SELECT COUNT(*)::int FROM fleet_vehicles v WHERE v.owner_id = o.id) AS nb_vehicules,
            (SELECT row_to_json(x) FROM (
               SELECT s.id, s.statut, s.debut_at, s.fin_at, p.nom AS plan, p.prix, p.devise
                 FROM fleet_subscriptions s JOIN fleet_plans p ON p.id = s.plan_id
                WHERE s.owner_id = o.id ORDER BY s.id DESC LIMIT 1) x) AS abonnement,
            (SELECT row_to_json(x) FROM (
               SELECT py.id, py.statut, py.montant, py.devise, py.methode, py.reference, py.created_at
                 FROM fleet_payments py JOIN fleet_subscriptions s ON s.id = py.subscription_id
                WHERE s.owner_id = o.id ORDER BY py.id DESC LIMIT 1) x) AS paiement
       FROM fleet_owners o
       LEFT JOIN fleet_owner_accounts a ON a.owner_id = o.id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY o.id DESC LIMIT ${limit}`,
    values
  );
  return sendJson(res, 200, { comptes: rows });
}

// PATCH /api/admin/comptes {ownerId, action: valider|refuser|suspendre|reactiver, motif?}
export async function gererCompte(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const ownerId = Number(body.ownerId);
    const action = body.action;
    const owner = (await query(`SELECT * FROM fleet_owners WHERE id = $1 LIMIT 1`, [ownerId])).rows[0];
    if (!owner) return sendJson(res, 404, { error: "Compte introuvable" });
    const motif = body.motif ? String(body.motif).slice(0, 500) : null;
    if (action === "valider") {
      const sub = await dernierAbonnement(ownerId);
      if (!sub) {
        return sendJson(res, 400, { error: "Aucun abonnement : le compte doit d'abord choisir un forfait" });
      }
      if (sub.statut === "actif") {
        await query(`UPDATE fleet_owners SET statut_compte = 'actif', motif = NULL WHERE id = $1`, [ownerId]);
        return sendJson(res, 200, { ok: true, dejaActif: true });
      }
      const pay = (
        await query(`SELECT statut FROM fleet_payments WHERE subscription_id = $1 ORDER BY id DESC LIMIT 1`, [sub.id])
      ).rows[0];
      if (!pay || pay.statut !== "confirme") {
        return sendJson(res, 400, { error: `Paiement non confirmé (état : ${pay ? pay.statut : "aucun"}). Confirmez d'abord le paiement.` });
      }
      const debut = sub.debut_at ? new Date(sub.debut_at) : new Date();
      const fin = sub.fin_at ? new Date(sub.fin_at) : finAbonnement(debut, sub.plan_duree);
      await query(`UPDATE fleet_subscriptions SET statut = 'actif', debut_at = $1, fin_at = $2, updated_at = now() WHERE id = $3`, [
        debut,
        fin,
        sub.id
      ]);
      await query(`UPDATE fleet_owners SET statut_compte = 'actif', motif = NULL WHERE id = $1`, [ownerId]);
      await notifier(ownerId, { type: "activation", titre: "Compte activé", corps: `Votre formule ${sub.plan_nom} est active jusqu'au ${new Date(fin).toLocaleDateString("fr-FR")}.` });
    } else if (action === "refuser") {
      if (!motif) return sendJson(res, 400, { error: "Motif du refus requis" });
      await query(`UPDATE fleet_owners SET statut_compte = 'refuse', motif = $1 WHERE id = $2`, [motif, ownerId]);
      await query(`UPDATE fleet_subscriptions SET statut = 'annule', updated_at = now() WHERE owner_id = $1 AND statut IN ('en_attente_paiement','paiement_a_verifier','en_attente_validation')`, [ownerId]);
      await notifier(ownerId, { type: "activation", titre: "Inscription refusée", corps: motif });
    } else if (action === "suspendre") {
      if (!motif) return sendJson(res, 400, { error: "Motif de la suspension requis" });
      await query(`UPDATE fleet_owners SET statut_compte = 'suspendu', motif = $1 WHERE id = $2`, [motif, ownerId]);
      await notifier(ownerId, { type: "suspension", titre: "Compte suspendu", corps: motif });
    } else if (action === "reactiver") {
      const sub = await dernierAbonnement(ownerId);
      const statut = sub && sub.statut === "actif" && new Date(sub.fin_at) > new Date() ? "actif" : "expire";
      await query(`UPDATE fleet_owners SET statut_compte = $1, motif = NULL WHERE id = $2`, [statut, ownerId]);
      await notifier(ownerId, { type: "activation", titre: "Compte réactivé", corps: "Votre accès est rétabli." });
    } else {
      return sendJson(res, 400, { error: "Action inconnue" });
    }
    await audit(admin.id, action, "compte", ownerId, { motif });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// GET /api/admin/forfaits — POST créer — PATCH modifier.
export async function forfaits(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    if (req.method === "GET") {
      const { rows } = await query(`SELECT * FROM fleet_plans ORDER BY type_compte, prix`);
      return sendJson(res, 200, { forfaits: rows });
    }
    const body = await readJson(req);
    if (req.method === "POST") {
      const row = (
        await query(
          `INSERT INTO fleet_plans(nom, type_compte, prix, devise, duree, limite_vehicules, georeperage, actif)
           VALUES($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING *`,
          [
            text(body.nom, 100, { required: true }),
            body.type_compte === "entreprise" ? "entreprise" : "particulier",
            Number(body.prix) || 0,
            String(body.devise || "DZD").slice(0, 8),
            ["mensuel", "trimestriel", "annuel"].includes(body.duree) ? body.duree : "mensuel",
            body.limite_vehicules == null || body.limite_vehicules === "" ? null : Math.max(1, Number(body.limite_vehicules)),
            Boolean(body.georeperage)
          ]
        )
      ).rows[0];
      await audit(admin.id, "creation_forfait", "forfait", row.id, { nom: row.nom });
      return sendJson(res, 200, { ok: true, forfait: row });
    }
    const sets = [];
    const params = [];
    if (body.nom !== undefined) {
      params.push(text(body.nom, 100, { required: true }));
      sets.push(`nom = $${params.length}`);
    }
    if (body.prix !== undefined) {
      params.push(Number(body.prix) || 0);
      sets.push(`prix = $${params.length}`);
    }
    if (body.duree !== undefined && ["mensuel", "trimestriel", "annuel"].includes(body.duree)) {
      params.push(body.duree);
      sets.push(`duree = $${params.length}`);
    }
    if (body.limite_vehicules !== undefined) {
      params.push(body.limite_vehicules == null || body.limite_vehicules === "" ? null : Math.max(1, Number(body.limite_vehicules)));
      sets.push(`limite_vehicules = $${params.length}`);
    }
    if (body.georeperage !== undefined) {
      params.push(Boolean(body.georeperage));
      sets.push(`georeperage = $${params.length}`);
    }
    if (body.actif !== undefined) {
      params.push(Boolean(body.actif));
      sets.push(`actif = $${params.length}`);
    }
    if (!sets.length) return sendJson(res, 400, { error: "rien à changer" });
    params.push(Number(body.id));
    const updated = (
      await query(`UPDATE fleet_plans SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *`, params)
    ).rows[0];
    if (!updated) return sendJson(res, 404, { error: "Forfait introuvable" });
    await audit(admin.id, "modification_forfait", "forfait", updated.id, { nom: updated.nom });
    return sendJson(res, 200, { ok: true, forfait: updated });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// GET /api/admin/paiements?statut=a_verifier
export async function paiements(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const statut = url.searchParams.get("statut") || "a_verifier";
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 100)));
  const { rows } = await query(
    `SELECT py.*, s.owner_id, s.statut AS abonnement, p.nom AS plan,
            o.nom, o.prenom, o.raison_sociale, o.telephone
       FROM fleet_payments py
       JOIN fleet_subscriptions s ON s.id = py.subscription_id
       JOIN fleet_plans p ON p.id = s.plan_id
       JOIN fleet_owners o ON o.id = s.owner_id
      WHERE py.statut = $1
      ORDER BY py.id DESC LIMIT $2`,
    [statut, limit]
  );
  return sendJson(res, 200, { paiements: rows });
}

// Confirmation manuelle d'un paiement (virement / justificatif vérifié).
export async function confirmerPaiement(paymentId, adminId) {
  const payment = (
    await query(
      `SELECT py.*, s.owner_id, s.plan_id, s.statut AS abonnement, p.duree, p.nom AS plan_nom
         FROM fleet_payments py
         JOIN fleet_subscriptions s ON s.id = py.subscription_id
         JOIN fleet_plans p ON p.id = s.plan_id
        WHERE py.id = $1 LIMIT 1`,
      [Number(paymentId)]
    )
  ).rows[0];
  if (!payment) throw new Error("Paiement introuvable");
  if (payment.statut === "confirme") return payment;
  const debut = new Date();
  const fin = finAbonnement(debut, payment.duree);
  await query(`UPDATE fleet_payments SET statut = 'confirme', confirme_par = $1, confirme_at = now(), updated_at = now() WHERE id = $2`, [
    adminId,
    payment.id
  ]);
  const auto = (await setting("activation_auto_apres_paiement", "0")) === "1";
  if (auto) {
    await query(`UPDATE fleet_subscriptions SET statut = 'actif', debut_at = $1, fin_at = $2, updated_at = now() WHERE id = $3`, [
      debut,
      fin,
      payment.subscription_id
    ]);
    await query(`UPDATE fleet_owners SET statut_compte = 'actif', motif = NULL WHERE id = $1`, [payment.owner_id]);
    await notifier(payment.owner_id, {
      type: "paiement",
      titre: "Paiement confirmé — compte actif",
      corps: `Votre formule ${payment.plan_nom} est active jusqu'au ${fin.toLocaleDateString("fr-FR")}.`
    });
  } else {
    await query(`UPDATE fleet_subscriptions SET statut = 'en_attente_validation', debut_at = $1, fin_at = $2, updated_at = now() WHERE id = $3`, [
      debut,
      fin,
      payment.subscription_id
    ]);
    await query(`UPDATE fleet_owners SET statut_compte = 'en_attente_validation' WHERE id = $1`, [payment.owner_id]);
    await notifier(payment.owner_id, {
      type: "paiement",
      titre: "Paiement confirmé",
      corps: "Votre compte est en attente de validation finale par l'administrateur."
    });
  }
  await audit(adminId, "confirmation_paiement", "paiement", payment.id, { abonnement: payment.subscription_id, activationAuto: auto });
  return payment;
}

// PATCH /api/admin/paiements {paymentId, action: confirmer|refuser, motif?}
export async function gererPaiement(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    if (body.action === "confirmer") {
      await confirmerPaiement(body.paymentId, admin.id);
      return sendJson(res, 200, { ok: true });
    }
    if (body.action === "refuser") {
      const payment = (
        await query(`SELECT py.*, s.owner_id FROM fleet_payments py JOIN fleet_subscriptions s ON s.id = py.subscription_id WHERE py.id = $1 LIMIT 1`, [
          Number(body.paymentId)
        ])
      ).rows[0];
      if (!payment) return sendJson(res, 404, { error: "Paiement introuvable" });
      await query(`UPDATE fleet_payments SET statut = 'refuse', updated_at = now() WHERE id = $1`, [payment.id]);
      await query(`UPDATE fleet_subscriptions SET statut = 'en_attente_paiement', updated_at = now() WHERE id = $1`, [payment.subscription_id]);
      await query(`UPDATE fleet_owners SET statut_compte = 'en_attente_paiement' WHERE id = $1`, [payment.owner_id]);
      await notifier(payment.owner_id, { type: "paiement", titre: "Paiement refusé", corps: body.motif ? String(body.motif).slice(0, 500) : "Veuillez recommencer le paiement." });
      await audit(admin.id, "refus_paiement", "paiement", payment.id, { motif: body.motif || null });
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: "Action inconnue" });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// POST /api/admin/abonnements {ownerId, planId, methode?} → abonnement manuel (accueil admin).
export async function creerAbonnement(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const owner = (await query(`SELECT * FROM fleet_owners WHERE id = $1 LIMIT 1`, [Number(body.ownerId)])).rows[0];
    if (!owner) return sendJson(res, 404, { error: "Compte introuvable" });
    const plan = (await query(`SELECT * FROM fleet_plans WHERE id = $1 AND actif LIMIT 1`, [Number(body.planId)])).rows[0];
    if (!plan) return sendJson(res, 400, { error: "Forfait inconnu ou inactif" });
    const sub = (
      await query(`INSERT INTO fleet_subscriptions(owner_id, plan_id, statut) VALUES($1,$2,'en_attente_paiement') RETURNING *`, [owner.id, plan.id])
    ).rows[0];
    await query(`INSERT INTO fleet_payments(subscription_id, montant, devise, methode, statut) VALUES($1,$2,$3,$4,'en_attente')`, [
      sub.id,
      plan.prix,
      plan.devise,
      body.methode || "virement"
    ]);
    await query(`UPDATE fleet_owners SET statut_compte = 'en_attente_paiement' WHERE id = $1`, [owner.id]);
    await audit(admin.id, "creation_abonnement", "abonnement", sub.id, { owner: owner.id, plan: plan.nom });
    return sendJson(res, 200, { ok: true, abonnement: sub.id });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// GET /api/admin/audit?limit
export async function journal(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") || 100)));
  const { rows } = await query(
    `SELECT j.*, a.username AS admin FROM fleet_audit_log j LEFT JOIN fleet_admins a ON a.id = j.admin_id ORDER BY j.id DESC LIMIT $1`,
    [limit]
  );
  return sendJson(res, 200, { journal: rows });
}

// POST /api/admin/maintenance/expirations → fige les abonnements dépassés.
export async function expirations(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  const { rows } = await query(
    `UPDATE fleet_subscriptions SET statut = 'expire', updated_at = now()
      WHERE statut = 'actif' AND fin_at <= now() RETURNING id, owner_id`
  );
  for (const row of rows) {
    await query(`UPDATE fleet_owners SET statut_compte = 'expire' WHERE id = $1 AND statut_compte = 'actif'`, [row.owner_id]);
    await notifier(row.owner_id, { type: "abonnement", titre: "Abonnement expiré", corps: "Renouvelez votre formule pour réactiver le suivi." });
  }
  await audit(admin.id, "maintenance_expirations", null, null, { traites: rows.length });
  return sendJson(res, 200, { ok: true, traites: rows.length });
}

// GET /api/admin/reglages — PATCH {activationAuto}
export async function reglages(req, res, auth) {
  const admin = auth || (await requireAdmin(req));
  if (!admin) return sendJson(res, 401, { error: "Non authentifié" });
  if (req.method === "GET") {
    return sendJson(res, 200, { activationAuto: (await setting("activation_auto_apres_paiement", "0")) === "1" });
  }
  const body = await readJson(req).catch(() => ({}));
  await query(`INSERT INTO fleet_settings(cle, valeur) VALUES('activation_auto_apres_paiement', $1) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, updated_at = now()`, [
    body.activationAuto ? "1" : "0"
  ]);
  await audit(admin.id, "reglage_activation", null, null, { activationAuto: Boolean(body.activationAuto) });
  return sendJson(res, 200, { ok: true });
}
