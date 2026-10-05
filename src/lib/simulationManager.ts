// Server-side simulation state manager (singleton)
import {
  CarState,
  FootprintRecord,
  RoutePoint,
  Proprietaire,
  Conducteur,
  Voiture,
  CategorieVehicule,
  Itineraire,
  advanceCarAlongRoute,
  CustomRoadNetwork,
  ProfilConducteur,
  SpeedInfraction,
  getRoadLimitKmh,
} from "./simulation";
import {
  NORTH_ALGERIA_CITIES,
  NOMS_ALGERIENS,
  PRENOMS_MASCULINS,
  PRENOMS_FEMININS,
  RAISONS_SOCIALES,
  MARQUES_VOITURES,
  COULEURS_VOITURES,
  CAR_MAP_COLORS,
  WILAYAS,
  generateNIN,
  generatePhone,
  generateImmatriculation,
  generateDateNaissance,
  calculateAge,
  generateNumeroPermis,
  haversineDistance,
  bearing,
  INTERRUPTION_THRESHOLD_SECONDS,
} from "./algeriaData";
import { v4 as uuidv4 } from "uuid";

export interface SimulationConfig {
  numCars: number;
  recordIntervalSec: number;
  timeMultiplier: number;
  flushThresholdKb: number;
  flushThresholdMinutes: number;
  selectedWilayas: string[];
  vehicleCategories?: string[];
  simulateContresens?: boolean;
  maxContinuousDrivingHours?: number;
  customOrigin?: string | null;
  customDestination?: string | null;
  sourceDonnees?: "aleatoire" | "registre"; // registre = vrais inscrits (propriétaires-app)
}

export interface RegistreTriplet { proprietaire: Proprietaire; voiture: Voiture; conducteur: Conducteur; }

// Charge tout le registre inscrit (véhicules + propriétaire + chauffeur désigné)
// pour que la simulation utilise les vrais noms. Fallback conducteur généré si non désigné.
export async function loadRegistreTriplets(allowedCategories?: string[]): Promise<RegistreTriplet[]> {
  const { db } = await import("@/db");
  const { voitures, proprietaires, conducteurs, affectations, comptesProprietaires } = await import("@/db/schema");
  const { eq, and, desc } = await import("drizzle-orm");
  // Uniquement les propriétaires INSCRITS (avec compte), pas les véhicules externes auto-créés
  const rows = await db.select({ voiture: voitures, proprio: proprietaires })
    .from(voitures).innerJoin(proprietaires, eq(voitures.proprietaireId, proprietaires.id))
    .innerJoin(comptesProprietaires, eq(comptesProprietaires.proprietaireId, proprietaires.id))
    .orderBy(desc(voitures.id));
  const out: RegistreTriplet[] = [];
  let colorIdx = 0;
  for (const { voiture: v, proprio: p } of rows) {
    const cat = ((v as any).categorieVehicule || "leger") as CategorieVehicule;
    if (allowedCategories?.length && !allowedCategories.includes(cat)) continue;
    const aff = await db.select({ cond: conducteurs }).from(affectations)
      .innerJoin(conducteurs, eq(affectations.conducteurId, conducteurs.id))
      .where(and(eq(affectations.voitureId, v.id), eq(affectations.actif, true as any)))
      .orderBy(desc(affectations.id)).limit(1);
    const dc = aff[0]?.cond;
    const dnProp = p.dateNaissance ? new Date(p.dateNaissance as any) : undefined;
    const proprietaire: Proprietaire = {
      id: p.id, nin: p.nin, type: p.type as any,
      nom: p.nom || undefined, prenom: p.prenom || undefined, raisonSociale: p.raisonSociale || undefined,
      dateNaissance: dnProp, telephone: p.telephone, adresse: p.adresse || "",
      commune: p.commune || "", wilaya: p.wilaya || "", codeWilaya: p.codeWilaya || "",
    };
    const voiture: Voiture = {
      id: v.id, carId: v.carId, proprietaire, immatriculation: v.immatriculation,
      marque: v.marque || "Inconnue", modele: v.modele || "—", couleur: v.couleur || "Gris",
      annee: v.annee || 2020, mapColor: CAR_MAP_COLORS[colorIdx++ % CAR_MAP_COLORS.length],
      categorieVehicule: cat, hauteur: (v as any).hauteur || 1.6, largeur: (v as any).largeur || 1.8,
      poids: (v as any).poids || 1.5, convoiSpecial: !!(v as any).convoiSpecial,
    };
    let conducteur: Conducteur;
    if (dc) {
      const dn = dc.dateNaissance ? new Date(dc.dateNaissance as any) : new Date(1990, 0, 1);
      conducteur = {
        id: dc.id, nin: dc.nin, nom: dc.nom, prenom: dc.prenom, dateNaissance: dn,
        age: calculateAge(dn), telephone: dc.telephone, numeroPermis: dc.numeroPermis || "—",
        categoriePermis: dc.categoriePermis || "B", commune: dc.commune || "", wilaya: dc.wilaya || "",
        profil: "normal", speed_factor: 0.95, a_max: 1.5, b_comfort: 2.5, reaction_time: 1.2,
      };
    } else {
      conducteur = generateConducteur(9000 + out.length, new Set<string>());
      conducteur.nom = "Non désigné";
    }
    out.push({ proprietaire, voiture, conducteur });
  }
  return out;
}

export interface SimulationState {
  sessionId: string;
  config: SimulationConfig;
  cars: CarState[];
  proprietaires: Proprietaire[];
  conducteurs: Conducteur[];
  running: boolean;
  startedAt: number;
  simulatedElapsedSec: number;
  footprintRecords: Map<string, FootprintRecord[]>;
  itinerairesHistory: Map<string, { itineraire: Itineraire; carId: string }>;
  infractions: SpeedInfraction[];
  lastInfractionAt: Map<string, number>;
  lastFlushAt: number;
  totalRecordsSent: number;
  intervalHandle: ReturnType<typeof setInterval> | null;
  routeFetchQueue: Set<string>;
  fetchingRoutes: boolean;
  customRoads: CustomRoadNetwork | null;
}

const globalForSim = globalThis as typeof globalThis & {
  __simState?: SimulationState | null;
  __pendingCustomRoads?: CustomRoadNetwork | null;
};

