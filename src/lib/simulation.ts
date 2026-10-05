// Car simulation engine — IDM Physics + Look-ahead + Unlimited Trail
import {
  haversineDistance,
  bearing,
  DRIVER_PROFILES,
  INTERRUPTION_THRESHOLD_SECONDS,
} from "./algeriaData";

export interface RoutePoint { lat: number; lon: number; }
export type ProfilConducteur = "prudent" | "normal" | "agressif";
export interface DriverProfile { speed_factor: number; acceleration: number; deceleration: number; reaction_time: number; }

export interface Proprietaire {
  id: number; nin: string; type: "physique" | "morale"; nom?: string; prenom?: string; raisonSociale?: string;
  dateNaissance?: Date; age?: number; telephone: string; adresse: string; commune: string; wilaya: string; codeWilaya: string;
}

export interface Conducteur {
  id: number; nin: string; nom: string; prenom: string; dateNaissance: Date; age: number; telephone: string;
  numeroPermis: string; categoriePermis: string; commune: string; wilaya: string; profil: ProfilConducteur;
  speed_factor: number; a_max: number; b_comfort: number; reaction_time: number;
}

export type CategorieVehicule = "leger" | "lourd" | "transport" | "transport_dangereux" | "convoi_exceptionnel" | "transport_personnel";
export interface Voiture {
  id: number; carId: string; proprietaire: Proprietaire; immatriculation: string; marque: string; modele: string;
  couleur: string; annee: number; mapColor: string;
  categorieVehicule: CategorieVehicule; hauteur: number; largeur: number; poids: number; convoiSpecial: boolean;
}

export interface Itineraire {
  id: string; voitureId: number; conducteur: Conducteur; villeDepart: string; villeArrivee: string;
  debutAt: Date; finAt?: Date; distanceKm: number; vitesseMoyenne: number; vitesseMax: number;
  nombreArrets: number; statut: "en_cours" | "termine" | "interrompu";
}

export type SpeedProfilePoint = { pct: number; speedKmh: number }; // pct 0-100, speed 0-170

export interface CarState {
  voiture: Voiture; conducteurActuel: Conducteur; itineraireActuel: Itineraire;
  lat: number; lon: number; speed: number; acceleration: number; heading: number;
  distanceTraveled: number; totalDistanceTraveled: number; status: string;
  routePoints: RoutePoint[]; routeIndex: number; originCity: string; destinationCity: string;
  needsNewRoute: boolean; waitTicks: number; lastRecordTime: Date; consecutiveStopTicks: number;
  currentV_ms: number; currentV0_ms: number; targetCruiseV_ms: number; cruiseTimer_s: number;
  isSlowingDown: boolean; lastAcc_ms2: number;
  customSpeedProfile?: SpeedProfilePoint[] | null; // croquis main levée
  customItinerary?: { origin: { lat: number; lon: number }; destination: { lat: number; lon: number } } | null;
  currentRoadName?: string; currentRoadMaxSpeed?: number | null;
  currentRoadRestrictions?: { maxheight?: string; maxwidth?: string; maxweight?: string; hgv?: string; hazmat?: string; access?: string; oneway?: string; stopping?: string; parking?: string; no_parking?: string; no_stopping?: string; "parking:lane:both"?: string } | null;
  currentRoadBearing?: number | null;
  continuousDrivingSec: number;
  lastInfractionLongDriveAt?: number;
  carburant?: number | null; // % réservoir remonté par GPS (external/track), null si inconnu
  footprintTrail: { lat: number; lon: number; speed: number; time: Date }[];
}

export interface SpeedInfraction {
  id: string; carId: string; immatriculation: string; conducteurNom: string;
  roadName: string; troncon: string;
  infraction: "exces de vitesse" | "impossible de comparée" | "zone interdite" | "tentative passage interdit" | "circulation à contresens" | "conduite longue sans arrêt" | "arrêt interdit" | "stationnement interdit";
  speed: number; speedLimit: number; excess: number;
  restriction?: string;
  categorieVehicule?: string;
  lat: number; lon: number;
  recordedAt: string; itineraireId: string;
}

export interface FootprintRecord {
  itineraireId: string; carId: string; latitude: number; longitude: number; altitude: number;
  vitesse: number; acceleration: number; cap: number; distanceCumulee: number;
  recordedAt: string; deltaSecondes: number; statut: string; estInterruption: boolean;
}

export interface CustomRoadNetwork {
  features: { geometry: { type: "LineString"; coordinates: [number, number][]; }; properties: any; }[];
  stops?: { geometry: { type: "Point"; coordinates: [number, number]; }; properties: any; }[];
}

