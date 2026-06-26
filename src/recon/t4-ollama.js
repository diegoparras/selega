// t4-ollama.js — Motor T4 de la nave: VLM-OCR LOCAL EN EL SERVER vía Ollama. A diferencia
// de los motores client-side (Paddle/Tesseract/ocrs/TrOCR), este NO corre en el navegador:
// el recorte se manda al server (proxy /api/llm), que rutea al modelo de visión local (Ollama)
// o a la nube gateada según la política del superadmin. Es la "artillería" para casos difíciles
// o formatos raros: lee lo que el OCR clásico no puede, sin que el balance salga del server local.
//
// El recorte se convierte a dataURL y va por /api/llm con un prompt acotado a OCR de UN número.
// Ese proxy ya existe (lo usa "Leer con IA"): guarda la key server-side, valida límite y audita.
// La privacidad la decide el routing del superadmin (local-first / solo-local / etc.).
//
// `disponible()`: true SOLO si la IA está disponible. Lo sabemos con un flag YA expuesto por
// /api/me (`ia_disponible`), que cacheamos vía setIaDisponible() (lo fija app.js al cargar /me).
// Sin ese flag (o false) el motor NO se ofrece → no se intenta un POST que daría 403.

let _iaDisponible = false; // cache del flag ia_disponible de /api/me (lo fija app.js)

// app.js lo llama tras leer /api/auth/me: así disponible() refleja el estado real sin pedir red.
export function setIaDisponible(v) { _iaDisponible = !!v; }

// Convierte un canvas/recorte a dataURL PNG (same-origin, no sale del navegador hasta el POST
// al PROPIO server). OffscreenCanvas no tiene toDataURL → camino sólo para <canvas> del DOM,
// que es lo que entra acá (el recorte de región ya viene como canvas regular).
function canvasADataURL(canvas) {
  if (canvas && typeof canvas.toDataURL === "function") return canvas.toDataURL("image/png");
  throw new Error("canvas sin toDataURL (no se puede serializar para el VLM)");
}

const SYSTEM = "Sos un OCR de importes contables argentinos. En la imagen hay UN número. " +
  "Devolvé SOLO ese número, EXACTAMENTE como aparece, con sus puntos de miles y su coma decimal " +
  "(ej: 1.234.567,89), y el signo o paréntesis si es negativo. Sin texto, sin explicación, sin comillas.";

// OCR de un recorte vía el VLM del server. Devuelve { texto, confianza:0..1 }.
async function ocr(canvas, onProgress) {
  onProgress?.(0.1);
  const img = canvasADataURL(canvas);
  onProgress?.(0.25);
  const r = await fetch("/api/llm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: SYSTEM, user: "Leé el número de esta imagen.", images: [img] }),
  });
  onProgress?.(0.9);
  if (!r.ok) throw new Error(`VLM server ${r.status}`);
  const d = await r.json();
  const crudo = (d.content ?? "").toString();
  // El modelo a veces envuelve en JSON o agrega texto; nos quedamos con el primer "número-ish".
  const texto = crudo.trim();
  onProgress?.(1);
  // Confianza fija moderada (el VLM no expone una calibrada por token); el humano valida.
  return { texto, confianza: texto ? 0.7 : 0 };
}

export const motorOllama = {
  id: "t4-ollama",
  tier: 2,                 // tanque: VLM (server), por encima del OCR clásico (tier 1)
  pref: 25,                // por debajo de ocrs/Paddle; sólo cuando se elige a propósito
  etiqueta: "VLM-OCR servidor (Ollama)",
  modos: ["region", "canvas"],
  dispositivo: "server",
  cuando: "casos difíciles/raros; usa el VLM local",
  peso: "server ~5 GB",    // pesos del modelo de visión en el server (no baja al navegador)
  // Disponible sólo si la IA está prendida (cap_vlm_local o nube, vía ia_disponible de /api/me).
  disponible: () => _iaDisponible,
  async reconocer({ canvas, onProgress }) {
    const { texto, confianza } = await ocr(canvas, onProgress);
    return { texto, confianza, motor: "t4-ollama" };
  },
};
