import { query } from "./db.mjs";

// Cycle de vie : inscription_recue → en_attente_paiement → paiement_a_verifier
// → en_attente_validation → actif → (expire | suspendu | refuse).

export async function notifier(ownerId, { type = "info", titre, corps = null }) {
  try {
    await query(`INSERT INTO fleet_notifications(owner_id, type, titre, corps) VALUES($1,$2,$3,$4)`, [
      ownerId,
      type,
      titre,
      corps
    ]);
  } catch {}
}

export async function audit(adminId, action, cibleType = null, cibleId = null, details = null) {
  try {
    await query(`INSERT INTO fleet_audit_log(admin_id, action, cible_type, cible_id, details) VALUES($1,$2,$3,$4,$5)`, [
      adminId,
      action,
      cibleType,
      cibleId,
      details ? JSON.stringify(details) : null
    ]);
  } catch {}
}

export async function setting(cle, defaut = null) {
  const { rows } = await query(`SELECT valeur FROM fleet_settings WHERE cle = $1 LIMIT 1`, [cle]);
  return rows[0]?.valeur ?? defaut;
}

export function finAbonnement(debut, duree) {
  const mois = duree === "annuel" ? 12 : duree === "trimestriel" ? 3 : 1;
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + mois);
  return fin;
}

export async function abonnementActif(ownerId) {
  const { rows } = await query(
    `SELECT s.*, p.nom AS plan_nom, p.duree AS plan_duree, p.limite_vehicules AS plan_limite, p.georeperage AS plan_georeperage, p.prix AS plan_prix, p.devise AS plan_devise
       FROM fleet_subscriptions s
       JOIN fleet_plans p ON p.id = s.plan_id
      WHERE s.owner_id = $1 AND s.statut = 'actif' AND s.fin_at > now()
      ORDER BY s.id DESC LIMIT 1`,
    [ownerId]
  );
  return rows[0] || null;
}

export async function dernierAbonnement(ownerId) {
  const { rows } = await query(
    `SELECT s.*, p.nom AS plan_nom, p.duree AS plan_duree, p.limite_vehicules AS plan_limite, p.georeperage AS plan_georeperage, p.prix AS plan_prix, p.devise AS plan_devise
       FROM fleet_subscriptions s
       JOIN fleet_plans p ON p.id = s.plan_id
      WHERE s.owner_id = $1
      ORDER BY s.id DESC LIMIT 1`,
    [ownerId]
  );
  return rows[0] || null;
}

// Limite de véhicules : plan actif > limite manuelle > défaut par type.
export async function limiteVehicules(owner) {
  const sub = await abonnementActif(owner.id);
  if (sub && sub.plan_limite != null) return { limite: sub.plan_limite, source: "forfait" };
  if (owner.limite_vehicules != null) return { limite: owner.limite_vehicules, source: "manuel" };
  if (owner.type === "morale") return { limite: null, source: "entreprise" };
  return { limite: 3, source: "particulier" };
}

export async function georeperageAutorise(ownerId) {
  const sub = await abonnementActif(ownerId);
  return Boolean(sub && sub.plan_georeperage);
}

// Marque l'expiration paresseusement + notifie une fois.
export async function verifierExpiration(ownerId) {
  const sub = await dernierAbonnement(ownerId);
  if (!sub) return null;
  if (sub.statut === "actif" && sub.fin_at && new Date(sub.fin_at) <= new Date()) {
    await query(`UPDATE fleet_subscriptions SET statut = 'expire', updated_at = now() WHERE id = $1`, [sub.id]);
    await query(`UPDATE fleet_owners SET statut_compte = 'expire' WHERE id = $1 AND statut_compte = 'actif'`, [ownerId]);
    await notifier(ownerId, { type: "abonnement", titre: "Abonnement expiré", corps: `Votre formule ${sub.plan_nom} a expiré. Renouvelez-la pour réactiver le suivi.` });
    return { ...sub, statut: "expire" };
  }
  if (sub.statut === "actif" && sub.fin_at && !sub.expiration_notifiee) {
    const jours = (new Date(sub.fin_at) - new Date()) / 86400000;
    if (jours <= 7) {
      await query(`UPDATE fleet_subscriptions SET expiration_notifiee = TRUE WHERE id = $1`, [sub.id]);
      await notifier(ownerId, {
        type: "abonnement",
        titre: "Abonnement bientôt expiré",
        corps: `Votre formule ${sub.plan_nom} expire le ${new Date(sub.fin_at).toLocaleDateString("fr-FR")}.`
      });
    }
  }
  return sub;
}

