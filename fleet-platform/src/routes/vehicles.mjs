import { query } from "../db.mjs";
import { requireOwner } from "../auth.mjs";
import { readJson, sendJson } from "../http.mjs";
import { activeDriver, vehicleForOwner } from "../fleet.mjs";
import { finiteNumber, optionalText, serialId, text } from "../validation.mjs";

export async function listVehicles(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  const { rows } = await query(`SELECT * FROM fleet_vehicles WHERE owner_id = $1 ORDER BY id DESC`, [session.owner.id]);
  const vehicules = [];
  for (const vehicle of rows) {
    const driver = await activeDriver(vehicle.id);
    vehicules.push({
      id: vehicle.id,
      carId: vehicle.car_id,
      immatriculation: vehicle.immatriculation,
      marque: vehicle.marque,
      modele: vehicle.modele,
      couleur: vehicle.couleur,
      annee: vehicle.annee,
      categorieVehicule: vehicle.categorie,
      actif: vehicle.actif,
      isStolen: vehicle.is_stolen,
      stolenReportedAt: vehicle.stolen_reported_at,
      chauffeur: driver
        ? {
            id: driver.id,
            nom: driver.nom,
            prenom: driver.prenom,
            telephone: driver.telephone,
            numeroPermis: driver.numero_permis,
            depuis: driver.started_at
          }
        : null
    });
  }
  return sendJson(res, 200, { vehicules });
}

export async function addVehicle(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const immatriculation = text(body.immatriculation, 20, { required: true });
    const existingPlate = await query(`SELECT id FROM fleet_vehicles WHERE immatriculation = $1 LIMIT 1`, [immatriculation]);
    if (existingPlate.rowCount) return sendJson(res, 409, { error: "Immatriculation déjà enregistrée" });

    let serial = optionalText(body.numeroSerie, 40);
    if (serial) {
      const clash = await query(`SELECT id FROM fleet_vehicles WHERE serial = $1 LIMIT 1`, [serial]);
      if (clash.rowCount) return sendJson(res, 409, { error: "Numéro de série déjà utilisé" });
    } else {
      serial = serialId("FLT");
    }
    const count = await query(`SELECT COUNT(*)::int AS n FROM fleet_vehicles WHERE owner_id = $1`, [session.owner.id]);
    const carId = `FLT-${session.owner.id}-${(count.rows[0]?.n || 0) + 1}-${Date.now().toString(36).toUpperCase()}`.slice(0, 64);
    const { rows } = await query(
      `INSERT INTO fleet_vehicles(owner_id, car_id, serial, immatriculation, marque, modele, couleur, annee, categorie)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, car_id, immatriculation, serial`,
      [
        session.owner.id,
        carId,
        serial,
        immatriculation,
        optionalText(body.marque, 50),
        optionalText(body.modele, 50),
        optionalText(body.couleur, 30),
        finiteNumber(body.annee, { min: 1900, max: 2100 }),
        optionalText(body.categorieVehicule, 30) || "leger"
      ]
    );
    const vehicle = rows[0];
    return sendJson(res, 200, {
      ok: true,
      vehicule: { id: vehicle.id, carId: vehicle.car_id, immatriculation: vehicle.immatriculation, numeroSerie: vehicle.serial }
    });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}

export async function patchVehicle(req, res, auth) {
  const session = auth || (await requireOwner(req));
  if (!session) return sendJson(res, 401, { error: "Non authentifié" });
  try {
    const body = await readJson(req);
    const vehicle = await vehicleForOwner(session.owner.id, { id: body.id });
    if (!vehicle) return sendJson(res, 404, { error: "Véhicule introuvable" });
    if (body.immatriculation && String(body.immatriculation) !== vehicle.immatriculation) {
      const clash = await query(`SELECT id FROM fleet_vehicles WHERE immatriculation = $1 LIMIT 1`, [String(body.immatriculation).slice(0, 20)]);
      if (clash.rowCount && clash.rows[0].id !== vehicle.id) {
        return sendJson(res, 409, { error: "Immatriculation déjà utilisée" });
      }
    }
    const patch = {};
    for (const key of ["marque", "modele", "couleur"]) {
      if (body[key] !== undefined) patch[key] = optionalText(body[key], 50);
    }
    if (body.immatriculation !== undefined) patch.immatriculation = text(body.immatriculation, 20, { required: true });
    if (body.categorieVehicule !== undefined) patch.categorie = optionalText(body.categorieVehicule, 30) || "leger";
    if (body.annee !== undefined && body.annee !== "") patch.annee = finiteNumber(body.annee, { min: 1900, max: 2100 });
    if (body.actif !== undefined) patch.actif = Boolean(body.actif);
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(patch)) {
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) return sendJson(res, 400, { error: "rien à changer" });
    params.push(vehicle.id);
    await query(`UPDATE fleet_vehicles SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: String(error.message || error) });
  }
}
