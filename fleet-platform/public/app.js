/* Fleet Platform — tableau de bord + espace admin (données persistantes). */
let token = localStorage.getItem("fleet_token") || "";
let adminToken = sessionStorage.getItem("fleet_admin") || "";
let typeCompte = "particulier";
let profil = null;
let statut = null;
let vehicles = [];
let zones = [];
let map = null, layer = null, pollT = null;
let zmap = null, zlayer = null, zdraft = null, zVertices = [], zCentre = null;
let editingPlan = 0;
const $ = (id) => document.getElementById(id);
const OFFLINE_MIN = 10;

const MARQUES = {
  Renault: ["Clio", "Symbol", "Duster", "Master", "Kangoo", "Captur"],
  Peugeot: ["208", "301", "2008", "Partner", "Boxer"],
  Dacia: ["Logan", "Sandero", "Duster", "Dokker"],
  Hyundai: ["Accent", "Tucson", "H-1", "Creta"],
  Toyota: ["Corolla", "Hilux", "Land Cruiser", "Hiace"],
  Kia: ["Picanto", "Rio", "Sportage", "K2500"],
  Volkswagen: ["Polo", "Caddy", "Transporter", "Amarok"],
  Fiat: ["500", "Doblo", "Ducato", "Tipo"],
  Skoda: ["Fabia", "Octavia", "Kodiaq"],
  Nissan: ["Micra", "Sunny", "Navara", "Patrol"],
  Suzuki: ["Swift", "Vitara", "Jimny"],
  Chery: ["Tiggo", "Arrizo", "QQ"],
  Chevrolet: ["Aveo", "Spark", "Niva"],
  MAN: ["TGS", "TGX", "TGL"],
  "Mercedes-Benz": ["Actros", "Atego", "Sprinter"],
  Volvo: ["FH", "FM", "FMX"],
  Scania: ["R", "P", "G"],
  Iveco: ["Daily", "Stralis", "Eurocargo"],
  Caterpillar: ["Chargeuse 950", "Pelle 320", "Niveleuse 120"],
  Komatsu: ["Pelle PC210", "Chargeuse WA380", "Bull D65"],
  Autre: ["Autre modèle"]
};

function hAuth() { return token ? { Authorization: "Bearer " + token } : {}; }
function hAdmin() { return adminToken ? { Authorization: "Bearer " + adminToken } : {}; }

async function call(path, options = {}, admin = false) {
  const r = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(admin ? hAdmin() : hAuth()), ...(options.headers || {}) } });
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

// ---------- Navigation ----------
const VIEWS = ["view-home", "view-auth", "view-app", "view-admin-login", "view-admin"];
function show(id) { VIEWS.forEach((v) => $(v).classList.add("hidden")); $(id).classList.remove("hidden"); }
function showAppTab(name) {
  document.querySelectorAll("#appTabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === name));
  ["vehicules", "carte", "historique", "zones", "profil"].forEach((v) => $("v-" + v).classList.toggle("hidden", v !== name));
  if (name === "carte" && map) setTimeout(() => map.invalidateSize(), 60);
  if (name === "zones") initZMap();
}
document.querySelectorAll("#appTabs button").forEach((b) => (b.onclick = () => showAppTab(b.dataset.v)));
$("navHome").onclick = () => { show("view-home"); };
$("navAdmin").onclick = () => { adminToken ? entrerAdmin() : show("view-admin-login"); };
$("navLogout").onclick = () => { token = ""; localStorage.removeItem("fleet_token"); stopPoll(); show("view-home"); $("navLogout").classList.add("hidden"); };
function showAuth(mode) {
  show("view-auth");
  const login = mode === "login";
  $("authTitle").textContent = login ? "Connexion" : "Inscription";
  $("loginBox").classList.toggle("hidden", !login);
  $("registerBox").classList.toggle("hidden", login);
  if (!login) chargerPlans();
}
document.querySelectorAll('input[name="typeCompte"]').forEach((r) => (r.onchange = () => { typeCompte = document.querySelector('input[name="typeCompte"]:checked').value; }));
$("btnGoLogin").onclick = () => showAuth("login");
$("btnGoRegister").onclick = () => { $("regType").value = typeCompte; majRegType(); showAuth("register"); };
$("regType").onchange = majRegType;
function majRegType() {
  const ent = $("regType").value === "entreprise";
  $("regParticulier").classList.toggle("hidden", ent);
  $("regEntreprise").classList.toggle("hidden", !ent);
  chargerPlans();
}
async function chargerPlans() {
  try {
    const j = await call("/api/fleet/plans?type=" + $("regType").value);
    $("regPlan").innerHTML = '<option value="">— Choisir plus tard —</option>' + (j.forfaits || []).map((p) => `<option value="${p.id}">${p.nom} — ${p.prix} ${p.devise} (${p.duree})</option>`).join("");
  } catch { /* hors ligne */ }
}

// ---------- Auth ----------
$("btnLogin").onclick = async () => {
  try {
    const j = await call("/api/proprietaires/auth/login", { method: "POST", body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value }) });
    token = j.token; localStorage.setItem("fleet_token", token);
    msg("authMsg", "Connecté.", true);
    await entrerApp();
  } catch (e) { msg("authMsg", e.message); }
};
$("btnRegister").onclick = async () => {
  try {
    const ent = $("regType").value === "entreprise";
    const body = {
      username: $("regUser").value.trim(), password: $("regPass").value, typeCompte: $("regType").value,
      telephone: ent ? $("regCTel").value.trim() : $("regTel").value.trim(),
      wilaya: ent ? $("regCWilaya").value.trim() : $("regWilaya").value.trim(),
      planId: $("regPlan").value ? Number($("regPlan").value) : undefined,
      methodePaiement: $("regMethode").value
    };
    if (ent) { body.raisonSociale = $("regRaison").value.trim(); body.nom = $("regCNom").value.trim(); body.prenom = $("regCPrenom").value.trim(); body.email = $("regEmail").value.trim(); }
    else { body.nom = $("regNom").value.trim(); body.prenom = $("regPrenom").value.trim(); }
    const j = await call("/api/proprietaires/auth/register", { method: "POST", body: JSON.stringify(body) });
    token = j.token; localStorage.setItem("fleet_token", token);
    msg("authMsg", "Compte créé : inscription reçue. Choisissez un forfait dans Profil si besoin.", true);
    await entrerApp();
  } catch (e) { msg("authMsg", e.message); }
};