// Le compte peut-il gérer ses données (véhicules, profil) ? Oui même sans paiement,
// sauf compte bloqué. Le SUIVI temps réel reste réservé à compteUtilisable().
export async function compteModifiable(ownerId) {
  const owner = (await query(`SELECT id, statut_compte FROM fleet_owners WHERE id = $1 LIMIT 1`, [ownerId])).rows[0];
  if (!owner) return { ok: false, motif: "Compte introuvable" };
  if (owner.statut_compte === "suspendu") return { ok: false, motif: "Compte suspendu" };
  if (owner.statut_compte === "refuse") return { ok: false, motif: "Inscription refusée" };
  return { ok: true };
}

// Nettoie une liste de couleurs (tableau ou texte séparé par lignes/virgules).
export function nettoyerCouleurs(valeur) {
  const brut = Array.isArray(valeur) ? valeur : String(valeur ?? "").split(/[\n,;]+/);
  const vus = new Set();
  const propres = [];
  for (const item of brut) {
    const couleur = String(item || "").trim().slice(0, 30);
    if (!couleur || vus.has(couleur.toLowerCase())) continue;
    vus.add(couleur.toLowerCase());
    propres.push(couleur);
    if (propres.length >= 60) break;
  }
  return propres;
}

// Couleurs proposées aux abonnés (réglage admin, défaut : liste vide).
export async function lireCouleurs() {
  try {
    const parsed = JSON.parse(await setting("couleurs_vehicules", "[]"));
    if (Array.isArray(parsed)) return nettoyerCouleurs(parsed);
  } catch {}
  return [];
}

// Le compte peut-il utiliser le suivi réel ? (Exigence fondamentale.)
export async function compteUtilisable(ownerId) {
  const owner = (await query(`SELECT id, statut_compte FROM fleet_owners WHERE id = $1 LIMIT 1`, [ownerId])).rows[0];
  if (!owner) return { ok: false, motif: "Compte introuvable" };
  if (owner.statut_compte === "suspendu") return { ok: false, motif: "Compte suspendu" };
  if (owner.statut_compte === "refuse") return { ok: false, motif: "Inscription refusée" };
  if (owner.statut_compte !== "actif") return { ok: false, motif: `Compte non activé (${owner.statut_compte})` };
  await verifierExpiration(ownerId);
  const sub = await abonnementActif(ownerId);
  if (!sub) return { ok: false, motif: "Abonnement inactif ou expiré" };
  return { ok: true, abonnement: sub };
}

// Dossier de vol ouvert pour un véhicule (ou null). Sert l'exception suivi-vol et la console admin.
export async function dossierVolOuvert(vehicleId) {
  const { rows } = await query(
    `SELECT id, owner_id, reported_at FROM fleet_theft_cases WHERE vehicle_id = $1 AND status = 'open' ORDER BY id DESC LIMIT 1`,
    [vehicleId]
  );
  return rows[0] || null;
}

export async function statutProprietaireVehicule(vehicleId) {
  const { rows } = await query(
    `SELECT o.id, o.statut_compte FROM fleet_vehicles v JOIN fleet_owners o ON o.id = v.owner_id WHERE v.id = $1 LIMIT 1`,
    [vehicleId]
  );
  return rows[0] || null;
}
