// plantillas.js — Auto-reconocimiento de formatos (motor de escala, estilo Fulgoria).
// Una PLANTILLA = fingerprint del formato + regiones por cifra. El fingerprint es
// VALUE-INDEPENDENT (privacy-safe): sólo usa el vocabulario de RÓTULOS (no los números
// del cliente), así dos balances del mismo estudio/formato matchean aunque cambien los
// montos. matchScore = Jaccard del vocabulario.

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Fingerprint: conjunto ordenado de palabras-rótulo (≥4 letras, sin números) del documento.
export function fingerprint(paginas) {
  const toks = new Set();
  for (const p of paginas || []) {
    for (const it of p.items || []) {
      const limpio = norm(it.str).replace(/[\d.,$()%/:\-]/g, " ");
      for (const w of limpio.split(/\s+/)) if (w.length >= 4) toks.add(w);
    }
  }
  return [...toks].sort();
}

// Similitud de Jaccard entre dos fingerprints (0..1).
export function matchScore(a, b) {
  if (!a?.length || !b?.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// Elige la mejor plantilla para un fingerprint, si supera el umbral.
export function mejorPlantilla(fp, plantillas, umbral = 0.6) {
  let best = null, score = 0;
  for (const pl of plantillas || []) {
    const s = matchScore(fp, pl._fp || []);
    if (s > score) { score = s; best = pl; }
  }
  return score >= umbral ? { plantilla: best, score } : null;
}
