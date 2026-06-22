// db.js — Capa de datos de Selega sobre PostgreSQL (cliente `pg`). Esquema, seed y
// repositorio. Todo acceso a la base pasa por las funciones de acá → la costura que
// permite escalar (concurrente, durable, consultable) sin tocar api.js salvo el await.
// Auditoría append-only. Funciones ASÍNCRONAS (pg es async).
import pg from "pg";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { hashPassword } from "./auth.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
const q = (text, params) => pool.query(text, params);

// Crea el esquema. Reintenta la conexión (Postgres puede tardar en levantar en Docker).
export async function initDb() {
  for (let intento = 1; ; intento++) {
    try { await q("SELECT 1"); break; }
    catch (e) {
      if (intento >= 15) throw e;
      await new Promise((r) => setTimeout(r, 1000)); // espera a que Postgres acepte
    }
  }
  await q(`
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'funcional', limite INTEGER DEFAULT 0, usados INTEGER DEFAULT 0,
      gasto NUMERIC DEFAULT 0, activo BOOLEAN DEFAULT true, creado TIMESTAMPTZ DEFAULT now());
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gasto NUMERIC DEFAULT 0;
    CREATE TABLE IF NOT EXISTS trabajos (
      id SERIAL PRIMARY KEY, jurisdiccion TEXT, comitente TEXT, cuit TEXT, tipo TEXT,
      estado TEXT DEFAULT 'en_curso', cifras TEXT DEFAULT '{}', controles TEXT DEFAULT '{}',
      desenlace TEXT, pack_version TEXT, usuario TEXT,
      creado TIMESTAMPTZ DEFAULT now(), modificado TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS auditoria (
      id SERIAL PRIMARY KEY, ts TIMESTAMPTZ DEFAULT now(), usuario TEXT, trabajo_id INTEGER,
      accion TEXT, detalle TEXT);
    CREATE TABLE IF NOT EXISTS packs (jurisdiccion TEXT PRIMARY KEY, pack TEXT);
    CREATE TABLE IF NOT EXISTS jurisdicciones (
      id TEXT PRIMARY KEY, provincia TEXT, consejo TEXT, creado TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS plantillas (
      id SERIAL PRIMARY KEY, nombre TEXT, jurisdiccion TEXT, fingerprint TEXT,
      campos TEXT, autor TEXT, creado TIMESTAMPTZ DEFAULT now());
    CREATE INDEX IF NOT EXISTS idx_trabajos_usuario ON trabajos(usuario);
    CREATE INDEX IF NOT EXISTS idx_trabajos_cuit ON trabajos(cuit);
    CREATE INDEX IF NOT EXISTS idx_audit_trabajo ON auditoria(trabajo_id);
    CREATE INDEX IF NOT EXISTS idx_plantillas_jur ON plantillas(jurisdiccion);
  `);
}

