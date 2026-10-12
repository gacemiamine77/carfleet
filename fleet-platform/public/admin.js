/* Fleet Platform — espace administrateur (page dédiée /admin.html). */
let adminToken = sessionStorage.getItem("fleet_admin") || "";
let editingPlan = 0;
const $ = (id) => document.getElementById(id);

function hAdmin() { return adminToken ? { Authorization: "Bearer " + adminToken } : {}; }

async function call(path, options = {}) {
  const r = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...hAdmin(), ...(options.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.error || ("HTTP " + r.status));
    err.status = r.status;
    throw err;
  }
  return j;
}
function msg(id, texte, ok) { const el = $(id); el.textContent = texte || ""; el.className = "msg " + (ok ? "ok" : "err"); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString("fr-FR") : "—"; }
function show(id) {
  for (const v of ["view-admin-login", "view-admin"]) $(v).classList.add("hidden");
  $(id).classList.remove("hidden");
}

// ---------- Connexion ----------
$("btnAdminLogin").onclick = async () => {
  try {
    const j = await call("/api/admin/auth/login", { method: "POST", body: JSON.stringify({ username: $("aUser").value.trim(), password: $("aPass").value, code: $("aCode").value.trim() }) });
    adminToken = j.token; sessionStorage.setItem("fleet_admin", adminToken);
    entrerAdmin(j.role);
  } catch (e) { msg("adminMsg", e.message); }
};
$("btnForgot").onclick = () => $("forgotBox").classList.toggle("hidden");
$("navLogout").onclick = async () => {
  try { await call("/api/admin/auth/logout", { method: "POST" }); } catch { /* session déjà morte */ }
  adminToken = ""; sessionStorage.removeItem("fleet_admin");
  show("view-admin-login");
  $("navLogout").classList.add("hidden");
};
async function entrerAdmin(role) {
  show("view-admin");
  $("navLogout").classList.remove("hidden");
  if (role) {
    $("aRole").textContent = role;
    $("aRole").style.background = role === "superadmin" ? "#7c3aed" : "#64748b";
    $("aRole").style.color = "#fff";
  }
  await Promise.all([chargerStats(), chargerComptes(), chargerPlansAdmin(), chargerPaiements(), chargerAudit(), chargerReglages(), chargerAdmins()]);
}
document.querySelectorAll("#adminTabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#adminTabs button").forEach((x) => x.classList.toggle("on", x === b));
  ["dash", "comptes", "forfaits", "paiements", "audit", "admins", "motdepasse", "reglages"].forEach((v) => $("a-" + v).classList.toggle("hidden", v !== b.dataset.v));
}));

// ---------- Indicateurs ----------
async function chargerStats() {
  const j = await call("/api/admin/stats", {});
  const c = j.comptes || {}, a = j.abonnements || {};
  const total = (Number(c.particuliers) || 0) + (Number(c.entreprises) || 0);
  const recettes = Number(j.recettesConfirmees || 0).toLocaleString("fr-FR");
  $("aQui").textContent = "admin";
  $("aStats").innerHTML = `
  <div class="kpi">
    <div class="kpi-card"><span class="kpi-n">${total}</span><span class="kpi-l">Comptes</span><small>${c.particuliers || 0} particuliers · ${c.entreprises || 0} entreprises</small></div>
    <div class="kpi-card ok"><span class="kpi-n">${c.actifs || 0}</span><span class="kpi-l">Actifs</span><small>suivi en service</small></div>
    <div class="kpi-card warn"><span class="kpi-n">${c.en_attente || 0}</span><span class="kpi-l">En attente</span><small>inscription · paiement · validation</small></div>
    <div class="kpi-card bad"><span class="kpi-n">${c.suspendus || 0}</span><span class="kpi-l">Suspendus</span><small>${c.expires || 0} expirés</small></div>
    <div class="kpi-card"><span class="kpi-n">${a.en_cours || 0}</span><span class="kpi-l">Abonnements en cours</span><small>${a.expirent_bientot || 0} expirent sous 14 jours</small></div>
    <div class="kpi-card warn"><span class="kpi-n">${j.paiementsAVefifier || 0}</span><span class="kpi-l">Paiements à vérifier</span><small>onglet Paiements</small></div>
    <div class="kpi-card ok"><span class="kpi-n">${recettes}</span><span class="kpi-l">Recettes confirmées</span><small>tous paiements validés</small></div>
  </div>`;
}

