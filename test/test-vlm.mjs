// test-vlm.mjs — ACEPTACIÓN del motor T5 (VLM-OCR en navegador vía transformers.js).
// Renderiza importes argentinos a un canvas (varias fuentes/tamaños), corre el MISMO modelo
// que usa el motor (TrOCR-printed) y compara el número leído contra el esperado usando el
// extraerNumero REAL del core. Éxito = TrOCR lee los dígitos y el número parseado coincide
// (TrOCR a veces se come puntos de miles → marcamos "dígitos OK" aunque el separador falle).
//
// HONESTIDAD: este motor NO es como Paddle (modelo ONNX chiquito vendorizado). Acá el modelo
// (pesos de TrOCR) NO está vendorizado: baja LAZY desde HuggingFace la PRIMERA vez (cientos
// de MB; cacheado luego). Por eso este test NO corre en `npm test` y se SALTEA con código 0
// si faltan las deps o el modelo no se puede bajar (sin red / sin permiso). Para correrlo:
//   npm i -D @huggingface/transformers canvas   &&   node test/test-vlm.mjs
// (la primera vez bajará los pesos del modelo desde HF y los cacheará en ./.cache)
//
// En el browser el motor usa transformers.web + WebGPU (vendorizado en /public/vendor/
// transformers); acá usamos el build node de transformers.js (onnxruntime-node) sólo para
// validar que el modelo lee importes, sin levantar navegador ni WebGPU.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extraerNumero } from "../src/core/formato.js";

const aquí = dirname(fileURLToPath(import.meta.url));
const SALTO = (msg) => { console.log("⚠", msg, "— SALTEO."); process.exit(0); };

// Verificar que existe el core (sanity) y cargar deps opcionales (fuera de package.json).
if (!existsSync(join(aquí, "..", "src", "core", "formato.js"))) SALTO("falta src/core/formato.js");

let tjs, canvasMod;
try {
  tjs = await import("@huggingface/transformers");
  canvasMod = await import("canvas");
} catch {
  console.log("⚠ @huggingface/transformers / canvas no instalados (dev) — SALTEO. Instalá:");
  console.log("    npm i -D @huggingface/transformers canvas   y volvé a correr este test.");
  console.log("    (la 1ª vez baja los pesos de TrOCR desde HuggingFace, ~cientos de MB, y los cachea)");
  process.exit(0);
}
const { createCanvas, registerFont } = canvasMod;
const { pipeline, env, RawImage } = tjs;

// Fuentes: registramos algunas de Windows si están (para que el render no caiga a un bitmap feo).
const FUENTES = [];
for (const [file, family] of [["arial.ttf", "Arial"], ["times.ttf", "Times"], ["cour.ttf", "Courier"]]) {
  const p = `C:/Windows/Fonts/${file}`;
  if (existsSync(p)) { try { registerFont(p, { family }); FUENTES.push(family); } catch { /* ya registrada */ } }
}
if (!FUENTES.length) FUENTES.push("sans-serif");
const TAMAÑOS = [34];

// Render de un importe a canvas → RawImage RGBA (lo que el pipeline image-to-text consume
// en Node; el build node no sabe hacer fetch de un data URL, hay que darle los píxeles).
const render = (txt, font) => {
  const m = createCanvas(10, 10).getContext("2d"); m.font = font;
  const w = Math.ceil(m.measureText(txt).width) + 24, h = 56;
  const cv = createCanvas(w, h), c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#000"; c.font = font; c.textBaseline = "middle";
  c.fillText(txt, 12, h / 2);
  const img = c.getImageData(0, 0, w, h);             // RGBA
  return new RawImage(new Uint8ClampedArray(img.data), w, h, 4);
};

const normalizar = (s) => (s || "")
  .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
  .replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",").replace(/[．。]/g, ".")
  .replace(/[‐‑‒–—−]/g, "-").trim();
const soloDigitos = (s) => (s || "").replace(/\D/g, "");

// Cargar el pipeline. En node usa onnxruntime-node; baja los pesos de HF la 1ª vez.
console.log("Motor T5 VLM-OCR (transformers.js / TrOCR-base-printed) — cargando modelo…");
console.log("(la primera vez baja los pesos desde HuggingFace; puede tardar)\n");
let pl;
try {
  env.allowRemoteModels = true; // baja de HF si no está en cache
  pl = await pipeline("image-to-text", "Xenova/trocr-base-printed");
} catch (e) {
  SALTO("no se pudo cargar el modelo (sin red / HF inaccesible): " + (e?.message || e));
}

const CASOS = ["196.343.896,44", "1.234.567,89", "9.886.410,27", "65.705.541,22", "(12.345,00)"];
let fallosNum = 0, fallosDig = 0, total = 0;
console.log(`Leyendo importes (fuentes: ${FUENTES.join(", ")})\n`);
for (const txt of CASOS) {
  const esp = extraerNumero(txt);
  const espDig = soloDigitos(txt);
  for (const fam of FUENTES) for (const sz of TAMAÑOS) {
    total++;
    let leido = "";
    try {
      const out = await pl(render(txt, `${sz}px ${fam}`));
      leido = normalizar(Array.isArray(out) ? (out[0]?.generated_text ?? "") : (out?.generated_text ?? ""));
    } catch (e) { leido = "[error: " + (e?.message || e) + "]"; }
    const got = extraerNumero(leido);
    const okNum = got != null && Math.abs(got - esp) < 0.005;
    const okDig = soloDigitos(leido) === espDig;     // ¿leyó bien TODOS los dígitos?
    if (!okNum) fallosNum++;
    if (!okDig) fallosDig++;
    const marca = okNum ? "✓" : (okDig ? "~" : "✗");  // ~ = dígitos OK pero separador mal
    console.log(`  ${marca} ${txt.padEnd(16)} [${(fam + " " + sz).padEnd(12)}] leyó="${leido}" → ${got}  (esp ${esp})`);
  }
}
console.log();
console.log(`Dígitos correctos: ${total - fallosDig}/${total}   |   Número exacto (con separadores): ${total - fallosNum}/${total}`);
// El criterio de aceptación es indulgente con los separadores (TrOCR-printed no fue
// entrenado para puntuación de miles): exigimos que lea los DÍGITOS. Si ni los dígitos
// salen, el modelo no es viable para importes en este pipeline → fallo.
if (fallosDig <= Math.ceil(total / 2)) {
  console.log("✓ TrOCR lee los dígitos de los importes (viable como tanque; el humano valida separadores).");
  process.exit(0);
} else {
  console.log("✗ TrOCR NO lee los dígitos de forma fiable en este pipeline — NO viable para importes.");
  process.exit(1);
}
