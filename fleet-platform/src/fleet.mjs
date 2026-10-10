import { query } from "./db.mjs";

export async function vehicleForOwner(ownerId, { id, carId, serial } = {}) {
  if (id) {
    const { rows } = await query(`SELECT * FROM fleet_vehicles WHERE id = $1 AND owner_id = $2 LIMIT 1`, [Number(id), ownerId]);
    return rows[0] || null;
  }
  if (carId) {
    const { rows } = await query(`SELECT * FROM fleet_vehicles WHERE car_id = $1 AND owner_id = $2 LIMIT 1`, [String(carId), ownerId]);
    return rows[0] || null;
  }
  if (serial) {
    const { rows } = await query(`SELECT * FROM fleet_vehicles WHERE serial = $1 AND owner_id = $2 LIMIT 1`, [String(serial), ownerId]);
    return rows[0] || null;
  }
  const { rows } = await query(`SELECT * FROM fleet_vehicles WHERE owner_id = $1 ORDER BY id DESC LIMIT 1`, [ownerId]);
  return rows[0] || null;
}

export async function vehicleBySerial(serial) {
  const { rows } = await query(`SELECT * FROM fleet_vehicles WHERE serial = $1 LIMIT 1`, [String(serial)]);
  return rows[0] || null;
}

export async function activeDriver(vehicleId) {
  const { rows } = await query(
    `SELECT d.* FROM fleet_assignments a
       JOIN fleet_drivers d ON d.id = a.driver_id
      WHERE a.vehicle_id = $1 AND a.active
      ORDER BY a.id DESC LIMIT 1`,
    [vehicleId]
  );
  return rows[0] || null;
}

export async function closeActiveAssignments(vehicleId) {
  await query(`UPDATE fleet_assignments SET active = FALSE, ended_at = now() WHERE vehicle_id = $1 AND active`, [vehicleId]);
}
