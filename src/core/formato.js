// formato.js — Formato de números CONFIGURABLE por el usuario: separador de miles,
// separador decimal y representación de negativos (signo adelante "-123", atrás "123-"
// o paréntesis contables "(123)"). El OCR y la carga manual INTERPRETAN según esta
// config (ej. en AR el punto es separador de miles, no decimal → "7.658.228" = 7658228);
// la pantalla MUESTRA según ella. Se guarda en localStorage.

export const FORMATO_DEFECTO = { miles: ".", decimal: ",", negativo: "adelante" };
const KEY = "selega.formato";

export function cargarFormato() {
  try { return { ...FORMATO_DEFECTO, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...FORMATO_DEFECTO }; }
}
export function guardarFormato(f) {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* sin storage */ }
}

const esNegativo = (s) => /^\s*\(.*\)\s*$/.test(s) || /-/.test(s);

// Parsea un texto a número según el formato. null si no hay número.
export function parseMonto(s, f = FORMATO_DEFECTO) {
  if (s == null || s === "") return null;
  const str = String(s).trim();
  const neg = esNegativo(str);
  let t = str.replace(/[^\d.,\s]/g, "");                       // dejo dígitos y separadores
  if (f.miles && f.miles !== " ") t = t.split(f.miles).join(""); // saco separador de miles
  t = t.replace(/\s/g, "");                                     // y espacios (miles o ruido)
  if (f.decimal && f.decimal !== ".") t = t.split(f.decimal).join(".");
  const partes = t.split(".");                                  // si quedan varios "." → todos menos el último son miles
  if (partes.length > 2) t = partes.slice(0, -1).join("") + "." + partes[partes.length - 1];
  if (t === "" || t === ".") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : (neg ? -Math.abs(n) : n);
}

// Extrae el número más probable de un texto (OCR ruidoso): el token con más dígitos.
export function extraerNumero(texto, f = FORMATO_DEFECTO) {
  const tokens = String(texto).match(/[-(]?\d[\d.,]*\)?/g);     // sin espacios → no fusiona columnas
  if (!tokens) return null;
  let mejor = null, mejorLen = -1;
  for (const tk of tokens) {
    const n = parseMonto(tk, f);
    if (n == null) continue;
    const len = tk.replace(/\D/g, "").length;
    if (len > mejorLen) { mejor = n; mejorLen = len; }
  }
  return mejor;
}

// Formatea un número a texto según el formato.
export function formatear(n, f = FORMATO_DEFECTO) {
  if (n == null || Number.isNaN(n)) return "";
  const [ent0, dec] = Math.abs(n).toFixed(2).split(".");
  const ent = f.miles ? ent0.replace(/\B(?=(\d{3})+(?!\d))/g, f.miles) : ent0;
  let s = ent + (f.decimal || ".") + dec;
  if (n < 0) s = f.negativo === "parentesis" ? `(${s})` : f.negativo === "atras" ? `${s}-` : `-${s}`;
  return s;
}