async function entrerApp() {
  show("view-app"); $("navLogout").classList.remove("hidden");
  await refreshProfil(); await loadVehicles(); initMap(); startPoll();
  showAppTab("vehicules");
}
async function refreshProfil() {
  const j = await call("/api/proprietaires/profil");
  profil = j.proprietaire; statut = j;
  const nom = profil.raisonSociale || ((profil.prenom || "") + " " + (profil.nom || "")).trim() || "—";
  $("qui").textContent = nom + (profil.type === "morale" ? " (entreprise)" : "");
  const pill = j.actif ? '<span class="pill p-actif">Actif</span>' : '<span class="pill p-att">Non activé</span>';
  $("statutCompte").innerHTML = pill;
  const s = j.abonnement;
  $("statutDetail").textContent = s
    ? `Compte : ${profil.statutCompte} · Forfait ${s.plan} (${s.statut})` + (s.fin ? ` · jusqu’au ${fmtDate(s.fin)}` : "")
    : `Compte : ${profil.statutCompte} · aucun forfait — choisissez-en un dans Profil.`;
  $("subBox").innerHTML = s
    ? `<b>${s.plan}</b> — ${s.statut} · ${s.prix} ${s.devise}` + (s.fin ? ` · fin : ${fmtDate(s.fin)}` : "")
    : "Aucun abonnement.";
  $("pNom").value = profil.nom || ""; $("pPrenom").value = profil.prenom || "";
  $("pTel").value = profil.telephone || ""; $("pEmail").value = profil.email || "";
  const abo = j.abonnement;
  $("zoneNoPlan").classList.toggle("hidden", Boolean(abo && abo.georeperage));
  chargerPlansProfil();
}
async function chargerPlansProfil() {
  try {
    const type = profil.type === "morale" ? "entreprise" : "particulier";
    const j = await call("/api/fleet/plans?type=" + type);
    $("planSel").innerHTML = (j.forfaits || []).map((p) => `<option value="${p.id}">${p.nom} — ${p.prix} ${p.devise} (${p.duree}, ${p.limite_vehicules == null ? "illimité" : p.limite_vehicules + " véh."}${p.georeperage ? ", zones" : ""})</option>`).join("");
  } catch { /* */ }
}
$("btnChoisirPlan").onclick = () => $("planBox").classList.toggle("hidden");
$("btnSouscrire").onclick = async () => {
  try {
    await call("/api/fleet/abonnement", { method: "POST", body: JSON.stringify({ planId: Number($("planSel").value), methode: $("planMethode").value }) });
    msg("profilMsg", "Forfait souscrit : réglez puis déclarez votre paiement.", true);
    await refreshProfil();
  } catch (e) { msg("profilMsg", e.message); }
};
$("btnDeclarerPaiement").onclick = async () => {
  const ref = prompt("Référence du virement / justificatif (optionnel) :") || "";
  try {
    await call("/api/fleet/paiement/declarer", { method: "POST", body: JSON.stringify({ reference: ref }) });
    msg("profilMsg", "Paiement transmis pour vérification.", true);
    await refreshProfil();
  } catch (e) { msg("profilMsg", e.message); }
};
$("btnSaveProfil").onclick = async () => {
  try {
    await call("/api/proprietaires/profil", { method: "PATCH", body: JSON.stringify({ nom: $("pNom").value, prenom: $("pPrenom").value, telephone: $("pTel").value, email: $("pEmail").value }) });
    msg("profilMsg", "Profil enregistré.", true); await refreshProfil();
  } catch (e) { msg("profilMsg", e.message); }
};
$("btnPw").onclick = async () => {
  try {
    await call("/api/proprietaires/profil", { method: "PATCH", body: JSON.stringify({ ancienMotDePasse: $("pwOld").value, nouveauMotDePasse: $("pwNew").value }) });
    msg("profilMsg", "Mot de passe changé.", true); $("pwOld").value = ""; $("pwNew").value = "";
  } catch (e) { msg("profilMsg", e.message); }
};

