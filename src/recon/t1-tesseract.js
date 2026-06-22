// t1-tesseract.js — Motor T1 de la nave: OCR clásico Tesseract.js (LOCAL, navegador).
// Ideal para OCR de una REGIÓN marcada (un recuadro chico) sobre un escaneado.
// Worker singleton, carga lazy: el .wasm/.traineddata recién entra a RAM al primer uso.
// Assets vendorizados en /public/vendor/tesseract (no sale nada a internet).

// URL ABSOLUTA (con origin) y barra final: el worker de Tesseract corre desde un blob
// y un path root-relativo (/public/...) le rompe el importScripts interno.
const V = (typeof location !== "undefined")
  ? new URL("/public/vendor/tesseract/", location.origin).href
  : "/public/vendor/tesseract/";
let workerP = null;  // promesa del worker (singleton)
let onProg = null;   // callback de progreso ACTUAL (mutable: el worker es único, su
                     // logger se fija una vez → lo despachamos al callback de cada llamada).

async function getWorker() {
  if (workerP) return workerP;
  workerP = (async () => {
    const Tesseract = await import(`${V}tesseract.esm.min.js`);
    const T = Tesseract.default || Tesseract;
    return T.createWorker("spa", 1, {
      workerPath: `${V}worker.min.js`,
      corePath: V,
      langPath: V,
      logger: (m) => { if (m.status === "recognizing text") onProg?.(m.progress); },
    });
  })();
  return workerP;
}

// OCR de un canvas (o región ya recortada a canvas). Devuelve texto + confianza 0..1.
// onProgress(0..1) se llama durante el reconocimiento (para barra de progreso).
export async function ocrCanvas(canvas, onProgress) {
  const worker = await getWorker();
  onProg = onProgress || null;
  try {
    const { data } = await worker.recognize(canvas);
    return { texto: data.text || "", confianza: (data.confidence ?? 0) / 100 };
  } finally {
    onProg = null;
  }
}

// El motor en formato Recognizer (lo registra la nave).
export const motorTesseract = {
  id: "t1-tesseract",
  tier: 1,
  etiqueta: "OCR Tesseract (local)",
  modos: ["region", "canvas"],
  disponible: () => true, // client-side siempre; el .env del server gobierna los tiers pesados
  async reconocer({ canvas, onProgress }) {
    const { texto, confianza } = await ocrCanvas(canvas, onProgress);
    return { texto, confianza, motor: "t1-tesseract" };
  },
};
