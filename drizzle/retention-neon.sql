-- Rétention historique footprints sur Neon (purge quotidienne du brut > 30 jours).
-- Les positions temps réel (vehicle_current_position) ne sont JAMAIS purgées.
--
-- ÉTAPE 1 — éditeur SQL Neon, base `postgres` : activer pg_cron
--   (Neon n'autorise CREATE EXTENSION pg_cron que dans la base postgres)
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- ÉTAPE 2 — éditeur SQL Neon, base `carfleetDB` : fonction de purge
--   (par lots de 5000, utilise l'index BRIN sur recorded_at)

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

-- ÉTAPE 3 — éditeur SQL Neon, base `postgres` : planifier dans carfleetDB
--
--   SELECT cron.unschedule('purge-footprints-30d');
--   SELECT cron.schedule_in_database(
--     'purge-footprints-30d', '0 3 * * *',
--     $$SELECT purge_old_footprints(30)$$, 'carfleetDB'
--   );
--
-- Vérifications (base postgres) :
--   SELECT jobname, schedule, database, active FROM cron.job;
-- Test manuel (base carfleetDB) : SELECT purge_old_footprints(30);
