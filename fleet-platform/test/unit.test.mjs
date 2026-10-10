import test from "node:test";
import assert from "node:assert/strict";

process.env.FLEET_DATABASE_URL ||= "postgresql://test:test@localhost:5432/fleet_test";
const auth = await import("../src/auth.mjs");
const validation = await import("../src/validation.mjs");
const http = await import("../src/http.mjs");

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
