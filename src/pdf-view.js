// pdf-view.js — El LIENZO: render del PDF en pantalla (multipágina, zoom, rotar),
// extracción de texto NATIVO (T0, sin OCR) y marcado de REGIÓN → recorte del canvas
// → motor de la nave (OCR acotado). 100% en el navegador: el PDF no sale del cliente.
//
// Reusa el enfoque de Fulgoria: coords normalizadas 0..1 para el overlay de marcado,
// recortá el canvas a la región antes de OCR-ear (region = crop + ocrCanvas).

const PDFJS = "/public/vendor/pdfjs/pdf.min.mjs";
const WORKER = "/public/vendor/pdfjs/pdf.worker.min.mjs";

let _lib = null;
async function lib() {
  if (!_lib) {
    _lib = await import(PDFJS);
    _lib.GlobalWorkerOptions.workerSrc = WORKER;
  }
  return _lib;
}

const DPR = Math.min(globalThis.devicePixelRatio || 1, 2); // nitidez sin reventar RAM

export class PdfView {
  // host: contenedor DOM. onRegion(crop, meta) se llama al soltar un rectángulo:
  //   crop = canvas recortado a la región; meta = { pagina, rect:{x,y,w,h} en 0..1 }.
  constructor(host, { onRegion, onPagina } = {}) {
    this.host = host;
    this.onRegion = onRegion;
    this.onPagina = onPagina; // callback(n) cuando cambia la página visible (slicer)
    this.doc = null;
    this.scale = 1.2;       // zoom base (global)
    this.rotaciones = [];   // rotación POR PÁGINA (0/90/180/270), índice = nº-1
    this.bytes = null;      // bytes originales del PDF (para exportar rotado)
    this.paginas = [];      // [{ wrap, canvas, overlay, viewport, num }]
    this.marcando = true;   // modo marcado de región activo
    this._raf = null; this._pagActual = 0;
    this.host.addEventListener("scroll", () => this._trackScroll());
  }

  // Salta a una página. Scrollea SOLO el visor (no la ventana): mueve host.scrollTop por
  // el delta entre el tope de la página y el tope del visor. smooth=false para el slider.
  irAPagina(n, smooth = true) {
    const m = this.paginas[n - 1];
    if (!m) return;
    const delta = m.wrap.getBoundingClientRect().top - this.host.getBoundingClientRect().top;
    this.host.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
  }

