// Applique les migrations drizzle/*.sql référencées dans drizzle/meta/_journal.json,
// dans l'ordre, en traquant les tags déjà appliqués dans la table __migrations.
// Usage : node scripts/migrate.mjs   (DATABASE_URL lu depuis .env ou l'environnement)
// Exemple prod : set DATABASE_URL=... && node scripts/migrate.mjs
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { Pool } from "pg";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });

const targets = process.argv.slice(2); // ex : node scripts/migrate.mjs 0005 → applique seulement 0005
const matchesTarget = (tag) =>
  targets.some((target) => tag === target || tag.startsWith(`${target}_`) || tag.startsWith(target));
async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS __migrations (tag text primary key, applied_at timestamptz default now())`);
  const applied = new Set((await pool.query(`SELECT tag FROM __migrations`)).rows.map((r) => r.tag));
  const journal = JSON.parse(readFileSync(resolve("drizzle/meta/_journal.json"), "utf8"));
  for (const entry of journal.entries) {
    if (applied.has(entry.tag)) continue;
    if (targets.length && !matchesTarget(entry.tag)) continue;
    const file = resolve("drizzle", `${entry.tag}.sql`);
    if (!existsSync(file)) throw new Error(`Migration introuvable : ${file}`);
    const sql = readFileSync(file, "utf8");
    const stmts = sql.split(/--> statement-breakpoint/).map((s) => s.trim()).filter(Boolean);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const st of stmts) await client.query(st);
      await client.query(`INSERT INTO __migrations(tag) VALUES($1)`, [entry.tag]);
      await client.query("COMMIT");
      console.log(`✔ ${entry.tag}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`${entry.tag} échoué : ${e.message}`);
    } finally {
      client.release();
    }
  }
  console.log("Migrations à jour.");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });