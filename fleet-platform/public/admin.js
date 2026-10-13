/* Fleet Platform — espace administrateur (page dédiée /admin.html). */
// Session volontairement en mémoire seule : quitter l'onglet ou la page impose une reconnexion.
let adminToken = "";
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
    adminToken = j.token;
    entrerAdmin(j.role);
  } catch (e) { msg("adminMsg", e.message); }
};
$("btnForgot").onclick = () => $("forgotBox").classList.toggle("hidden");
$("navLogout").onclick = async () => {
  try { await call("/api/admin/auth/logout", { method: "POST" }); } catch { /* session déjà morte */ }
  adminToken = "";
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
  await Promise.all([chargerStats(), chargerComptes(), chargerPlansAdmin(), chargerPaiements(), chargerVols(), chargerAudit(), chargerReglages(), chargerAdmins()]);
}
document.querySelectorAll("#adminTabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#adminTabs button").forEach((x) => x.classList.toggle("on", x === b));
  ["dash", "comptes", "forfaits", "paiements", "vols", "carte", "audit", "admins", "motdepasse", "reglages"].forEach((v) => $("a-" + v).classList.toggle("hidden", v !== b.dataset.v));
  if (b.dataset.v === "carte") initAMap();
  if (b.dataset.v === "vols") marquerVolsVus();
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
      <td>${c.statut_compte === "suppression_demandee"
        ? `<button data-act="rejeter_suppression" data-id="${c.id}" class="ghost">Rejeter demande</button> <button data-act="supprimer_definitivement" data-id="${c.id}" class="ghost">Supprimer tout</button>`
        : `<button data-act="valider" data-id="${c.id}" class="ghost">Valider</button> <button data-act="refuser" data-id="${c.id}" class="ghost">Refuser</button> <button data-act="suspendre" data-id="${c.id}" class="ghost">Suspendre</button> <button data-act="reactiver" data-id="${c.id}" class="ghost">Réactiver</button>`}</td></tr>`;
  }).join("") || '<tr><td colspan="5">Aucun compte.</td></tr>';
  document.querySelectorAll("#aRows [data-act]").forEach((b) => (b.onclick = async () => {
    try {
      let motif = "";
      if (["refuser", "suspendre"].includes(b.dataset.act)) {
        motif = prompt("Motif (obligatoire) :") || "";
        if (!motif.trim()) return;
      }
      if (b.dataset.act === "supprimer_definitivement" && !confirm("Effacer DÉFINITIVEMENT ce compte et toutes ses données (véhicules, positions, historique, zones, paiements) ? Irréversible.")) return;
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

// ---------- Vols déclarés ----------
async function chargerVols() {
  try {
    const j = await call("/api/admin/vols", {});
    const vols = j.vols || [];
    const nonVus = vols.filter((v) => !v.vu_par_admin).length;
    $("tabVols").textContent = nonVus ? `Vols (${nonVus})` : "Vols";
    $("aVolsRows").innerHTML = vols.map((v) => {
      const abonne = v.raison_sociale || [v.prenom, v.nom].filter(Boolean).join(" ") || "—";
      const ouvert = v.status === "open";
      const pos = v.latitude != null
        ? `${Number(v.latitude).toFixed(4)}, ${Number(v.longitude).toFixed(4)}<br /><small>${v.speed || 0} km/h · ${fmtDate(v.position_at)}</small><br /><small><a href="https://www.openstreetmap.org/?mlat=${v.latitude}&mlon=${v.longitude}#map=15/${v.latitude}/${v.longitude}" target="_blank" rel="noopener">Voir sur OSM</a></small>`
        : "<i>aucune position</i>";
      return `<tr>
        <td><span class="pill ${ouvert ? "st-bad" : "st-mut"}">${ouvert ? "Ouvert" : "Résolu"}</span><br /><small>n° ${v.dossier} · ${fmtDate(v.reported_at)}</small></td>
        <td><b>${v.immatriculation}</b><br /><small>${[v.marque, v.modele, v.couleur].filter(Boolean).join(" ")}</small></td>
        <td><b>${abonne}</b><br /><small>${v.username || ""} · ${v.telephone || ""} · ${v.statut_compte || ""}</small></td>
        <td>${pos}</td>
        <td>${v.note || "—"}</td>
        <td style="white-space:nowrap"><button data-voir="${v.vehicle_id}" class="ghost">Voir carte</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="6"><i>Aucun vol signalé.</i></td></tr>';
    document.querySelectorAll("#aVolsRows [data-voir]").forEach((b) => (b.onclick = () => {
      document.querySelector('#adminTabs button[data-v="carte"]').click();
      setTimeout(() => {
        const sel = $("aVehSel");
        if ([...sel.options].some((o) => o.value === b.dataset.voir)) sel.value = b.dataset.voir;
        chargerItineraireAdmin();
      }, 120);
    }));
  } catch (e) {
    $("aVolsRows").innerHTML = `<tr><td colspan="6">${e.message}</td></tr>`;
  }
}
async function marquerVolsVus() {
  try {
    await call("/api/admin/vols/vus", { method: "POST", body: JSON.stringify({}) });
    $("tabVols").textContent = "Vols";
  } catch { /* pastille conservée */ }
}