// Index spatial en grille (cellule ~2,2 km) : évite de scanner les 449 Mo de routes
// à chaque tick (gel du serveur). Construit une fois par wilaya, requêtes en O(voisins).
const ROAD_CELL = 0.02;
interface WilayaRoadIndex { lats: number[]; lons: number[]; ms: (number | null)[]; props: any[]; grid: Map<string, number[]>; }
const osmRoadsCache = new Map<string, WilayaRoadIndex | null>();
function roadCellKey(lat: number, lon: number): string {
  return Math.floor(lat / ROAD_CELL) + ":" + Math.floor(lon / ROAD_CELL);
}
function loadWilayaRoads(code: string): WilayaRoadIndex | null {
  if (osmRoadsCache.has(code)) return osmRoadsCache.get(code) ?? null;
  let idx: WilayaRoadIndex | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs"); const path = require("path");
    const file = path.join(process.cwd(), "public", "data", "algeria-roads", `algeria-roads-${code}.geojson`);
    if (fs.existsSync(file)) {
      const gj = JSON.parse(fs.readFileSync(file, "utf8"));
      const lats: number[] = [], lons: number[] = [], ms: (number | null)[] = [], props: any[] = [];
      const grid = new Map<string, number[]>();
      for (const f of gj.features || []) {
        let coords = f.geometry?.coordinates;
        if (!Array.isArray(coords)) continue;
        // MultiLineString → aplatit d'un niveau
        if (Array.isArray(coords[0]?.[0])) {
          const flat: any[] = [];
          for (const line of coords) if (Array.isArray(line)) flat.push(...line);
          coords = flat;
        }
        const m = f.properties?.maxspeed ? parseInt(String(f.properties.maxspeed).replace(/[^0-9]/g, ""), 10) : NaN;
        const mVal = Number.isFinite(m) ? m : null;
        const pr = f.properties || {};
        for (const c of coords) {
          const clon = c?.[0], clat = c?.[1];
          if (!Number.isFinite(clon) || !Number.isFinite(clat)) continue;
          const i = lats.length;
          lats.push(clat); lons.push(clon); ms.push(mVal); props.push(pr);
          const k = roadCellKey(clat, clon);
          let arr = grid.get(k);
          if (!arr) { arr = []; grid.set(k, arr); }
          arr.push(i);
        }
      }
      idx = { lats, lons, ms, props, grid };
    }
  } catch {}
  osmRoadsCache.set(code, idx);
  return idx;
}
function nearestRoadPt(idx: WilayaRoadIndex, lat: number, lon: number, maxDistM: number, needMs: boolean): number {
  const cx = Math.floor(lat / ROAD_CELL), cy = Math.floor(lon / ROAD_CELL);
  let best = -1, bestDist = Infinity;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const arr = idx.grid.get((cx + dx) + ":" + (cy + dy));
    if (!arr) continue;
    for (const i of arr) {
      if (needMs && idx.ms[i] == null) continue;
      const d = haversineDistance(lat, lon, idx.lats[i], idx.lons[i]);
      if (d < bestDist && d < maxDistM) { bestDist = d; best = i; }
    }
  }
  return best;
}
const ALL_WILAYAS = Array.from({ length: 58 }, (_, i) => String(i + 1).padStart(2, "0"));
function getOsmMaxSpeedForPosition(lat: number, lon: number, wilayaCode?: string): number | null {
  try {
    const codes = wilayaCode ? [wilayaCode] : ALL_WILAYAS;
    for (const code of codes) {
      const idx = loadWilayaRoads(code);
      if (!idx) continue;
      const i = nearestRoadPt(idx, lat, lon, 200, true);
      if (i >= 0) return idx.ms[i];
    }
  } catch {}
  return null;
}

function getOsmRestrictionsForPosition(lat: number, lon: number, wilayaCode?: string): any | null {
  try {
    const codes = wilayaCode ? [wilayaCode] : ALL_WILAYAS;
    for (const code of codes) {
      const idx = loadWilayaRoads(code);
      if (!idx) continue;
      const i = nearestRoadPt(idx, lat, lon, 80, false);
      if (i >= 0) return idx.props[i];
    }
  } catch {}
  return null;
}

function checkZoneInterdite(voiture: Voiture, roadProps: any): string | null {
  if (!roadProps) return null;
  const cat = voiture.categorieVehicule;
  const isLourd = cat === "lourd" || cat === "transport" || cat === "transport_dangereux" || cat === "convoi_exceptionnel";
  const isDangereux = cat === "transport_dangereux";
  // hgv
  if (isLourd && (roadProps.hgv === "no" || roadProps.hgv === "private" || roadProps.goods === "no")) return `Interdiction poids lourd (hgv=no)`;
  if (isDangereux && (roadProps.hazmat === "no" || roadProps.hazmat === "private")) return `Interdiction matières dangereuses (hazmat=no)`;
  if (roadProps.access === "no" || roadProps.access === "private") return `Accès interdit (access=${roadProps.access})`;
  if (roadProps.motor_vehicle === "no") return `Véhicules à moteur interdits`;
  // hauteur
  if (roadProps.maxheight) {
    const mh = parseFloat(String(roadProps.maxheight).replace(/[^0-9.]/g,""));
    if (Number.isFinite(mh) && voiture.hauteur > mh) return `Hauteur limite ${mh}m dépassée (${voiture.hauteur}m)`;
  }
  if (roadProps.maxwidth) {
    const mw = parseFloat(String(roadProps.maxwidth).replace(/[^0-9.]/g,""));
    if (Number.isFinite(mw) && voiture.largeur > mw) return `Largeur limite ${mw}m dépassée (${voiture.largeur}m)`;
  }
  if (roadProps.maxweight) {
    const mw = parseFloat(String(roadProps.maxweight).replace(/[^0-9.]/g,""));
    if (Number.isFinite(mw) && voiture.poids > mw) return `Poids limite ${mw}t dépassé (${voiture.poids}t)`;
  }
  if (voiture.convoiSpecial && roadProps.highway === "residential") return `Convoi exceptionnel interdit en zone résidentielle`;
  return null;
}

const OSRM_BASE = "https://router.project-osrm.org";

function isCarTerminated(status: string): boolean {
  return status === "terminé" || status === "terminés" || status === "arrivée" || status === "termine";
}

// ─── DATA GENERATORS ────────────────────────────────────────────

function generateProprietaire(id: number): Proprietaire {
  const isPhysique = Math.random() > 0.3;
  const wilaya = WILAYAS[Math.floor(Math.random() * WILAYAS.length)];
  const city = NORTH_ALGERIA_CITIES.find(c => c[3] === wilaya.code) || NORTH_ALGERIA_CITIES[0];

  if (isPhysique) {
    const isMale = Math.random() > 0.4;
    const dateNaissance = generateDateNaissance(25, 70);
    return {
      id, nin: generateNIN(), type: "physique",
      nom: NOMS_ALGERIENS[Math.floor(Math.random() * NOMS_ALGERIENS.length)],
      prenom: isMale ? PRENOMS_MASCULINS[Math.floor(Math.random() * PRENOMS_MASCULINS.length)] : PRENOMS_FEMININS[Math.floor(Math.random() * PRENOMS_FEMININS.length)],
      dateNaissance, age: calculateAge(dateNaissance), telephone: generatePhone(),
      adresse: `${Math.floor(Math.random() * 200) + 1}, Rue ${NOMS_ALGERIENS[Math.floor(Math.random() * NOMS_ALGERIENS.length)]}`,
      commune: city[0], wilaya: wilaya.name, codeWilaya: wilaya.code,
    };
  } else {
    return {
      id, nin: generateNIN(), type: "morale",
      raisonSociale: RAISONS_SOCIALES[Math.floor(Math.random() * RAISONS_SOCIALES.length)],
      telephone: generatePhone(), adresse: `Zone Industrielle, Lot ${Math.floor(Math.random() * 50) + 1}`,
      commune: city[0], wilaya: wilaya.name, codeWilaya: wilaya.code,
    };
  }
}

function generateConducteur(id: number, usedNames: Set<string>): Conducteur {
  const isMale = Math.random() > 0.3;
  const dateNaissance = generateDateNaissance(20, 60);
  const wilaya = WILAYAS[Math.floor(Math.random() * WILAYAS.length)];
  const city = NORTH_ALGERIA_CITIES.find(c => c[3] === wilaya.code) || NORTH_ALGERIA_CITIES[0];
  const p_choice: ProfilConducteur = Math.random() < 0.25 ? "prudent" : Math.random() > 0.85 ? "agressif" : "normal";
  
  let speed_factor = 0.95, a_max = 1.5, b_comfort = 2.5, reaction_time = 1.2;
  if (p_choice === "prudent") { speed_factor = 0.82; a_max = 1.0; b_comfort = 1.5; reaction_time = 1.5; } 
  else if (p_choice === "agressif") { speed_factor = 1.08; a_max = 2.0; b_comfort = 3.5; reaction_time = 0.9; }

  // Garantit unicité nom+prénom parmi les conducteurs générés
  let nom: string, prenom: string, key: string, attempts = 0;
  do {
    nom = NOMS_ALGERIENS[Math.floor(Math.random() * NOMS_ALGERIENS.length)];
    prenom = isMale ? PRENOMS_MASCULINS[Math.floor(Math.random() * PRENOMS_MASCULINS.length)] : PRENOMS_FEMININS[Math.floor(Math.random() * PRENOMS_FEMININS.length)];
    key = `${nom}|${prenom}`;
    attempts++;
    // Évite boucle infinie si pool épuisé
    if (attempts > 50) break;
  } while (usedNames.has(key));
  usedNames.add(key);

  return {
    id, nin: generateNIN(), nom, prenom,
    dateNaissance, age: calculateAge(dateNaissance), telephone: generatePhone(),
    numeroPermis: generateNumeroPermis(), categoriePermis: ["B", "C", "D", "E"][Math.floor(Math.random() * 4)],
    commune: city[0], wilaya: wilaya.name, profil: p_choice,
    speed_factor, a_max, b_comfort, reaction_time,
  };
}

