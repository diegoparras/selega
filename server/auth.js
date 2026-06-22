// auth.js — cripto de autenticación con primitivas NATIVAS de Node (sin deps).
// Hash de contraseñas con scrypt (KDF fuerte) + comparación en tiempo constante.
// Sesiones como cookie firmada (HMAC) y stateless → sin store de sesiones, escalable.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pw), salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [s, h] = stored.split(":");
  const hash = scryptSync(String(pw), Buffer.from(s, "hex"), 64);
  const hb = Buffer.from(h, "hex");
  return hash.length === hb.length && timingSafeEqual(hash, hb);
}

export function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySession(cookie, secret) {
  if (!cookie || !cookie.includes(".")) return null;
  const [body, mac] = cookie.split(".");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