  // Página más centrada en el viewport del visor (para resaltar en el slicer).
  _paginaVisible() {
    const cont = this.host;
    const mid = cont.getBoundingClientRect().top + cont.clientHeight / 2;
    let best = 0, bestDist = Infinity;
    for (const m of this.paginas) {
      const r = m.wrap.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestDist) { bestDist = d; best = m.num; }
    }
    return best;
  }

  _trackScroll() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      const n = this._paginaVisible();
      if (n && n !== this._pagActual) { this._pagActual = n; this.onPagina?.(n); }
    });
  }

  async cargar(arrayBuffer, onProgress) {
    const L = await lib();
    const original = new Uint8Array(arrayBuffer);
    this.bytes = original.slice();                 // copia antes de que pdf.js la detache
    this.doc = await L.getDocument({ data: original }).promise;
    this.rotaciones = new Array(this.doc.numPages).fill(0);
    await this.render(onProgress);
    return this.doc.numPages;
  }

  async render(onProgress) {
    if (!this.doc) return;
    this.host.innerHTML = "";
    this.paginas = [];
    for (let n = 1; n <= this.doc.numPages; n++) {
      const meta = await this._pagina(n);
      this.host.appendChild(meta.wrap);
      this.paginas.push(meta);
      onProgress?.(n, this.doc.numPages);          // progreso de render (página X de N)
    }
  }

  // Construye y renderiza UNA página (con su propia rotación) → meta. No la inserta.
  async _pagina(n) {
    const page = await this.doc.getPage(n);
    const rot = ((this.rotaciones[n - 1] || 0) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale: this.scale, rotation: rot });
    const wrap = document.createElement("div");
    wrap.className = "pdf-pagina";
    wrap.style.width = `${viewport.width}px`;
    wrap.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * DPR);
    canvas.height = Math.floor(viewport.height * DPR);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport, transform: DPR !== 1 ? [DPR, 0, 0, DPR, 0, 0] : null }).promise;

    const overlay = document.createElement("div");
    overlay.className = "pdf-overlay";

    const num = document.createElement("span");
    num.className = "pdf-num"; num.textContent = n;

    wrap.append(canvas, overlay, num);
    const meta = { wrap, canvas, overlay, viewport, num: n };
    this._marcado(meta);
    return meta;
  }

  // Rota UNA página `dir`×90° (dir 1=horario, -1=antihorario) y re-renderiza solo esa.
  async rotarPagina(n, dir = 1) {
    this.rotaciones[n - 1] = (((this.rotaciones[n - 1] || 0) + dir * 90) % 360 + 360) % 360;
    const meta = await this._pagina(n);
    this.paginas[n - 1].wrap.replaceWith(meta.wrap);
    this.paginas[n - 1] = meta;
  }
  // Rota la página que se está viendo (control fijo del visor).
  paginaActual() { return this._pagActual || 1; }
  rotarActual(dir = 1) { return this.rotarPagina(this.paginaActual(), dir); }
  // Rota TODO el documento `dir`×90° (escaneo entero de costado).
  async rotarTodo(dir = 1) {
    for (let i = 0; i < this.rotaciones.length; i++)
      this.rotaciones[i] = (((this.rotaciones[i] || 0) + dir * 90) % 360 + 360) % 360;
    await this.render();
  }
  // Auto-enderezar: detecta páginas con TEXTO nativo de costado y las rota. (Escaneados
  // sin texto no se detectan acá — quedan para el control manual o OSD futuro.) Devuelve nº rotadas.
  async autoEnderezar() {
    let rotadas = 0;
    for (let p = 1; p <= this.doc.numPages; p++) {
      const tc = await (await this.doc.getPage(p)).getTextContent();
      let horiz = 0, vert = 0, cw = 0, ccw = 0;
      for (const it of tc.items) {
        const [a, b, c, d] = it.transform;
        if (Math.abs(a) + Math.abs(d) >= Math.abs(b) + Math.abs(c)) horiz++;
        else { vert++; (b > 0 ? ccw++ : cw++); }
      }
      if (vert > horiz * 1.5 && vert > 5) {
        this.rotaciones[p - 1] = (((this.rotaciones[p - 1] || 0) + (cw >= ccw ? 90 : 270)) % 360 + 360) % 360;
        rotadas++;
      }
    }
    if (rotadas) await this.render();
    return rotadas;
  }

  // Exporta el PDF con las rotaciones aplicadas (PDF REAL, vector/texto intactos).
  async exportar() {
    if (!this.bytes) throw new Error("No hay PDF cargado");
    const { PDFDocument, degrees } = await import("/public/vendor/pdf-lib/pdf-lib.esm.min.js");
    const doc = await PDFDocument.load(this.bytes);
    doc.getPages().forEach((p, i) => {
      const extra = this.rotaciones[i] || 0;
      if (extra) p.setRotation(degrees(((p.getRotation().angle || 0) + extra) % 360));
    });
    return doc.save(); // Uint8Array
  }

  // Items de texto de una página con rect NORMALIZADO 0..1 (origen arriba-izq).
  async _items(n) {
    const L = await lib();
    const page = await this.doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    return tc.items.filter((it) => it.str && it.str.trim()).map((it) => {
      const m = L.Util.transform(vp.transform, it.transform); // a espacio de viewport (px)
      const h = Math.hypot(m[2], m[3]) || 10;                 // alto de fuente
      return { str: it.str, x: m[4] / vp.width, y: (m[5] - h) / vp.height,
        w: (it.width || 0) / vp.width, h: h / vp.height };
    });
  }

  // Texto NATIVO dentro de un rect 0..1 del MARCO MOSTRADO (el mismo que usa el overlay de marcado
  // y el recorte del canvas). Usa el viewport REAL con que se renderizó la página (scale + rotación,
  // incluyendo la rotación intrínseca del PDF) → imposible que la lectura se corra de fila.
  // Devuelve "" si la región no tiene texto (PDF escaneado → el llamador cae a OCR).
  async textoEnRect(n, rect) {
    if (!this.doc || !rect) return "";
    const L = await lib();
    const page = await this.doc.getPage(n);
    const rot = ((this.rotaciones[n - 1] || 0) % 360 + 360) % 360;
    const vp = page.getViewport({ scale: this.scale, rotation: rot }); // idéntico al render + overlay
    const tc = await page.getTextContent();
    const out = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const m = L.Util.transform(vp.transform, it.transform);
      const h = Math.hypot(m[2], m[3]) || 10;
      const cx = (m[4] + (it.width || 0) * vp.scale / 2) / vp.width;  // centro del glifo, normalizado
      const cy = (m[5] - h / 2) / vp.height;
      if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) out.push(it.str);
    }
    return out.join(" ");
  }

  // Texto NATIVO con posiciones por página (T0). items vacío = PDF escaneado (→ OCR).
  async textoNativoConPos() {
    if (!this.doc) return [];
    const paginas = [];
    for (let n = 1; n <= this.doc.numPages; n++) {
      const items = await this._items(n);
      // Reconstruí líneas agrupando por Y (los items vienen sin saltos de línea).
      const filas = new Map();
      for (const it of items) {
        const k = Math.round(it.y * 500);
        if (!filas.has(k)) filas.set(k, []);
        filas.get(k).push(it);
      }
      const lineas = [...filas.entries()].sort((a, b) => a[0] - b[0]) // arriba→abajo
        .map(([, its]) => its.sort((a, b) => a.x - b.x).map((i) => i.str).join(" "));
      paginas.push({ num: n, items, lineas });
    }
    return paginas;
  }

  // Texto plano por página (compat con el extractor de anclas).
  async textoNativo() {
    return (await this.textoNativoConPos()).map((p) => p.lineas.join("\n"));
  }

  // Renderiza una página a un canvas de alta resolución para OCR (rotación-aware,
  // independiente del zoom de pantalla). Se usa para "Leer todo con OCR".
  async canvasPagina(n, { escala = 2 } = {}) {
    const page = await this.doc.getPage(n);
    const rot = ((this.rotaciones[n - 1] || 0) % 360 + 360) % 360;
    const vp = page.getViewport({ scale: escala, rotation: rot });
    const cv = document.createElement("canvas");
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    return cv;
  }

  // Provenance: salta a la página y dibuja un recuadro temporal sobre la región.
  // `rect0` está en marco SIN rotar; lo transformo a la rotación actual de la página.
  resaltar(pagina, rect0) {
    const meta = this.paginas[pagina - 1];
    if (!meta) return;
    const rect = this._rotarRect(rect0, this.rotaciones[pagina - 1] || 0);
    // Scrollea solo el visor (centra la página) sin mover la ventana.
    const delta = (meta.wrap.getBoundingClientRect().top - this.host.getBoundingClientRect().top)
      - (this.host.clientHeight - meta.wrap.getBoundingClientRect().height) / 2;
    this.host.scrollBy({ top: delta, behavior: "smooth" });
    const box = document.createElement("div");
    box.className = "pdf-prov";
    this._situar(box, rect.x, rect.y, rect.w, rect.h);
    meta.overlay.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }

  // Overlay de marcado por arrastre (coords normalizadas 0..1), reusa el patrón Fulgoria.
  _marcado(meta) {
    const { overlay } = meta;
    let sel = null, x0 = 0, y0 = 0;
    const rel = (e) => {
      const r = overlay.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    overlay.addEventListener("pointerdown", (e) => {
      if (!this.marcando) return;
      e.preventDefault(); overlay.setPointerCapture(e.pointerId);
      const p = rel(e); x0 = p.x; y0 = p.y;
      sel = document.createElement("div");
      sel.className = "pdf-sel";
      overlay.appendChild(sel);
      this._situar(sel, x0, y0, 0, 0);
    });
    overlay.addEventListener("pointermove", (e) => {
      if (!sel) return;
      const p = rel(e);
      this._situar(sel, Math.min(x0, p.x), Math.min(y0, p.y), Math.abs(p.x - x0), Math.abs(p.y - y0));
    });
    overlay.addEventListener("pointerup", (e) => {
      if (!sel) return;
      const p = rel(e);
      const rect = { x: Math.min(x0, p.x), y: Math.min(y0, p.y), w: Math.abs(p.x - x0), h: Math.abs(p.y - y0) };
      sel.remove(); sel = null;
      if (rect.w < 0.01 || rect.h < 0.01) return; // click suelto, no región
      const crop = this._recortar(meta, rect); // recorta del canvas YA rotado → queda derecho
      const rot = this.rotaciones[meta.num - 1] || 0;
      const rect0 = this._rotarRect(rect, (360 - rot) % 360); // guardo en marco sin rotar
      this.onRegion?.(crop, { pagina: meta.num, rect, rect0 });
    });
  }

  _situar(el, x, y, w, h) {
    el.style.left = `${x * 100}%`; el.style.top = `${y * 100}%`;
    el.style.width = `${w * 100}%`; el.style.height = `${h * 100}%`;
  }

  // Transforma un rect normalizado del marco SIN rotar (rot 0) al marco rotado `rot`
  // (horario, igual que pdf.js). Inverso: pasar (360 - rot).
  _rotarRect(r, rot) {
    rot = ((rot % 360) + 360) % 360;
    if (rot === 90) return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
    if (rot === 180) return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h };
    if (rot === 270) return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  }

  // Recorta la región (0..1) del canvas a la resolución de render → canvas nuevo para OCR.
  _recortar(meta, rect) {
    const c = meta.canvas;
    const sx = rect.x * c.width, sy = rect.y * c.height;
    const sw = Math.max(1, rect.w * c.width), sh = Math.max(1, rect.h * c.height);
    const out = document.createElement("canvas");
    out.width = Math.round(sw); out.height = Math.round(sh);
    out.getContext("2d").drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out;
  }

  // Cambia el zoom CONSERVANDO la posición de lectura (no vuelve a la página 1).
  async setZoom(f) {
    this.scale = Math.max(0.5, Math.min(4, f));
    const cont = this.host;
    const frac = cont.scrollHeight ? cont.scrollTop / cont.scrollHeight : 0; // posición relativa
    await this.render();
    cont.scrollTop = frac * cont.scrollHeight; // misma posición tras re-render
  }
  zoomIn() { return this.setZoom(this.scale * 1.2); }
  zoomOut() { return this.setZoom(this.scale / 1.2); }
}
