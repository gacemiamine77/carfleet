-- Fleet Platform : schéma initial, base STRICTEMENT séparée de la Sécurité publique.
-- Appliquer une seule fois sur la base flotte : ex. éditeur SQL Neon, base fleet_db.

CREATE TABLE IF NOT EXISTS fleet_owners (
  id SERIAL PRIMARY KEY,
  type VARCHAR(16) NOT NULL DEFAULT 'physique' CHECK (type IN ('physique', 'morale')),
  nom VARCHAR(100),
  prenom VARCHAR(100),
  raison_sociale VARCHAR(200),
  nin VARCHAR(32) NOT NULL UNIQUE,
  telephone VARCHAR(32) NOT NULL,
  email VARCHAR(160),
  adresse TEXT,
  commune VARCHAR(100),
  wilaya VARCHAR(100),
  code_wilaya VARCHAR(4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_owner_accounts (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES fleet_owners(id) ON DELETE CASCADE,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'viewer')),
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_owner_accounts_owner_idx ON fleet_owner_accounts(owner_id);

CREATE TABLE IF NOT EXISTS fleet_owner_sessions (
  token VARCHAR(96) PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES fleet_owner_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_owner_sessions_account_idx ON fleet_owner_sessions(account_id);

CREATE TABLE IF NOT EXISTS fleet_vehicles (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES fleet_owners(id) ON DELETE CASCADE,
  car_id VARCHAR(64) NOT NULL UNIQUE,
  serial VARCHAR(40) UNIQUE,
  immatriculation VARCHAR(20) NOT NULL UNIQUE,
  marque VARCHAR(50),
  modele VARCHAR(50),
  couleur VARCHAR(30),
  annee INTEGER,
  categorie VARCHAR(30) NOT NULL DEFAULT 'leger',
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  is_stolen BOOLEAN NOT NULL DEFAULT FALSE,
  stolen_reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_vehicles_owner_idx ON fleet_vehicles(owner_id);
CREATE INDEX IF NOT EXISTS fleet_vehicles_serial_idx ON fleet_vehicles(serial);

CREATE TABLE IF NOT EXISTS fleet_drivers (
  id SERIAL PRIMARY KEY,
  nin VARCHAR(32) NOT NULL UNIQUE,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  telephone VARCHAR(32) NOT NULL,
  numero_permis VARCHAR(30),
  categorie_permis VARCHAR(10),
  commune VARCHAR(100),
  wilaya VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_assignments (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES fleet_drivers(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_assignments_one_active_per_vehicle
  ON fleet_assignments(vehicle_id) WHERE active;
CREATE INDEX IF NOT EXISTS fleet_assignments_vehicle_idx ON fleet_assignments(vehicle_id);

CREATE TABLE IF NOT EXISTS fleet_trips (
  id SERIAL PRIMARY KEY,
  trip_id VARCHAR(64) NOT NULL UNIQUE,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  driver_id INTEGER NOT NULL REFERENCES fleet_drivers(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL,
  start_city VARCHAR(100),
  end_city VARCHAR(100),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours', 'termine', 'interrompu')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_trips_vehicle_idx ON fleet_trips(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_trips_vehicle_status_idx ON fleet_trips(vehicle_id, status);

CREATE TABLE IF NOT EXISTS fleet_positions (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES fleet_trips(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed DOUBLE PRECISION NOT NULL,
  acceleration DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION NOT NULL,
  fuel DOUBLE PRECISION,
  distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'moving',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_positions_vehicle_time_idx ON fleet_positions(vehicle_id, recorded_at);
CREATE INDEX IF NOT EXISTS fleet_positions_time_idx ON fleet_positions(recorded_at);

CREATE TABLE IF NOT EXISTS fleet_current_positions (
  vehicle_id INTEGER PRIMARY KEY REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  car_id VARCHAR(64) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  fuel DOUBLE PRECISION,
  trip_id INTEGER REFERENCES fleet_trips(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_theft_cases (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES fleet_owners(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  share_token VARCHAR(96) UNIQUE,
  share_expires_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_theft_cases_vehicle_idx ON fleet_theft_cases(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_theft_cases_owner_status_idx ON fleet_theft_cases(owner_id, status);
