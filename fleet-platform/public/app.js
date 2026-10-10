let token = localStorage.getItem("fleet_token") || "";
let map = null;
let layer = null;
let selected = null;
const $ = (id) => document.getElementById(id);

function headers() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...headers(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.status);
  return data;
}

function setAuth(loggedIn) {
  $("fleetCard").classList.toggle("hidden", !loggedIn);
  $("mapCard").classList.toggle("hidden", !loggedIn);
  $("logout").classList.toggle("hidden", !loggedIn);
}

async function login() {
  try {
    const data = await call("/api/proprietaires/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: $("username").value.trim(), password: $("password").value })
    });
    token = data.token;
    localStorage.setItem("fleet_token", token);
    $("authMsg").textContent = "Connecté.";
    setAuth(true);
    initMap();
    await load();
  } catch (error) {
    $("authMsg").textContent = error.message;
  }
}

async function register() {
  try {
    const data = await call("/api/proprietaires/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: $("username").value.trim(),
        password: $("password").value,
        telephone: $("telephone").value.trim(),
        type: "physique"
      })
    });
    token = data.token;
    localStorage.setItem("fleet_token", token);
    $("authMsg").textContent = "Compte créé et connecté.";
    setAuth(true);
    initMap();
    await load();
  } catch (error) {
    $("authMsg").textContent = error.message;
  }
}

function logout() {
  token = "";
  localStorage.removeItem("fleet_token");
  setAuth(false);
  $("authMsg").textContent = "Déconnecté.";
}

function initMap() {
  if (map) return;
  map = L.map("map").setView([35.8, 3.0], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap France | © OpenStreetMap",
    subdomains: "abc",
    maxZoom: 20
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(), 80);
}

async function load() {
  const data = await call("/api/fleet/live");
  const vehicles = data.vehicules || [];
  $("count").textContent = vehicles.length;
  $("rows").innerHTML = vehicles
    .map(
      (v) => `<tr>
        <td><b>${v.immatriculation}</b><br /><small>${v.marque || ""} ${v.modele || ""} ${v.couleur || ""}</small></td>
        <td>${v.chauffeur ? `${v.chauffeur.prenom || ""} ${v.chauffeur.nom || ""}` : "—"}</td>
        <td>${v.live ? `${v.live.latitude.toFixed(4)}, ${v.live.longitude.toFixed(4)}<br /><small>${v.live.speed || 0} km/h</small>` : "—"}</td>
        <td class="${v.isStolen ? "stolen" : ""}">${v.isStolen ? "VOL DÉCLARÉ" : "OK"}</td>
        <td>
          <button data-live="${v.id}">Carte</button>
          <button data-history="${v.id}">24 h</button>
          <button data-theft="${v.id}">${v.isStolen ? "Résoudre" : "Vol"}</button>
        </td>
      </tr>`
    )
    .join("");
  drawLive(vehicles);
}

function drawLive(vehicles) {
  if (!map) return;
  layer.clearLayers();
  const bounds = [];
  for (const vehicle of vehicles) {
    if (!vehicle.live) continue;
    L.marker([vehicle.live.latitude, vehicle.live.longitude])
      .addTo(layer)
      .bindPopup(`<b>${vehicle.immatriculation}</b><br />${vehicle.live.speed || 0} km/h`);
    bounds.push([vehicle.live.latitude, vehicle.live.longitude]);
  }
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [20, 20] });
  else if (bounds.length === 1) map.setView(bounds[0], 13);
  $("mapTitle").textContent = "temps réel";
}

async function drawHistory(vehicleId) {
  const data = await call(`/api/fleet/history?vehicleId=${vehicleId}&limit=2000`);
  const points = data.points || [];
  layer.clearLayers();
  if (points.length < 2) {
    $("mapTitle").textContent = "aucun historique";
    return;
  }
  const line = points.map((point) => [point.latitude, point.longitude]);
  L.polyline(line, { color: "#0f3d2e", weight: 4 }).addTo(layer);
  L.circleMarker(line[0], { radius: 6, color: "#16a34a" }).addTo(layer).bindPopup("Départ");
  L.circleMarker(line[line.length - 1], { radius: 6, color: "#b91c1c" }).addTo(layer).bindPopup("Dernière position");
  map.fitBounds(line, { padding: [20, 20] });
  $("mapTitle").textContent = `historique 24 h — ${data.distanceKm} km`;
}

async function toggleTheft(vehicleId, stolen) {
  if (stolen) {
    await call("/api/fleet/theft/resolve", { method: "POST", body: JSON.stringify({ vehicleId }) });
  } else if (confirm("Déclarer ce véhicule volé ?")) {
    await call("/api/fleet/theft/report", { method: "POST", body: JSON.stringify({ vehicleId, share: true, dureeJours: 7 }) });
  }
  await load();
}

document.addEventListener("click", async (event) => {
  const live = event.target.dataset?.live;
  const history = event.target.dataset?.history;
  const theft = event.target.dataset?.theft;
  if (live) {
    selected = Number(live);
    await load();
  }
  if (history) drawHistory(history).catch((error) => ($("mapTitle").textContent = error.message));
  if (theft) {
    const stolen = event.target.textContent.includes("Résoudre");
    toggleTheft(Number(theft), stolen).catch((error) => ($("authMsg").textContent = error.message));
  }
});

$("login").onclick = login;
$("register").onclick = register;
$("logout").onclick = logout;
$("reload").onclick = () => load().catch((error) => ($("authMsg").textContent = error.message));
$("showLive").onclick = () => load().catch((error) => ($("authMsg").textContent = error.message));
$("showHistory").onclick = () => {
  if (selected) drawHistory(selected).catch((error) => ($("mapTitle").textContent = error.message));
};
$("addVehicle").onclick = async () => {
  try {
    await call("/api/proprietaires/vehicules", {
      method: "POST",
      body: JSON.stringify({
        immatriculation: $("immat").value.trim(),
        marque: $("marque").value.trim(),
        modele: $("modele").value.trim(),
        couleur: $("couleur").value.trim()
      })
    });
    await load();
  } catch (error) {
    $("authMsg").textContent = error.message;
  }
};

if (token) {
  setAuth(true);
  initMap();
  load().catch(() => {
    token = "";
    localStorage.removeItem("fleet_token");
    setAuth(false);
  });
}
