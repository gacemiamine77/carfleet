import { query } from "../db.mjs";
import { requireOwner } from "../auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { compteUtilisable, georeperageAutorise } from "../lifecycle.mjs";
import { finiteNumber, text } from "../validation.mjs";
import { vehicleForOwner } from "../fleet.mjs";

async function zoneComplete(row) {
  const assigned = await query(
    `SELECT gv.vehicle_id, gv.actif, gv.alertes, v.immatriculation, v.car_id
       FROM fleet_geofence_vehicles gv
       JOIN fleet_vehicles v ON v.id = gv.vehicle_id
      WHERE gv.geofence_id = $1`,
    [row.id]
  );
  return { ...row, vehicules: assigned.rows };
}

// GET /api/fleet/geofences → zones du compte + véhicules associés.
export async function lister(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const { rows } = await query(`SELECT * FROM fleet_geofences WHERE owner_id = $1 ORDER BY id DESC`, [session.owner.id]);
  const zones = [];
  for (const row of rows) zones.push(await zoneComplete(row));
  return sendJson(res, 200, { zones });
}

// POST /api/fleet/geofences {nom, type, centreLat, centreLon, rayonM, points, vehicleIds[]}
export async function creer(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    if (!(await georeperageAutorise(session.owner.id))) {
      return sendJson(res, 403, { error: "Géorepérage non inclus dans votre forfait" });
    }
    const body = await readJson(req);
    const nom = text(body.nom, 100, { required: true });
    const type = body.type === "polygone" ? "polygone" : "cercle";
    let centreLat = null;
    let centreLon = null;
    let rayonM = null;
    let points = null;
    if (type === "cercle") {
      centreLat = finiteNumber(body.centreLat, { required: true, min: -90, max: 90 });
      centreLon = finiteNumber(body.centreLon, { required: true, min: -180, max: 180 });
      rayonM = finiteNumber(body.rayonM, { required: true, min: 10, max: 500000 });
    } else {
      if (!Array.isArray(body.points) || body.points.length < 3) {
        return sendJson(res, 400, { error: "Un polygone exige au moins 3 points" });
      }
      points = JSON.stringify(
        body.points.map((point) => {
          const pair = Array.isArray(point) ? point : [point.lat, point.lon];
          const lat = finiteNumber(pair[0], { required: true, min: -90, max: 90 });
          const lon = finiteNumber(pair[1], { required: true, min: -180, max: 180 });
          return [lat, lon];
        })
      );
    }
    const zone = (
      await query(
        `INSERT INTO fleet_geofences(owner_id, nom, type, centre_lat, centre_lon, rayon_m, points)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [session.owner.id, nom, type, centreLat, centreLon, rayonM, points]
      )
    ).rows[0];
    for (const vehicleId of body.vehicleIds || []) {
      const vehicle = await vehicleForOwner(session.owner.id, { id: vehicleId });
      if (!vehicle) continue;
      await query(
        `INSERT INTO fleet_geofence_vehicles(geofence_id, vehicle_id, actif, alertes)
         VALUES($1,$2,TRUE,TRUE) ON CONFLICT (geofence_id, vehicle_id) DO UPDATE SET actif = TRUE`,
        [zone.id, vehicle.id]
      );
    }
    return sendJson(res, 200, { ok: true, zone: await zoneComplete(zone) });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// PATCH /api/fleet/geofences {id, nom?, actif?}
export async function modifier(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const zone = (
      await query(`SELECT * FROM fleet_geofences WHERE id = $1 AND owner_id = $2 LIMIT 1`, [Number(body.id), session.owner.id])
    ).rows[0];
    if (!zone) return sendJson(res, 404, { error: "Zone introuvable" });
    const sets = [];
    const params = [];
    if (body.nom !== undefined) {
      params.push(text(body.nom, 100, { required: true }));
      sets.push(`nom = $${params.length}`);
    }
    if (body.actif !== undefined) {
      params.push(Boolean(body.actif));
      sets.push(`actif = $${params.length}`);
    }
    if (!sets.length) return sendJson(res, 400, { error: "rien à changer" });
    params.push(zone.id);
    await query(`UPDATE fleet_geofences SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// DELETE /api/fleet/geofences?id= → supprime la zone (+ assignations, états, événements).
export async function supprimer(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const url = new URL(req.url, "http://localhost");
  const { rowCount } = await query(`DELETE FROM fleet_geofences WHERE id = $1 AND owner_id = $2`, [
    Number(url.searchParams.get("id")),
    session.owner.id
  ]);
  if (!rowCount) return sendJson(res, 404, { error: "Zone introuvable" });
  return sendJson(res, 200, { ok: true });
}

// POST /api/fleet/geofences/assigner {geofenceId, vehicleId, actif?, alertes?}
export async function assigner(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const zone = (
      await query(`SELECT * FROM fleet_geofences WHERE id = $1 AND owner_id = $2 LIMIT 1`, [Number(body.geofenceId), session.owner.id])
    ).rows[0];
    if (!zone) return sendJson(res, 404, { error: "Zone introuvable" });
    const vehicle = await vehicleForOwner(session.owner.id, { id: body.vehicleId });
    if (!vehicle) return sendJson(res, 404, { error: "Véhicule introuvable" });
    await query(
      `INSERT INTO fleet_geofence_vehicles(geofence_id, vehicle_id, actif, alertes)
       VALUES($1,$2,$3,$4)
       ON CONFLICT (geofence_id, vehicle_id) DO UPDATE SET actif = EXCLUDED.actif, alertes = EXCLUDED.alertes`,
      [zone.id, vehicle.id, body.actif !== false, body.alertes !== false]
    );
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

// GET /api/fleet/geofence-events?vehicleId&debut&fin&limit → historique entrée/sortie.
export async function evenements(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const gate = await compteUtilisable(session.owner.id);
  if (!gate.ok) return sendJson(res, 403, { error: gate.motif });
  const url = new URL(req.url, "http://localhost");
  const debut = url.searchParams.get("debut") ? new Date(url.searchParams.get("debut")) : new Date(Date.now() - 7 * 86400 * 1000);
  const fin = url.searchParams.get("fin") ? new Date(url.searchParams.get("fin")) : new Date();
  const limit = Math.min(1000, Math.max(10, Number(url.searchParams.get("limit") || 200)));
  const values = [session.owner.id, debut, fin, limit];
  let extra = "";
  if (url.searchParams.get("vehicleId")) {
    values.push(Number(url.searchParams.get("vehicleId")));
    extra = ` AND e.vehicle_id = $5`;
  }
  const { rows } = await query(
    `SELECT e.*, g.nom AS zone, v.immatriculation, v.car_id
       FROM fleet_geofence_events e
       JOIN fleet_geofences g ON g.id = e.geofence_id
       JOIN fleet_vehicles v ON v.id = e.vehicle_id
      WHERE v.owner_id = $1 AND e.occurred_at >= $2 AND e.occurred_at <= $3${extra}
      ORDER BY e.occurred_at DESC LIMIT $4`,
    values
  );
  return sendJson(res, 200, { evenements: rows });
}