// ---------- Comptes abonnés ----------
async function chargerComptes() {
  const q = new URLSearchParams();
  if ($("fType").value) q.set("type", $("fType").value);
  if ($("fStatut").value) q.set("statut", $("fStatut").value);
  if ($("fQ").value.trim()) q.set("q", $("fQ").value.trim());
  const j = await call("/api/admin/comptes?" + q.toString(), {});
  $("aRows").innerHTML = (j.comptes || []).map((c) => {
    const nom = c.raison_sociale || ((c.prenom || "") + " " + (c.nom || "")).trim();
    const abo = c.abonnement ? `${c.abonnement.plan} (${c.abonnement.statut})` : "—";
    const pay = c.paiement ? `${c.paiement.montant} ${c.paiement.devise} · ${c.paiement.statut}` : "—";
    return `<tr><td><b>${nom}</b><br /><small>${c.username || ""} · ${c.telephone || ""} · ${c.nb_vehicules} véh.</small></td>
      <td>${c.type === "morale" ? "Entreprise" : "Particulier"}</td><td><b>${c.statut_compte}</b>${c.motif ? "<br /><small>" + c.motif + "</small>" : ""}</td>
      <td>${abo}<br />${pay}</td>
      <td><button data-act="valider" data-id="${c.id}" class="ghost">Valider</button> <button data-act="refuser" data-id="${c.id}" class="ghost">Refuser</button> <button data-act="suspendre" data-id="${c.id}" class="ghost">Suspendre</button> <button data-act="reactiver" data-id="${c.id}" class="ghost">Réactiver</button></td></tr>`;
  }).join("") || '<tr><td colspan="5">Aucun compte.</td></tr>';
  document.querySelectorAll("#aRows [data-act]").forEach((b) => (b.onclick = async () => {
    try {
      let motif = "";
      if (["refuser", "suspendre"].includes(b.dataset.act)) {
        motif = prompt("Motif (obligatoire) :") || "";
        if (!motif.trim()) return;
      }
      await call("/api/admin/comptes", { method: "PATCH", body: JSON.stringify({ ownerId: Number(b.dataset.id), action: b.dataset.act, motif }) });
      msg("compteMsg", "Action effectuée.", true);
      await chargerComptes(); await chargerStats();
    } catch (e) { msg("compteMsg", e.message); }
  }));
}
$("btnComptes").onclick = chargerComptes;

// ---------- Forfaits ----------
function resetPlanForm() {
  editingPlan = 0;
  $("plNom").value = ""; $("plType").value = "particulier"; $("plPrix").value = "";
  $("plDuree").value = "mensuel"; $("plLimite").value = ""; $("plGeo").value = "0";
}
async function chargerPlansAdmin() {
  const j = await call("/api/admin/forfaits", {});
  $("aPlans").innerHTML = (j.forfaits || []).map((p) => `<div style="border-bottom:1px solid #e2e8f0;padding:6px 0"><b>${p.nom}</b> (${p.type_compte}) — ${p.prix} ${p.devise}/${p.duree} · ${p.limite_vehicules == null ? "illimité" : p.limite_vehicules + " véh."}${p.georeperage ? " · zones" : ""} ${p.actif ? "" : "<i>(inactif)</i>"}<br /><button data-plan="${p.id}" class="ghost">Modifier</button> <button data-plan-actif="${p.id}" data-val="${p.actif ? 0 : 1}" class="ghost">${p.actif ? "Désactiver" : "Activer"}</button> <button data-plan-suppr="${p.id}" class="ghost">Supprimer</button></div>`).join("") || "<i>Aucun forfait.</i>";
  document.querySelectorAll("#aPlans [data-plan]").forEach((b) => (b.onclick = async () => {
    const p = (await call("/api/admin/forfaits", {})).forfaits.find((x) => x.id === Number(b.dataset.plan));
    if (!p) return;
    editingPlan = p.id; $("plNom").value = p.nom; $("plType").value = p.type_compte;
    $("plPrix").value = p.prix; $("plDuree").value = p.duree; $("plLimite").value = p.limite_vehicules ?? "";
    $("plGeo").value = p.georeperage ? "1" : "0";
    msg("planMsg", `Modification du forfait « ${p.nom} » — « Nouveau » pour annuler.`, true);
  }));
  document.querySelectorAll("#aPlans [data-plan-actif]").forEach((b) => (b.onclick = async () => {
    try {
      await call("/api/admin/forfaits", { method: "PATCH", body: JSON.stringify({ id: Number(b.dataset.planActif), actif: b.dataset.val === "1" }) });
      msg("planMsg", "Forfait mis à jour.", true);
      await chargerPlansAdmin();
    } catch (e) { msg("planMsg", e.message); }
  }));
  document.querySelectorAll("#aPlans [data-plan-suppr]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer définitivement ce forfait ? (Impossible s'il est lié à des abonnements.)")) return;
    try {
      await call("/api/admin/forfaits?id=" + b.dataset.planSuppr, { method: "DELETE" });
      if (editingPlan === Number(b.dataset.planSuppr)) resetPlanForm();
      msg("planMsg", "Forfait supprimé.", true);
      await chargerPlansAdmin();
    } catch (e) { msg("planMsg", e.message); }
  }));
}
$("btnPlanNew").onclick = () => { resetPlanForm(); msg("planMsg", "Nouveau forfait.", true); };
$("btnPlanSave").onclick = async () => {
  try {
    const body = { nom: $("plNom").value.trim(), type_compte: $("plType").value, prix: Number($("plPrix").value), duree: $("plDuree").value, limite_vehicules: $("plLimite").value === "" ? null : Number($("plLimite").value), georeperage: $("plGeo").value === "1" };
    if (editingPlan) {
      body.id = editingPlan;
      await call("/api/admin/forfaits", { method: "PATCH", body: JSON.stringify(body) });
      editingPlan = 0;
    } else {
      await call("/api/admin/forfaits", { method: "POST", body: JSON.stringify(body) });
    }
    msg("planMsg", "Forfait enregistré.", true);
    await chargerPlansAdmin();
  } catch (e) { msg("planMsg", e.message); }
};

