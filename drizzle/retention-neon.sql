-- Rétention historique footprints sur Neon (à coller dans l'éditeur SQL Neon, UNE fois).
-- Purge quotidienne du brut > 30 jours. Nécessite les extensions postgis + pg_cron
-- (la migration 0001 crée déjà postgis ; pg_cron est géré ici).
-- Les positions temps réel (vehicle_current_position) ne sont JAMAIS purgées.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Fonction de purge (par lots de 5000, utilise l'index BRIN sur recorded_at)
CREATE OR REPLACE FUNCTION purge_old_footprints(retention_days int DEFAULT 30)
RETURNS bigint AS $$
DECLARE
  total bigint := 0;
  n int;
  cutoff timestamptz := now() - (retention_days || ' days')::interval;
BEGIN
  LOOP
    DELETE FROM footprints WHERE id IN (
      SELECT id FROM footprints WHERE recorded_at < cutoff ORDER BY recorded_at LIMIT 5000
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n < 5000;
  END LOOP;
  RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Planification quotidienne à 03:00 UTC (remplace le job s'il existe déjà)
SELECT cron.unschedule('purge-footprints-30d');
SELECT cron.schedule('purge-footprints-30d', '0 3 * * *', $$SELECT purge_old_footprints(30)$$);

-- Vérification :
-- SELECT * FROM cron.job;
-- SELECT purge_old_footprints(30);  -- test manuel (retourne le nb supprimé)
