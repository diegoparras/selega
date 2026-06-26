// t5-vlm-browser.js — Motor T5 de la nave: VLM-OCR que corre 100% EN EL NAVEGADOR vía
// transformers.js (@huggingface/transformers) con WebGPU. Opción de MÁXIMA CALIDAD para
// escaneados/fotos y tablas, como artillería pesada por encima de Paddle/Tesseract.
//
// La LIBRERÍA está VENDORIZADA en /public/vendor/transformers (sin CDN para el código):
//   - transformers.web.js                     (la lib, ~1.1 MB)
//   - ort-wasm-simd-threaded.jsep.{mjs,wasm}  (runtime ONNX WebGPU, ~26 MB el .wasm)
//   - ort-wasm-simd-threaded.asyncify.{mjs,wasm} (fallback proxy/no-jsep)
// Fijamos env.backends.onnx.wasm.wasmPaths a esa carpeta → el runtime NUNCA va al CDN.
//
// El MODELO (pesos) es lo único que puede bajar LAZY (al primer OCR) y quedar cacheado
// por el navegador (Cache API "transformers-cache"). Es peso de modelo, no dato del
// usuario: el PDF/recorte NUNCA sale del navegador (sólo se descargan los pesos del modelo).
//
// ───────────────────────── HONESTIDAD SOBRE VIABILIDAD ──────────────────────────────
// 1) GOT-OCR2 (stepfun-ai/GOT-OCR-2.0): NO es viable en browser hoy. transformers.js v4
//    NO implementa la arquitectura `got_ocr` y NO existe export ONNX (onnx-community no lo
//    tiene; el repo oficial es PyTorch/safetensors). Descartado.
// 2) Modelos que SÍ soporta transformers.js y leen números impresos:
//      · TrOCR  (Xenova/trocr-base-printed / -small-printed) — task image-to-text.
//        Entrenado en recortes de UNA línea → ideal para el modo "region" de Selega
//        (el usuario marca un recuadro chico de cifras). NO hace layout/página entera.
//      · Donut  (Xenova/donut-base-finetuned-cord-v2) — OCR-free de documentos, bueno en
//        recibos/tablas, pero emite tokens estructurados (no un importe pelado) y pesa más.
//    Elegimos TrOCR-printed como modelo del motor: encaja con "region" y lee dígitos.
// 3) RIESGO DE RED / CSP: la app sirve con CSP `connect-src 'self'` (server/index.js, que
//    NO tocamos). Con esa CSP el navegador BLOQUEA la descarga de pesos desde huggingface.co.
//    Por eso este motor es VIABLE EN VIVO sólo si se cumple UNA de estas dos cosas:
//      (a) el operador sirve el modelo LOCALMENTE bajo /public/vendor/transformers/models/
//          (env.localModelPath, allowLocalModels=true) → todo same-origin, sin tocar CSP, o
//      (b) el operador agrega huggingface.co a connect-src en el server (decisión de infra).
//    `disponible()` es CONSERVADOR: devuelve true sólo si hay WebGPU Y hay una fuente de
//    modelo plausible (local servido, o remoto habilitado). Si no, NO se ofrece (no rompe).

// Carpeta vendor de la librería (URL absoluta con barra final, igual criterio que Paddle:
// el runtime resuelve su .wasm relativo a wasmPaths y un path root-relativo lo rompe).
const V = (typeof location !== "undefined")
  ? new URL("/public/vendor/transformers/", location.origin).href
  : "/public/vendor/transformers/";

// Modelo y task. TrOCR-printed: image-to-text, recortes de una línea. (small = ~63 MB q8,
// base = más grande pero más preciso; usamos base por calidad, que es el norte de este tier.)
const MODELO_ID = "Xenova/trocr-base-printed";
const TASK = "image-to-text";

// ── Flags de operador (decisiones de infra; por defecto OFF para no ofrecer algo roto) ──
// ¿Servimos el modelo localmente bajo el vendor? Si copiás el repo del modelo a
// /public/vendor/transformers/models/Xenova/trocr-base-printed/ y ponés esto en true,
// el motor anda 100% same-origin (no necesita tocar la CSP del server). Por defecto false:
// no asumimos que el operador vendorizó los pesos.
const MODELO_LOCAL = false;
// ¿La CSP/infra permite bajar pesos de HuggingFace? La app sirve con `connect-src 'self'`,
// así que por defecto FALSE: no ofrecemos un motor que fallaría contra esa CSP. El operador
// lo prende (junto con abrir la CSP a huggingface.co) para habilitar la bajada remota lazy.
const PERMITIR_REMOTO = false;

let pipeP = null;     // promesa del pipeline (singleton, lazy)
let dispositivoUsado = "";

// Configura el entorno de transformers.js para que NO use CDN para el código/runtime.
function configurarEnv(env) {
  // El runtime ONNX-web busca su .wasm relativo a wasmPaths → vendorizado, sin jsDelivr.
  env.backends.onnx.wasm.wasmPaths = V;
  env.backends.onnx.wasm.numThreads = 1; // sin SharedArrayBuffer/COOP-COEP: un hilo, estable.
  if (MODELO_LOCAL) {
    // Modelo servido por NOSOTROS (same-origin, respeta connect-src 'self').
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = `${V}models/`;
  } else {
    // Modelo baja LAZY desde el hub de HuggingFace (requiere que la CSP permita
    // connect-src huggingface.co — decisión de infra; sin eso, el primer OCR falla y la
    // nave cae al motor anterior). Cacheado por el navegador tras la primera bajada.
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
  }
}