function calculateIDMAcceleration(v: number, v0: number, a: number, b: number, s: number) {
  if (v0 <= 0.1) return -b;
  const freeTerm = 1 - Math.pow(v / Math.max(0.1, v0), 4);
  const s0 = 2.0, T = 1.5, s_star = s0 + v * T + (v * v) / (2 * Math.sqrt(a * b));
  return a * (freeTerm - Math.pow(s_star / Math.max(0.5, s), 2));
}

export function getRoadLimitKmh(c: CarState, lookAheadMeters: number): number {
  let weightedSum = 0, weightTot = 0, dist = 0, idx = c.routeIndex;
  if (!c.routePoints || c.routePoints.length < 2) return 90;
  while (dist < lookAheadMeters && idx + 2 < c.routePoints.length) {
    const b1 = bearing(c.routePoints[idx].lat, c.routePoints[idx].lon, c.routePoints[idx+1].lat, c.routePoints[idx+1].lon);
    const b2 = bearing(c.routePoints[idx+1].lat, c.routePoints[idx+1].lon, c.routePoints[idx+2].lat, c.routePoints[idx+2].lon);
    let diff = Math.abs(b2 - b1); if (diff > 180) diff = 360 - diff;
    if (diff < 1.5) diff = 0; // bruit OSM <1.5° = ligne droite
    const segLen = haversineDistance(c.routePoints[idx].lat, c.routePoints[idx].lon, c.routePoints[idx+1].lat, c.routePoints[idx+1].lon);
    const w = Math.max(0.2, 1 - dist / lookAheadMeters) * segLen; // pondéré distance + longueur segment
    weightedSum += diff * w;
    weightTot += w;
    dist += segLen;
    idx++;
  }
  const avgCurv = weightTot > 0 ? weightedSum / weightTot : 0;
  // Lissage continu : 0°->170, 3°->130, 8°->90, 15°->55 (170 max demandé)
  const smooth = 170 / (1 + Math.pow(avgCurv / 8, 1.35));
  return Math.max(35, Math.min(170, Math.round(smooth)));
}

function isTerminalStatus(s: string): boolean {
  return s === "terminé" || s === "terminés" || s === "arrivée" || s === "termine";
}

// Projette (lat,lon) sur le segment [a,b] — garantit 100% sur route OSM
function snapToSegment(lat: number, lon: number, a: RoutePoint, b: RoutePoint): RoutePoint {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const ax = (b.lon - a.lon) * cosLat;
  const ay = b.lat - a.lat;
  const px = (lon - a.lon) * cosLat;
  const py = lat - a.lat;
  const len2 = ax * ax + ay * ay;
  if (len2 === 0) return { lat: a.lat, lon: a.lon };
  let t = (px * ax + py * ay) / len2;
  t = Math.max(0, Math.min(1, t));
  return { lat: a.lat + ay * t, lon: a.lon + ax * t / cosLat };
}

