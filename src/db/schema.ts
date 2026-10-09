import {
  pgTable,
  serial,
  varchar,
  text,
  doublePrecision,
  timestamp,
  integer,
  date,
  boolean,
  pgEnum,
  customType,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Colonne PostGIS geography(Point,4326) — nécessite CREATE EXTENSION postgis
// (migration : extension créée avant la table). Source de vérité = lat/lon,
// geog sert aux calculs géospatiaux (ST_DWithin, ST_Length…).
export const geographyPoint = customType<{ data: { lon: number; lat: number }; driverData: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
  toDriver(value: { lon: number; lat: number }) {
    return `SRID=4326;POINT(${value.lon} ${value.lat})`;
  },
});

// Enum for owner type (physical person or company)
export const ownerTypeEnum = pgEnum("owner_type", ["physique", "morale"]);

// ─── PROPRIETAIRE (Owner) ───────────────────────────────────────
// Un propriétaire peut être une personne physique ou morale
export const proprietaires = pgTable("proprietaires", {
  id: serial("id").primaryKey(),
  nin: varchar("nin", { length: 20 }).notNull().unique(), // Numéro d'Identification National
  type: ownerTypeEnum("type").notNull().default("physique"),
  
  // Pour personne physique
  nom: varchar("nom", { length: 100 }),
  prenom: varchar("prenom", { length: 100 }),
  dateNaissance: date("date_naissance"),
  
  // Pour personne morale (entreprise)
  raisonSociale: varchar("raison_sociale", { length: 200 }),
  
  // Coordonnées
  telephone: varchar("telephone", { length: 32 }).notNull(),
  adresse: text("adresse"),
  commune: varchar("commune", { length: 100 }),
  wilaya: varchar("wilaya", { length: 100 }),
  codeWilaya: varchar("code_wilaya", { length: 4 }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── VOITURE (Vehicle) ──────────────────────────────────────────
// Chaque voiture appartient à un propriétaire
export const voitures = pgTable("voitures", {
  id: serial("id").primaryKey(),
  carId: varchar("car_id", { length: 64 }).notNull().unique(), // Ex: CAR-001
  proprietaireId: integer("proprietaire_id").notNull().references(() => proprietaires.id),
  
  // Infos véhicule
  immatriculation: varchar("immatriculation", { length: 20 }).notNull().unique(),
  // N° de série virtuel du dispositif GPS (généré par l'app dispositif, unique)
  numeroSerie: varchar("numero_serie", { length: 40 }).unique(),
  marque: varchar("marque", { length: 50 }),
  modele: varchar("modele", { length: 50 }),
  couleur: varchar("couleur", { length: 30 }),
  annee: integer("annee"),
  typeCarburant: varchar("type_carburant", { length: 20 }),
  // Gabarit / catégorie (demande utilisateur)
  categorieVehicule: varchar("categorie_vehicule", { length: 30 }).notNull().default("leger"), // leger, lourd, transport, transport_dangereux, convoi_exceptionnel
  hauteur: doublePrecision("hauteur"), // mètres
  largeur: doublePrecision("largeur"), // mètres
  poids: doublePrecision("poids"), // tonnes
  convoiSpecial: boolean("convoi_special").default(false),
  
  // Couleur sur la carte
  mapColor: varchar("map_color", { length: 10 }).notNull().default("#3498db"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── CONDUCTEUR (Driver) ────────────────────────────────────────
// Une personne qui conduit (peut être différent du propriétaire)
export const conducteurs = pgTable("conducteurs", {
  id: serial("id").primaryKey(),
  nin: varchar("nin", { length: 20 }).notNull().unique(),
  nom: varchar("nom", { length: 100 }).notNull(),
  prenom: varchar("prenom", { length: 100 }).notNull(),
  dateNaissance: date("date_naissance"),
  telephone: varchar("telephone", { length: 32 }).notNull(),
  
  // Permis de conduire
  numeroPermis: varchar("numero_permis", { length: 30 }),
  categoriePermis: varchar("categorie_permis", { length: 10 }), // A, B, C, D, E
  dateDelivrancePermis: date("date_delivrance_permis"),
  
  adresse: text("adresse"),
  commune: varchar("commune", { length: 100 }),
  wilaya: varchar("wilaya", { length: 100 }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── ITINERAIRE (Trip/Journey) ──────────────────────────────────
// Un trajet continu sans interruption > 1 heure
export const itineraires = pgTable("itineraires", {
  id: serial("id").primaryKey(),
  itineraireId: varchar("itineraire_id", { length: 64 }).notNull().unique(),
  voitureId: integer("voiture_id").notNull().references(() => voitures.id),
  conducteurId: integer("conducteur_id").notNull().references(() => conducteurs.id),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  
  // Villes origine/destination
  villeDepart: varchar("ville_depart", { length: 100 }),
  villeArrivee: varchar("ville_arrivee", { length: 100 }),
  
  // Temps
  debutAt: timestamp("debut_at", { withTimezone: true }).notNull(),
  finAt: timestamp("fin_at", { withTimezone: true }),
  dureeMinutes: integer("duree_minutes"),
  
  // Statistiques
  distanceKm: doublePrecision("distance_km").default(0),
  vitesseMoyenne: doublePrecision("vitesse_moyenne"),
  vitesseMax: doublePrecision("vitesse_max"),
  nombreArrets: integer("nombre_arrets").default(0),
  
  // État
  statut: varchar("statut", { length: 20 }).notNull().default("en_cours"), // en_cours, termine, interrompu
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── FOOTPRINT / TRACKING POINTS ────────────────────────────────
// Chaque point enregistré avec position et métriques.
// Volume (1000 vh × 10 s ≈ 8,6 M/jour) : brut purgé au-delà de la rétention
// (voir /api/admin/retention + retention-neon.sql), lecture temps réel via
// vehicle_current_position, index BRIN sur recordedAt + GiST sur geog.
export const footprints = pgTable("footprints", {
  id: serial("id").primaryKey(),
  itineraireId: integer("itineraire_id").notNull().references(() => itineraires.id),
  voitureId: integer("voiture_id").notNull().references(() => voitures.id),

  // Position GPS
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  altitude: doublePrecision("altitude").default(0),
  // Miroir PostGIS (rempli à l'insertion, NULL pour l'ancien historique)
  geog: geographyPoint("geog"),

  // Métriques
  vitesse: doublePrecision("vitesse").notNull(), // km/h
  acceleration: doublePrecision("acceleration").notNull(), // km/h/s
  cap: doublePrecision("cap").notNull(), // heading en degrés
  carburant: doublePrecision("carburant"), // % réservoir (payload GPS fuel)
  distanceCumulee: doublePrecision("distance_cumulee").default(0), // mètres depuis début itinéraire

  // Temps
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),

  // Durée depuis dernier point (pour détecter interruptions)
  deltaSecondes: integer("delta_secondes"),

  // État
  statut: varchar("statut", { length: 16 }).notNull().default("moving"), // moving, stopped, idle
  estInterruption: boolean("est_interruption").default(false),
}, (t) => [
  index("footprints_recorded_brin").using("brin", t.recordedAt),
  index("footprints_geog_gist").using("gist", t.geog),
  index("footprints_voiture_time").on(t.voitureId, t.recordedAt),
]);

// ─── POSITION TEMPS REEL (1 ligne/véhicule, upsert à chaque message GPS) ────
// C'est CETTE table que lisent la carte opérateur et les apps (jamais footprints en direct).
export const vehicleCurrentPosition = pgTable("vehicle_current_position", {
  voitureId: integer("voiture_id").primaryKey().references(() => voitures.id),
  carId: varchar("car_id", { length: 64 }).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  vitesse: doublePrecision("vitesse"),
  cap: doublePrecision("cap"),
  carburant: doublePrecision("carburant"),
  itineraireId: integer("itineraire_id").references(() => itineraires.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── UNITES DE SECURITE ROUTIERE (Police / Gendarmerie) ─────────
// Périmètre = limites administratives de wilaya (codeWilaya 01-58)
export const typeUniteEnum = pgEnum("type_unite", ["police", "gendarmerie"]);
export const statutAlerteEnum = pgEnum("statut_alerte", ["nouveau", "notifie", "en_cours", "terminee", "abandonnee", "traite"]);

export const unitesSecurite = pgTable("unites_securite", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(), // ex POL-16, GND-16
  nom: varchar("nom", { length: 200 }).notNull(),
  type: typeUniteEnum("type").notNull(),
  codeWilaya: varchar("code_wilaya", { length: 4 }).notNull(),
  wilaya: varchar("wilaya", { length: 100 }).notNull(),
  // Nature du dispositif : barrage_fixe, barrage_mobile, motards, vehicule_mobile, poste_fixe
  moyen: varchar("moyen", { length: 30 }).notNull().default("poste_fixe"),
  mobile: boolean("mobile").default(false),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  telephone: varchar("telephone", { length: 32 }),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── COMPTES UNITES (1 compte = 1 unité, accès restreint à sa wilaya) ─
export const comptesUnites = pgTable("comptes_unites", {
  id: serial("id").primaryKey(),
  uniteId: integer("unite_id").notNull().references(() => unitesSecurite.id),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sessionsUnites = pgTable("sessions_unites", {
  token: varchar("token", { length: 96 }).primaryKey(),
  compteId: integer("compte_id").notNull().references(() => comptesUnites.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── COMPTES PROPRIETAIRES (espace propriétaires indépendant) ───────
// Inscription libre pour l'instant (actif=true) ; bascule validation admin
// plus tard en créant les comptes avec actif=false + écran de validation.
export const comptesProprietaires = pgTable("comptes_proprietaires", {
  id: serial("id").primaryKey(),
  proprietaireId: integer("proprietaire_id").notNull().references(() => proprietaires.id),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sessionsProprietaires = pgTable("sessions_proprietaires", {
  token: varchar("token", { length: 96 }).primaryKey(),
  compteId: integer("compte_id").notNull().references(() => comptesProprietaires.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── AFFECTATIONS (chauffeur désigné d'un véhicule, 1 actif à la fois) ─
export const affectations = pgTable("affectations", {
  id: serial("id").primaryKey(),
  voitureId: integer("voiture_id").notNull().references(() => voitures.id),
  conducteurId: integer("conducteur_id").notNull().references(() => conducteurs.id),
  debutAt: timestamp("debut_at", { withTimezone: true }).defaultNow(),
  finAt: timestamp("fin_at", { withTimezone: true }),
  actif: boolean("actif").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── INFRACTIONS CONSTATEES (persistées + dispatchées aux unités) ─
export const infractionsConstatees = pgTable("infractions_constatees", {
  id: serial("id").primaryKey(),
  externalId: varchar("external_id", { length: 64 }).notNull().unique(), // id mémoire SpeedInfraction
  carId: varchar("car_id", { length: 64 }),
  immatriculation: varchar("immatriculation", { length: 20 }),
  conducteurNom: varchar("conducteur_nom", { length: 200 }),
  categorieVehicule: varchar("categorie_vehicule", { length: 30 }),
  infraction: varchar("infraction", { length: 60 }).notNull(),
  restriction: text("restriction"),
  roadName: varchar("road_name", { length: 255 }),
  troncon: varchar("troncon", { length: 255 }),
  vitesse: doublePrecision("vitesse"),
  vitesseLimite: doublePrecision("vitesse_limite"),
  exces: doublePrecision("exces"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  codeWilaya: varchar("code_wilaya", { length: 4 }),
  wilaya: varchar("wilaya", { length: 100 }),
  uniteId: integer("unite_id").references(() => unitesSecurite.id),
  assigneUniteId: integer("assigne_unite_id").references(() => unitesSecurite.id),
  statut: statutAlerteEnum("statut").notNull().default("nouveau"),
  // Cycle d'interception : assignation → acceptation → clôture (résultat + compte rendu)
  notifieAt: timestamp("notifie_at", { withTimezone: true }),
  accepteUniteId: integer("accepte_unite_id").references(() => unitesSecurite.id),
  accepteAt: timestamp("accepte_at", { withTimezone: true }),
  clotureAt: timestamp("cloture_at", { withTimezone: true }),
  resultat: varchar("resultat", { length: 40 }), // pv | verbalisation | controle_ok | fausse_alerte | abandonnee
  compteRendu: text("compte_rendu"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── NOTIFICATIONS UNITES (cloche in-app / SMS-ready) ───────────
// Créées à l'assignation d'une interception (et autres événements).
// Une ligne = une notif pour une unité ; `lu` = accusé de lecture app.
export const notificationsUnites = pgTable("notifications_unites", {
  id: serial("id").primaryKey(),
  uniteId: integer("unite_id").notNull().references(() => unitesSecurite.id),
  type: varchar("type", { length: 30 }).notNull().default("info"), // interception | info | alerte
  titre: varchar("titre", { length: 200 }).notNull(),
  corps: text("corps"),
  infractionId: integer("infraction_id"),
  uniteSourceId: integer("unite_source_id"),
  lu: boolean("lu").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── SESSIONS DE SIMULATION ─────────────────────────────────────
export const simulationSessions = pgTable("simulation_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(),
  numVoitures: integer("num_voitures").notNull(),
  intervalleEnregistrement: integer("intervalle_enregistrement").notNull(), // secondes
  seuilFlushKb: integer("seuil_flush_kb").notNull(),
  seuilFlushMinutes: integer("seuil_flush_minutes").notNull(),
  totalEnregistrements: integer("total_enregistrements").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  notes: text("notes"),
});

// ─── RELATIONS ──────────────────────────────────────────────────

export const proprietairesRelations = relations(proprietaires, ({ many }) => ({
  voitures: many(voitures),
}));

export const voituresRelations = relations(voitures, ({ one, many }) => ({
  proprietaire: one(proprietaires, {
    fields: [voitures.proprietaireId],
    references: [proprietaires.id],
  }),
  itineraires: many(itineraires),
  footprints: many(footprints),
}));

export const conducteursRelations = relations(conducteurs, ({ many }) => ({
  itineraires: many(itineraires),
}));

export const itinerairesRelations = relations(itineraires, ({ one, many }) => ({
  voiture: one(voitures, {
    fields: [itineraires.voitureId],
    references: [voitures.id],
  }),
  conducteur: one(conducteurs, {
    fields: [itineraires.conducteurId],
    references: [conducteurs.id],
  }),
  footprints: many(footprints),
}));

export const footprintsRelations = relations(footprints, ({ one }) => ({
  itineraire: one(itineraires, {
    fields: [footprints.itineraireId],
    references: [itineraires.id],
  }),
  voiture: one(voitures, {
    fields: [footprints.voitureId],
    references: [voitures.id],
  }),
}));
