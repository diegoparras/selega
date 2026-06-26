// extractor-client.js — Cliente Node del sidecar Python de extracción de PDFs.
//
// El sidecar (carpeta extractor/) es un microservicio FastAPI APARTE que extrae
// texto + items con posición + tablas de PDFs digitales con engines potentes
// (PyMuPDF, pdfplumber, pdfminer.six, pypdf). El PDF va al server LOCAL de Selega,
// nunca a la nube.
//
// FEATURE OPCIONAL Y OFF POR DEFECTO: si EXTRACTOR_URL no está seteada, esta función
// devuelve null (= sidecar no configurado). Quien la llame debe tratar null como
// "feature apagada" y caer al camino normal (pdf-parse / pdf.js). Así no rompe nada.
//
// Sin dependencias nuevas: usa fetch nativo (Node 18+). No se cablea en api.js acá.

// Espíritu del formato que devuelve /extract (coords normalizadas 0..1, top-left):
//   { engine, paginas: [{ n, texto, items: [{ str, x, y, w, h }] }], tablas?: [...] }

const DEFAULT_TIMEOUT_MS = 120000; // los PDFs grandes/tablas pueden tardar
const MAX_PDF_BYTES = 50 * 1024 * 1024; // espejo del tope del sidecar

const ENGINES = new Set(["pymupdf", "pdfplumber", "pdfminer", "pypdf"]);

/**
 * Extrae un PDF usando el sidecar Python, si está configurado.
 *
 * @param {Buffer|Uint8Array} pdfBuffer  Bytes del PDF.
 * @param {object} [opts]
 * @param {string}  [opts.engine="pymupdf"]  pymupdf | pdfplumber | pdfminer | pypdf
 * @param {boolean} [opts.tablas=false]      Pedir extracción de tablas (?tables=1).
 * @param {number}  [opts.timeoutMs]         Timeout del fetch.
 * @returns {Promise<object|null>}  JSON del sidecar, o null si la feature está OFF.
 * @throws  {Error}  Si el sidecar SÍ está configurado pero falla (input/red/parser).
 */
export async function extraerConSidecar(pdfBuffer, { engine = "pymupdf", tablas = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = (process.env.EXTRACTOR_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null; // feature OFF: nadie configuró el sidecar → no rompe.

  if (!ENGINES.has(engine)) {
    throw new Error(`extractor: engine inválido ${JSON.stringify(engine)} (use ${[...ENGINES].join("|")})`);
  }
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error("extractor: pdfBuffer vacío");
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    throw new Error(`extractor: PDF supera ${MAX_PDF_BYTES} bytes`);
  }

  const url = `${base}/extract?engine=${encodeURIComponent(engine)}${tablas ? "&tables=1" : ""}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: pdfBuffer,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detalle = "";
      try { detalle = (await res.json())?.detail || ""; } catch { /* no era JSON */ }
      throw new Error(`extractor: HTTP ${res.status}${detalle ? ` — ${detalle}` : ""}`);
    }
    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`extractor: timeout tras ${timeoutMs} ms`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/** Sondea /health del sidecar. Devuelve el JSON, o null si no está configurado/no responde. */
export async function sidecarDisponible(timeoutMs = 4000) {
  const base = (process.env.EXTRACTOR_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
