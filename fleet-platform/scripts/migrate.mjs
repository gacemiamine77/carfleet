import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import "dotenv/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(root, "..", "db");
const url = process.env.FLEET_DATABASE_URL;
if (!url) {
  console.error("FLEET_DATABASE_URL manquante. Utilisez la base flotte dédiée, jamais la base Sécurité publique.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS fleet_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set((await pool.query(`SELECT filename FROM fleet_migrations`)).rows.map((row) => row.filename));
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = await readFile(path.join(migrationsDir, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO fleet_migrations(filename) VALUES($1)`, [filename]);
      await client.query("COMMIT");
      console.log(`✔ ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`${filename} échoué : ${error.message}`);
    } finally {
      client.release();
    }
  }
  console.log("Migrations flotte à jour.");
  await pool.end();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
