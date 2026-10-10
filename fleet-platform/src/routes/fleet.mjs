import { randomBytes } from "node:crypto";
import { query } from "../db.mjs";
import { requireOwner } from "../auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { activeDriver, vehicleForOwner } from "../fleet.mjs";
import { optionalText } from "../validation.mjs";

export async function live(req, res, auth, params) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const vehicleId = url.searchParams.get("vehicleId");
  const carId = url.searchParams.get("carId");
  const conditions = [`v.owner_id = $1`];
  const values = [session.owner.id];
  if (vehicleId) {
    values.push(Number(vehicleId));
    conditions.push(`v.id = $${values.length}`);
  }
  if (carId) {
    values.push(String(carId));
    conditions.push(`v.car_id = $${values.length}`);
  }
  const { rows } = await query(
    `SELECT v.*, c.latitude, c.longitude, c.speed, c.heading, c.fuel, c.recorded_at AS live_at, c.trip_id AS live_trip
       FROM fleet_vehicles v
       LEFT JOIN fleet_current_positions c ON c.vehicle_id = v.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY v.id DESC`,
    values
  );
  const vehicles = [];
  for (const vehicle of rows) {
    const driver = await activeDriver(vehicle.id);
    vehicles.push({
      id: vehicle.id,
      carId: vehicle.car_id,
      immatriculation: vehicle.immatriculation,
      marque: vehicle.marque,
      modele: vehicle.modele,
      couleur: vehicle.couleur,
      isStolen: vehicle.is_stolen,
      live: vehicle.live_at
        ? {
            latitude: vehicle.latitude,
            longitude: vehicle.longitude,
            speed: vehicle.speed,
            heading: vehicle.heading,
            fuel: vehicle.fuel,
            recordedAt: vehicle.live_at,
            tripId: vehicle.live_trip
          }
        : null,
      chauffeur: driver ? { id: driver.id, nom: driver.nom, prenom: driver.prenom, telephone: driver.telephone } : null
    });
  }
  if (params?.single && !vehicles.length) return sendJson(res, 404, { error: "Véhicule introuvable" });
  return sendJson(res, 200, { vehicules: vehicles });
}

export async function history(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const vehicle = await vehicleForOwner(session.owner.id, {
    id: url.searchParams.get("vehicleId"),
    carId: url.searchParams.get("carId")
  });
  if (!vehicle) return sendJson(res, 404, { error: "Véhicule introuvable" });
  const debut = url.searchParams.get("debut") ? new Date(url.searchParams.get("debut")) : new Date(Date.now() - 24 * 3600 * 1000);
  const fin = url.searchParams.get("fin") ? new Date(url.searchParams.get("fin")) : new Date();
  const limit = Math.min(5000, Math.max(10, Number(url.searchParams.get("limit") || 2000)));
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return sendJson(res, 400, { error: "Dates invalides" });
  const { rows } = await query(
    `SELECT latitude, longitude, speed, heading, recorded_at, distance_m
       FROM fleet_positions
      WHERE vehicle_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
      ORDER BY recorded_at ASC, id ASC
      LIMIT $4`,
    [vehicle.id, debut, fin, limit]
  );
  const distanceKm = rows.length ? Math.max(0, (Number(rows[rows.length - 1].distance_m) || 0) - (Number(rows[0].distance_m) || 0)) / 1000 : 0;
  return sendJson(res, 200, {
    vehicle: { id: vehicle.id, carId: vehicle.car_id, immatriculation: vehicle.immatriculation },
    debut,
    fin,
    distanceKm: Math.round(distanceKm * 10) / 10,
    points: rows
  });
}

export async function stats(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const carId = url.searchParams.get("carId") || "";
  const fin = url.searchParams.get("fin") ? new Date(url.searchParams.get("fin")) : new Date();
  const debut = url.searchParams.get("debut") ? new Date(url.searchParams.get("debut")) : new Date(fin.getTime() - 30 * 86400 * 1000);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return sendJson(res, 400, { error: "Dates invalides" });
  const owned = await query(`SELECT id, car_id FROM fleet_vehicles WHERE owner_id = $1`, [session.owner.id]);
  const ids = owned.rows.filter((vehicle) => !carId || vehicle.car_id === carId).map((vehicle) => vehicle.id);
  if (!ids.length) return sendJson(res, 200, { series: [], totalKm: 0, totalTrajets: 0, vitesseMoyenne: 0, debut, fin });
  const { rows } = await query(
    `SELECT to_char(recorded_at, 'YYYY-MM-DD') AS jour,
            COUNT(*)::int AS points,
            COUNT(DISTINCT trip_id)::int AS trajets,
            AVG(speed)::float AS vitesse_moyenne,
            MAX(speed)::float AS vitesse_max,
            (MAX(distance_m) - MIN(distance_m)) AS metres
       FROM fleet_positions
      WHERE vehicle_id = ANY($1) AND recorded_at >= $2 AND recorded_at <= $3
      GROUP BY 1 ORDER BY 1`,
    [ids, debut, fin]
  );
  const series = rows.map((row) => ({
    periode: row.jour,
    km: Math.round((Math.max(0, Number(row.metres) || 0) / 1000) * 10) / 10,
    trajets: row.trajets,
    vitesseMoyenne: Math.round(Number(row.vitesse_moyenne) || 0),
    vitesseMax: Math.round(Number(row.vitesse_max) || 0)
  }));
  return sendJson(res, 200, {
    series,
    totalKm: Math.round(series.reduce((sum, row) => sum + row.km, 0) * 10) / 10,
    totalTrajets: series.reduce((sum, row) => sum + row.trajets, 0),
    vitesseMoyenne: series.length ? Math.round(series.reduce((sum, row) => sum + row.vitesseMoyenne, 0) / series.length) : 0,
    debut,
    fin
  });
}