export function advanceCarAlongRoute(car: CarState, deltaT: number): { car: CarState; isInterruption: boolean } {
  const c = { ...car }; 
  if (isTerminalStatus(c.status)) {
    c.status = "terminé";
    c.speed = 0; c.currentV_ms = 0; c.acceleration = 0; return { car: c, isInterruption: false };
  }
  if (c.waitTicks > 0) { 
    c.waitTicks--; c.speed = 0; c.currentV_ms = 0; c.acceleration = 0; c.status = "arrêt temporaire"; return { car: c, isInterruption: false }; 
  }
  if (!c.routePoints || c.routePoints.length === 0) {
    c.speed = 0; c.status = "chargement route..."; return { car: c, isInterruption: false };
  }
  if (c.routeIndex >= c.routePoints.length - 1) {
    c.speed = 0; c.currentV_ms = 0; c.status = "terminé";
    if (c.itineraireActuel.statut === "en_cours") c.itineraireActuel = { ...c.itineraireActuel, statut: "termine", finAt: new Date() };
    return { car: c, isInterruption: false };
  }

  const dt = 0.1, totalSteps = Math.round(deltaT / dt);
  for (let s = 0; s < totalSteps; s++) {
    if (c.routeIndex >= c.routePoints.length - 1) break;
    // Snap final : si on est à <12m de la destination, on considère arrivé (évite blocage IDM s0=2m)
    const s_dest_snap = haversineDistance(c.lat, c.lon, c.routePoints[c.routePoints.length - 1].lat, c.routePoints[c.routePoints.length - 1].lon);
    if (s_dest_snap < 12) {
      const last = c.routePoints[c.routePoints.length - 1];
      c.lat = last.lat; c.lon = last.lon;
      c.routeIndex = c.routePoints.length - 1;
      c.distanceTraveled += s_dest_snap; c.totalDistanceTraveled += s_dest_snap;
      c.footprintTrail.push({ lat: c.lat, lon: c.lon, speed: c.currentV_ms * 3.6, time: new Date() });
      break;
    }
    // Limite route lissée 250m d'anticipation, facteur conducteur — overridée si croquis
    let roadSafeV_ms: number;
    const hasSketch = !!(c.customSpeedProfile && c.customSpeedProfile.length >= 2);
    if (hasSketch) {
      // pct basé sur distance parcourue (plus fidèle que l'index)
      let totalDist = 0;
      for (let i = 0; i < c.routePoints.length - 1; i++) totalDist += haversineDistance(c.routePoints[i].lat, c.routePoints[i].lon, c.routePoints[i+1].lat, c.routePoints[i+1].lon);
      const pct = totalDist > 1 ? Math.min(100, (c.distanceTraveled / totalDist) * 100) : 0;
      // interpolation linéaire sur le croquis
      let seg = 0;
      for (let i = 0; i < c.customSpeedProfile!.length - 1; i++) {
        if (pct >= c.customSpeedProfile![i].pct && pct <= c.customSpeedProfile![i + 1].pct) { seg = i; break; }
      }
      if (pct > c.customSpeedProfile![c.customSpeedProfile!.length - 1].pct) seg = c.customSpeedProfile!.length - 2;
      if (pct < c.customSpeedProfile![0].pct) seg = 0;
      const a = c.customSpeedProfile![seg], b = c.customSpeedProfile![seg + 1];
      const t = b.pct === a.pct ? 0 : (pct - a.pct) / (b.pct - a.pct);
      const sketchKmh = a.speedKmh + (b.speedKmh - a.speedKmh) * t;
      // Sketch prioritaire : on ne bride que si la route est très sinueuse (sécurité), pas systématiquement
      const roadCap = getRoadLimitKmh(c, 250);
      // Si sketch dépasse roadCap de <15 km/h, on suit le sketch (volonté utilisateur), sinon on cap à roadCap
      roadSafeV_ms = (sketchKmh <= roadCap + 15 ? sketchKmh : roadCap) / 3.6;
    } else {
      roadSafeV_ms = (getRoadLimitKmh(c, 250) * c.conducteurActuel.speed_factor) / 3.6;
    }
    // Filtrage passe-bas : doux en mode normal (0.03), réactif en mode sketch (0.18) pour suivre le croquis
    const v0Alpha = hasSketch ? 0.18 : 0.03;
    c.currentV0_ms = c.currentV0_ms + (roadSafeV_ms - c.currentV0_ms) * v0Alpha;
    const s_dest = s_dest_snap;
    // Démarrage en douceur : 1er 80m bride l'accélération à 60%
    const isStarting = c.totalDistanceTraveled < 80;
    const a_max_eff = isStarting ? c.conducteurActuel.a_max * 0.55 : c.conducteurActuel.a_max;
    // Arrêt en douceur : sous 120m on baisse progressivement v0
    let v0_eff = c.currentV0_ms;
    if (s_dest < 120) v0_eff = Math.min(v0_eff, Math.max(3, (s_dest / 120) * c.currentV0_ms));
    let accRaw = calculateIDMAcceleration(c.currentV_ms, v0_eff, a_max_eff, c.conducteurActuel.b_comfort, Math.max(s_dest, 10));
    // Rare freinage brusque : on bride les décélérations fortes si pas de virage serré
    if (accRaw < -2.0 && s_dest > 80) {
      const curv = 120 - getRoadLimitKmh(c, 80); // 0 si ligne droite
      if (curv < 40) accRaw = Math.max(accRaw, -1.6); // pas de virage -> freinage doux max
    }
    accRaw = Math.max(-c.conducteurActuel.b_comfort, Math.min(a_max_eff, accRaw));
    // Jerk réaliste : limite la variation d'accélération par dt
    const jerkMax = c.conducteurActuel.profil === "prudent" ? 1.0 : c.conducteurActuel.profil === "agressif" ? 2.2 : 1.6; // m/s³
    const prevAcc = c.lastAcc_ms2 ?? 0;
    const jerkClamped = Math.max(-jerkMax * dt, Math.min(jerkMax * dt, accRaw - prevAcc));
    const acc = prevAcc + jerkClamped;
    c.lastAcc_ms2 = acc;
    c.currentV_ms = Math.max(0, c.currentV_ms + acc * dt);
    const moveDist = c.currentV_ms * dt; let rem = moveDist;
    while (rem > 0 && c.routeIndex < c.routePoints.length - 1) {
      const target = c.routePoints[c.routeIndex + 1], d = haversineDistance(c.lat, c.lon, target.lat, target.lon);
      if (d <= rem) {
        rem -= d; c.lat = target.lat; c.lon = target.lon; c.routeIndex++;
        c.distanceTraveled += d; c.totalDistanceTraveled += d;
      } else {
        const ratio = rem / d;
        const interpLat = c.lat + (target.lat - c.lat) * ratio;
        const interpLon = c.lon + (target.lon - c.lon) * ratio;
        const snapped = snapToSegment(interpLat, interpLon, { lat: c.lat, lon: c.lon }, target);
        c.lat = snapped.lat; c.lon = snapped.lon;
        c.distanceTraveled += rem; c.totalDistanceTraveled += rem; rem = 0;
      }
    }
    // Footprint régulier toutes les 1s (10*dt) -> courbe vitesse lisse, 100% sur route (snap déjà fait)
    if (s % 10 === 0) {
      c.footprintTrail.push({ lat: c.lat, lon: c.lon, speed: Math.round(c.currentV_ms * 3.6 * 10) / 10, time: new Date() });
    }
  }
  c.speed = Math.round(c.currentV_ms * 3.6 * 10) / 10;
  c.acceleration = Math.round((c.speed - car.speed) / deltaT * 10) / 10;
  // Filet de sécurité : si proche de la fin (<20m) on force l'arrivée même si l'index n'a pas bougé (IDM)
  const distToEnd = haversineDistance(c.lat, c.lon, c.routePoints[c.routePoints.length - 1].lat, c.routePoints[c.routePoints.length - 1].lon);
  if (c.routeIndex >= c.routePoints.length - 1 || distToEnd < 20) {
    if (distToEnd < 20 && c.routeIndex < c.routePoints.length - 1) {
      const last = c.routePoints[c.routePoints.length - 1];
      c.lat = last.lat; c.lon = last.lon;
      c.routeIndex = c.routePoints.length - 1;
      c.distanceTraveled += distToEnd; c.totalDistanceTraveled += distToEnd;
    }
    c.speed = 0; c.currentV_ms = 0; c.status = "terminé";
    if (c.itineraireActuel.statut === "en_cours") c.itineraireActuel = { ...c.itineraireActuel, statut: "termine", finAt: new Date() };
  } else {
    c.status = "en route";
    const next = c.routePoints[c.routeIndex + 1]; c.heading = Math.round(bearing(c.lat, c.lon, next.lat, next.lon) * 10) / 10;
  }
  c.itineraireActuel.distanceKm = Math.round(c.distanceTraveled / 10) / 100;
  c.lastRecordTime = new Date(); return { car: c, isInterruption: false };
}

export function carsToGeoJSON(cars: CarState[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cars.map((car) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [car.lon, car.lat] },
      properties: {
        carId: car.voiture.carId, immatriculation: car.voiture.immatriculation, marque: car.voiture.marque, modele: car.voiture.modele,
        couleurVoiture: car.voiture.couleur, typeVehicule: "Véhicule Léger",
        proprietaireNom: car.voiture.proprietaire?.type === "physique" ? `${car.voiture.proprietaire.prenom || ""} ${car.voiture.proprietaire.nom || ""}`.trim() || "Externe" : (car.voiture.proprietaire?.raisonSociale || "Externe"),
        proprietaireTel: car.voiture.proprietaire?.telephone || "", conducteurNom: `${car.conducteurActuel?.prenom || ""} ${car.conducteurActuel?.nom || ""}`.trim() || "Externe", conducteurTel: car.conducteurActuel?.telephone || "",
        conducteurPermis: car.conducteurActuel?.numeroPermis || "", conducteurProfil: car.conducteurActuel?.profil || "normal", originCity: car.originCity, destinationCity: car.destinationCity,
        speed: car.speed, acceleration: car.acceleration, heading: car.heading, distanceKm: car.itineraireActuel?.distanceKm || 0, status: car.status, color: car.voiture.mapColor,
        routeProgress: car.routePoints?.length > 0 ? Math.round((car.routeIndex / Math.max(1, car.routePoints.length - 1)) * 100) : 0,
      },
    })),
  };
}

export function carFootprintToGeoJSON(car: CarState): GeoJSON.FeatureCollection {
  const trail = car.footprintTrail; if (trail.length === 0) return { type: "FeatureCollection", features: [] };
  const points: GeoJSON.Feature[] = trail.map((p) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] }, properties: { speed: p.speed, time: p.time.toISOString() } }));
  const line: GeoJSON.Feature = { type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: trail.map((p) => [p.lon, p.lat]) }, properties: { carId: car.voiture.carId, color: car.voiture.mapColor } };
  return { type: "FeatureCollection", features: [line, ...points] };
}