function generateVoiture(id: number, proprietaire: Proprietaire, allowed?: string[]): Voiture {
  const marqueInfo = MARQUES_VOITURES[Math.floor(Math.random() * MARQUES_VOITURES.length)];
  const modele = marqueInfo.modeles[Math.floor(Math.random() * marqueInfo.modeles.length)];
  // Dimensions réelles par modèle (évite Polo lourd)
  const modelSpecs: Record<string, { cat: CategorieVehicule; h: number; l: number; p: number; convoi?: boolean }> = {
    // Léger - citadines/berlines
    "Polo": { cat: "leger", h: 1.46, l: 1.75, p: 1.2 }, "Clio": { cat: "leger", h: 1.44, l: 1.73, p: 1.2 }, "208": { cat: "leger", h: 1.43, l: 1.74, p: 1.1 }, "301": { cat: "leger", h: 1.48, l: 1.74, p: 1.2 }, "Accent": { cat: "leger", h: 1.45, l: 1.73, p: 1.2 }, "i10": { cat: "leger", h: 1.48, l: 1.68, p: 1.0 }, "i20": { cat: "leger", h: 1.49, l: 1.73, p: 1.1 }, "Yaris": { cat: "leger", h: 1.50, l: 1.73, p: 1.1 }, "Rio": { cat: "leger", h: 1.45, l: 1.72, p: 1.2 }, "Picanto": { cat: "leger", h: 1.48, l: 1.59, p: 1.0 }, "Ibiza": { cat: "leger", h: 1.42, l: 1.78, p: 1.2 }, "Aveo": { cat: "leger", h: 1.51, l: 1.68, p: 1.1 }, "Spark": { cat: "leger", h: 1.55, l: 1.59, p: 1.0 }, "Punto": { cat: "leger", h: 1.49, l: 1.68, p: 1.1 }, "Logan": { cat: "leger", h: 1.52, l: 1.73, p: 1.3 }, "Sandero": { cat: "leger", h: 1.52, l: 1.73, p: 1.3 },
    // Léger SUV
    "Duster": { cat: "leger", h: 1.68, l: 1.80, p: 1.4 }, "Tucson": { cat: "leger", h: 1.65, l: 1.86, p: 1.6 }, "Sportage": { cat: "leger", h: 1.65, l: 1.85, p: 1.6 }, "Arona": { cat: "leger", h: 1.55, l: 1.78, p: 1.3 },
    // Transport léger / utilitaire
    "Kangoo": { cat: "transport", h: 1.83, l: 1.91, p: 1.8 }, "Partner": { cat: "transport", h: 1.84, l: 1.84, p: 1.6 }, "Dokker": { cat: "transport", h: 1.85, l: 1.75, p: 1.4 }, "Caddy": { cat: "transport", h: 1.86, l: 1.79, p: 1.7 }, "Doblo": { cat: "transport", h: 1.89, l: 1.83, p: 1.6 },
    // Lourd / transport
    "Hilux": { cat: "lourd", h: 1.81, l: 1.85, p: 2.1 }, "Hiace": { cat: "transport", h: 2.28, l: 1.95, p: 2.8 }, "H1": { cat: "transport", h: 1.93, l: 1.92, p: 2.3 }, "Carnival": { cat: "transport_personnel", h: 1.77, l: 1.98, p: 2.2 }, "Trafic": { cat: "transport", h: 1.97, l: 1.95, p: 1.9 }, "Master": { cat: "lourd", h: 2.49, l: 2.07, p: 3.5 },
    "Corolla": { cat: "leger", h: 1.43, l: 1.78, p: 1.3 }, "Megane": { cat: "leger", h: 1.44, l: 1.81, p: 1.4 }, "308": { cat: "leger", h: 1.44, l: 1.85, p: 1.4 }, "Golf": { cat: "leger", h: 1.49, l: 1.78, p: 1.3 }, "Leon": { cat: "leger", h: 1.44, l: 1.81, p: 1.4 }, "Cruze": { cat: "leger", h: 1.48, l: 1.79, p: 1.4 }, "Tipo": { cat: "leger", h: 1.50, l: 1.79, p: 1.4 },
    "Symbol": { cat: "leger", h: 1.51, l: 1.73, p: 1.2 }, "Expert": { cat: "transport", h: 1.94, l: 1.92, p: 1.9 }, "Ducato": { cat: "lourd", h: 2.52, l: 2.05, p: 3.5 }, "Transporter": { cat: "transport", h: 1.99, l: 1.90, p: 1.9 },
  };
  const spec = modelSpecs[modele];
  let cat: CategorieVehicule, hauteur: number, largeur: number, poids: number, convoiSpecial = false;
  if (spec) {
    cat = spec.cat; hauteur = spec.h + (Math.random()*0.04-0.02); largeur = spec.l + (Math.random()*0.02-0.01); poids = spec.p + (Math.random()*0.3-0.15);
    if (spec.convoi) convoiSpecial = true;
    // Si l'utilisateur a filtré les catégories et que le modèle ne correspond pas, on respecte le filtre en gardant le gabarit réel du modèle
    if (allowed && allowed.length && !allowed.includes(cat)) {
      // On garde le modèle (dimensions réelles) mais on force la catégorie au premier choix autorisé pour le filtrage
      const allCats: CategorieVehicule[] = ["leger", "lourd", "transport", "transport_dangereux", "convoi_exceptionnel", "transport_personnel"];
      const pool = (allowed as CategorieVehicule[]).filter(c=> allCats.includes(c));
      if (pool.length) cat = pool[Math.floor(Math.random() * pool.length)];
      // recalcul gabarit si catégorie forcée très différente (ex: Polo en lourd) → on garde dimensions Polo, pas lourd
      if (cat === "convoi_exceptionnel") { hauteur = 4.2 + Math.random()*0.6; largeur = 3.0 + Math.random()*0.5; poids = 40 + Math.random()*20; convoiSpecial = true; }
    }
  } else {
    const allCats: CategorieVehicule[] = ["leger", "lourd", "transport", "transport_dangereux", "convoi_exceptionnel", "transport_personnel"];
    const pool = allowed && allowed.length ? (allowed as CategorieVehicule[]).filter(c=> allCats.includes(c)) : allCats;
    const categories = pool.length ? pool : allCats;
    cat = categories[Math.floor(Math.random() * categories.length)];
    if (cat === "lourd") { hauteur = 3.2 + Math.random()*0.8; largeur = 2.4 + Math.random()*0.2; poids = 12 + Math.random()*8; }
    else if (cat === "transport") { hauteur = 3.5 + Math.random()*0.5; largeur = 2.5; poids = 20 + Math.random()*10; }
    else if (cat === "transport_dangereux") { hauteur = 3.6; largeur = 2.55; poids = 25 + Math.random()*5; }
    else if (cat === "convoi_exceptionnel") { hauteur = 4.2 + Math.random()*0.6; largeur = 3.0 + Math.random()*0.5; poids = 40 + Math.random()*20; convoiSpecial = true; }
    else if (cat === "leger") { hauteur = 1.5 + Math.random()*0.4; largeur = 1.7 + Math.random()*0.3; poids = 1.2 + Math.random()*0.8; }
    else { hauteur = 1.7; largeur = 1.9; poids = 2.5; }
  }
  return {
    id, carId: `CAR-${String(id).padStart(3, "0")}`, proprietaire,
    immatriculation: generateImmatriculation(proprietaire.codeWilaya),
    marque: marqueInfo.marque, modele,
    couleur: COULEURS_VOITURES[Math.floor(Math.random() * COULEURS_VOITURES.length)],
    annee: 2010 + Math.floor(Math.random() * 15), mapColor: CAR_MAP_COLORS[id % CAR_MAP_COLORS.length],
    categorieVehicule: cat, hauteur: Math.round(hauteur*100)/100, largeur: Math.round(largeur*100)/100, poids: Math.round(poids*10)/10, convoiSpecial,
  };
}

