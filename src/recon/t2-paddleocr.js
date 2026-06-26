// t2-paddleocr.js — Motor T2 de la nave: PaddleOCR PP-OCRv5 (mobile) por ONNX Runtime
// Web. El MEJOR leyendo dígitos y separadores (puntos de miles + coma decimal) en
// escaneados/fotos — donde Tesseract los comía o los confundía. LOCAL, navegador,
// WebGPU con fallback a WASM. Assets VENDORIZADOS en /public/vendor/paddleocr (sin CDN).
// Carga LAZY: ni el runtime ni el modelo (~41MB) entran a RAM hasta el primer OCR.
//
// Sólo RECONOCIMIENTO (rec), sin detección: en Selega el usuario YA marca un recuadro
// chico (una línea de cifras), así que le damos ese recorte directo al rec. Más liviano
// (un solo modelo) y exacto para el caso de importes. Por eso este motor es modo "region".
// Para OCR de página entera (canvas) sigue mandando Tesseract (que sí detecta líneas).

// URL absoluta con barra final (igual criterio que Tesseract: el runtime resuelve el .wasm
// relativo a wasmPaths y un path root-relativo le rompe la resolución desde el worker).
const V = (typeof location !== "undefined")
  ? new URL("/public/vendor/paddleocr/", location.origin).href
  : "/public/vendor/paddleocr/";

const MODELO = `${V}ppocrv5_mobile_rec.onnx`;
const DICT = `${V}ppocrv5_dict.txt`;

const ALTO_REC = 48;   // PP-OCR rec: entrada NCHW con alto fijo 48; ancho dinámico (múltiplo de 8)
const ANCHO_MIN = 16;

let sesionP = null;    // promesa de { sesion, charset } (singleton, lazy)
let providerUsado = "";

// Carga perezosa del runtime ONNX + modelo + diccionario. Una sola vez.
async function getSesion() {
  if (sesionP) return sesionP;
  sesionP = (async () => {
    const ort = await import(`${V}ort.webgpu.bundle.min.mjs`);
    // El runtime busca su .wasm relativo a wasmPaths (vendorizado, sin CDN).
    ort.env.wasm.wasmPaths = V;
    ort.env.wasm.numThreads = 1;       // sin SharedArrayBuffer/COOP-COEP: un hilo (estable en todo navegador)
    ort.env.logLevel = "error";

    // Diccionario CTC: índice del logit → carácter. C del modelo = largo del dict
    // (el "blank" cae en el índice 0 = espacio de ancho completo del propio dict).
    const dictTxt = await (await fetch(DICT)).text();
    const charset = dictTxt.replace(/\r/g, "").split("\n");

    // Proveedores: WebGPU si hay; si no, WASM. Si WebGPU falla al crear sesión, caemos a WASM.
    const buf = await (await fetch(MODELO)).arrayBuffer();
    const intentar = async (eps) => ort.InferenceSession.create(buf, {
      executionProviders: eps, graphOptimizationLevel: "all",
    });
    let sesion;
    const tieneGPU = typeof navigator !== "undefined" && !!navigator.gpu;
    if (tieneGPU) {
      try { sesion = await intentar(["webgpu"]); providerUsado = "webgpu"; }
      catch { sesion = await intentar(["wasm"]); providerUsado = "wasm"; }
    } else {
      sesion = await intentar(["wasm"]); providerUsado = "wasm";
    }
    return { ort, sesion, charset };
  })();
  return sesionP;
}

