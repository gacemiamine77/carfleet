import { Pool } from "pg";
import "dotenv/config";
import { hashPassword } from "../src/auth.mjs";
import { newTotpSecret, otpauthUrl } from "../src/totp.mjs";

// Gestion du compte administrateur principal (accès serveur requis = procédure de récupération).
// Usage :
//   node scripts/admin.mjs create <username> <password>
//   node scripts/admin.mjs totp <username>      (affiche le secret + URL à enregistrer dans l'app d'authentification)
//   node scripts/admin.mjs reset-password <username> <nouveau-mot-de-passe>

const url = process.env.FLEET_DATABASE_URL;
if (!url) {
  console.error("FLEET_DATABASE_URL manquante.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
const [, , command, username, secret2] = process.argv;

async function main() {
  if (command === "create") {
    if (!username || !secret2 || String(secret2).length < 10) {
      console.error("Usage : node scripts/admin.mjs create <username> <password(10+)> ");
      process.exit(1);
    }
    const exists = await pool.query(`SELECT id FROM fleet_admins WHERE username = $1 LIMIT 1`, [username]);
    if (exists.rowCount) {
      console.error("Administrateur déjà existant.");
      process.exit(1);
    }
    await pool.query(`INSERT INTO fleet_admins(username, password_hash, actif) VALUES($1,$2,TRUE)`, [username, hashPassword(secret2)]);
    console.log(`✔ administrateur ${username} créé. Ajoutez la double authentification : node scripts/admin.mjs totp ${username}`);
  } else if (command === "totp") {
    if (!username) {
      console.error("Usage : node scripts/admin.mjs totp <username>");
      process.exit(1);
    }
    const secret = newTotpSecret();
    const updated = await pool.query(`UPDATE fleet_admins SET totp_secret = $1 WHERE username = $2`, [secret, username]);
    if (!updated.rowCount) {
      console.error("Administrateur introuvable.");
      process.exit(1);
    }
    console.log("Secret TOTP (à saisir dans l'application d'authentification) :");
    console.log(secret);
    console.log("URL d'enregistrement :");
    console.log(otpauthUrl(secret, username));
  } else if (command === "reset-password") {
    if (!username || !secret2 || String(secret2).length < 10) {
      console.error("Usage : node scripts/admin.mjs reset-password <username> <nouveau-mot-de-passe(10+)>");
      process.exit(1);
    }
    const updated = await pool.query(`UPDATE fleet_admins SET password_hash = $1 WHERE username = $2`, [hashPassword(secret2), username]);
    if (!updated.rowCount) {
      console.error("Administrateur introuvable.");
      process.exit(1);
    }
    await pool.query(`DELETE FROM fleet_admin_sessions WHERE admin_id = (SELECT id FROM fleet_admins WHERE username = $1)`, [username]);
    console.log(`✔ mot de passe réinitialisé pour ${username} (sessions révoquées).`);
  } else {
    console.error("Commande inconnue : create | totp | reset-password");
    process.exit(1);
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