// ---------- Notifications ----------
$("btnNotif").onclick = async () => {
  const box = $("notifList");
  if (!box.classList.contains("hidden")) { box.classList.add("hidden"); return; }
  try {
    const j = await call("/api/proprietaires/notifications");
    box.innerHTML = (j.notifications || []).map((n) => `<div style="border-bottom:1px solid #e2e8f0;padding:6px 0"><b>${n.titre}</b><br />${n.corps || ""}<br /><small>${fmtDate(n.created_at)}</small></div>`).join("") || "<i>Aucune notification</i>";
    box.classList.remove("hidden");
    $("notifN").textContent = j.nonLues || 0;
    if ((j.nonLues || 0) > 0) await call("/api/proprietaires/notifications", { method: "PATCH" }).catch(() => {});
  } catch (e) { box.innerHTML = e.message; box.classList.remove("hidden"); }
};

// ---------- Véhicules ----------
function statutVehicule(v) {
  if (!v.live) return { txt: "Hors ligne", cls: "d-off" };
  const ageMin = (Date.now() - new Date(v.live.recordedAt).getTime()) / 60000;
  if (ageMin > OFFLINE_MIN) return { txt: "Hors ligne", cls: "d-off" };
  if ((v.live.speed || 0) >= 5) return { txt: "En mouvement", cls: "d-move" };
  return { txt: "À l’arrêt", cls: "d-stop" };
}
async function loadVehicles() {
  try {
    const j = await call("/api/fleet/live");
    vehicles = j.vehicules || [];
  } catch (e) {
    if (e.status === 403) { $("rows").innerHTML = `<tr><td colspan="5">${e.message}</td></tr>`; return; }
    throw e;
  }
  $("count").textContent = vehicles.length;
  $("rows").innerHTML = vehicles.map((v) => {
    const s = statutVehicule(v);
    const pos = v.live ? `${v.live.latitude.toFixed(4)}, ${v.live.longitude.toFixed(4)}<br /><small>${v.live.speed || 0} km/h · ${fmtDate(v.live.recordedAt)}</small>` : "—";
    return `<tr>
      <td><b>${v.immatriculation}</b><br /><small>${[v.marque, v.modele, v.couleur].filter(Boolean).join(" ")}${v.nomInterne ? " · " + v.nomInterne : ""}</small></td>
      <td><span class="dot ${s.cls}"></span>${s.txt}</td>
      <td>${v.chauffeur ? (v.chauffeur.prenom || "") + " " + (v.chauffeur.nom || "") : "—"}</td>
      <td class="${v.isStolen ? "stolen" : ""}">${v.isStolen ? "VOL DÉCLARÉ" : "OK"}</td>
      <td><button data-edit="${v.id}" class="ghost">Gérer</button> <button data-theft="${v.id}" class="ghost">${v.isStolen ? "Résoudre" : "Vol"}</button></td>
    </tr>`;
  }).join("") || '<tr><td colspan="5" style="color:#999">Aucun véhicule. Ajoutez-en un ci-dessous.</td></tr>';
  $("hVeh").innerHTML = vehicles.map((v) => `<option value="${v.id}">${v.immatriculation}</option>`).join("");
  $("zVeh").innerHTML = '<option value="">Tous</option>' + vehicles.map((v) => `<option value="${v.id}">${v.immatriculation}</option>`).join("");
  drawLive();
}
$("btnReload").onclick = () => loadVehicles().catch((e) => msg("vehMsg", e.message));
function remplirMarques(selM = "", selMo = "") {
  $("vehMarque").innerHTML = Object.keys(MARQUES).map((m) => `<option ${m === selM ? "selected" : ""}>${m}</option>`).join("");
  remplirModeles(selMo);
}
function remplirModeles(sel = "") {
  const modeles = MARQUES[$("vehMarque").value] || ["—"];
  $("vehModele").innerHTML = modeles.map((m) => `<option ${m === sel ? "selected" : ""}>${m}</option>`).join("");
}
$("vehMarque").onchange = () => remplirModeles();
$("btnAddVeh").onclick = () => {
  ["vehId", "vehImmat", "vehVin", "vehSerial", "vehAnnee", "vehCouleur", "vehLong", "vehLarg", "vehHaut", "vehTel1", "vehTel2", "vehNomInt", "vehService", "vehResp"].forEach((id) => ($(id).value = ""));
  $("vehCat").value = "leger"; remplirMarques();
  $("vehFormTitle").textContent = "Nouveau véhicule";
  $("btnDelVeh").classList.add("hidden");
  $("vehFormCard").classList.remove("hidden");
};
$("btnCancelVeh").onclick = () => $("vehFormCard").classList.add("hidden");
$("btnSaveVeh").onclick = async () => {
  const body = {
    immatriculation: $("vehImmat").value.trim(), marque: $("vehMarque").value, modele: $("vehModele").value,
    couleur: $("vehCouleur").value.trim(), categorieVehicule: $("vehCat").value,
    annee: $("vehAnnee").value ? Number($("vehAnnee").value) : undefined,
    vin: $("vehVin").value.trim() || undefined,
    longueur: $("vehLong").value ? Number($("vehLong").value) : undefined,
    largeur: $("vehLarg").value ? Number($("vehLarg").value) : undefined,
    hauteur: $("vehHaut").value ? Number($("vehHaut").value) : undefined,
    telPrincipal: $("vehTel1").value.trim() || undefined, telSecondaire: $("vehTel2").value.trim() || undefined,
    nomInterne: $("vehNomInt").value.trim() || undefined, service: $("vehService").value.trim() || undefined,
    responsable: $("vehResp").value.trim() || undefined
  };
  try {
    if ($("vehId").value) {
      body.id = Number($("vehId").value);
      await call("/api/proprietaires/vehicules", { method: "PATCH", body: JSON.stringify(body) });
    } else {
      body.numeroSerie = $("vehSerial").value.trim() || undefined;
      const j = await call("/api/proprietaires/vehicules", { method: "POST", body: JSON.stringify(body) });
      $("vehSerial").value = j.vehicule.numeroSerie || "";
    }
    msg("vehMsg", "Enregistré.", true);
    $("vehFormCard").classList.add("hidden");
    await loadVehicles();
  } catch (e) { msg("vehMsg", e.message); }
};
$("btnDelVeh").onclick = async () => {
  if (!confirm("Supprimer ce véhicule et tout son historique ?")) return;
  try {
    await call("/api/proprietaires/vehicules?id=" + $("vehId").value, { method: "DELETE" });
    $("vehFormCard").classList.add("hidden"); await loadVehicles();
  } catch (e) { msg("vehMsg", e.message); }
};
document.addEventListener("click", async (e) => {
  const edit = e.target.dataset?.edit, theft = e.target.dataset?.theft;
  if (edit) {
    const v = (await call("/api/fleet/live")).vehicules.find((x) => x.id === Number(edit));
    if (!v) return;
    $("vehId").value = v.id; $("vehImmat").value = v.immatriculation || "";
    $("vehSerial").value = v.numeroSerie || "";
    $("vehCat").value = v.categorieVehicule || "leger"; remplirMarques(v.marque || "", v.modele || "");
    $("vehAnnee").value = v.annee || ""; $("vehCouleur").value = v.couleur || "";
    $("vehVin").value = v.vin || "";
    $("vehLong").value = v.longueur || ""; $("vehLarg").value = v.largeur || ""; $("vehHaut").value = v.hauteur || "";
    $("vehTel1").value = v.telPrincipal || ""; $("vehTel2").value = v.telSecondaire || "";
    $("vehNomInt").value = v.nomInterne || ""; $("vehService").value = v.service || ""; $("vehResp").value = v.responsable || "";
    $("vehFormTitle").textContent = "Véhicule " + v.immatriculation;
    $("btnDelVeh").classList.remove("hidden");
    $("vehFormCard").classList.remove("hidden");
    showAppTab("vehicules");
    window.scrollTo(0, document.body.scrollHeight);
  }
  if (theft) {
    const isStolen = e.target.textContent.includes("Résoudre");
    try {
      if (isStolen) await call("/api/fleet/theft/resolve", { method: "POST", body: JSON.stringify({ vehicleId: Number(theft) }) });
      else if (confirm("Déclarer ce véhicule volé ?")) {
        await call("/api/fleet/theft/report", { method: "POST", body: JSON.stringify({ vehicleId: Number(theft), share: true, dureeJours: 7 }) });
      } else return;
      await loadVehicles();
    } catch (err) { msg("vehMsg", err.message); }
  }
});

