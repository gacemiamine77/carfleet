-- Fleet Platform 0001 : cahier des charges complet.
-- Comptes par type + cycle d'activation, forfaits/abonnements/paiements,
-- administration + audit, notifications, champs véhicule étendus, géorepérage.
-- Appliquer APRÈS 0000_fleet_core.sql, sur la base flotte UNIQUEMENT.

-- ── 1. Cycle de vie du compte + forfait ──────────────────────────
ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS statut_compte VARCHAR(32) NOT NULL DEFAULT 'inscription_recue';
ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS motif TEXT;
ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS limite_vehicules INTEGER;
ALTER TABLE fleet_owners ADD COLUMN IF NOT EXISTS email VARCHAR(160);

CREATE TABLE IF NOT EXISTS fleet_plans (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  type_compte VARCHAR(16) NOT NULL CHECK (type_compte IN ('particulier', 'entreprise')),
  prix NUMERIC(12, 2) NOT NULL DEFAULT 0,
  devise VARCHAR(8) NOT NULL DEFAULT 'DZD',
  duree VARCHAR(16) NOT NULL CHECK (duree IN ('mensuel', 'trimestriel', 'annuel')),
  limite_vehicules INTEGER,
  georeperage BOOLEAN NOT NULL DEFAULT FALSE,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_subscriptions (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES fleet_owners(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES fleet_plans(id),
  statut VARCHAR(32) NOT NULL DEFAULT 'en_attente_paiement'
    CHECK (statut IN ('en_attente_paiement', 'paiement_a_verifier', 'en_attente_validation', 'actif', 'expire', 'annule')),
  debut_at TIMESTAMPTZ,
  fin_at TIMESTAMPTZ,
  expiration_notifiee BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_subscriptions_owner_idx ON fleet_subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS fleet_subscriptions_owner_status_idx ON fleet_subscriptions(owner_id, statut);

CREATE TABLE IF NOT EXISTS fleet_payments (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES fleet_subscriptions(id) ON DELETE CASCADE,
  montant NUMERIC(12, 2) NOT NULL,
  devise VARCHAR(8) NOT NULL DEFAULT 'DZD',
  methode VARCHAR(32) NOT NULL DEFAULT 'virement' CHECK (methode IN ('virement', 'especes', 'passerelle', 'autre')),
  reference VARCHAR(100),
  statut VARCHAR(32) NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'a_verifier', 'confirme', 'refuse', 'expire_annule')),
  confirme_par INTEGER,
  confirme_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_payments_subscription_idx ON fleet_payments(subscription_id);
CREATE INDEX IF NOT EXISTS fleet_payments_status_idx ON fleet_payments(statut);

-- Forfaits par défaut (modifiables par l'administrateur).
INSERT INTO fleet_plans(nom, type_compte, prix, devise, duree, limite_vehicules, georeperage, actif)
VALUES
  ('Particulier Mensuel', 'particulier', 1500, 'DZD', 'mensuel', 3, FALSE, TRUE),
  ('Particulier Annuel', 'particulier', 15000, 'DZD', 'annuel', 3, TRUE, TRUE),
  ('Entreprise Mensuel', 'entreprise', 5000, 'DZD', 'mensuel', 20, TRUE, TRUE),
  ('Entreprise Annuel', 'entreprise', 50000, 'DZD', 'annuel', 50, TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Réglages plateforme (activation automatique ou validation manuelle).
CREATE TABLE IF NOT EXISTS fleet_settings (
  cle VARCHAR(64) PRIMARY KEY,
  valeur TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO fleet_settings(cle, valeur) VALUES ('activation_auto_apres_paiement', '0') ON CONFLICT DO NOTHING;

-- ── 2. Administration + audit ────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret VARCHAR(64),
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_admin_sessions (
  token VARCHAR(96) PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES fleet_admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fleet_audit_log (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES fleet_admins(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  cible_type VARCHAR(32),
  cible_id INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_audit_log_time_idx ON fleet_audit_log(created_at DESC);

-- ── 3. Notifications utilisateurs ────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_notifications (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES fleet_owners(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL DEFAULT 'info',
  titre VARCHAR(200) NOT NULL,
  corps TEXT,
  lu BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_notifications_owner_idx ON fleet_notifications(owner_id, created_at DESC);

-- ── 4. Champs véhicule étendus ───────────────────────────────────
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS vin VARCHAR(17);
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS longueur DOUBLE PRECISION;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS largeur DOUBLE PRECISION;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS hauteur DOUBLE PRECISION;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS tel_principal VARCHAR(32);
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS tel_secondaire VARCHAR(32);
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS nom_interne VARCHAR(100);
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS service VARCHAR(100);
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS responsable VARCHAR(200);

-- ── 5. Géorepérage ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fleet_geofences (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES fleet_owners(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('cercle', 'polygone')),
  centre_lat DOUBLE PRECISION,
  centre_lon DOUBLE PRECISION,
  rayon_m DOUBLE PRECISION,
  points JSONB,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_geofences_owner_idx ON fleet_geofences(owner_id);

CREATE TABLE IF NOT EXISTS fleet_geofence_vehicles (
  geofence_id INTEGER NOT NULL REFERENCES fleet_geofences(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  alertes BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (geofence_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS fleet_geofence_states (
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  geofence_id INTEGER NOT NULL REFERENCES fleet_geofences(id) ON DELETE CASCADE,
  inside BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, geofence_id)
);

CREATE TABLE IF NOT EXISTS fleet_geofence_events (
  id SERIAL PRIMARY KEY,
  geofence_id INTEGER NOT NULL REFERENCES fleet_geofences(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
  type VARCHAR(16) NOT NULL CHECK (type IN ('entree', 'sortie')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_geofence_events_vehicle_time_idx ON fleet_geofence_events(vehicle_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS fleet_geofence_events_geofence_idx ON fleet_geofence_events(geofence_id);
