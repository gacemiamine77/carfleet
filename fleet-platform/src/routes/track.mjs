import { query } from "../db.mjs";
import { readJson, sendJson } from "../http.mjs";
import { activeDriver, vehicleBySerial } from "../fleet.mjs";
import { compteUtilisable } from "../lifecycle.mjs";
import { coordinate, dansZone, driverNin, finiteNumber, haversineMeters, optionalText, parseDate, text } from "../validation.mjs";

function tripId(vehicleId) {
  return `flt-${vehicleId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 64);
}

async function driverForPoint(vehicle, point) {
  const assigned = await activeDriver(vehicle.id);
  if (assigned) return assigned;
  const nom = String(point.conducteurNom || point.nom || "").trim();
  const prenom = String(point.conducteurPrenom || point.prenom || "").trim();
  const telephone = String(point.conducteurTel || point.telephone || "").trim();
  if (!nom || !prenom || !telephone) return null;
  const existing = await query(`SELECT * FROM fleet_drivers WHERE telephone = $1 LIMIT 1`, [telephone]);
  if (existing.rows[0]) return existing.rows[0];
  const created = await query(
    `INSERT INTO fleet_drivers(nin, nom, prenom, telephone, numero_permis, wilaya)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [driverNin(vehicle.car_id), nom.slice(0, 100), prenom.slice(0, 100), telephone.slice(0, 32), optionalText(point.conducteurPermis, 30), null]
  );
  return created.rows[0];
}

async function openTrip(vehicle, driver, sessionId, point) {
  const open = await query(
    `SELECT * FROM fleet_trips WHERE vehicle_id = $1 AND status = 'en_cours' ORDER BY id DESC LIMIT 1`,
    [vehicle.id]
  );
  if (open.rows[0]) {
    if (open.rows[0].driver_id !== driver.id) {
      await query(`UPDATE fleet_trips SET status = 'interrompu', ended_at = now() WHERE id = $1`, [open.rows[0].id]);
    } else {
      return open.rows[0];
    }
  }
  const created = await query(
    `INSERT INTO fleet_trips(trip_id, vehicle_id, driver_id, session_id, start_city, end_city, started_at, status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'en_cours') RETURNING *`,
    [
      tripId(vehicle.id),
      vehicle.id,
      driver.id,
      String(sessionId || `device-${new Date().toISOString().slice(0, 10)}`).slice(0, 64),
      optionalText(point.originName || point.villeDepart, 100) || "Suivi",
      optionalText(point.destName || point.villeArrivee, 100) || "Suivi",
      parseDate(point.recordedAt || point.timestamp)
    ]
  );
  return created.rows[0];
}

