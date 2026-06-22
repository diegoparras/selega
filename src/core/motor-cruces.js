// motor-cruces.js — Motor GENÉRICO de cruces numéricos. Evalúa cruces definidos como
// DATA (no hardcodeados) contra las cifras. SIN eval: parser propio de expresiones con
// lista blanca de campos + operadores. Es la base del constructor visual de reglas:
// el Admin arma un cruce → sale este spec → el motor lo corre igual que los nativos.
//
// Spec de un cruce (JSON, vive en el rule-pack):
//   { id, nombre, activo, condicion, tipo:"comparacion"|"presencia", ... ref }
//   condicion: "siempre" | { campo, op, valor, sinDato:"na"|"falta" }
//   comparacion: { izq:[tokens], comparador, der:[tokens], tolerancia }
//   presencia:   { campo, debe:"presente"|"verdadero", faltaEstado:"DIFIERE" }
//   tokens de expresión: [campo, op, campo, op, ...]  op ∈ + − × ÷

export const OK = "OK", DIFIERE = "DIFIERE", NA = "N/A", FALTA = "FALTA_DATO";
export const TOL_DEFECTO = 1.0;

const r2 = (n) => Math.round(n * 100) / 100;

// Evalúa una expresión [campo, op, campo, ...] contra cifras. null si falta un dato.
// Precedencia: × ÷ antes que + − (sin eval, sólo aritmética sobre campos permitidos).
export function evalExpr(tokens, cifras) {
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length % 2 === 0) return null;
  const vals = [], ops = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      const v = cifras[tokens[i]];
      if (typeof v !== "number" || Number.isNaN(v)) return null; // falta dato → cruce FALTA
      vals.push(v);
    } else ops.push(tokens[i]);
  }
  const nums = [vals[0]], add = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k], nv = vals[k + 1];
    if (op === "×" || op === "*") nums[nums.length - 1] *= nv;
    else if (op === "÷" || op === "/") nums[nums.length - 1] = nv !== 0 ? nums[nums.length - 1] / nv : NaN;
    else { add.push(op); nums.push(nv); }
  }
  let acc = nums[0];
  for (let k = 0; k < add.length; k++) acc = (add[k] === "−" || add[k] === "-") ? acc - nums[k + 1] : acc + nums[k + 1];
  return Number.isNaN(acc) ? null : acc;
}

// ¿Aplica el cruce? → "aplica" | "na" | "falta" (según la condición y si hay dato).
export function evalCondicion(cond, cifras) {
  if (!cond || cond === "siempre") return "aplica";
  const v = cifras[cond.campo];
  if (v == null) return cond.sinDato === "falta" ? "falta" : "na";
  let ok;
  switch (cond.op) {
    case "=": ok = v === cond.valor; break;
    case "≠": ok = v !== cond.valor; break;
    case "en": ok = Array.isArray(cond.valor) && cond.valor.includes(v); break;
    case "<": ok = v < cond.valor; break;
    case ">": ok = v > cond.valor; break;
    case "≤": ok = v <= cond.valor; break;
    case "≥": ok = v >= cond.valor; break;
    default: ok = false;
  }
  return ok ? "aplica" : "na";
}

function comparar(comp, izq, der, tol) {
  const dif = r2(izq - der);
  let ok;
  switch (comp) {
    case "=": ok = Math.abs(dif) <= tol; break;
    case "≠": ok = Math.abs(dif) > tol; break;
    case "≤": ok = izq <= der + tol; break;
    case "≥": ok = izq >= der - tol; break;
    case ">": ok = izq > der; break;
    case "<": ok = izq < der; break;
    default: ok = false;
  }
  return { ok, dif };
}

// Campos (cifras) que TOCA un cruce — para corroborar qué cifras valida.
export function camposDeCruce(spec) {
  const s = new Set();
  const addExpr = (t) => { if (Array.isArray(t)) t.forEach((tok, i) => { if (i % 2 === 0) s.add(tok); }); };
  if (spec.tipo === "presencia") { if (spec.campo) s.add(spec.campo); }
  else { addExpr(spec.izq); addExpr(spec.der); }
  if (spec.condicion && spec.condicion.campo) s.add(spec.condicion.campo);
  return [...s];
}

// Evalúa UN cruce → { id, nombre, estado, diferencia, detalle, campos }.
export function evaluarCruce(spec, cifras) {
  const base = { id: spec.id, nombre: spec.nombre, estado: NA, diferencia: null, detalle: "",
    consecuencia: spec.consecuencia || null, campos: camposDeCruce(spec) };
  if (spec.activo === false) return { ...base, estado: NA, detalle: "cruce desactivado" };

  const ap = evalCondicion(spec.condicion, cifras);
  if (ap === "falta") return { ...base, estado: FALTA, detalle: spec.detalleFalta || "falta el dato de la condición" };
  if (ap === "na") return { ...base, estado: NA, detalle: spec.detalleNA || "no aplica" };

  if (spec.tipo === "presencia") {
    const v = cifras[spec.campo];
    const ok = spec.debe === "verdadero" ? v === true : v != null;
    return { ...base,
      estado: ok ? OK : (spec.faltaEstado || DIFIERE),
      detalle: ok ? (spec.detalleOK || "presente") : (spec.detalleFalta || "ausente") };
  }

  // tipo "comparacion" (default)
  const izq = evalExpr(spec.izq, cifras);
  const der = evalExpr(spec.der, cifras);
  if (izq == null || der == null) return { ...base, estado: FALTA, detalle: "falta cargar una cifra" };
  const tol = spec.tolerancia != null ? spec.tolerancia : TOL_DEFECTO;
  const { ok, dif } = comparar(spec.comparador || "=", izq, der, tol);
  return { ...base, estado: ok ? OK : DIFIERE, diferencia: ok ? null : dif, detalle: spec.ref || "" };
}

// Corre un set de cruces (data) contra las cifras.
export function correrCrucesData(cifras, cruces) {
  return (cruces || []).map((c) => evaluarCruce(c, cifras));
}

export function resumen(resultados) {
  const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
  return { ok: cuenta(OK), difiere: cuenta(DIFIERE), na: cuenta(NA), falta: cuenta(FALTA) };
}

// Confianza por cifra DERIVADA DE LOS CRUCES: una cifra que entra en un cruce que CIERRA
// está corroborada (la matemática la respalda); si solo aparece en cruces que difieren,
// es sospechosa. Devuelve { campo: "ok" | "mal" }. Un OK gana sobre un DIFIERE.
export function corroboracionCifras(resultados) {
  const estado = {};
  for (const r of resultados || []) {
    if (r.estado !== OK && r.estado !== DIFIERE) continue; // solo cruces realmente evaluados
    for (const c of r.campos || []) {
      if (r.estado === OK) estado[c] = "ok";
      else if (estado[c] !== "ok") estado[c] = "mal";
    }
  }
  return estado;
}
