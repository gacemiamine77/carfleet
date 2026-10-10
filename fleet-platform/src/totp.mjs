import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP RFC 6238 (SHA-1, 30 s, 6 chiffres) — double authentification admin, sans dépendance.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input) {
  const clean = String(input || "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Secret TOTP invalide");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

export function hotp(secret, counter) {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function totpCode(secret, atMs = Date.now(), stepSeconds = 30) {
  return hotp(secret, Math.floor(atMs / 1000 / stepSeconds));
}

export function verifyTotp(secret, code, atMs = Date.now(), window = 1) {
  const expected = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(expected)) return false;
  const counter = Math.floor(atMs / 1000 / 30);
  for (let delta = -window; delta <= window; delta += 1) {
    const candidate = hotp(secret, counter + delta);
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function newTotpSecret() {
  const bytes = randomBytes(20);
  let output = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32[(value >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function otpauthUrl(secret, label, issuer = "Fleet Platform") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
