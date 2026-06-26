// preproceso.js — Preprocesado del recorte ANTES del OCR. Los separadores de miles/
// decimal son chiquitos; en escaneados/fotos quedan borrosos y el OCR los come o los
// confunde. Subir resolución + pasar a gris + estirar contraste los vuelve nítidos.
// Beneficia a CUALQUIER motor (Paddle y Tesseract). Sólo se aplica en el camino de
// OCR de IMAGEN: el texto nativo del PDF no pasa por acá.
//
// Pipeline: upscale ~3× (suave) → escala de grises (luma) → estiramiento de contraste
// (autocontraste por percentiles, robusto a fondos grises del escaneo). NO binariza a
// blanco/negro duro: Paddle anda mejor con gris continuo; un umbral agresivo borra los
// puntitos. Devuelve un canvas nuevo (no toca el original / la provenance).

// Hace un <canvas> (o usa OffscreenCanvas si está) del tamaño pedido.
function lienzo(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// Escala mínima de la altura: si el recorte es muy chico, lo llevamos al menos a ~96px
// de alto (donde el detalle de los separadores sobrevive). Factor tope para no inflar RAM.
const ALTO_OBJETIVO = 96;   // alto mínimo deseado tras el upscale
const FACTOR_BASE = 3;      // upscale nominal
const FACTOR_MAX = 6;       // tope duro

/**
 * Preprocesa un canvas para OCR de importes. Idempotente y puro (no muta la entrada).
 * @param {HTMLCanvasElement|OffscreenCanvas} src  recorte de la región
 * @returns {HTMLCanvasElement|OffscreenCanvas} canvas preprocesado (gris+contraste, upscaled)
 */
export function preprocesarParaOCR(src) {
  const sw = src.width | 0, sh = src.height | 0;
  if (!sw || !sh) return src; // nada que hacer
  // Factor: el base, pero subiendo si el recorte es bajito (para llegar al alto objetivo), con tope.
  let factor = Math.max(FACTOR_BASE, Math.ceil(ALTO_OBJETIVO / sh));
  factor = Math.min(FACTOR_MAX, factor);
  const dw = Math.max(1, Math.round(sw * factor));
  const dh = Math.max(1, Math.round(sh * factor));

  const dst = lienzo(dw, dh);
  const ctx = dst.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;        // upscale suave (bilineal): no “pixela” los bordes
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, dw, dh);

  // Gris (luma BT.601) + autocontraste por percentiles (descarta 2% de colas → robusto a
  // manchas/sombras del escaneo). Mapea [p2..p98] a [0..255] linealmente.
  const img = ctx.getImageData(0, 0, dw, dh);
  const px = img.data;
  const N = dw * dh;
  const luma = new Uint8ClampedArray(N);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    luma[j] = g; hist[g]++;
  }
  // percentiles
  const corte = Math.max(1, Math.round(N * 0.02));
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= corte) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= corte) { hi = v; break; } }
  const rango = Math.max(1, hi - lo);
  // LUT de estiramiento (gamma suave 0.9 → realza un poco los grises medios sin quemar)
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) / rango));
    lut[v] = (Math.pow(t, 0.9) * 255) | 0;
  }
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = lut[luma[j]];
    px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return dst;
}
