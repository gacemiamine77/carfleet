import test from "node:test";
import assert from "node:assert/strict";

process.env.FLEET_DATABASE_URL ||= "postgresql://test:test@localhost:5432/fleet_test";
const auth = await import("../src/auth.mjs");
const validation = await import("../src/validation.mjs");
const http = await import("../src/http.mjs");
const totp = await import("../src/totp.mjs");

test("mot de passe : hachage et vérification", () => {
  const hashed = auth.hashPassword("secret-123");
  assert.equal(auth.verifyPassword("secret-123", hashed), true);
  assert.equal(auth.verifyPassword("mauvais", hashed), false);
  assert.equal(auth.verifyPassword("secret-123", "invalide"), false);
});

test("authentification : extraction du jeton Bearer", () => {
  assert.equal(auth.bearerToken("Bearer abc123"), "abc123");
  assert.equal(auth.bearerToken("Token abc123"), "");
  assert.equal(auth.bearerToken(""), "");
});

test("validation : coordonnées et distances", () => {
  assert.equal(validation.coordinate("36.7", "lat"), 36.7);
  assert.throws(() => validation.coordinate("200", "lat"), /Nombre invalide/);
  const meters = validation.haversineMeters(36.7, 3.0, 36.7, 4.0);
  assert.ok(meters > 89000 && meters < 90000);
});

test("validation : identifiants série stables et bornés", () => {
  const serial = validation.serialId("FLT");
  assert.ok(serial.startsWith("FLT-"));
  assert.ok(serial.length <= 40);
});

test("requêtes : limite de débit", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(http.rateLimit(key, 2, 60_000), true);
  assert.equal(http.rateLimit(key, 2, 60_000), true);
  assert.equal(http.rateLimit(key, 2, 60_000), false);
});

test("TOTP : vecteur RFC 6238 (SHA-1, 30 s)", () => {
  // Secret ASCII "12345678901234567890" encodé base32 ; T=59s → 287082.
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totp.totpCode(secret, 59_000), "287082");
  assert.equal(totp.verifyTotp(secret, "287082", 59_000), true);
  assert.equal(totp.verifyTotp(secret, "000000", 59_000), false);
});

test("géorepérage : cercle et polygone", () => {
  assert.equal(validation.dansCercle(36.7, 3.0, 36.7, 3.0, 500), true);
  assert.equal(validation.dansCercle(36.8, 3.0, 36.7, 3.0, 500), false);
  const carre = [[0, 0], [0, 1], [1, 1], [1, 0]];
  assert.equal(validation.dansPolygone(0.5, 0.5, carre), true);
  assert.equal(validation.dansPolygone(2, 2, carre), false);
  assert.equal(validation.dansZone(36.7, 3.0, { type: "cercle", centre_lat: 36.7, centre_lon: 3.0, rayon_m: 500 }), true);
  assert.equal(validation.dansZone(0.5, 0.5, { type: "polygone", points: carre }), true);
});

test("véhicule : VIN", () => {
  assert.equal(validation.vin("VF1ABCDEF12345678"), "VF1ABCDEF12345678");
  assert.equal(validation.vin(""), null);
  assert.throws(() => validation.vin("TROP-COURT"), /VIN invalide/);
  assert.throws(() => validation.vin("VF1ABCDEFGI123456"), /VIN invalide/);
});