function generateItineraire(voiture: Voiture, conducteur: Conducteur, origin: string, destination: string): Itineraire {
  return { id: uuidv4(), voitureId: voiture.id, conducteur, villeDepart: origin, villeArrivee: destination, debutAt: new Date(), distanceKm: 0, vitesseMoyenne: 0, vitesseMax: 0, nombreArrets: 0, statut: "en_cours" };
}

const OSRM_ENDPOINTS = [
  "https://router.project-osrm.org",
  "https://routing.openstreetmap.de/routed-car",
  "https://osrm.cherrycache.org",
];

async function snapToRoad(lat: number, lon: number): Promise<{ lat: number; lon: number } | null> {
  for (const base of OSRM_ENDPOINTS) {
    const url = `${base}/nearest/v1/driving/${lon},${lat}?number=1`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if (data.code === "Ok" && data.waypoints?.[0]?.location) {
        const [nLon, nLat] = data.waypoints[0].location;
        // Si la route la plus proche est à > 5km, on considère que le point est vraiment isolé
        const dist = haversineDistance(lat, lon, nLat, nLon);
        if (dist < 15000) return { lat: nLat, lon: nLon };
      }
    } catch { continue; }
  }
  return null;
}

async function fetchOSRMRoute(fromLat: number, fromLon: number, toLat: number, toLon: number): Promise<RoutePoint[]> {
  // Snap les points loin d'une route (ex: point en plein désert / loin du réseau)
  let sFrom = { lat: fromLat, lon: fromLon };
  let sTo = { lat: toLat, lon: toLon };
  const snappedFrom = await snapToRoad(fromLat, fromLon);
  const snappedTo = await snapToRoad(toLat, toLon);
  if (snappedFrom) sFrom = snappedFrom;
  if (snappedTo) sTo = snappedTo;

  for (const base of OSRM_ENDPOINTS) {
    const url = `${base}/route/v1/driving/${sFrom.lon},${sFrom.lat};${sTo.lon},${sTo.lat}?overview=full&geometries=geojson&steps=false`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates?.length >= 2) {
        return data.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => ({ lat, lon }));
      }
      // Si NoRoute mais snap a fonctionné, on tente quand même avec les points originaux (cas pont/ferry)
      if (data.code === "NoRoute" && (snappedFrom || snappedTo)) {
        const fallbackUrl = `${base}/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=false`;
        try {
          const r2 = await fetch(fallbackUrl, { signal: AbortSignal.timeout(8000) });
          const d2 = await r2.json();
          if (d2.code === "Ok" && d2.routes?.[0]?.geometry?.coordinates?.length >= 2) {
            return d2.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => ({ lat, lon }));
          }
        } catch {}
      }
    } catch { continue; }
  }
  return []; // échec -> retry plus tard avec une autre paire de villes
}

function isChefLieu(city: typeof NORTH_ALGERIA_CITIES[0]): boolean {
  // Chef-lieu = "Wilaya Centre" ex: "Tiaret Centre" pour wilaya "Tiaret"
  return city[0] === `${city[4]} Centre`;
}

function clampToLand(lat: number, lon: number): { lat: number; lon: number } {
  // Évite la mer Méditerranée : au nord de 36.9° c'est la mer pour la côte algérienne
  if (lat > 36.92) lat = 36.92 - Math.random() * 0.08;
  if (lat < 18.5) lat = 18.5;
  if (lon < -8.7) lon = -8.7;
  if (lon > 12) lon = 12;
  // Sahara sud : reste dans les bornes Algérie
  return { lat, lon };
}

function getPool(selectedWilayas: string[], excludeChefLieu: boolean) {
  let av = NORTH_ALGERIA_CITIES;
  if (selectedWilayas && Array.isArray(selectedWilayas) && selectedWilayas.length > 0) {
    const cleanCodes = selectedWilayas.map(s => String(s).trim().padStart(2, "0"));
    av = NORTH_ALGERIA_CITIES.filter(c => cleanCodes.includes(String(c[3]).trim().padStart(2, "0")));
  }
  if (av.length === 0) av = NORTH_ALGERIA_CITIES;
  if (!excludeChefLieu) return av;
  const filtered = av.filter(c => !isChefLieu(c));
  // Si wilaya n'a que le chef-lieu (ex: Saida), on garde quand même la ville pour éviter pool vide,
  // mais on génèrera un point jitteré dans la wilaya (voir ci-dessous)
  return filtered.length > 0 ? filtered : av;
}

function pickRandomCityPair(selectedWilayas: string[], currentCityName?: string) {
  const avAll = getPool(selectedWilayas, false);
  const av = getPool(selectedWilayas, false); // garde chefs-lieux + communes
  const useJitteredOrigin = av.length === 0 || (avAll.length === 1 && isChefLieu(avAll[0]));

  // Wilaya avec 1 seule ville : jamais de Zone, on pioche 2 vrais chefs-lieux de commune distincts
  if (av.length <= 1 || useJitteredOrigin) {
    const pool = avAll.length >= 2 ? avAll : NORTH_ALGERIA_CITIES.filter(c => c[3] === avAll[0][3]);
    const realPool = pool.length >= 2 ? pool : NORTH_ALGERIA_CITIES;
    let oIdx = Math.floor(Math.random() * realPool.length);
    let dIdx: number;
    do { dIdx = Math.floor(Math.random() * realPool.length); } while (dIdx === oIdx);
    const oC = realPool[oIdx], dC = realPool[dIdx];
    return {
      origin: { name: oC[0], lat: oC[1], lon: oC[2] },
      destination: { name: dC[0], lat: dC[1], lon: dC[2] },
    };
  }

  let oIdx: number;
  if (currentCityName) {
    const found = av.findIndex(([name]) => name === currentCityName);
    // Si le currentCity est un chef-lieu (ex: arrivée précédente à Tiaret Centre), on re-tire hors chef-lieu
    oIdx = found !== -1 ? found : Math.floor(Math.random() * av.length);
    if (found !== -1 && isChefLieu(av[found])) oIdx = Math.floor(Math.random() * av.length);
  } else {
    oIdx = Math.floor(Math.random() * av.length);
  }

  // Pick a random distinct destination hors chef-lieu
  let dIdx: number;
  let attempts = 0;
  do {
    dIdx = Math.floor(Math.random() * av.length);
    if (dIdx !== oIdx && av.length > 2 && attempts < 8) {
      const dist = haversineDistance(av[oIdx][1], av[oIdx][2], av[dIdx][1], av[dIdx][2]);
      if (dist < 30000) { attempts++; continue; }
    }
    if (dIdx !== oIdx) break;
  } while (true);

  const o = av[oIdx], d = av[dIdx];
  return { origin: { name: o[0], lat: o[1], lon: o[2] }, destination: { name: d[0], lat: d[1], lon: d[2] } };
}

export function getSimulation(): SimulationState | null { return globalForSim.__simState ?? null; }
export function setPendingCustomRoads(net: CustomRoadNetwork | null) { globalForSim.__pendingCustomRoads = net; }
export function getPendingCustomRoads(): CustomRoadNetwork | null { return globalForSim.__pendingCustomRoads ?? null; }

