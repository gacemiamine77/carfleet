export function text(value, max, { required = false } = {}) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned && required) throw new Error("Champ requis manquant");
  if (cleaned.length > max) throw new Error(`Champ trop long (maximum ${max})`);
  return cleaned;
}

export function optionalText(value, max) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return text(value, max);
}

export function finiteNumber(value, { required = false, min = -Infinity, max = Infinity } = {}) {
  if ((value === undefined || value === null || value === "") && !required) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error("Nombre invalide");
  return number;
}

export function coordinate(value, kind) {
  const number = finiteNumber(value, { required: true, min: kind === "lat" ? -90 : -180, max: kind === "lat" ? 90 : 180 });
  return number;
}

export function parseDate(value) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Date invalide");
  return date;
}

export function haversineMeters(aLat, aLon, bLat, bLon) {
  const earth = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

export function vin(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const cleaned = String(value).trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) throw new Error("VIN invalide (17 caractères, sans I/O/Q)");
  return cleaned;
}

export function dansCercle(lat, lon, centreLat, centreLon, rayonM) {
  return haversineMeters(lat, lon, centreLat, centreLon) <= rayonM;
}

// Ray casting : points au format [lat, lon].
export function dansPolygone(lat, lon, points) {
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [latI, lonI] = points[i];
    const [latJ, lonJ] = points[j];
    if (lonI > lon !== lonJ > lon && lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI) {
      inside = !inside;
    }
  }
  return inside;
}

export function dansZone(lat, lon, zone) {
  if (zone.type === "cercle") {
    return dansCercle(lat, lon, Number(zone.centre_lat), Number(zone.centre_lon), Number(zone.rayon_m));
  }
  const points = Array.isArray(zone.points) ? zone.points : JSON.parse(zone.points || "[]");
  return dansPolygone(lat, lon, points);
}

export function serialId(prefix = "FLT") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`.slice(0, 40);
}

export function ownerNin() {
  return `FLEET-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 32);
}

export function driverNin(carId) {
  return `FLEET-COND-${String(carId || "VEH").slice(0, 10)}-${Date.now().toString(36)}`.slice(0, 32);
}