// ---------- Carte temps réel (positions réelles des dispositifs) ----------
function initMap() {
  if (map) return;
  map = L.map("map").setView([35.8, 3.0], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap France | © OpenStreetMap", subdomains: "abc", maxZoom: 20 }).addTo(map);
  layer = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(), 80);
}
function drawLive() {
  if (!map || !layer) return;
  layer.clearLayers();
  const bounds = [];
  for (const v of vehicles) {
    if (!v.live) continue;
    const s = statutVehicule(v);
    const couleur = s.cls === "d-move" ? "#16a34a" : s.cls === "d-stop" ? "#f59e0b" : "#94a3b8";
    L.marker([v.live.latitude, v.live.longitude], {
      icon: L.divIcon({ className: "", html: `<div style="width:18px;height:18px;border-radius:999px;background:${couleur};border:2px solid #fff;box-shadow:0 1px 4px #0006"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
    }).addTo(layer).bindPopup(`<b>${v.immatriculation}</b><br />${s.txt} · ${v.live.speed || 0} km/h<br />${fmtDate(v.live.recordedAt)}`);
    bounds.push([v.live.latitude, v.live.longitude]);
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [20, 20] });
  else if (bounds.length === 1) map.setView(bounds[0], 13);
}
function startPoll() { stopPoll(); pollT = setInterval(() => { if (!$("view-app").classList.contains("hidden")) loadVehicles().catch(() => {}); }, 10000); }
function stopPoll() { if (pollT) clearInterval(pollT); pollT = null; }

// ---------- Historique ----------
$("btnHist").onclick = async () => {
  if (!$("hVeh").value) { $("hInfo").textContent = "Aucun véhicule."; return; }
  try {
    const q = new URLSearchParams({ vehicleId: $("hVeh").value, limit: "3000" });
    if ($("hDebut").value) q.set("debut", new Date($("hDebut").value).toISOString());
    if ($("hFin").value) q.set("fin", new Date($("hFin").value).toISOString());
    const j = await call("/api/fleet/history?" + q.toString());
    $("hInfo").textContent = `${(j.points || []).length} positions · ${j.distanceKm} km · du ${fmtDate(j.debut)} au ${fmtDate(j.fin)}`;
    showAppTab("carte");
    layer.clearLayers();
    const line = (j.points || []).map((p) => [p.latitude, p.longitude]);
    if (line.length >= 2) {
      L.polyline(line, { color: "#0f3d2e", weight: 4 }).addTo(layer);
      map.fitBounds(line, { padding: [20, 20] });
    }
  } catch (e) { $("hInfo").textContent = e.message; }
};

// ---------- Zones ----------
function initZMap() {
  if (zmap) { setTimeout(() => zmap.invalidateSize(), 80); return; }
  zmap = L.map("zmap").setView([35.8, 3.0], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap France | © OpenStreetMap", subdomains: "abc", maxZoom: 20 }).addTo(zmap);
  zlayer = L.layerGroup().addTo(zmap);
  zdraft = L.layerGroup().addTo(zmap);
  zmap.on("click", (e) => {
    if ($("zType").value === "cercle") {
      zCentre = [e.latlng.lat, e.latlng.lng];
      zdraft.clearLayers();
      L.circle(zCentre, { radius: Number($("zRayon").value) || 500, color: "#1d4ed8" }).addTo(zdraft);
    } else {
      zVertices.push([e.latlng.lat, e.latlng.lng]);
      zdraft.clearLayers();
      zVertices.forEach((p) => L.circleMarker(p, { radius: 5, color: "#1d4ed8" }).addTo(zdraft));
      if (zVertices.length >= 3) L.polygon(zVertices, { color: "#1d4ed8" }).addTo(zdraft);
    }
  });
  setTimeout(() => zmap.invalidateSize(), 80);
  chargerZones();
}
$("btnZTerminer").onclick = () => { zVertices = []; if (zdraft) zdraft.clearLayers(); };
$("zType").onchange = () => { zVertices = []; zCentre = null; if (zdraft) zdraft.clearLayers(); };
$("btnZCreer").onclick = async () => {
  try {
    const body = { nom: $("zNom").value.trim(), type: $("zType").value };
    if (body.type === "cercle") {
      if (!zCentre) throw new Error("Cliquez la carte pour placer le centre.");
      body.centreLat = zCentre[0]; body.centreLon = zCentre[1]; body.rayonM = Number($("zRayon").value) || 500;
    } else {
      if (zVertices.length < 3) throw new Error("Ajoutez au moins 3 sommets, puis créez.");
      body.points = zVertices;
    }
    await call("/api/fleet/geofences", { method: "POST", body: JSON.stringify(body) });
    zVertices = []; zCentre = null; zdraft.clearLayers(); $("zNom").value = "";
    await chargerZones();
  } catch (e) { alert(e.message); }
};
async function chargerZones() {
  try {
    const j = await call("/api/fleet/geofences");
    zones = j.zones || [];
  } catch (e) {
    $("zList").innerHTML = e.status === 403 ? e.message : "Erreur de chargement.";
    return;
  }
  zlayer.clearLayers();
  zones.forEach((z) => {
    if (z.type === "cercle" && z.centre_lat != null) L.circle([z.centre_lat, z.centre_lon], { radius: z.rayon_m, color: "#16a34a" }).addTo(zlayer).bindPopup(z.nom);
    else if (z.points) L.polygon(typeof z.points === "string" ? JSON.parse(z.points) : z.points, { color: "#16a34a" }).addTo(zlayer).bindPopup(z.nom);
  });
  $("zList").innerHTML = zones.map((z) => {
    const boxes = vehicles.map((v) => {
      const on = (z.vehicules || []).some((a) => a.vehicle_id === v.id && a.actif);
      return `<label style="flex-direction:row;align-items:center;gap:4px"><input type="checkbox" data-zone="${z.id}" data-veh="${v.id}" ${on ? "checked" : ""} style="width:auto" /> ${v.immatriculation}</label>`;
    }).join("");
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:6px"><b>${z.nom}</b> (${z.type}) ${z.actif ? "" : "<i>inactif</i>"}<br />${boxes}<br /><button data-zdel="${z.id}" class="ghost">Supprimer</button></div>`;
  }).join("") || "<i>Aucune zone.</i>";
  document.querySelectorAll("#zList input[type=checkbox]").forEach((c) => (c.onchange = async () => {
    await call("/api/fleet/geofences/assigner", { method: "POST", body: JSON.stringify({ geofenceId: Number(c.dataset.zone), vehicleId: Number(c.dataset.veh), actif: c.checked }) });
  }));
  document.querySelectorAll("#zList [data-zdel]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Supprimer cette zone ?")) return;
    await call("/api/fleet/geofences?id=" + b.dataset.zdel, { method: "DELETE" });
    await chargerZones();
  }));
}
$("btnZEvents").onclick = async () => {
  try {
    const q = new URLSearchParams({ limit: "200" });
    if ($("zVeh").value) q.set("vehicleId", $("zVeh").value);
    const j = await call("/api/fleet/geofence-events?" + q.toString());
    $("zEvents").innerHTML = (j.evenements || []).map((e) => `<div>${e.type === "entree" ? "➡️ Entrée" : "⬅️ Sortie"} — <b>${e.immatriculation}</b> · ${e.zone} · ${fmtDate(e.occurred_at)}</div>`).join("") || "<i>Aucun événement.</i>";
  } catch (e) { $("zEvents").textContent = e.message; }
};