export async function ingest(req, res) {
  const started = Date.now();
  let body;
  try {
    body = await readJson(req, 1024 * 1024);
  } catch (error) {
    return sendJson(res, 400, { error: String(error.message || error) });
  }
  try {
    const sessionId = body.sessionId || `device-${new Date().toISOString().slice(0, 10)}`;
    const points = Array.isArray(body.cars) ? body.cars : [body];
    if (!points.length) return sendJson(res, 400, { error: "Aucun point GPS" });

    let inserted = 0;
    let rejected = 0;
    for (const point of points) {
      try {
        const serial = text(point.serial, 40, { required: true });
        const vehicle = await vehicleBySerial(serial);
        if (!vehicle || !vehicle.actif) {
          rejected += 1;
          continue;
        }
        // Exigence fondamentale : pas de suivi réel sans compte activé.
        const gate = await compteUtilisable(vehicle.owner_id);
        if (!gate.ok) {
          rejected += 1;
          continue;
        }
        const lat = coordinate(point.lat, "lat");
        const lon = coordinate(point.lon, "lon");
        const recordedAt = parseDate(point.recordedAt || point.timestamp);
        const driver = await driverForPoint(vehicle, point);
        if (!driver) {
          rejected += 1;
          continue;
        }
        const trip = await openTrip(vehicle, driver, sessionId, point);
        const last = await query(
          `SELECT latitude, longitude, distance_m FROM fleet_positions WHERE vehicle_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 1`,
          [vehicle.id]
        );
        const previous = last.rows[0];
        const step = previous ? haversineMeters(previous.latitude, previous.longitude, lat, lon) : 0;
        const tripDistance = Number(previous?.distance_m || 0) + step;
        const speed = finiteNumber(point.speed, { min: 0, max: 400 }) ?? 0;
        const heading = finiteNumber(point.heading, { min: 0, max: 360 }) ?? 0;
        const fuel = finiteNumber(point.fuel ?? point.carburant, { min: 0, max: 100 });
        const ax = finiteNumber(point.ax, { min: -50, max: 50 }) ?? 0;
        const ay = finiteNumber(point.ay, { min: -50, max: 50 }) ?? 0;
        const az = finiteNumber(point.az, { min: -50, max: 50 }) ?? 9.81;
        const acceleration = Math.abs(Math.sqrt(ax * ax + ay * ay + az * az) - 9.81) * 3.6;

        await query(
          `INSERT INTO fleet_positions(trip_id, vehicle_id, latitude, longitude, altitude, speed, acceleration, heading, fuel, distance_m, recorded_at, status)
           VALUES($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,'moving')`,
          [trip.id, vehicle.id, lat, lon, speed, acceleration, heading, fuel, tripDistance, recordedAt]
        );
        await query(
          `INSERT INTO fleet_current_positions(vehicle_id, car_id, latitude, longitude, speed, heading, fuel, trip_id, recorded_at, updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
           ON CONFLICT (vehicle_id) DO UPDATE SET
             car_id = EXCLUDED.car_id,
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             speed = EXCLUDED.speed,
             heading = EXCLUDED.heading,
             fuel = EXCLUDED.fuel,
             trip_id = EXCLUDED.trip_id,
             recorded_at = EXCLUDED.recorded_at,
             updated_at = now()`,
          [vehicle.id, vehicle.car_id, lat, lon, speed, heading, fuel, trip.id, recordedAt]
        );
        await query(`UPDATE fleet_trips SET distance_m = $1 WHERE id = $2`, [tripDistance, trip.id]);
        await detecterZones(vehicle.id, lat, lon, recordedAt);
        inserted += 1;
      } catch {
        rejected += 1;
      }
    }
    return sendJson(res, 200, { ok: true, inserted, rejected, sessionId, ingestMs: Date.now() - started });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function usage(req, res) {
  return sendJson(res, 200, {
    ok: true,
    usage: "POST {serial, lat, lon, speed?, heading?, fuel?, recordedAt|timestamp?} ou {cars:[...], sessionId?} vers /api/external/track"
  });
}

// Détection entrée/sortie : compare l'état précédent, journalise la transition.
async function detecterZones(vehicleId, lat, lon, recordedAt) {
  try {
    const zones = await query(
      `SELECT g.* FROM fleet_geofence_vehicles gv
         JOIN fleet_geofences g ON g.id = gv.geofence_id
        WHERE gv.vehicle_id = $1 AND gv.actif AND g.actif`,
      [vehicleId]
    );
    for (const zone of zones.rows) {
      let inside = false;
      try {
        inside = dansZone(lat, lon, zone);
      } catch {
        continue;
      }
      const state = (
        await query(`SELECT inside FROM fleet_geofence_states WHERE vehicle_id = $1 AND geofence_id = $2 LIMIT 1`, [vehicleId, zone.id])
      ).rows[0];
      if (!state) {
        await query(
          `INSERT INTO fleet_geofence_states(vehicle_id, geofence_id, inside) VALUES($1,$2,$3)
           ON CONFLICT (vehicle_id, geofence_id) DO UPDATE SET inside = EXCLUDED.inside, updated_at = now()`,
          [vehicleId, zone.id, inside]
        );
        continue; // premier point : mémorise sans générer de faux événement
      }
      if (state.inside !== inside) {
        await query(`UPDATE fleet_geofence_states SET inside = $1, updated_at = now() WHERE vehicle_id = $2 AND geofence_id = $3`, [
          inside,
          vehicleId,
          zone.id
        ]);
        await query(
          `INSERT INTO fleet_geofence_events(geofence_id, vehicle_id, type, occurred_at) VALUES($1,$2,$3,$4)`,
          [zone.id, vehicleId, inside ? "entree" : "sortie", recordedAt]
        );
      }
    }
  } catch {}
}