export function createSimulation(config: SimulationConfig, registre?: RegistreTriplet[]): SimulationState {
  const existingState = getSimulation();
  if (existingState) stopSimulation();
  // Mode registre : vrais inscrits (tout le registre, cyclé si numCars > inscrits)
  const useRegistre = config.sourceDonnees === "registre" && registre && registre.length > 0;
  const prs = useRegistre ? [] : Array.from({ length: Math.ceil(config.numCars * 0.7) }, (_, i) => generateProprietaire(i + 1));
  const usedNames = new Set<string>();
  const cds = useRegistre ? [] : Array.from({ length: config.numCars + 5 }, (_, i) => generateConducteur(i + 1, usedNames));
  
  const avAll = getPool(config.selectedWilayas, false);
  const av = getPool(config.selectedWilayas, false); // garde chefs-lieux + communes
  let avForInit = av.length > 0 ? av : avAll;
  if (avForInit.length === 0) avForInit = NORTH_ALGERIA_CITIES;

  // Garantie d'unicité : chaque voiture a un couple départ→arrivée différent hors chef-lieu
  const usedPairs = new Set<string>();
  // Shuffle Fisher-Yates pour répartir les origines
  const shuffledAv = [...avForInit];
  for (let i = shuffledAv.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledAv[i], shuffledAv[j]] = [shuffledAv[j], shuffledAv[i]];
  }

  // Conducteur unique par voiture à un instant donné (pas 2 voitures avec même nom en même temps)
  const shuffledCds = [...cds];
  for (let i = shuffledCds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffledCds[i], shuffledCds[j]] = [shuffledCds[j], shuffledCds[i]]; }
  const cars: CarState[] = Array.from({ length: config.numCars }, (_, i) => {
    const p = useRegistre ? registre![i % registre!.length].proprietaire : prs[i % prs.length];
    const v = useRegistre ? registre![i % registre!.length].voiture : generateVoiture(i + 1, p, config.vehicleCategories);
    const c = useRegistre ? registre![i % registre!.length].conducteur : shuffledCds[i % shuffledCds.length];
    let origin: { name: string; lat: number; lon: number };
    let destination: { name: string; lat: number; lon: number };
    // Chef-lieu de commune obligatoire : origine et destination toujours piochés dans NORTH_ALGERIA_CITIES (vrais points terrestres)
    if (avForInit.length <= 1) {
      // Wilaya à 1 commune dans la base (ne doit plus arriver, 134 communes) -> on prend 2 communes réelles distinctes de la wilaya la plus proche
      const fallbackPool = NORTH_ALGERIA_CITIES.filter(cc => cc[3] === avAll[0][3]);
      const pool = fallbackPool.length >= 2 ? fallbackPool : NORTH_ALGERIA_CITIES;
      const oIdx = i % pool.length;
      let dIdx: number;
      do { dIdx = Math.floor(Math.random() * pool.length); } while (dIdx === oIdx);
      const oC = pool[oIdx], dC = pool[dIdx];
      origin = { name: oC[0], lat: oC[1], lon: oC[2] };
      destination = { name: dC[0], lat: dC[1], lon: dC[2] };
    } else {
      let picked = false;
      let attempts = 0;
      let o: typeof avForInit[0] = avForInit[0], d: typeof avForInit[0] = avForInit[1];
      while (!picked && attempts < 80) {
        // Origine : cycle sur shuffledAv pour éviter de reprendre la même ville 5×
        const oIdx = attempts < shuffledAv.length
          ? avForInit.indexOf(shuffledAv[(i + attempts) % shuffledAv.length])
          : Math.floor(Math.random() * avForInit.length);
        let dIdx: number;
        let inner = 0;
        do {
          dIdx = Math.floor(Math.random() * avForInit.length);
          if (dIdx === oIdx) continue;
          if (avForInit.length > 2 && inner < 6) {
            const dist = haversineDistance(avForInit[oIdx][1], avForInit[oIdx][2], avForInit[dIdx][1], avForInit[dIdx][2]);
            if (dist < 30000) { inner++; continue; }
          }
          break;
        } while (true);
        o = avForInit[oIdx]; d = avForInit[dIdx];
        const key = `${o[0]}→${d[0]}`;
        if (!usedPairs.has(key)) {
          picked = true;
          usedPairs.add(key);
          break;
        }
        attempts++;
      }
      // Si pool trop petit et tous les couples déjà utilisés -> on autorise un doublon réel chef-lieu (jamais de jitter mer)
      if (!picked) {
        let bIdx = Math.floor(Math.random() * avForInit.length);
        let tIdx: number;
        do { tIdx = Math.floor(Math.random() * avForInit.length); } while (tIdx === bIdx && avForInit.length > 1);
        o = avForInit[bIdx];
        d = avForInit[tIdx];
        usedPairs.add(`${o[0]}→${d[0]}`);
      }
      origin = { name: o[0], lat: o[1], lon: o[2] };
      destination = { name: d[0], lat: d[1], lon: d[2] };
    }

    return {
      voiture: v, conducteurActuel: c, itineraireActuel: generateItineraire(v, c, origin.name, destination.name),
      lat: origin.lat, lon: origin.lon, speed: 0, acceleration: 0, heading: 0, distanceTraveled: 0, totalDistanceTraveled: 0,
      status: "idle", routePoints: [], routeIndex: 0, originCity: origin.name, destinationCity: destination.name,
      needsNewRoute: true, waitTicks: 0, lastRecordTime: new Date(), consecutiveStopTicks: 0,
      currentV_ms: 0, currentV0_ms: 0, targetCruiseV_ms: 0, cruiseTimer_s: 0, isSlowingDown: false, lastAcc_ms2: 0,
      continuousDrivingSec: 0, lastInfractionLongDriveAt: 0, stoppedSec: 0, footprintTrail: [],
    };
  });

  const history = new Map<string, { itineraire: Itineraire; carId: string }>();
  cars.forEach(c => history.set(c.itineraireActuel.id, { itineraire: c.itineraireActuel, carId: c.voiture.carId }));
  // En mode registre, expose les vrais inscrits utilisés (stats/listes)
  const statePrs = useRegistre ? [...new Map(cars.map(c => [c.voiture.proprietaire.nin, c.voiture.proprietaire])).values()] : prs;
  const stateCds = useRegistre ? [...new Map(cars.map(c => [c.conducteurActuel.nin, c.conducteurActuel])).values()] : cds;
  const pending = getPendingCustomRoads();
  const state: SimulationState = { sessionId: uuidv4(), config, cars, proprietaires: statePrs, conducteurs: stateCds, running: false, startedAt: Date.now(), simulatedElapsedSec: 0, footprintRecords: new Map(cars.map(c => [c.voiture.carId, []])), itinerairesHistory: history, infractions: [], lastInfractionAt: new Map(), lastFlushAt: Date.now(), totalRecordsSent: 0, intervalHandle: null, routeFetchQueue: new Set(), fetchingRoutes: false, customRoads: existingState?.customRoads || pending || null };
  globalForSim.__simState = state;
  return state;
}