// ---- config k/v + secreto de sesión (cacheado en memoria) ----
// La tabla config es chica y cambia rarísimo (solo cuando el superadmin guarda). La cacheamos
// entera con TTL corto → un handler que lee 5-7 llaves hace 1 query (o 0) en vez de 7 seriales.
let _secret = null, _cfg = null, _cfgTs = 0;
async function cargarConfig() {
  if (_cfg && Date.now() - _cfgTs < 30000) return _cfg;
  _cfg = Object.fromEntries((await q("SELECT key,value FROM config")).rows.map((r) => [r.key, r.value]));
  _cfgTs = Date.now();
  return _cfg;
}
export const getConfig = async (k, def = null) => { const c = await cargarConfig(); return c[k] ?? def; };
export const setConfig = async (k, v) => {
  await q("INSERT INTO config(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [k, v == null ? null : String(v)]);
  _cfgTs = 0; // invalidá la caché tras escribir
};
export async function sessionSecret() {
  if (_secret) return _secret;
  let s = await getConfig("session_secret");
  if (!s) { s = randomBytes(32).toString("hex"); await setConfig("session_secret", s); }
  return (_secret = s);
}

// ---- usuarios ----
export const getUserByEmail = async (e) => (await q("SELECT * FROM users WHERE email=$1", [e])).rows[0] || null;
export const listUsers = async () => (await q("SELECT id,email,role,limite,usados,gasto,activo FROM users ORDER BY email")).rows;
export const sumarGasto = async (email, monto) => void (await q("UPDATE users SET gasto = gasto + $1 WHERE email=$2", [monto, email]));
export const gastoTotal = async () => Number((await q("SELECT COALESCE(SUM(gasto),0) AS t FROM users")).rows[0].t);
export const setLimite = async (id, n) => void (await q("UPDATE users SET limite=$1 WHERE id=$2", [n, id]));
export const setUserRole = async (id, role) => void (await q("UPDATE users SET role=$1 WHERE id=$2", [role, id]));
export const setUserActivo = async (id, activo) => void (await q("UPDATE users SET activo=$1 WHERE id=$2", [!!activo, id]));
export const deleteUser = async (id) => void (await q("DELETE FROM users WHERE id=$1", [id]));
export const incUsados = async (email) => void (await q("UPDATE users SET usados=usados+1 WHERE email=$1", [email]));
export async function createUser({ email, pass, role = "agente", limite = 0 }) {
  const r = await q("INSERT INTO users(email,pass,role,limite) VALUES($1,$2,$3,$4) RETURNING id",
    [email, hashPassword(pass), role, limite]);
  return r.rows[0].id;
}
export const setUserPass = async (id, pw) => void (await q("UPDATE users SET pass=$1 WHERE id=$2", [hashPassword(pw), id]));

// ---- trabajos ----
export async function crearTrabajo(t) {
  const r = await q(`INSERT INTO trabajos(jurisdiccion,comitente,cuit,tipo,estado,cifras,controles,desenlace,pack_version,usuario)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [t.jurisdiccion, t.comitente, t.cuit, t.tipo || "", t.estado || "en_curso",
     t.cifras || "{}", t.controles || "{}", t.desenlace || "", t.pack_version || null, t.usuario]);
  return r.rows[0].id;
}
export const actualizarTrabajo = async (t) => void (await q(
  `UPDATE trabajos SET comitente=$1,cuit=$2,estado=$3,cifras=$4,controles=$5,desenlace=$6,modificado=now() WHERE id=$7`,
  [t.comitente, t.cuit, t.estado, t.cifras, t.controles, t.desenlace, t.id]));
export const getTrabajo = async (id) => (await q("SELECT * FROM trabajos WHERE id=$1", [id])).rows[0] || null;
export const setEstadoTrabajo = async (id, estado) =>
  void (await q("UPDATE trabajos SET estado=$1,modificado=now() WHERE id=$2", [estado, id]));
export const trabajosDe = async (email) =>
  (await q("SELECT id,jurisdiccion,comitente,cuit,tipo,estado,desenlace,pack_version,modificado FROM trabajos WHERE usuario=$1 ORDER BY modificado DESC", [email])).rows;
export const todosLosTrabajos = async () =>
  (await q("SELECT id,jurisdiccion,comitente,cuit,tipo,estado,desenlace,pack_version,usuario,modificado FROM trabajos ORDER BY modificado DESC LIMIT 500")).rows;

// ---- auditoría (append-only) ----
export const auditar = async (usuario, trabajoId, accion, detalle = "") =>
  void (await q("INSERT INTO auditoria(usuario,trabajo_id,accion,detalle) VALUES($1,$2,$3,$4)",
    [usuario, trabajoId ?? null, accion, detalle]));
export const auditoriaDe = async (trabajoId) =>
  (await q("SELECT ts,usuario,accion,detalle FROM auditoria WHERE trabajo_id=$1 ORDER BY id", [trabajoId])).rows;

// ---- packs custom ----
export const getPack = async (j) => {
  const r = await q("SELECT pack FROM packs WHERE jurisdiccion=$1", [j]);
  return r.rows[0] ? JSON.parse(r.rows[0].pack) : null;
};
export const setPack = async (j, pack) => void (await q(
  "INSERT INTO packs(jurisdiccion,pack) VALUES($1,$2) ON CONFLICT(jurisdiccion) DO UPDATE SET pack=excluded.pack",
  [j, JSON.stringify(pack)]));
export const deletePack = async (j) => void (await q("DELETE FROM packs WHERE jurisdiccion=$1", [j]));

// ---- jurisdicciones custom / overrides (el superadmin crea entes y renombra los fijos) ----
export const listJurisdicciones = async () =>
  (await q("SELECT id,provincia,consejo FROM jurisdicciones ORDER BY provincia")).rows;
export const upsertJurisdiccion = async ({ id, provincia, consejo }) => void (await q(
  "INSERT INTO jurisdicciones(id,provincia,consejo) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET provincia=excluded.provincia, consejo=excluded.consejo",
  [id, provincia, consejo]));
export const deleteJurisdiccion = async (id) => void (await q("DELETE FROM jurisdicciones WHERE id=$1", [id]));

// ---- plantillas (biblioteca compartida de formatos: fingerprint + regiones por cifra) ----
export const listPlantillas = async (jur) =>
  (await q("SELECT id,nombre,jurisdiccion,fingerprint,campos,autor FROM plantillas WHERE jurisdiccion=$1 ORDER BY creado DESC", [jur])).rows;
export async function crearPlantilla(p) {
  const r = await q("INSERT INTO plantillas(nombre,jurisdiccion,fingerprint,campos,autor) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [p.nombre, p.jurisdiccion, p.fingerprint, p.campos, p.autor]);
  return r.rows[0].id;
}
export const borrarPlantilla = async (id) => void (await q("DELETE FROM plantillas WHERE id=$1", [id]));

// ---- seed / reset del admin ----
export async function seedAdmin() {
  const existing = await getUserByEmail(config.adminEmail);
  if (existing) {
    // Si se pasó SELEGA_ADMIN_PASS, reseteamos la contraseña del admin → nunca quedás afuera.
    if (config.adminPass) await setUserPass(existing.id, config.adminPass);
    return null;
  }
  const pass = config.adminPass || randomBytes(6).toString("base64url");
  // El que instala COMISIONA el sistema → arranca como superadmin (motores + jurisdicciones).
  await createUser({ email: config.adminEmail, pass, role: "superadmin" });
  await auditar("sistema", null, "seed_admin", config.adminEmail);
  return config.adminPass ? null : pass; // pass generada → se imprime una vez
}
