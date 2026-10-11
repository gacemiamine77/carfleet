import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { applyCors, rateLimit, sendJson } from "./src/http.mjs";
import { login, logout as logoutProprio, profile, register } from "./src/routes/auth.mjs";
import {
  comptes,
  changerMotDePasse,
  creerAdmin,
  creerAbonnement,
  expirations,
  forfaits,
  gererAdmin,
  gererCompte,
  gererPaiement,
  journal,
  listeAdmins,
  login as loginAdmin,
  logout as logoutAdmin,
  paiements,
  reglages,
  stats as statsAdmin
} from "./src/routes/admin.mjs";
import { addDriver, listDrivers, patchDriver } from "./src/routes/drivers.mjs";
import { history, live, reportTheft, resolveTheft, sharedTheft, stats } from "./src/routes/fleet.mjs";
import {
  assigner,
  creer as creerZone,
  evenements as evenementsZones,
  lister as listerZones,
  modifier as modifierZone,
  supprimer as supprimerZone
} from "./src/routes/geofences.mjs";
import {
  choisir as choisirAbonnement,
  declarer as declarerPaiement,
  lireNotifications,
  notifications,
  plans,
  statut as statutCompte
} from "./src/routes/subscriptions.mjs";
import { ingest, usage } from "./src/routes/track.mjs";
import { addVehicle, deleteVehicle, listVehicles, patchVehicle } from "./src/routes/vehicles.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || process.env.FLEET_PORT || 3003);

const STATIC = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" }
};

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "inconnu";
}