export async function assignRouteForCar(car: CarState, conducteurs: Conducteur[]): Promise<CarState> {
  const state = getSimulation(), sw = state?.config.selectedWilayas || [];
  let routePoints: RoutePoint[] = [], originName = car.destinationCity || car.originCity, destName = "Destination";
  if (state?.customRoads?.features.length) {
    const f = state.customRoads.features;
    const forceContra = (car as any)._forceContresensNext;
    if (forceContra) delete (car as any)._forceContresensNext;
    // Routage réel sur graphe perso : BFS entre 2 points aléatoires du réseau (évite ligne droite hors routes)
    const pickIdx = () => Math.floor(Math.random() * f.length);
    const aIdx = pickIdx(), bIdx = (()=>{ let x; do x=pickIdx(); while(x===aIdx); return x; })();
    const aFeat = f[aIdx], bFeat = f[bIdx];
    const aPt = aFeat.geometry.coordinates[Math.floor(aFeat.geometry.coordinates.length/2)] as [number, number];
    const bPt = bFeat.geometry.coordinates[Math.floor(bFeat.geometry.coordinates.length/2)] as [number, number];
    // Construit graphe extrémités -> BFS
    const key = (pt:[number,number])=> `${pt[0].toFixed(5)},${pt[1].toFixed(5)}`;
    const adj = new Map<string, {to:string, featIdx:number, rev:boolean}[]>();
    for (let i=0;i<f.length;i++){ const c=f[i].geometry.coordinates as [number,number][]; const s=key(c[0]), e=key(c[c.length-1]); if(!adj.has(s)) adj.set(s,[]); if(!adj.has(e)) adj.set(e,[]); adj.get(s)!.push({to:e, featIdx:i, rev:false}); adj.get(e)!.push({to:s, featIdx:i, rev:true}); }
    const startKey = key(aPt), endKey = key(bPt);
    // BFS
    const queue: string[][] = [[startKey]]; const visited = new Set([startKey]); const prev = new Map<string, {from:string, featIdx:number, rev:boolean}>();
    let found: string[] | null = null;
    while(queue.length){
      const path = queue.shift()!;
      const cur = path[path.length-1];
      if (cur===endKey){ found=path; break; }
      for(const nb of adj.get(cur)||[]){ if(!visited.has(nb.to)){ visited.add(nb.to); prev.set(nb.to,{from:cur, featIdx:nb.featIdx, rev:nb.rev}); queue.push([...path, nb.to]); } }
    }
    let chain: [number, number][] = [];
    let roadName = aFeat.properties?.name || aFeat.properties?.ref || aFeat.properties?.highway || "perso";
    const ms0 = aFeat.properties?.maxspeed ? parseInt(String(aFeat.properties.maxspeed).replace(/[^0-9]/g, ""), 10) : NaN;
    let roadMs: number | null = Number.isFinite(ms0) ? ms0 : null;
    let roadRestr: any = { maxheight: aFeat.properties?.maxheight, maxwidth: aFeat.properties?.maxwidth, maxweight: aFeat.properties?.maxweight, hgv: aFeat.properties?.hgv, hazmat: aFeat.properties?.hazmat, access: aFeat.properties?.access, motor_vehicle: aFeat.properties?.motor_vehicle, highway: aFeat.properties?.highway, oneway: aFeat.properties?.oneway, stopping: aFeat.properties?.stopping, parking: aFeat.properties?.parking, no_parking: aFeat.properties?.no_parking, no_stopping: aFeat.properties?.no_stopping, "parking:lane:both": aFeat.properties?.["parking:lane:both"] };
    if (forceContra && !roadRestr.oneway) roadRestr.oneway = "yes";
    if (found && found.length>1){
      // reconstruit la chaîne le long du plus court chemin
      for(let i=1;i<found.length;i++){
        const cur=found[i], from=found[i-1];
        const edge = (adj.get(from)||[]).find(e=>e.to===cur);
        if(!edge) continue;
        const coords=[...(f[edge.featIdx].geometry.coordinates as [number, number][])];
        if(edge.rev) coords.reverse();
        if(chain.length && coords[0][0]===chain[chain.length-1][0] && coords[0][1]===chain[chain.length-1][1]) coords.shift();
        chain.push(...coords);
      }
    } else {
      // Fallback : plus proche voisin comme avant
      chain = [...(aFeat.geometry.coordinates as [number, number][])];
      roadName = aFeat.properties?.name || aFeat.properties?.ref || aFeat.properties?.highway || "perso";
    }
    if (chain.length < 2) chain = [...(aFeat.geometry.coordinates as [number, number][])];
    routePoints = chain.map(([lon, lat]) => ({ lat, lon }));
    const doContresens = (state?.config as any)?.simulateContresens && Math.random() < 0.15 && roadRestr.oneway;
    if (doContresens || forceContra) routePoints = [...routePoints].reverse();
    originName = aFeat.properties?.name || aFeat.properties?.ref || `Tronçon ${aFeat.properties?.highway || "perso"}`;
    destName = bFeat.properties?.name || bFeat.properties?.ref || `Tronçon ${bFeat.properties?.highway || "perso"}`;
    if (originName === destName) destName = `${destName} (2)`;
    if (doContresens || forceContra) { const t=originName; originName=destName; destName=t; }
    car.lat = routePoints[0].lat; car.lon = routePoints[0].lon;
    car.currentRoadName = roadName + (doContresens || forceContra ? " (contresens simulé)" : "");
    car.currentRoadMaxSpeed = roadMs;
    car.currentRoadRestrictions = roadRestr;
  } else if ((car as any).customItinerary) {
    const ci = (car as any).customItinerary as { origin: { lat: number; lon: number }; destination: { lat: number; lon: number }; originName?: string; destName?: string };
    originName = ci.originName || `Perso ${ci.origin.lat.toFixed(3)},${ci.origin.lon.toFixed(3)}`;
    destName = ci.destName || `Perso ${ci.destination.lat.toFixed(3)},${ci.destination.lon.toFixed(3)}`;
    routePoints = await fetchOSRMRoute(ci.origin.lat, ci.origin.lon, ci.destination.lat, ci.destination.lon);
    if (routePoints.length >= 2) car.lat = routePoints[0].lat, car.lon = routePoints[0].lon;
    (car as any).customItinerary = null;
    if (routePoints.length < 2) {
      console.warn(`[OSRM] échec itinéraire perso ${originName} -> ${destName}`);
      car.needsNewRoute = true;
      const st = getSimulation();
      if (st) st.routeFetchQueue.add(car.voiture.carId);
      return car;
    }
  } else {
    const cfg: any = state?.config;
    const forcedOrigin = cfg?.customOrigin ? NORTH_ALGERIA_CITIES.find(c=>c[0]===cfg.customOrigin) : null;
    const forcedDest = cfg?.customDestination ? NORTH_ALGERIA_CITIES.find(c=>c[0]===cfg.customDestination) : null;
    let lastOriginName: string = originName, lastDestName: string = destName;
    if (forcedOrigin && forcedDest) {
      originName = forcedOrigin[0]; destName = forcedDest[0];
      routePoints = await fetchOSRMRoute(forcedOrigin[1], forcedOrigin[2], forcedDest[1], forcedDest[2]);
      lastOriginName = originName; lastDestName = destName;
      if (routePoints.length >= 2) { car.lat = routePoints[0].lat; car.lon = routePoints[0].lon; }
    } else {
      let attempts = 0;
      lastOriginName = ""; lastDestName = "";
      while (attempts < 3 && routePoints.length < 2) {
        const { origin, destination } = pickRandomCityPair(sw, attempts === 0 ? (car.destinationCity || car.originCity) : undefined);
        originName = origin.name; destName = destination.name;
        lastOriginName = originName; lastDestName = destName;
        routePoints = await fetchOSRMRoute(origin.lat, origin.lon, destination.lat, destination.lon);
      if (routePoints.length >= 2) {
        // Place la voiture directement sur la route snappée (pas au centre-ville loin de la route)
        car.lat = routePoints[0].lat; car.lon = routePoints[0].lon;
        break;
      }
      attempts++;
    }
    if (routePoints.length < 2) {
      console.warn(`[OSRM] échec route ${lastOriginName} -> ${lastDestName} après ${attempts} tentatives (point loin d'une route), retry prochain tick`);
      car.needsNewRoute = true;
      const stateRetry = getSimulation();
      if (stateRetry) stateRetry.routeFetchQueue.add(car.voiture.carId);
      return car;
    }
    if (!state?.customRoads?.features.length) {
      car.currentRoadName = `${originName} → ${destName}`;
      car.currentRoadMaxSpeed = null;
      car.currentRoadRestrictions = null;
    }
    }
  }
  car.routePoints = routePoints; car.routeIndex = 0; car.originCity = originName; car.destinationCity = destName;
  if (Math.random() < 0.3) {
    // Ne réassigne que parmi les conducteurs libres (pas déjà sur une autre voiture en même temps)
    const state2 = getSimulation();
    const usedIds = new Set((state2?.cars || []).filter(cc => cc.voiture.carId !== car.voiture.carId).map(cc => cc.conducteurActuel.id));
    const free = conducteurs.filter(dd => !usedIds.has(dd.id));
    const pool = free.length ? free : conducteurs;
    car.conducteurActuel = pool[Math.floor(Math.random() * pool.length)];
  }
  const newItin = generateItineraire(car.voiture, car.conducteurActuel, originName, destName);
  car.itineraireActuel = newItin;
  // Historise pour flush DB (évite perte des anciens itinéraires)
  const histState = getSimulation();
  if (histState) histState.itinerairesHistory.set(newItin.id, { itineraire: newItin, carId: car.voiture.carId });
  car.needsNewRoute = false; car.status = "moving"; car.distanceTraveled = 0; car.currentV_ms = 0; car.currentV0_ms = 0;
  car.targetCruiseV_ms = 0; car.cruiseTimer_s = 0; car.lastAcc_ms2 = 0;
  return car;
}

