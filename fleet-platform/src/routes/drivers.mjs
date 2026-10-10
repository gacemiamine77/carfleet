import { query } from "../db.mjs";
import { requireOwner } from "../auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { closeActiveAssignments, vehicleForOwner } from "../fleet.mjs";
import { driverNin, optionalText, text } from "../validation.mjs";

async function driverForOwner(ownerId, driverId) {
  const { rows } = await query(
    `SELECT DISTINCT d.* FROM fleet_drivers d
       JOIN fleet_assignments a ON a.driver_id = d.id
       JOIN fleet_vehicles v ON v.id = a.vehicle_id
      WHERE d.id = $1 AND v.owner_id = $2 LIMIT 1`,
    [Number(driverId), ownerId]
  );
  return rows[0] || null;
}

export async function listDrivers(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const { rows } = await query(
    `SELECT DISTINCT d.*, a.vehicle_id AS vehicle_id
       FROM fleet_drivers d
       JOIN fleet_assignments a ON a.driver_id = d.id
       JOIN fleet_vehicles v ON v.id = a.vehicle_id
      WHERE v.owner_id = $1 AND a.active
      ORDER BY d.nom, d.prenom`,
    [session.owner.id]
  );
  return sendJson(res, 200, {
    chauffeurs: rows.map((driver) => ({
      id: driver.id,
      nom: driver.nom,
      prenom: driver.prenom,
      telephone: driver.telephone,
      numeroPermis: driver.numero_permis,
      vehicleId: driver.vehicle_id
    }))
  });
}

export async function addDriver(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const vehicle = await vehicleForOwner(session.owner.id, { id: body.voitureId || body.vehicleId });
    if (!vehicle) return sendJson(res, 404, { error: "Véhicule introuvable" });
    const nom = text(body.nom, 100, { required: true });
    const prenom = text(body.prenom, 100, { required: true });
    const telephone = text(body.telephone || body.conducteurTel, 32, { required: true });
    let driver = (
      await query(`SELECT * FROM fleet_drivers WHERE telephone = $1 LIMIT 1`, [telephone])
    ).rows[0] || null;
    if (!driver) {
      const created = await query(
        `INSERT INTO fleet_drivers(nin, nom, prenom, telephone, numero_permis, wilaya)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          driverNin(vehicle.car_id),
          nom,
          prenom,
          telephone,
          optionalText(body.numeroPermis, 30),
          optionalText(body.wilaya, 100)
        ]
      );
      driver = created.rows[0];
    }
    await closeActiveAssignments(vehicle.id);
    const assignment = await query(
      `INSERT INTO fleet_assignments(vehicle_id, driver_id, active) VALUES($1,$2,TRUE) RETURNING id, started_at`,
      [vehicle.id, driver.id]
    );
    return sendJson(res, 200, {
      ok: true,
      chauffeur: {
        id: driver.id,
        nom: driver.nom,
        prenom: driver.prenom,
        telephone: driver.telephone,
        numeroPermis: driver.numero_permis,
        depuis: assignment.rows[0].started_at
      }
    });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function patchDriver(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const driver = await driverForOwner(session.owner.id, body.id || body.chauffeurId);
    if (!driver) return sendJson(res, 404, { error: "Chauffeur introuvable" });
    const patch = {};
    if (body.nom !== undefined) patch.nom = text(body.nom, 100, { required: true });
    if (body.prenom !== undefined) patch.prenom = text(body.prenom, 100, { required: true });
    if (body.telephone !== undefined) patch.telephone = text(body.telephone, 32, { required: true });
    if (body.numeroPermis !== undefined) patch.numero_permis = optionalText(body.numeroPermis, 30);
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(patch)) {
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) return sendJson(res, 400, { error: "rien à changer" });
    params.push(driver.id);
    await query(`UPDATE fleet_drivers SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}
