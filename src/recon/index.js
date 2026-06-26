// recon/index.js — La "nave espacial de reconocimiento": interfaz Recognizer común
// + registro de motores + router por modo/tier. Se enchufan/sacan motores sin tocar
// el resto. Arriba de lo que devuelva el motor van las 18 cifras + los 13 cruces.
//
// Contrato Recognizer:
//   { id, tier, etiqueta, modos:[...], disponible():bool, async reconocer(entrada) }
//   entrada según modo:  'region'|'canvas' → { canvas, onProgress }
//   salida normalizada:  { texto, items?, confianza:0..1, motor }
//
// Tiers (escalada: barato→artillería): 0 texto nativo · 1 OCR Tesseract local ·
// 2 vision-LLM local (tanque) · 3 nube/bulk gateada. Hoy registramos T0+T1; el resto
// se enchufa después. Qué tiers están activos lo gobierna el .env del server (los
// pesados) — acá exponemos sólo los client-side.

import { motorPaddle } from "./t2-paddleocr.js";
import { motorTesseract } from "./t1-tesseract.js";

const registro = new Map();

export function registrar(motor) { registro.set(motor.id, motor); }

// Motores habilitados para un modo, del más barato (tier bajo) al más caro. Desempate
// dentro del mismo tier: el campo `pref` (menor = preferido) y, si empata, el orden de
// registro. Así Paddle queda PRIMERO en OCR de región y Tesseract de fallback, sin
// depender de la estabilidad implícita del sort.
export function motores(modo) {
  return [...registro.values()]
    .filter((m) => m.disponible() && m.modos.includes(modo))
    .sort((a, b) => (a.tier - b.tier) || ((a.pref ?? 50) - (b.pref ?? 50)));
}

// El router elige el motor más barato disponible para el modo (o uno forzado por id).
export function elegir(modo, forzarId) {
  if (forzarId) return registro.get(forzarId) || null;
  return motores(modo)[0] || null;
}

// Reconocer con escalada: probá del más barato al más caro hasta superar el umbral
// de confianza. (Hoy con un solo motor de región devuelve ese; deja lista la escalada.)
export async function reconocer(modo, entrada, { umbral = 0.6, forzarId } = {}) {
  const cands = forzarId ? [registro.get(forzarId)].filter(Boolean) : motores(modo);
  if (!cands.length) throw new Error(`No hay motor de reconocimiento para "${modo}"`);
  let ultimo = null;
  for (const m of cands) {
    ultimo = await m.reconocer(entrada);
    ultimo.motor = m.id;
    if ((ultimo.confianza ?? 0) >= umbral) return ultimo;
  }
  return ultimo; // ninguno superó el umbral → el mejor esfuerzo (lo juzga el humano)
}

// Motores client-side de Fase 1. T0 (texto nativo) lo maneja pdf-view directamente
// sobre el doc pdf.js; acá registramos los que operan por canvas/región.
// Paddle (rec PP-OCRv5) es el PREFERIDO en OCR de región (lee bien los separadores);
// Tesseract queda de fallback en región y como único motor de página entera (canvas).
registrar(motorPaddle);
registrar(motorTesseract);

export { registro };