// Carga perezosa de la librería + pipeline. Una sola vez. Elige WebGPU; si no, cae a WASM.
async function getPipeline(onProgress) {
  if (pipeP) return pipeP;
  pipeP = (async () => {
    const tjs = await import(`${V}transformers.web.js`);
    configurarEnv(tjs.env);
    const prog = (x) => {
      // transformers.js reporta progreso de descarga de pesos { status, progress(0..100) }.
      if (x && typeof x.progress === "number") onProgress?.(Math.min(0.95, x.progress / 100));
    };
    const tieneGPU = typeof navigator !== "undefined" && !!navigator.gpu;
    try {
      const pl = await tjs.pipeline(TASK, MODELO_ID, { device: "webgpu", progress_callback: prog });
      dispositivoUsado = "webgpu";
      return pl;
    } catch (e) {
      // Si WebGPU falla al crear (sin adapter, OOM, etc.) probamos WASM antes de rendirnos.
      if (!tieneGPU) throw e;
      const pl = await tjs.pipeline(TASK, MODELO_ID, { device: "wasm", progress_callback: prog });
      dispositivoUsado = "wasm";
      return pl;
    }
  })();
  return pipeP;
}

// Normaliza glifos de ancho completo a ASCII (mismo criterio que Paddle): así extraerNumero
// ve paréntesis/comas/puntos/guiones normales y detecta negativos y separadores sin tropezar.
function normalizar(s) {
  return (s || "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .replace(/（/g, "(").replace(/）/g, ")")
    .replace(/，/g, ",").replace(/[．。]/g, ".")
    .replace(/[‐‑‒–—−]/g, "-")
    .trim();
}

// El pipeline image-to-text de transformers.js acepta una URL/Blob/imagen; le pasamos un
// data URL del canvas (same-origin, no sale nada). Devuelve [{ generated_text }].
function canvasADataURL(canvas) {
  if (typeof canvas.toDataURL === "function") return canvas.toDataURL("image/png");
  // OffscreenCanvas: convertToBlob → data URL (raro en este camino, pero por las dudas).
  return canvas; // el pipeline también acepta el objeto imagen directamente
}

// OCR de un canvas/recorte. Devuelve { texto, confianza:0..1 }.
async function ocr(canvas, onProgress) {
  const pl = await getPipeline(onProgress);
  onProgress?.(0.96);
  const entrada = canvasADataURL(canvas);
  const salida = await pl(entrada);
  onProgress?.(1);
  const crudo = Array.isArray(salida) ? (salida[0]?.generated_text ?? "") : (salida?.generated_text ?? "");
  // TrOCR no expone una confianza calibrada por token acá; damos una confianza moderada
  // fija (no 1) para que la escalada del router la trate como "mejor esfuerzo del tanque"
  // y el humano valide. Si quedara vacío, confianza 0.
  const texto = normalizar(crudo);
  return { texto, confianza: texto ? 0.75 : 0 };
}

// ── Disponibilidad: CONSERVADORA. No ofrecemos algo roto. ────────────────────────────
// Requisitos duros: WebAssembly + WebGPU (este tier sólo tiene sentido con GPU; en WASM
// puro TrOCR-base es lentísimo). Y una fuente de modelo plausible: local servido, o remoto
// habilitado por el operador. navigator.gpu es síncrono (true si la API existe); la prueba
// real de adapter ocurre lazy en getPipeline (y si falla, la nave cae al motor anterior).
function hayFuenteModelo() {
  return MODELO_LOCAL || PERMITIR_REMOTO;
}

const hayWasm = typeof WebAssembly !== "undefined";
const hayWebGPU = typeof navigator !== "undefined" && !!navigator.gpu;

export const motorVLM = {
  id: "t5-vlm",
  tier: 2,                 // tanque: vision/VLM local, por encima del OCR clásico (tier 1)
  pref: 30,
  etiqueta: "VLM-OCR navegador (TrOCR, WebGPU)",
  modos: ["region", "canvas"],
  dispositivo: "navegador",
  cuando: "Escaneados/tablas difíciles donde Paddle/Tesseract fallan (máxima calidad, GPU).",
  peso: "~26 MB runtime (vendorizado) + pesos del modelo TrOCR-base (~lazy desde HF, cacheado)",
  // Sólo disponible con WebGPU Y una fuente de modelo válida. Si no, NO se ofrece (no rompe).
  disponible: () => hayWasm && hayWebGPU && hayFuenteModelo(),
  dispositivoUsado: () => dispositivoUsado, // info: "webgpu" | "wasm" (tras el primer uso)
  async reconocer({ canvas, onProgress }) {
    onProgress?.(0.02);
    const { texto, confianza } = await ocr(canvas, onProgress);
    return { texto, confianza, motor: "t5-vlm" };
  },
};