export async function reportTheft(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const vehicle = await vehicleForOwner(session.owner.id, { id: body.vehicleId || body.vehiculeId, carId: body.carId });
    if (!vehicle) return sendJson(res, 404, { error: "Véhicule introuvable" });
    const open = await query(
      `SELECT * FROM fleet_theft_cases WHERE vehicle_id = $1 AND owner_id = $2 AND status = 'open' ORDER BY id DESC LIMIT 1`,
      [vehicle.id, session.owner.id]
    );
    if (open.rows[0]) return sendJson(res, 200, { ok: true, dossier: publicCase(open.rows[0]) });
    const share = body.partage === true || body.share === true;
    const days = Math.min(30, Math.max(1, Number(body.dureeJours || body.shareDays || 7)));
    const token = share ? randomBytes(48).toString("hex") : null;
    const expires = share ? new Date(Date.now() + days * 86400 * 1000) : null;
    await query(`UPDATE fleet_vehicles SET is_stolen = TRUE, stolen_reported_at = now(), updated_at = now() WHERE id = $1`, [vehicle.id]);
    const created = await query(
      `INSERT INTO fleet_theft_cases(vehicle_id, owner_id, status, share_token, share_expires_at, note)
       VALUES($1,$2,'open',$3,$4,$5) RETURNING *`,
      [vehicle.id, session.owner.id, token, expires, optionalText(body.note, 2000)]
    );
    return sendJson(res, 200, { ok: true, dossier: publicCase(created.rows[0]) });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function resolveTheft(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const vehicle = await vehicleForOwner(session.owner.id, { id: body.vehicleId || body.vehiculeId, carId: body.carId });
    if (!vehicle && !body.caseId) return sendJson(res, 404, { error: "Véhicule introuvable" });
    if (body.caseId) {
      await query(
        `UPDATE fleet_theft_cases SET status = 'resolved', resolved_at = now(), share_token = NULL, share_expires_at = NULL
          WHERE id = $1 AND owner_id = $2 AND status = 'open'`,
        [Number(body.caseId), session.owner.id]
      );
    } else {
      await query(
        `UPDATE fleet_theft_cases SET status = 'resolved', resolved_at = now(), share_token = NULL, share_expires_at = NULL
          WHERE vehicle_id = $1 AND owner_id = $2 AND status = 'open'`,
        [vehicle.id, session.owner.id]
      );
    }
    if (vehicle) {
      await query(`UPDATE fleet_vehicles SET is_stolen = FALSE, stolen_reported_at = NULL, updated_at = now() WHERE id = $1`, [vehicle.id]);
    }
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function sharedTheft(req, res, token) {
  const { rows } = await query(
    `SELECT c.status, c.reported_at, c.share_expires_at,
            v.immatriculation, v.marque, v.modele, v.couleur,
            p.latitude, p.longitude, p.speed, p.recorded_at
       FROM fleet_theft_cases c
       JOIN fleet_vehicles v ON v.id = c.vehicle_id
       LEFT JOIN fleet_current_positions p ON p.vehicle_id = v.id
      WHERE c.share_token = $1 LIMIT 1`,
    [String(token || "")]
  );
  const row = rows[0];
  if (!row || row.status !== "open" || (row.share_expires_at && new Date(row.share_expires_at) < new Date())) {
    return sendJson(res, 410, { error: "Lien de partage invalide ou expiré" });
  }
  return sendJson(res, 200, {
    ok: true,
    dossier: {
      immatriculation: row.immatriculation,
      marque: row.marque,
      modele: row.modele,
      couleur: row.couleur,
      reportedAt: row.reported_at,
      live: row.recorded_at
        ? { latitude: row.latitude, longitude: row.longitude, speed: row.speed, recordedAt: row.recorded_at }
        : null
    }
  });
}

function publicCase(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    status: row.status,
    reportedAt: row.reported_at,
    resolvedAt: row.resolved_at,
    shareToken: row.share_token,
    shareExpiresAt: row.share_expires_at,
    note: row.note
  };
}