async function processRouteFetchQueue(state: SimulationState) {
  if (state.fetchingRoutes) return;
  state.fetchingRoutes = true;
  try {
    const q = Array.from(state.routeFetchQueue); state.routeFetchQueue.clear();
    for (const id of q) {
      if (!state.running) break;
      if (id.startsWith("EXT-")) continue; // externe = pas de recalcul serveur
      const idx = state.cars.findIndex(c => c.voiture.carId === id);
      if (idx !== -1) { state.cars[idx] = await assignRouteForCar(state.cars[idx], state.conducteurs); await new Promise(r => setTimeout(r, 1100)); }
    }
  } finally { state.fetchingRoutes = false; }
}

export function startSimulation(): SimulationState | null {
  const state = getSimulation();
  if (!state || state.running) return state;
  state.running = true; state.lastFlushAt = Date.now(); state.startedAt = Date.now(); state.simulatedElapsedSec = 0;
  state.cars.forEach(c => { if (c.needsNewRoute) state.routeFetchQueue.add(c.voiture.carId); });
  processRouteFetchQueue(state);
  // La simulation est désormais pilotée par POST /api/simulation/tick (polling client)
  // pour éviter le double avancement (interval serveur + tick client).
  // On ne crée plus de setInterval serveur ici. tickSimulation() s'occupe
  // de l'avancement, du buffering et de l'arrêt quand tout est terminé.
  if (state.intervalHandle) { clearInterval(state.intervalHandle); state.intervalHandle = null; }
  return state;
}