// ---------- Admin ----------
$("btnAdminLogin").onclick = async () => {
  try {
    const j = await call("/api/admin/auth/login", { method: "POST", body: JSON.stringify({ username: $("aUser").value.trim(), password: $("aPass").value, code: $("aCode").value.trim() }) }, true);
    adminToken = j.token; sessionStorage.setItem("fleet_admin", adminToken);
    entrerAdmin();
  } catch (e) { msg("adminMsg", e.message); }
};
async function entrerAdmin() {
  show("view-admin");
  await Promise.all([chargerStats(), chargerComptes(), chargerPlansAdmin(), chargerPaiements(), chargerAudit(), chargerReglages(), chargerAdmins()]);
}
async function chargerAdmins() {
  try {
    const j = await call("/api/admin/admins", {}, true);
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
      await call("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id, password: pwd }) }, true);
      msg("adminsMsg", "Mot de passe redéfini.", true);
    } else if (b.dataset.role) {
      await call("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id, role: b.dataset.role }) }, true);
      msg("adminsMsg", "Rôle mis à jour.", true);
    } else if (b.dataset.actif !== undefined) {
      await call("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id, actif: b.dataset.actif === "1" }) }, true);
      msg("adminsMsg", "Statut mis à jour.", true);
    }
    await chargerAdmins();
  } catch (err) { msg("adminsMsg", err.message); }
});
document.addEventListener("DOMContentLoaded", () => {
  const btnF = document.getElementById("btnForgot");
  if (btnF) btnF.onclick = () => document.getElementById("forgotBox").classList.toggle("hidden");
  const btnC = document.getElementById("btnAdminCreate");
  if (btnC) btnC.onclick = async () => {
    try {
      await call("/api/admin/admins", { method: "POST", body: JSON.stringify({ username: $("naUser").value.trim(), password: $("naPass").value, role: $("naRole").value }) }, true);
      $("naUser").value = ""; $("naPass").value = "";
      msg("adminsMsg", "Administrateur créé.", true);
      await chargerAdmins();
    } catch (e) { msg("adminsMsg", e.message); }
  };
  const btnP = document.getElementById("btnAdminPw");
  if (btnP) btnP.onclick = async () => {
    try {
      await call("/api/admin/auth/password", { method: "POST", body: JSON.stringify({ ancienMotDePasse: $("pwAdmOld").value, nouveauMotDePasse: $("pwAdmNew").value }) }, true);
      $("pwAdmOld").value = ""; $("pwAdmNew").value = "";
      msg("adminPwMsg", "Mot de passe redéfini, reconnectez-vous.", true);
    } catch (e) { msg("adminPwMsg", e.message); }
  };
});
document.querySelectorAll("#adminTabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#adminTabs button").forEach((x) => x.classList.toggle("on", x === b));
  ["dash", "comptes", "forfaits", "paiements", "audit", "admins", "motdepasse", "reglages"].forEach((v) => $("a-" + v).classList.toggle("hidden", v !== b.dataset.v));
}));
async function chargerStats() {
  const j = await call("/api/admin/stats", {}, true);
  $("aQui").textContent = "admin";
  $("aStats").innerHTML = `Comptes : <b>${j.comptes.particuliers}</b> particuliers · <b>${j.comptes.entreprises}</b> entreprises · <b>${j.comptes.en_attente}</b> en attente<br />Actifs : <b>${j.comptes.actifs}</b> · Suspendus : <b>${j.comptes.suspendus}</b> · Expirés : <b>${j.comptes.expires}</b><br />Abonnements en cours : <b>${j.abonnements.en_cours}</b> · expirent bientôt : <b>${j.abonnements.expirent_bientot}</b><br />Paiements à vérifier : <b>${j.paiementsAVefifier}</b> · Recettes confirmées : <b>${j.recettesConfirmees}</b>`;
}
async function chargerComptes() {
  const q = new URLSearchParams();
  if ($("fType").value) q.set("type", $("fType").value);
  if ($("fStatut").value) q.set("statut", $("fStatut").value);
  if ($("fQ").value.trim()) q.set("q", $("fQ").value.trim());
  const j = await call("/api/admin/comptes?" + q.toString(), {}, true);
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
      await call("/api/admin/comptes", { method: "PATCH", body: JSON.stringify({ ownerId: Number(b.dataset.id), action: b.dataset.act, motif }) }, true);
      msg("compteMsg", "Action effectuée.", true);
      await chargerComptes(); await chargerStats();
    } catch (e) { msg("compteMsg", e.message); }
  }));
}
$("btnComptes").onclick = chargerComptes;
async function chargerPlansAdmin() {
  const j = await call("/api/admin/forfaits", {}, true);
  $("aPlans").innerHTML = (j.forfaits || []).map((p) => `<div style="border-bottom:1px solid #e2e8f0;padding:6px 0"><b>${p.nom}</b> (${p.type_compte}) — ${p.prix} ${p.devise}/${p.duree} · ${p.limite_vehicules == null ? "illimité" : p.limite_vehicules + " véh."}${p.georeperage ? " · zones" : ""} ${p.actif ? "" : "<i>(inactif)</i>"} <button data-plan="${p.id}" class="ghost">Modifier</button></div>`).join("");
  document.querySelectorAll("#aPlans [data-plan]").forEach((b) => (b.onclick = async () => {
    const p = (await call("/api/admin/forfaits", {}, true)).forfaits.find((x) => x.id === Number(b.dataset.plan));
    editingPlan = p.id; $("plNom").value = p.nom; $("plType").value = p.type_compte;
    $("plPrix").value = p.prix; $("plDuree").value = p.duree; $("plLimite").value = p.limite_vehicules ?? "";
    $("plGeo").value = p.georeperage ? "1" : "0";
  }));
}
$("btnPlanSave").onclick = async () => {
  try {
    const body = { nom: $("plNom").value.trim(), type_compte: $("plType").value, prix: Number($("plPrix").value), duree: $("plDuree").value, limite_vehicules: $("plLimite").value === "" ? null : Number($("plLimite").value), georeperage: $("plGeo").value === "1" };
    if (editingPlan) {
      body.id = editingPlan;
      await call("/api/admin/forfaits", { method: "PATCH", body: JSON.stringify(body) }, true);
      editingPlan = 0;
    } else {
      await call("/api/admin/forfaits", { method: "POST", body: JSON.stringify(body) }, true);
    }
    msg("planMsg", "Forfait enregistré.", true);
    await chargerPlansAdmin();
  } catch (e) { msg("planMsg", e.message); }
};
async function chargerPaiements() {
  const st = $("payStatut").value || "a_verifier";
  const j = await call("/api/admin/paiements?statut=" + st, {}, true);
  const actions = st === "a_verifier";
  $("aPays").innerHTML = (j.paiements || []).map((p) => `<div style="border-bottom:1px solid #e2e8f0;padding:6px 0"><b>${p.montant} ${p.devise}</b> — ${p.nom || ""} ${p.prenom || ""} ${p.raison_sociale || ""} (${p.telephone || ""})<br /><small>${p.plan} · ${p.methode} · réf ${p.reference || "—"} · ${p.statut} · ${fmtDate(p.created_at)}</small>${actions ? `<br /><button data-pay="confirmer" data-id="${p.id}" class="ghost">Confirmer</button> <button data-pay="refuser" data-id="${p.id}" class="ghost">Refuser</button>` : ""}</div>`).join("") || "<i>Aucun paiement.</i>";
  document.querySelectorAll("#aPays [data-pay]").forEach((b) => (b.onclick = async () => {
    const motif = b.dataset.pay === "refuser" ? prompt("Motif du refus :") || "" : "";
    await call("/api/admin/paiements", { method: "PATCH", body: JSON.stringify({ paymentId: Number(b.dataset.id), action: b.dataset.pay, motif }) }, true);
    await chargerPaiements(); await chargerComptes(); await chargerStats();
  }));
}
$("btnPays").onclick = chargerPaiements;
async function chargerAudit() {
  const j = await call("/api/admin/audit", {}, true);
  $("aAudit").innerHTML = (j.journal || []).map((a) => `<div style="border-bottom:1px solid #e2e8f0;padding:5px 0"><b>${a.action}</b> par ${a.admin || "?"} — ${a.cible_type || ""} ${a.cible_id || ""}<br /><small>${fmtDate(a.created_at)} · ${JSON.stringify(a.details || {})}</small></div>`).join("") || "<i>Vide.</i>";
}
async function chargerReglages() {
  const j = await call("/api/admin/reglages", {}, true);
  $("setAuto").checked = Boolean(j.activationAuto);
}
$("btnSettings").onclick = async () => {
  await call("/api/admin/reglages", { method: "PATCH", body: JSON.stringify({ activationAuto: $("setAuto").checked }) }, true);
  alert("Réglage enregistré.");
};
$("btnExpire").onclick = async () => {
  const j = await call("/api/admin/maintenance/expirations", { method: "POST" }, true);
  alert(j.traites + " abonnement(s) expiré(s).");
  await chargerStats(); await chargerComptes();
};

// ---------- Reprise de session ----------
if (token) {
  entrerApp().catch(() => { token = ""; localStorage.removeItem("fleet_token"); });
}