async function router(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  const route = `${req.method} ${url.pathname}`;

  if (STATIC[url.pathname] && req.method === "GET") {
    const asset = STATIC[url.pathname];
    const body = await readFile(path.join(publicDir, asset.file));
    res.writeHead(200, { "Content-Type": asset.type, "Cache-Control": "no-store" });
    res.end(body);
    return;
  }

  if (route === "GET /api/health") return sendJson(res, 200, { ok: true, service: "fleet-platform", time: new Date().toISOString() });
  if (route === "POST /api/proprietaires/auth/register") {
    if (!rateLimit(`auth:${clientIp(req)}`, 60, 60_000)) return sendJson(res, 429, { error: "Trop de tentatives" });
    return register(req, res);
  }
  if (route === "POST /api/proprietaires/auth/login") {
    if (!rateLimit(`auth:${clientIp(req)}`, 60, 60_000)) return sendJson(res, 429, { error: "Trop de tentatives" });
    return login(req, res);
  }
  if (route === "POST /api/proprietaires/auth/logout") return logoutProprio(req, res);
  if (url.pathname === "/api/proprietaires/profil" && (req.method === "GET" || req.method === "PATCH")) return profile(req, res);
  if (url.pathname === "/api/proprietaires/vehicules" && req.method === "GET") return listVehicles(req, res);
  if (url.pathname === "/api/proprietaires/vehicules" && req.method === "POST") return addVehicle(req, res);
  if (url.pathname === "/api/proprietaires/vehicules" && req.method === "PATCH") return patchVehicle(req, res);
  if (url.pathname === "/api/proprietaires/vehicules" && req.method === "DELETE") return deleteVehicle(req, res);
  if (url.pathname === "/api/proprietaires/notifications" && req.method === "GET") return notifications(req, res);
  if (url.pathname === "/api/proprietaires/notifications" && req.method === "PATCH") return lireNotifications(req, res);
  if (url.pathname === "/api/proprietaires/chauffeurs" && req.method === "GET") return listDrivers(req, res);
  if (url.pathname === "/api/proprietaires/chauffeurs" && req.method === "POST") return addDriver(req, res);
  if (url.pathname === "/api/proprietaires/chauffeurs" && req.method === "PATCH") return patchDriver(req, res);
  if (url.pathname === "/api/external/track" && req.method === "POST") {
    if (!rateLimit(`track:${clientIp(req)}`, 1200, 60_000)) return sendJson(res, 429, { error: "Trop de points GPS" });
    return ingest(req, res);
  }
  if (route === "GET /api/external/track") return usage(req, res);
  if (route === "GET /api/proprietaires/stats") return stats(req, res);
  if (route === "GET /api/fleet/live") return live(req, res);
  if (route === "GET /api/fleet/history") return history(req, res);
  if (route === "GET /api/fleet/stats") return stats(req, res);
  if (route === "GET /api/fleet/plans") return plans(req, res);
  if (route === "POST /api/fleet/abonnement") return choisirAbonnement(req, res);
  if (route === "POST /api/fleet/paiement/declarer") return declarerPaiement(req, res);
  if (route === "GET /api/fleet/statut") return statutCompte(req, res);
  if (url.pathname === "/api/fleet/geofences" && req.method === "GET") return listerZones(req, res);
  if (url.pathname === "/api/fleet/geofences" && req.method === "POST") return creerZone(req, res);
  if (url.pathname === "/api/fleet/geofences" && req.method === "PATCH") return modifierZone(req, res);
  if (url.pathname === "/api/fleet/geofences" && req.method === "DELETE") return supprimerZone(req, res);
  if (route === "POST /api/fleet/geofences/assigner") return assigner(req, res);
  if (route === "GET /api/fleet/geofence-events") return evenementsZones(req, res);
  if (route === "POST /api/fleet/theft/report") return reportTheft(req, res);
  if (route === "POST /api/fleet/theft/resolve") return resolveTheft(req, res);
  if (req.method === "GET" && url.pathname.startsWith("/api/fleet/theft/shared/")) {
    return sharedTheft(req, res, decodeURIComponent(url.pathname.replace("/api/fleet/theft/shared/", "")));
  }
  // Webhook passerelle de paiement : la confirmation doit venir du prestataire (signature vérifiée),
  // jamais du navigateur. Prestataire non intégré pour l'instant → 501 explicite.
  if (url.pathname.startsWith("/api/paiements/webhook/")) {
    return sendJson(res, 501, { error: "Passerelle non intégrée : utilisez la confirmation manuelle admin après contrôle du justificatif." });
  }
  if (route === "POST /api/admin/auth/login") {
    if (!rateLimit(`admin:${clientIp(req)}`, 30, 60_000)) return sendJson(res, 429, { error: "Trop de tentatives" });
    return loginAdmin(req, res);
  }
  if (route === "POST /api/admin/auth/logout") return logoutAdmin(req, res);
  if (route === "POST /api/admin/auth/password") return changerMotDePasse(req, res);
  if (route === "GET /api/admin/admins") return listeAdmins(req, res);
  if (route === "POST /api/admin/admins") return creerAdmin(req, res);
  if (route === "PATCH /api/admin/admins") return gererAdmin(req, res);
  if (route === "GET /api/admin/stats") return statsAdmin(req, res);
  if (route === "GET /api/admin/comptes") return comptes(req, res);
  if (route === "PATCH /api/admin/comptes") return gererCompte(req, res);
  if (url.pathname === "/api/admin/forfaits" && (req.method === "GET" || req.method === "POST" || req.method === "PATCH")) return forfaits(req, res);
  if (route === "GET /api/admin/paiements") return paiements(req, res);
  if (route === "PATCH /api/admin/paiements") return gererPaiement(req, res);
  if (route === "POST /api/admin/abonnements") return creerAbonnement(req, res);
  if (route === "GET /api/admin/audit") return journal(req, res);
  if (route === "POST /api/admin/maintenance/expirations") return expirations(req, res);
  if (url.pathname === "/api/admin/reglages" && (req.method === "GET" || req.method === "PATCH")) return reglages(req, res);
  if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Route inconnue" });
  return sendJson(res, 404, { error: "Page inconnue" });
}

const server = http.createServer((req, res) => {
  router(req, res).catch((error) => {
    try {
      sendJson(res, 500, { error: String(error.message || error) });
    } catch {}
  });
});

server.listen(port, () => {
  console.log(`Fleet Platform : http://localhost:${port}`);
});
