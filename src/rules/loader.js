// loader.js — Carga de jurisdicciones y rule-packs (Selega).
// Prioridad: pack custom (servidor/Postgres, COMPARTIDO entre agentes) > pack del repo > base.
// Los packs custom ya NO viven por-navegador: persisten en el servidor (/api/packs lectura,
// /api/admin/packs escritura admin-only).
import { CRUCES_CPCEN } from "../core/cruces-cpcen.js";
import { CAMPOS } from "../core/schema.js";

export async function cargarRegistro() {
  const base = (await (await fetch("./rules/_registry.json")).json()).jurisdicciones;
  // Mergeá los entes del servidor (override de nombre por id, o ente nuevo) sobre los 24 fijos.
  let extra = [];
  try { extra = await (await fetch("/api/jurisdicciones")).json(); } catch { /* sin sesión: solo fijos */ }
  const map = new Map(base.map((j) => [j.id, j]));
  for (const e of extra || []) map.set(e.id, { ...(map.get(e.id) || {}), ...e });
  return [...map.values()];
}

// Lee el pack custom del servidor (o null si no hay / sin sesión).
async function packCustom(id) {
  try {
    const r = await fetch(`/api/packs/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const p = await r.json();
    return p && Object.keys(p).length ? p : null;
  } catch { return null; }
}

export async function cargarPack(jur) {
  let pack;
  const custom = await packCustom(jur.id);
  if (custom) {
    pack = { ...custom, _origen: "custom" };
  } else if (jur.estado === "completo" && jur.pack) {
    pack = { ...(await (await fetch(`./rules/${jur.pack}`)).json()), _origen: "repo" };
  } else {
    const base = await (await fetch("./rules/_base.json")).json();
    pack = { ...base, jurisdiccion: jur.id, consejo: jur.consejo,
      nombre: `${jur.provincia} — ${jur.consejo}`, _origen: "base", _plantilla: true };
  }
  // Semilla: los 13 cruces EECC estándar si el pack no trae los suyos. A partir de acá
  // los cruces son DATA del pack por jurisdicción (el Admin los edita y persisten en custom).
  if (!Array.isArray(pack.cruces) || !pack.cruces.length) pack.cruces = CRUCES_CPCEN;
  // Las CIFRAS también son DATA del pack (editables por jurisdicción). Semilla = las 18+ canónicas.
  if (!Array.isArray(pack.campos) || !pack.campos.length) pack.campos = CAMPOS;
  return pack;
}

export async function guardarPackCustom(id, pack) {
  const r = await fetch(`/api/admin/packs/${encodeURIComponent(id)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pack) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
}

export async function borrarPackCustom(id) {
  const r = await fetch(`/api/admin/packs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
}