// ---------- Paiements ----------
const LIB_STATUT_PAY = { a_verifier: ["À vérifier", "st-warn"], en_attente: ["En attente", "st-mut"], confirme: ["Confirmé", "st-ok"], refuse: ["Refusé", "st-bad"] };
const LIB_METHODE_PAY = { virement: "Virement", especes: "Espèces", passerelle: "En ligne", autre: "Autre" };
async function chargerPaiements() {
  const st = $("payStatut").value || "a_verifier";
  const j = await call("/api/admin/paiements?statut=" + st, {});
  const actions = st === "a_verifier";
  $("aPaysRows").innerHTML = (j.paiements || []).map((p) => {
    const abonne = p.raison_sociale || [p.prenom, p.nom].filter(Boolean).join(" ") || "—";
    const [libStatut, clsStatut] = LIB_STATUT_PAY[p.statut] || [p.statut, "st-mut"];
    return `<tr>
      <td style="white-space:nowrap">${fmtDate(p.created_at)}</td>
      <td><b>${abonne}</b><br /><small>${p.telephone || ""}</small></td>
      <td>${p.plan || "—"}</td>
      <td style="white-space:nowrap"><b>${p.montant} ${p.devise || ""}</b></td>
      <td>${LIB_METHODE_PAY[p.methode] || p.methode || "—"}</td>
      <td>${p.reference || "—"}</td>
      <td><span class="pill ${clsStatut}">${libStatut}</span></td>
      <td style="white-space:nowrap">${actions ? `<button data-pay="confirmer" data-id="${p.id}" class="ghost">Confirmer</button> <button data-pay="refuser" data-id="${p.id}" class="ghost">Refuser</button>` : ""}</td>
    </tr>`;
  }).join("") || '<tr><td colspan="8"><i>Aucun paiement.</i></td></tr>';
  document.querySelectorAll("#aPaysRows [data-pay]").forEach((b) => (b.onclick = async () => {
    try {
      const motif = b.dataset.pay === "refuser" ? prompt("Motif du refus :") || "" : "";
      await call("/api/admin/paiements", { method: "PATCH", body: JSON.stringify({ paymentId: Number(b.dataset.id), action: b.dataset.pay, motif }) });
      msg("payMsg", b.dataset.pay === "confirmer" ? "Paiement confirmé." : "Paiement refusé.", true);
      await chargerPaiements(); await chargerComptes(); await chargerStats();
    } catch (e) { msg("payMsg", e.message); }
  }));
}
$("btnPays").onclick = chargerPaiements;

// ---------- Journal ----------
async function chargerAudit() {
  const j = await call("/api/admin/audit", {});
  $("aAudit").innerHTML = (j.journal || []).map((a) => `<div style="border-bottom:1px solid #e2e8f0;padding:5px 0"><b>${a.action}</b> par ${a.admin || "?"} — ${a.cible_type || ""} ${a.cible_id || ""}<br /><small>${fmtDate(a.created_at)} · ${JSON.stringify(a.details || {})}</small></div>`).join("") || "<i>Vide.</i>";
}

