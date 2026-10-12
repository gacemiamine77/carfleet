-- Signalement des vols côté admin : horodatage + pastille "non vu".
ALTER TABLE fleet_theft_cases ADD COLUMN IF NOT EXISTS signale_admin_at TIMESTAMPTZ;
ALTER TABLE fleet_theft_cases ADD COLUMN IF NOT EXISTS vu_par_admin BOOLEAN NOT NULL DEFAULT FALSE;
-- Les dossiers déjà ouverts deviennent visibles comme non vus.
UPDATE fleet_theft_cases SET vu_par_admin = FALSE WHERE status = 'open' AND vu_par_admin IS NULL;
