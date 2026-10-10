import { Pool } from "pg";
import "dotenv/config";

const url = process.env.FLEET_DATABASE_URL;
if (!url) {
  throw new Error("FLEET_DATABASE_URL manquante. La plateforme flotte exige sa propre base, séparée de la Sécurité publique.");
}

export const pool = new Pool({ connectionString: url });

export async function query(text, params = []) {
  return pool.query(text, params);
}
