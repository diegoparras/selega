// test-paddleocr.mjs — ACEPTACIÓN del motor T2 (PaddleOCR PP-OCRv5 rec) leyendo IMPORTES.
// Renderiza importes argentinos a un canvas (varias fuentes/tamaños), corre el MISMO modelo
// y diccionario VENDORIZADOS en /public/vendor/paddleocr, y compara el número leído contra
// el esperado usando el extraerNumero REAL del core (src/core/formato.js). Éxito = lee bien
// los puntos (miles) y la coma (decimal): el número parseado coincide.
//
// Requiere onnxruntime-node + canvas (NO son deps de la app; son sólo del test). Si faltan,
// el test se SALTEA con código 0 (no rompe `npm test`). Para correrlo en serio:
//   npm i -D onnxruntime-node canvas  &&  node test/test-paddleocr.mjs
//
// Nota: en el browser el motor usa onnxruntime-WEB (WebGPU/WASM); acá usamos
// onnxruntime-node sólo para validar el modelo+dict+pipeline sin levantar navegador.
// El preprocesado y la decodificación CTC son idénticos a los del motor t2-paddleocr.js.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extraerNumero } from "../src/core/formato.js";

const aquí = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(aquí, "..", "public", "vendor", "paddleocr");
const MODELO = join(VENDOR, "ppocrv5_mobile_rec.onnx");
const DICT = join(VENDOR, "ppocrv5_dict.txt");

if (!existsSync(MODELO) || !existsSync(DICT)) {
  console.log("⚠ assets vendorizados ausentes — SALTEO (esperaba", MODELO + ")");
  process.exit(0);
}

let ort, canvasMod;
try {
  ort = (await import("onnxruntime-node")).default;
  canvasMod = await import("canvas");
} catch {
  console.log("⚠ onnxruntime-node / canvas no instalados (dev) — SALTEO. Instalá:");
  console.log("    npm i -D onnxruntime-node canvas   y volvé a correr este test.");
  process.exit(0);
}
const { createCanvas, registerFont } = canvasMod;

// Fuentes: registramos algunas de Windows si están (para que el render no caiga a un bitmap feo).
const FUENTES = [];
for (const [file, family] of [["arial.ttf", "Arial"], ["times.ttf", "Times"], ["cour.ttf", "Courier"]]) {
  const p = `C:/Windows/Fonts/${file}`;
  if (existsSync(p)) { try { registerFont(p, { family }); FUENTES.push(family); } catch { /* ya registrada */ } }
}
if (!FUENTES.length) FUENTES.push("sans-serif"); // fallback (puede leer peor, pero no aborta)
const TAMAÑOS = [30, 34];

// --- diccionario CTC (idéntico al motor): índice del logit → carácter ---
const charset = readFileSync(DICT, "utf8").replace(/\r/g, "").split("\n");
const sess = await ort.InferenceSession.create(MODELO);

const render = (txt, font) => {
  const m = createCanvas(10, 10).getContext("2d"); m.font = font;
  const w = Math.ceil(m.measureText(txt).width) + 24, h = 48;
  const cv = createCanvas(w, h), c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#000"; c.font = font; c.textBaseline = "middle";
  c.fillText(txt, 12, h / 2);
  return cv;
};
// preprocesado (upscale+gris+contraste) — versión Node del src/recon/preproceso.js
const preprocesar = (src) => {
  const H = Math.max(96, src.height * 3), factor = H / src.height;
  const dw = Math.round(src.width * factor), dh = Math.round(src.height * factor);
  const dst = createCanvas(dw, dh), ctx = dst.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, dw, dh);
  const img = ctx.getImageData(0, 0, dw, dh), px = img.data, N = dw * dh;
  const luma = new Uint8ClampedArray(N), hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) { const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0; luma[j] = g; hist[g]++; }
  const corte = Math.max(1, Math.round(N * 0.02)); let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= corte) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= corte) { hi = v; break; } }
  const rango = Math.max(1, hi - lo), lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) { const t = Math.min(1, Math.max(0, (v - lo) / rango)); lut[v] = (Math.pow(t, 0.9) * 255) | 0; }
  for (let i = 0, j = 0; i < px.length; i += 4, j++) { const g = lut[luma[j]]; px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255; }
  ctx.putImageData(img, 0, 0); return dst;
};
const aTensor = (cv) => {
  const ratio = cv.width / cv.height; const W = Math.max(16, Math.ceil(Math.round(48 * ratio) / 8) * 8);
  const t = createCanvas(W, 48), c = t.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, W, 48);
  const dw = Math.min(W, Math.round(48 * ratio)); c.drawImage(cv, 0, 0, dw, 48);
  const px = c.getImageData(0, 0, W, 48).data, plano = 48 * W, data = new Float32Array(3 * plano);
  for (let y = 0; y < 48; y++) for (let x = 0; x < W; x++) { const p = (y * W + x) * 4, o = y * W + x;
    data[o] = ((px[p] / 255) - 0.5) / 0.5; data[plano + o] = ((px[p + 1] / 255) - 0.5) / 0.5; data[2 * plano + o] = ((px[p + 2] / 255) - 0.5) / 0.5; }
  return new ort.Tensor("float32", data, [1, 3, 48, W]);
};
const decodificar = (o) => { const [, T, C] = o.dims, d = o.data; let s = "", last = -1;
  for (let t = 0; t < T; t++) { let b = 0, bv = -Infinity, base = t * C; for (let c = 0; c < C; c++) { const v = d[base + c]; if (v > bv) { bv = v; b = c; } } if (b !== 0 && b !== last) s += charset[b] ?? ""; last = b; } return s; };
const normalizar = (s) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",").replace(/[．。]/g, ".").replace(/[‐‑‒–—−]/g, "-");

const CASOS = ["196.343.896,44", "1.234.567,89", "9.886.410,27", "65.705.541,22", "(12.345,00)"];
console.log(`Motor T2 PaddleOCR — leyendo importes (fuentes: ${FUENTES.join(", ")})\n`);
let fallos = 0, total = 0;
for (const txt of CASOS) {
  const esp = extraerNumero(txt);
  let okCaso = true;
  for (const fam of FUENTES) for (const sz of TAMAÑOS) {
    total++;
    const out = await sess.run({ [sess.inputNames[0]]: aTensor(preprocesar(render(txt, `${sz}px ${fam}`))) });
    const leido = normalizar(decodificar(out[sess.outputNames[0]]));
    const got = extraerNumero(leido);
    const ok = got != null && Math.abs(got - esp) < 0.005;
    if (!ok) { okCaso = false; fallos++; }
    console.log(`  ${ok ? "✓" : "✗"} ${txt.padEnd(16)} [${(fam + " " + sz).padEnd(14)}] leyó="${leido}" → ${got}  (esp ${esp})`);
  }
  console.log(`  ${okCaso ? "✓" : "✗"} ${txt}  — separadores ${okCaso ? "OK" : "MAL"}\n`);
}
console.log(fallos === 0 ? `✓ PaddleOCR OK — ${total}/${total} lecturas correctas` : `✗ ${fallos}/${total} lecturas fallaron`);
process.exit(fallos === 0 ? 0 : 1);