// Prepara el recorte para el rec: alto 48, ancho proporcional (múltiplo de 8), NCHW,
// normalizado (x/255-0.5)/0.5 sobre los 3 canales. La entrada ya viene en gris+contraste
// del preprocesado, pero igual la pasamos como RGB (el modelo espera 3 canales).
function aTensor(ort, canvas) {
  const ratio = canvas.width / Math.max(1, canvas.height);
  let W = Math.max(ANCHO_MIN, Math.ceil(Math.round(ALTO_REC * ratio) / 8) * 8);
  const tmp = (typeof OffscreenCanvas !== "undefined")
    ? new OffscreenCanvas(W, ALTO_REC)
    : Object.assign(document.createElement("canvas"), { width: W, height: ALTO_REC });
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, ALTO_REC);
  const dw = Math.min(W, Math.round(ALTO_REC * ratio));
  ctx.drawImage(canvas, 0, 0, dw, ALTO_REC);
  const px = ctx.getImageData(0, 0, W, ALTO_REC).data;
  const plano = ALTO_REC * W;
  const data = new Float32Array(3 * plano);
  for (let y = 0; y < ALTO_REC; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, o = y * W + x;
      data[o] = ((px[p] / 255) - 0.5) / 0.5;                 // R
      data[plano + o] = ((px[p + 1] / 255) - 0.5) / 0.5;     // G
      data[2 * plano + o] = ((px[p + 2] / 255) - 0.5) / 0.5; // B
    }
  }
  return new ort.Tensor("float32", data, [1, 3, ALTO_REC, W]);
}

// Decodificación CTC greedy: por cada paso temporal toma el índice de mayor logit,
// colapsa repetidos y descarta el blank (índice 0). Devuelve { texto, confianza }.
function decodificarCTC(salida, charset) {
  const [, T, C] = salida.dims;
  const d = salida.data;
  let texto = "", ultimo = -1, sumProb = 0, n = 0;
  for (let t = 0; t < T; t++) {
    let best = 0, bv = -Infinity;
    const base = t * C;
    for (let c = 0; c < C; c++) { const v = d[base + c]; if (v > bv) { bv = v; best = c; } }
    if (best !== 0 && best !== ultimo) {
      texto += charset[best] ?? "";
      // softmax aprox. de la confianza del carácter elegido (sólc sobre los dos mejores
      // sería más barato; usamos el max-logit normalizado a 0..1 vía sigmoide suave).
      sumProb += 1 / (1 + Math.exp(-bv)); n++;
    }
    ultimo = best;
  }
  const confianza = n ? sumProb / n : 0;
  return { texto, confianza };
}

// Normaliza glifos de ancho completo que el modelo (multilingüe) a veces emite por
// dígitos/puntuación ASCII (p. ej. "（" por "(", "，" por ","). Así extraerNumero ve
// paréntesis/comas/puntos normales y detecta negativos y separadores sin tropezar.
function normalizar(s) {
  return s
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(/（/g, "(").replace(/）/g, ")")
    .replace(/，/g, ",").replace(/[．。]/g, ".")
    .replace(/[‐‑‒–—−]/g, "-");
}

// OCR de un canvas/recorte. Devuelve { texto, confianza:0..1 }.
export async function ocrRegion(canvas) {
  const { ort, sesion, charset } = await getSesion();
  const tensor = aTensor(ort, canvas);
  const nombreIn = sesion.inputNames[0];   // "x"
  const nombreOut = sesion.outputNames[0]; // "fetch_name_0"
  const salida = (await sesion.run({ [nombreIn]: tensor }))[nombreOut];
  const { texto, confianza } = decodificarCTC(salida, charset);
  return { texto: normalizar(texto), confianza };
}

// ¿Disponible? El motor es client-side puro; pedimos que exista WebAssembly (cualquier
// navegador moderno) y, perezosamente, los assets. Si el import/fetch fallara en runtime,
// la nave cae al siguiente motor (Tesseract) — pero por defecto Paddle es el preferido.
const hayWasm = typeof WebAssembly !== "undefined";

export const motorPaddle = {
  id: "t2-paddleocr",
  tier: 1,                 // mismo tier OCR que Tesseract; el desempate lo da `pref`
  pref: 10,                // preferido en región (menor = primero) — gana a Tesseract (pref 20)
  etiqueta: "OCR PaddleOCR PP-OCRv5 (local)",
  modos: ["region"],       // sólo región (rec sin detección). Página entera → Tesseract.
  disponible: () => hayWasm,
  proveedor: () => providerUsado, // info: "webgpu" | "wasm" (tras el primer uso)
  async reconocer({ canvas, onProgress }) {
    onProgress?.(0.1);
    const { texto, confianza } = await ocrRegion(canvas);
    onProgress?.(1);
    return { texto, confianza, motor: "t2-paddleocr" };
  },
};
