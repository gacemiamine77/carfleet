import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { applyCors, rateLimit, sendJson } from "./src/http.mjs";
import { login, profile, register } from "./src/routes/auth.mjs";
import { addDriver, listDrivers, patchDriver } from "./src/routes/drivers.mjs";
import { history, live, reportTheft, resolveTheft, sharedTheft, stats } from "./src/routes/fleet.mjs";
import { ingest, usage } from "./src/routes/track.mjs";
import { addVehicle, listVehicles, patchVehicle } from "./src/routes/vehicles.mjs";

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
  if (url.pathname === "/api/proprietaires/profil" && (req.method === "GET" || req.method === "PATCH")) return profile(req, res);
  if (url.pathname === "/api/proprietaires/vehicules" && req.method === "GET") return listVehicles(req, res);
  if (url.pathname === "/api/proprietaires/vehicules" && req.method === "POST") return addVehicle(req, res);
  if (url.pathname === "/api/proprietaires/vehicules" && req.method === "PATCH") return patchVehicle(req, res);
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
  if (route === "POST /api/fleet/theft/report") return reportTheft(req, res);
  if (route === "POST /api/fleet/theft/resolve") return resolveTheft(req, res);
  if (req.method === "GET" && url.pathname.startsWith("/api/fleet/theft/shared/")) {
    return sharedTheft(req, res, decodeURIComponent(url.pathname.replace("/api/fleet/theft/shared/", "")));
  }
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
