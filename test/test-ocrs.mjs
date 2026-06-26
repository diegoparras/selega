// test-ocrs.mjs — ACEPTACIÓN del motor T3 (ocrs, OCR neuronal Rust→WASM) leyendo IMPORTES.
// Renderiza importes argentinos a un canvas (varias fuentes/tamaños), corre el MISMO binding
// wasm-bindgen y los MISMOS modelos .rten VENDORIZADOS en /public/vendor/ocrs, y compara el
// número leído contra el esperado usando el extraerNumero REAL del core (src/core/formato.js).
// Éxito = lee bien los puntos (miles), la coma (decimal) y los paréntesis (negativo contable):
// el número parseado coincide.
//
// Requiere `canvas` (NO es dep de la app; sólo del test — igual que test-paddleocr.mjs). El
// wasm + modelos ya están vendorizados, así que no hace falta nada más. Si falta `canvas` o
// los assets, el test se SALTEA con código 0 (no rompe `npm test`). Para correrlo en serio:
//   npm i -D canvas  &&  node test/test-ocrs.mjs
//
// Nota: el binding ocrs.js es `--target web`; en Node le pasamos los bytes del .wasm directo
// a la función de init (acepta BufferSource). En el browser el motor t3-ocrs.js le pasa la URL
// del .wasm vendorizado. El pipeline (loadImage RGBA → getText) es idéntico al del motor.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { extraerNumero } from "../src/core/formato.js";

const aquí = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(aquí, "..", "public", "vendor", "ocrs");
const BINDING = join(VENDOR, "ocrs.js");
const WASM = join(VENDOR, "ocrs_bg.wasm");
const MODELO_DET = join(VENDOR, "text-detection.rten");
const MODELO_REC = join(VENDOR, "text-recognition.rten");

for (const p of [BINDING, WASM, MODELO_DET, MODELO_REC]) {
  if (!existsSync(p)) {
    console.log("⚠ assets vendorizados ausentes — SALTEO (esperaba", p + ")");
    process.exit(0);
  }
}

let canvasMod, ocrs;
try {
  canvasMod = await import("canvas");
  ocrs = await import(pathToFileURL(BINDING).href);
} catch (e) {
  console.log("⚠ `canvas` no instalado (dev) o binding ocrs ilegible — SALTEO. Instalá:");
  console.log("    npm i -D canvas   y volvé a correr este test.   (", e.message, ")");
  process.exit(0);
}
const { createCanvas, registerFont } = canvasMod;

// --- motor ocrs: init wasm + cargar ambos modelos .rten (idéntico al t3-ocrs.js) ---
await ocrs.default(readFileSync(WASM)); // en Node: bytes directos (en browser: URL)
const init = new ocrs.OcrEngineInit();
init.setDetectionModel(new Uint8Array(readFileSync(MODELO_DET)));
init.setRecognitionModel(new Uint8Array(readFileSync(MODELO_REC)));
const engine = new ocrs.OcrEngine(init);

// Fuentes: registramos algunas de Windows si están (para que el render no caiga a un bitmap feo).
const FUENTES = [];
for (const [file, family] of [["arial.ttf", "Arial"], ["times.ttf", "Times"], ["cour.ttf", "Courier"]]) {
  const p = `C:/Windows/Fonts/${file}`;
  if (existsSync(p)) { try { registerFont(p, { family }); FUENTES.push(family); } catch { /* ya registrada */ } }
}
if (!FUENTES.length) FUENTES.push("sans-serif"); // fallback (puede leer peor, pero no aborta)
const TAMAÑOS = [34, 40];

// normalización de glifos → ASCII de importes (idéntica al motor t3-ocrs.js, incluido el
// retoque que borra el espacio que ocrs mete junto al separador decimal en monoespaciadas)
const normalizar = (s) => s
  .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
  .replace(/（/g, "(").replace(/）/g, ")")
  .replace(/，/g, ",").replace(/[．。]/g, ".")
  .replace(/[‐‑‒–—−]/g, "-")
  .replace(/([.,])\s+(\d)/g, "$1$2")
  .replace(/(\d)\s+([.,])/g, "$1$2");

// Render de un importe a canvas blanco con texto negro. ocrs DETECTA la línea (no es un rec
// pelado), así que reproducimos cómo luce una región marcada de verdad: aire generoso a los
// lados y arriba/abajo. Con poco margen el detector llega a partir la única línea en dos
// (lee bien los dígitos, pero rompe el orden) — un recorte holgado evita esa sobre-segmentación.
const PAD_X = 72, ALTO = 128;
const render = (txt, font) => {
  const m = createCanvas(10, 10).getContext("2d"); m.font = font;
  const w = Math.ceil(m.measureText(txt).width) + PAD_X * 2;
  const cv = createCanvas(w, ALTO), c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, w, ALTO);
  c.fillStyle = "#000"; c.font = font; c.textBaseline = "middle";
  c.fillText(txt, PAD_X, ALTO / 2);
  return cv;
};

// OCR de un canvas con ocrs (loadImage RGBA channels-last → getText), igual que el motor.
const ocrCanvas = (cv) => {
  const id = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height);
  const img = engine.loadImage(cv.width, cv.height, new Uint8Array(id.data.buffer));
  return normalizar(engine.getText(img) || "");
};

const CASOS = ["196.343.896,44", "1.234.567,89", "9.886.410,27", "65.705.541,22", "(12.345,00)"];
console.log(`Motor T3 ocrs (neuronal Rust→WASM) — leyendo importes (fuentes: ${FUENTES.join(", ")})\n`);
let fallos = 0, total = 0;
for (const txt of CASOS) {
  const esp = extraerNumero(txt);
  let okCaso = true;
  for (const fam of FUENTES) for (const sz of TAMAÑOS) {
    total++;
    const leido = ocrCanvas(render(txt, `${sz}px ${fam}`));
    const got = extraerNumero(leido);
    const ok = got != null && Math.abs(got - esp) < 0.005;
    if (!ok) { okCaso = false; fallos++; }
    console.log(`  ${ok ? "✓" : "✗"} ${txt.padEnd(16)} [${(fam + " " + sz).padEnd(14)}] leyó="${leido.replace(/\n/g, "⏎").trim()}" → ${got}  (esp ${esp})`);
  }
  console.log(`  ${okCaso ? "✓" : "✗"} ${txt}  — separadores ${okCaso ? "OK" : "MAL"}\n`);
}
console.log(fallos === 0 ? `✓ ocrs OK — ${total}/${total} lecturas correctas` : `✗ ${fallos}/${total} lecturas fallaron`);
process.exit(fallos === 0 ? 0 : 1);
