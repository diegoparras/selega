// t3-ocrs.js — Motor T3 de la nave: ocrs (motor OCR NEURONAL en Rust→WASM, MIT).
// Pipeline ML completo (detección + reconocimiento) entrenado en PyTorch y exportado a
// rten; corre 100% LOCAL en el navegador por WebAssembly+SIMD128. A diferencia de Paddle
// (sólo rec) y Tesseract, ocrs DETECTA líneas además de reconocerlas, así que sirve tanto
// para una REGIÓN marcada como para un CANVAS de página entera. Es la opción robusta cuando
// el recorte trae varias líneas, texto torcido o fondo sucio donde el rec pelado patina.
//
// Assets VENDORIZADOS en /public/vendor/ocrs (sin CDN en runtime):
//   ocrs.js + ocrs_bg.wasm  (binding wasm-bindgen, build `--target web`)
//   text-detection.rten     (~2.4 MB, segmentación texto/no-texto)
//   text-recognition.rten   (~9.3 MB, CRNN línea→caracteres)
// Carga LAZY: ni el wasm ni los modelos (~12 MB juntos) entran a RAM hasta el primer OCR.
//
// pref 15: entre Paddle (10, el más fino para una línea de cifras) y Tesseract (20). En
// región, Paddle sigue primero; ocrs es el escalón intermedio antes del fallback clásico.

// URL absoluta con barra final (mismo criterio que Paddle/Tesseract: el binding resuelve
// el .wasm relativo a su propia URL y un path root-relativo rompe la resolución).
const V = (typeof location !== "undefined")
  ? new URL("/public/vendor/ocrs/", location.origin).href
  : "/public/vendor/ocrs/";

const WASM = `${V}ocrs_bg.wasm`;
const MODELO_DET = `${V}text-detection.rten`;
const MODELO_REC = `${V}text-recognition.rten`;

let motorP = null; // promesa del { OcrEngine } listo (singleton, lazy)

// Carga perezosa del binding wasm-bindgen + ambos modelos .rten. Una sola vez.
async function getMotor() {
  if (motorP) return motorP;
  motorP = (async () => {
    const mod = await import(`${V}ocrs.js`);
    const initWasm = mod.default;            // __wbg_init(module_or_path?)
    const { OcrEngine, OcrEngineInit } = mod;

    // Instanciar el wasm (le pasamos la URL explícita del .wasm vendorizado) + bajar los
    // dos modelos en paralelo. setDetectionModel/setRecognitionModel esperan Uint8Array.
    const [, detBuf, recBuf] = await Promise.all([
      initWasm(WASM),
      fetch(MODELO_DET).then((r) => r.arrayBuffer()),
      fetch(MODELO_REC).then((r) => r.arrayBuffer()),
    ]);

    const init = new OcrEngineInit();
    init.setDetectionModel(new Uint8Array(detBuf));
    init.setRecognitionModel(new Uint8Array(recBuf));
    return { engine: new OcrEngine(init) };
  })();
  return motorP;
}

// Vuelca un canvas/recorte a píxeles RGBA crudos (channels-last), el formato que pide
// OcrEngine.loadImage (infiere RGB/RGBA por el largo del array → le damos los 4 canales
// directos del ImageData, sin recortar el alfa).
function aImageData(canvas) {
  const w = canvas.width | 0, h = canvas.height | 0;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, w, h);
  return { w, h, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

// Normaliza glifos de ancho completo / variantes Unicode a los ASCII que mira extraerNumero
// para los IMPORTES: dígitos, punto/coma (separadores), guion (negativo) y paréntesis
// (negativo contable). Mismo criterio que el motor Paddle, más un retoque propio de ocrs:
// en fuentes monoespaciadas el modelo a veces mete un ESPACIO pegado al separador decimal
// (p.ej. "9.886.410, 27"); como extraerNumero corta por espacios para no fusionar columnas,
// ese espacio rompería el número → lo borramos cuando está entre un separador y los dígitos.
function normalizar(s) {
  return s
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(/（/g, "(").replace(/）/g, ")")
    .replace(/，/g, ",").replace(/[．。]/g, ".")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/([.,])\s+(\d)/g, "$1$2")   // "410, 27" → "410,27"
    .replace(/(\d)\s+([.,])/g, "$1$2");  // "410 ,27" → "410,27"
}

// OCR de un canvas (región marcada o página). Devuelve { texto, confianza:0..1 }.
// ocrs no expone una confianza por carácter en su API JS; reportamos una confianza
// heurística: 0.85 si leyó algo, 0 si vino vacío (la nave igual cruza con extraerNumero).
export async function ocrCanvas(canvas, onProgress) {
  const { engine } = await getMotor();
  onProgress?.(0.3);
  const { w, h, data } = aImageData(canvas);
  const img = engine.loadImage(w, h, data);   // RGBA crudo, channels-last
  onProgress?.(0.6);
  const texto = engine.getText(img);          // detección + reconocimiento, texto en orden de lectura
  onProgress?.(1);
  const limpio = normalizar(texto || "");
  return { texto: limpio, confianza: limpio.trim() ? 0.85 : 0 };
}

// ¿Disponible? Motor client-side puro: pedimos WebAssembly (cualquier navegador moderno).
// Los assets se bajan perezosamente; si import/fetch fallara en runtime, la nave cae al
// siguiente motor del modo (en región Paddle ya fue primero; en canvas, Tesseract).
const hayWasm = typeof WebAssembly !== "undefined";

export const motorOcrs = {
  id: "t3-ocrs",
  tier: 1,                 // mismo tier OCR que Paddle/Tesseract; el desempate lo da `pref`
  pref: 15,                // entre Paddle (10) y Tesseract (20)
  etiqueta: "OCR ocrs neuronal (local)",
  modos: ["region", "canvas"], // detecta líneas: sirve para región y página entera
  dispositivo: "navegador",
  cuando: "recortes con varias líneas o texto torcido/sucio donde el rec pelado patina",
  peso: "~12 MB",          // wasm ~2 MB + detección ~2.4 MB + reconocimiento ~9.3 MB (lazy)
  disponible: () => hayWasm,
  async reconocer({ canvas, onProgress }) {
    const { texto, confianza } = await ocrCanvas(canvas, onProgress);
    return { texto, confianza, motor: "t3-ocrs" };
  },
};
