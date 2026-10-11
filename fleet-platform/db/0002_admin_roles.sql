-- Rôles d'administration : le compte principal devient superadmin,
-- qui peut ensuite créer/promouvoir d'autres admins via l'API.
ALTER TABLE fleet_admins
  ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name = 'fleet_admins' AND constraint_name = 'fleet_admins_role_check') THEN
    ALTER TABLE fleet_admins
      ADD CONSTRAINT fleet_admins_role_check CHECK (role IN ('superadmin', 'admin'));
  END IF;
END $$;

-- Le plus ancien compte (créé via scripts/admin.mjs) devient superadmin,
-- uniquement si aucun superadmin n'existe encore.
UPDATE fleet_admins SET role = 'superadmin'
 WHERE id = (SELECT MIN(id) FROM fleet_admins)
   AND NOT EXISTS (SELECT 1 FROM fleet_admins WHERE role = 'superadmin');