// ---------- Carte admin : positions et itinéraires ----------
let amap = null, alayer = null, aline = null;
function fondsDeCarteAdmin() {
  return {
    "Plan (France)": L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap France | © OpenStreetMap", subdomains: "abc", maxZoom: 20 }),
    "Plan (monde)": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }),
    "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Imagerie © Esri, Maxar, Earthstar Geographics", maxZoom: 19 }),
    "Relief": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { attribution: "© OpenTopoMap (CC-BY-SA) | © OpenStreetMap", subdomains: "abc", maxZoom: 17 }),
    "Clair": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: "© OpenStreetMap | © CARTO", subdomains: "abcd", maxZoom: 20 })
  };
}
function initAMap() {
  if (amap) { setTimeout(() => amap.invalidateSize(), 80); return; }
  amap = L.map("amap").setView([35.8, 3.0], 6);
  const fonds = fondsDeCarteAdmin();
  fonds["Plan (France)"].addTo(amap);
  L.control.layers(fonds).addTo(amap);
  alayer = L.layerGroup().addTo(amap);
  aline = L.layerGroup().addTo(amap);
  const fin = new Date(), debut = new Date(Date.now() - 24 * 3600 * 1000);
  $("aFin").value = fin.toISOString().slice(0, 16);
  $("aDebut").value = debut.toISOString().slice(0, 16);
  setTimeout(() => amap.invalidateSize(), 80);
  chargerVehiculesAdmin();
}
async function chargerVehiculesAdmin() {
  try {
    const q = new URLSearchParams();
    if ($("aVehVoles").checked) q.set("vole", "1");
    if ($("aVehHorsZone").checked) q.set("horsZone", "1");
    if ($("aVehQ").value.trim()) q.set("q", $("aVehQ").value.trim());
    const j = await call("/api/admin/vehicules?" + q.toString(), {});
    const liste = j.vehicules || [];
    $("aVehSel").innerHTML = liste.map((v) => {
      const flags = `${v.vol_ouvert || v.is_stolen ? "🚨 " : ""}${(v.zones_hors || []).length ? "⚠️ hors zone " : ""}`;
      const abonne = v.raison_sociale || [v.prenom, v.nom].filter(Boolean).join(" ") || "";
      return `<option value="${v.id}">${flags}${v.immatriculation} — ${abonne}</option>`;
    }).join("") || '<option value="">— aucun véhicule —</option>';
    alayer.clearLayers();
    const bounds = [];
    for (const v of liste) {
      if (v.latitude == null) continue;
      const vole = v.vol_ouvert || v.is_stolen;
      const hz = (v.zones_hors || []).length > 0;
      const couleur = vole ? "#dc2626" : hz ? "#f59e0b" : "#16a34a";
      const abonne = v.raison_sociale || [v.prenom, v.nom].filter(Boolean).join(" ") || "";
      L.marker([v.latitude, v.longitude], {
        icon: L.divIcon({ className: "", html: `<div style="width:18px;height:18px;border-radius:999px;background:${couleur};border:2px solid #fff;box-shadow:0 1px 4px #0006"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
      }).addTo(alayer).bindPopup(`<b>${v.immatriculation}</b>${vole ? " 🚨 VOL" : ""}${hz ? " ⚠️ hors zone" : ""}<br />${[v.marque, v.modele, v.couleur].filter(Boolean).join(" ")}<br />${abonne} · ${v.telephone || ""}<br />${v.speed || 0} km/h · ${fmtDate(v.position_at)}${hz ? "<br />Hors : " + v.zones_hors.join(", ") : ""}`);
      bounds.push([v.latitude, v.longitude]);
    }
    if (bounds.length > 1) amap.fitBounds(bounds, { padding: [20, 20] });
    else if (bounds.length === 1) amap.setView(bounds[0], 13);
    $("aItInfo").textContent = `${liste.length} véhicule(s) affiché(s) · 🔴 volé · 🟠 hors zone · 🟢 en règle.`;
  } catch (e) { $("aItInfo").textContent = e.message; }
}
$("btnAVeh").onclick = chargerVehiculesAdmin;
async function chargerItineraireAdmin() {
  const id = $("aVehSel").value;
  if (!id) { $("aItInfo").textContent = "Choisissez un véhicule."; return; }
  try {
    const q = new URLSearchParams({ vehicleId: id, limit: "3000" });
    if ($("aDebut").value) q.set("debut", new Date($("aDebut").value).toISOString());
    if ($("aFin").value) q.set("fin", new Date($("aFin").value).toISOString());
    const j = await call("/api/admin/positions?" + q.toString(), {});
    $("aItInfo").textContent = `${j.vehicule.immatriculation} : ${(j.points || []).length} positions · ${j.distanceKm} km · du ${fmtDate(j.debut)} au ${fmtDate(j.fin)}`;
    aline.clearLayers();
    const line = (j.points || []).map((p) => [p.latitude, p.longitude]);
    if (line.length >= 2) {
      L.polyline(line, { color: j.vehicule.is_stolen ? "#dc2626" : "#0f3d2e", weight: 4 }).addTo(aline);
      const d = line[0], f = line[line.length - 1];
      L.marker(d).addTo(aline).bindPopup("Départ<br />" + fmtDate(j.points[0].recorded_at));
      L.marker(f).addTo(aline).bindPopup("Arrivée<br />" + fmtDate(j.points[j.points.length - 1].recorded_at));
      amap.fitBounds(line, { padding: [20, 20] });
    } else if (line.length === 1) amap.setView(line[0], 13);
  } catch (e) { $("aItInfo").textContent = e.message; }
}
$("btnAItineraire").onclick = chargerItineraireAdmin;

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