export function stopSimulation() { const state = getSimulation(); if (state) { state.running = false; if (state.intervalHandle) { clearInterval(state.intervalHandle); state.intervalHandle = null; } } }
export function tickSimulation() {
  const state = getSimulation(); if (!state) return null;
  const reps = Math.max(1, Math.floor(state.config.timeMultiplier));
  const baseDt = state.config.recordIntervalSec;
  let allTerminated = true;
  for (let r = 0; r < reps; r++) {
    state.simulatedElapsedSec += baseDt;
    const now = new Date(state.startedAt + state.simulatedElapsedSec * 1000);
    let repAllTerminated = true;
    state.cars.forEach((c, i) => {
      // EXT-* : position pilotée par l'app externe (OSM) → ne pas avancer/recycler côté serveur
      if (c.voiture.carId.startsWith("EXT-")) {
        if (c.status === "en route") repAllTerminated = false;
        return;
      }
      // Avance d'un pas réel de recordIntervalSec simulé, répété timeMultiplier fois
      const { car } = advanceCarAlongRoute(state.cars[i], baseDt);
      // Réseau perso : enchaîne les tronçons au lieu de terminer après 500m
      if (isCarTerminated(car.status) && state.customRoads?.features.length) {
        car.status = "idle"; car.needsNewRoute = true; state.routeFetchQueue.add(car.voiture.carId);
        // Ne compte pas comme terminé pour l'arrêt global
        repAllTerminated = false;
        state.cars[i] = car;
        return;
      }
      state.cars[i] = car;
      if (!isCarTerminated(car.status)) repAllTerminated = false;
      // Détection excès de vitesse : seulement OSM, pas d'estimation courbure (demande utilisateur)
      if (car.status === "en route" && car.speed > 0) {
        let effectiveLimit: number | null = car.currentRoadMaxSpeed ?? null;
        if (effectiveLimit == null) {
          const originWilaya = NORTH_ALGERIA_CITIES.find(c => c[0] === car.originCity)?.[3] || car.voiture.proprietaire.codeWilaya;
          const osmMs = getOsmMaxSpeedForPosition(car.lat, car.lon, originWilaya);
          if (osmMs != null) effectiveLimit = osmMs;
        }
        // Limite OSM inconnue : on ne crée PLUS d'infraction ("impossible de comparée"
        // n'est pas une infraction, juste une absence d'info). Vitesse non évaluable.
        if (effectiveLimit == null) {
          // rien à signaler
        } else {
          const limitKmh = effectiveLimit as number;
          if (car.speed > limitKmh + 5) {
            const lastAt = state.lastInfractionAt.get(car.voiture.carId) || 0;
            const nowMs = now.getTime();
            if (nowMs - lastAt > 10000) {
              const inf = {
                id: uuidv4(),
                carId: car.voiture.carId,
                immatriculation: car.voiture.immatriculation,
                conducteurNom: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
                roadName: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                troncon: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                infraction: "exces de vitesse" as const,
                speed: Math.round(car.speed * 10) / 10,
                speedLimit: limitKmh,
                excess: Math.round((car.speed - limitKmh) * 10) / 10,
                lat: car.lat,
                lon: car.lon,
                recordedAt: now.toISOString(),
                itineraireId: car.itineraireActuel.id,
              } as SpeedInfraction;
              state.infractions.push(inf);
              state.lastInfractionAt.set(car.voiture.carId, nowMs);
            }
          }
        }
        // Zone interdite / gabarit
        let roadProps: any = car.currentRoadRestrictions;
        if (!roadProps) {
          const wCode = NORTH_ALGERIA_CITIES.find(c => c[0] === car.originCity)?.[3] || car.voiture.proprietaire.codeWilaya;
          roadProps = getOsmRestrictionsForPosition(car.lat, car.lon, wCode);
        }
        const zoneReason = checkZoneInterdite(car.voiture, roadProps);
        if (zoneReason) {
          const lastAtZ = state.lastInfractionAt.get(car.voiture.carId + "_zone") || 0;
          const nowMsZ = now.getTime();
          if (nowMsZ - lastAtZ > 20000) {
            const infZ = {
              id: uuidv4(),
              carId: car.voiture.carId,
              immatriculation: car.voiture.immatriculation,
              conducteurNom: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
              roadName: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
              troncon: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
              infraction: "zone interdite" as const,
              speed: Math.round(car.speed * 10) / 10,
              speedLimit: (car.currentRoadMaxSpeed ?? 9999) as number,
              excess: 0,
              restriction: zoneReason,
              lat: car.lat,
              lon: car.lon,
              recordedAt: now.toISOString(),
              itineraireId: car.itineraireActuel.id,
            } as SpeedInfraction;
            state.infractions.push(infZ);
            state.lastInfractionAt.set(car.voiture.carId + "_zone", nowMsZ);
          }
        }
        // Circulation à contresens — oneway=yes
        const onewayVal = (car.currentRoadRestrictions as any)?.oneway || (roadProps as any)?.oneway;
        if (onewayVal === "yes" || onewayVal === "1" || onewayVal === "-1") {
          let roadBearing: number | null = (car as any).currentRoadBearing ?? null;
          if (roadBearing == null && car.routePoints.length > 1 && car.routeIndex < car.routePoints.length - 1) {
            const cur = car.routePoints[car.routeIndex];
            const nxt = car.routePoints[car.routeIndex + 1];
            roadBearing = bearing(cur.lat, cur.lon, nxt.lat, nxt.lon);
          } else if (roadBearing == null && car.routePoints.length > 1) {
            roadBearing = car.heading;
          }
          if (roadBearing != null && Number.isFinite(car.heading)) {
            let allowed = roadBearing;
            if (onewayVal === "-1") allowed = (allowed + 180) % 360;
            let diff = Math.abs(car.heading - allowed);
            if (diff > 180) diff = 360 - diff;
            if (diff > 90) {
              const lastAtC = state.lastInfractionAt.get(car.voiture.carId + "_contra") || 0;
              const nowMsC = now.getTime();
              if (nowMsC - lastAtC > 15000) {
                const infC = {
                  id: uuidv4(),
                  carId: car.voiture.carId,
                  immatriculation: car.voiture.immatriculation,
                  conducteurNom: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
                  roadName: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                  troncon: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                  infraction: "circulation à contresens" as const,
                  speed: Math.round(car.speed * 10) / 10,
                  speedLimit: (car.currentRoadMaxSpeed ?? 9999) as number,
                  excess: 0,
                  restriction: `Sens unique oneway=${onewayVal} cap ${Math.round(car.heading)}° vs route ${Math.round(allowed)}° diff ${Math.round(diff)}°`,
                  lat: car.lat,
                  lon: car.lon,
                  recordedAt: now.toISOString(),
                  itineraireId: car.itineraireActuel.id,
                } as SpeedInfraction;
                state.infractions.push(infC);
                state.lastInfractionAt.set(car.voiture.carId + "_contra", nowMsC);
              }
            }
          }
        }
        // Stop / stationnement tracking
        if (car.speed < 1) {
          (car as any).stoppedSec = ((car as any).stoppedSec || 0) + baseDt;
        } else {
          (car as any).stoppedSec = 0;
        }
        // Arrêt / stationnement interdit
        {
          const stoppedSec = (car as any).stoppedSec || 0;
          let roadForStop: any = car.currentRoadRestrictions || (typeof getOsmRestrictionsForPosition !== 'undefined' ? getOsmRestrictionsForPosition(car.lat, car.lon, NORTH_ALGERIA_CITIES.find(c => c[0] === car.originCity)?.[3] || car.voiture.proprietaire.codeWilaya) : null);
          const isNoStopping = roadForStop && (roadForStop.no_stopping === "yes" || roadForStop["parking:lane:both"] === "no_stopping" || roadForStop.stopping === "no");
          const isNoParking = roadForStop && (roadForStop.no_parking === "yes" || roadForStop["parking:lane:both"] === "no_parking" || roadForStop.parking === "no");
          if (stoppedSec >= 5 && isNoStopping) {
            const lastAtS = state.lastInfractionAt.get(car.voiture.carId + "_stop") || 0;
            if (now.getTime() - lastAtS > 30000) {
              const infS = {
                id: uuidv4(),
                carId: car.voiture.carId,
                immatriculation: car.voiture.immatriculation,
                conducteurNom: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
                roadName: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                troncon: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                infraction: "arrêt interdit" as const,
                speed: 0, speedLimit: 9999, excess: 0,
                restriction: `Arrêt interdit (no_stopping)`,
                lat: car.lat, lon: car.lon,
                recordedAt: now.toISOString(),
                itineraireId: car.itineraireActuel.id,
              } as SpeedInfraction;
              state.infractions.push(infS);
              state.lastInfractionAt.set(car.voiture.carId + "_stop", now.getTime());
            }
          } else if (stoppedSec >= 60 && isNoParking) {
            const lastAtP = state.lastInfractionAt.get(car.voiture.carId + "_park") || 0;
            if (now.getTime() - lastAtP > 60000) {
              const infP = {
                id: uuidv4(),
                carId: car.voiture.carId,
                immatriculation: car.voiture.immatriculation,
                conducteurNom: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
                roadName: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                troncon: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
                infraction: "stationnement interdit" as const,
                speed: 0, speedLimit: 9999, excess: 0,
                restriction: `Stationnement interdit (no_parking) depuis ${Math.round(stoppedSec)}s`,
                lat: car.lat, lon: car.lon,
                recordedAt: now.toISOString(),
                itineraireId: car.itineraireActuel.id,
              } as SpeedInfraction;
              state.infractions.push(infP);
              state.lastInfractionAt.set(car.voiture.carId + "_park", now.getTime());
            }
          }
        }
        // Conduite longue sans arrêt > X heures
        const maxHours = (state.config as any).maxContinuousDrivingHours ?? 4;
        if (car.status === "en route" && car.speed > 5) {
          car.continuousDrivingSec = (car.continuousDrivingSec || 0) + baseDt;
        } else {
          car.continuousDrivingSec = Math.max(0, (car.continuousDrivingSec || 0) - baseDt);
          if ((car as any).status === "arrêt temporaire" || (car as any).status === "idle" || car.speed === 0) {
            if ((car.continuousDrivingSec || 0) < 60) car.continuousDrivingSec = 0;
          }
        }
        if (car.continuousDrivingSec > maxHours * 3600) {
          const lastAtL = (car as any).lastInfractionLongDriveAt || 0;
          const nowMsL = now.getTime();
          if (nowMsL - lastAtL > 60000) {
            const hours = (car.continuousDrivingSec / 3600).toFixed(1);
            const infL = {
              id: uuidv4(),
              carId: car.voiture.carId,
              immatriculation: car.voiture.immatriculation,
              conducteurNom: `${car.conducteurActuel.prenom} ${car.conducteurActuel.nom}`,
              roadName: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
              troncon: car.currentRoadName || `${car.originCity} → ${car.destinationCity}`,
              infraction: "conduite longue sans arrêt" as const,
              speed: Math.round(car.speed * 10) / 10,
              speedLimit: 9999,
              excess: 0,
              restriction: `Conduite continue ${hours}h sans arrêt > ${maxHours}h`,
              lat: car.lat,
              lon: car.lon,
              recordedAt: now.toISOString(),
              itineraireId: car.itineraireActuel.id,
            } as SpeedInfraction;
            state.infractions.push(infL);
            (car as any).lastInfractionLongDriveAt = nowMsL;
            state.lastInfractionAt.set(car.voiture.carId + "_long", nowMsL);
          }
        }
      }
      // Un footprint par intervale configuré -> respecte strictement recordIntervalSec
      const records = state.footprintRecords.get(car.voiture.carId);
      if (records) records.push({ itineraireId: car.itineraireActuel.id, carId: car.voiture.carId, latitude: car.lat, longitude: car.lon, altitude: 0, vitesse: car.speed, acceleration: car.acceleration, cap: car.heading, distanceCumulee: car.distanceTraveled, recordedAt: now.toISOString(), deltaSecondes: baseDt, statut: car.status, estInterruption: false });
    });
    if (!repAllTerminated) allTerminated = false;
    if (repAllTerminated && state.cars.length > 0) { stopSimulation(); break; }
  }
  if (state.routeFetchQueue.size > 0 && !state.fetchingRoutes) processRouteFetchQueue(state);
  // allTerminated reflète l'état après tous les sous-ticks
  if (!allTerminated) {
    allTerminated = state.cars.every(c => isCarTerminated(c.status));
  }
  // Réseau perso : ne s'arrête jamais après 1km, enchaîne les tronçons
  if (allTerminated && state.customRoads?.features.length) {
    state.cars.forEach(c => { if (isCarTerminated(c.status)) { c.status = "idle"; c.needsNewRoute = true; state.routeFetchQueue.add(c.voiture.carId); } });
    allTerminated = false;
    if (!state.fetchingRoutes) processRouteFetchQueue(state);
  } else if (allTerminated && state.cars.length > 0) {
    stopSimulation();
  }
  return state;
}
export function drainRecords() { const state = getSimulation(); if (!state) return []; const all: FootprintRecord[] = []; state.footprintRecords.forEach((recs, id) => { all.push(...recs); state.footprintRecords.set(id, []); }); state.lastFlushAt = Date.now(); state.totalRecordsSent += all.length; return all; }
export function getCarRecords(carId: string): FootprintRecord[] { const state = getSimulation(); if (!state) return []; return state.footprintRecords.get(carId) ?? []; }
export function getBufferStats() { const state = getSimulation(); if (!state) return { totalRecords: 0, sizeKb: 0, elapsedMinutes: 0 }; let count = 0, size = 0; state.footprintRecords.forEach(recs => { count += recs.length; size += JSON.stringify(recs).length; }); return { totalRecords: count, sizeKb: Math.round(size / 102.4) / 10, elapsedMinutes: Math.round((Date.now() - state.lastFlushAt) / 60000 * 10) / 10 }; }
export function destroySimulation() { stopSimulation(); globalForSim.__simState = null; }