// ---------- Réglages ----------
async function chargerReglages() {
  const j = await call("/api/admin/reglages", {});
  $("setAuto").checked = Boolean(j.activationAuto);
  $("setCouleurs").value = (j.couleurs || []).join("\n");
}
$("btnSettings").onclick = async () => {
  try {
    await call("/api/admin/reglages", { method: "PATCH", body: JSON.stringify({ activationAuto: $("setAuto").checked, couleurs: $("setCouleurs").value.split("\n") }) });
    msg("settingsMsg", "Réglages enregistrés.", true);
  } catch (e) { msg("settingsMsg", e.message); }
};
$("btnExpire").onclick = async () => {
  const j = await call("/api/admin/maintenance/expirations", { method: "POST" });
  alert(j.traites + " abonnement(s) expiré(s).");
  await chargerStats(); await chargerComptes();
};

// ---------- Administrateurs (superadmin) ----------
async function chargerAdmins() {
  try {
    const j = await call("/api/admin/admins", {});
    $("aAdmins").innerHTML = j.admins.map((a) => `<tr><td>${a.username}</td><td>${a.role}</td><td>${a.actif ? "oui" : "non"}</td><td>${new Date(a.created_at).toLocaleDateString("fr-DZ")}</td><td style="white-space:nowrap">
      <button data-adm="${a.id}" data-role="${a.role === "superadmin" ? "admin" : "superadmin"}" class="ghost">⇄ ${a.role === "superadmin" ? "admin" : "superadmin"}</button>
      <button data-adm="${a.id}" data-actif="${a.actif ? 0 : 1}" class="ghost">${a.actif ? "Désactiver" : "Activer"}</button>
      <button data-adm="${a.id}" data-reset="1" class="ghost">Nouv. MDP</button>
    </td></tr>`).join("") || `<tr><td colspan="5">Aucun administrateur.</td></tr>`;
  } catch (e) {
    $("aAdmins").innerHTML = `<tr><td colspan="5">${e.message} (réservé superadmin ?)</td></tr>`;
  }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest ? e.target.closest("button[data-adm]") : null;
  if (!b) return;
  const id = Number(b.dataset.adm);
  try {
    if (b.dataset.reset) {
      const pwd = window.prompt("Nouveau mot de passe pour cet admin (10+ caractères) :");
      if (!pwd) return;
      await call("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id, password: pwd }) });
      msg("adminsMsg", "Mot de passe redéfini.", true);
    } else if (b.dataset.role) {
      await call("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id, role: b.dataset.role }) });
      msg("adminsMsg", "Rôle mis à jour.", true);
    } else if (b.dataset.actif !== undefined) {
      await call("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id, actif: b.dataset.actif === "1" }) });
      msg("adminsMsg", "Statut mis à jour.", true);
    }
    await chargerAdmins();
  } catch (err) { msg("adminsMsg", err.message); }
});
$("btnAdminCreate").onclick = async () => {
  try {
    await call("/api/admin/admins", { method: "POST", body: JSON.stringify({ username: $("naUser").value.trim(), password: $("naPass").value, role: $("naRole").value }) });
    $("naUser").value = ""; $("naPass").value = "";
    msg("adminsMsg", "Administrateur créé.", true);
    await chargerAdmins();
  } catch (e) { msg("adminsMsg", e.message); }
};
$("btnAdminPw").onclick = async () => {
  try {
    await call("/api/admin/auth/password", { method: "POST", body: JSON.stringify({ ancienMotDePasse: $("pwAdmOld").value, nouveauMotDePasse: $("pwAdmNew").value }) });
    $("pwAdmOld").value = ""; $("pwAdmNew").value = "";
    msg("adminPwMsg", "Mot de passe redéfini, reconnectez-vous.", true);
  } catch (e) { msg("adminPwMsg", e.message); }
};
$("btnForgot").onclick = () => $("forgotBox").classList.toggle("hidden");

// ---------- Reprise de session ----------
if (sessionStorage.getItem("fleet_admin")) {
  (async () => {
    try {
      // La session est validée au premier appel ; afficher le rôle après.
      await entrerAdmin();
    } catch {
      sessionStorage.removeItem("fleet_admin");
    }
  })();
}
