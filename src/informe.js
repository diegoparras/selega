// informe.js — Generador de INFORME PDF DESCARGABLE (documento vectorial, no print de la web).
// Toma un trabajo `t` + pack + formato + veredicto ya computado y dibuja un documento A4 limpio
// con pdf-lib (vendorizada en /public/vendor, SIN CDN), y dispara la descarga del archivo .pdf.
// No duplica el motor: reusa computarVeredicto/cargarPack/formatear. No usa window.print() ni el DOM.
import { computarVeredicto, ESTADO_LABEL } from "./core/veredicto.js";
import { CAMPOS } from "./core/schema.js";
import { cargarPack } from "./rules/loader.js";
import { cargarFormato, formatear } from "./core/formato.js";

// pdf-lib ya está vendorizada y servida (la usa también pdf-view.js para rotar páginas).
// Carga perezosa: solo se baja cuando el usuario exporta (no penaliza el arranque de la app).
const PDFLIB = "/public/vendor/pdf-lib/pdf-lib.esm.min.js";

const fechaLarga = (s) => s ? new Date(s).toLocaleString("es-AR", {
  day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "—";

// Estado del cruce → texto (sin emojis: "OK"/"Difiere"/"N/A"/"Falta dato").
const CRUCE_TXT = { OK: "OK", DIFIERE: "Difiere", "N/A": "N/A", FALTA_DATO: "Falta dato" };

// ---- Paleta (tinta sobre papel; los MISMOS colores del documento web, sin glow) ----
const BORDO = [0xa8, 0x32, 0x4a];
const TINTA = [0x16, 0x16, 0x1a];   // texto principal
const GRIS = [0x70, 0x70, 0x7b];    // etiquetas / secundario
const GRIS2 = [0x3c, 0x3c, 0x44];   // texto medio
const LINEA = [0xe4, 0xe4, 0xea];   // líneas finas
const LINEA2 = [0xc9, 0xc9, 0xd0];  // líneas de cabecera de tabla
const PAPEL_CAJA = [0xfa, 0xfa, 0xfb];
// Color por veredicto: borde, fondo y tinta del título de la caja de desenlace + estados.
const SEM = {
  verde: { borde: [0x1a, 0x7f, 0x37], fondo: [0xf1, 0xf8, 0xf3], txt: [0x14, 0x6c, 0x2e] },
  amarillo: { borde: [0x9a, 0x67, 0x00], fondo: [0xfb, 0xf7, 0xec], txt: [0x8a, 0x5b, 0x00] },
  rojo: { borde: [0xcf, 0x22, 0x2e], fondo: [0xfc, 0xf1, 0xf1], txt: [0xb5, 0x1b, 0x26] },
};
const EST_COLOR = {
  OK: [0x14, 0x6c, 0x2e], DIFIERE: [0xb5, 0x1b, 0x26],
  "N/A": GRIS, FALTA_DATO: [0x8a, 0x5b, 0x00],
};

// Sanitiza el comitente para el nombre de archivo: ascii, guiones, sin barras ni espacios raros.
function sanitizarNombre(s) {
  const base = String(s || "informe")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")      // saca acentos
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") // a guiones, sin bordes
    .toLowerCase().slice(0, 60);
  return base || "informe";
}

// Resuelve pack + formato + veredicto si no vienen dados (modo "desde la bandeja/expediente").
// opts: { registro?, pack?, formato?, veredicto? } — el control le pasa todo ya hecho (eficiente).
async function resolver(t, opts) {
  let pack = opts.pack;
  if (!pack) {
    pack = { cruces: [], secciones: [], campos: CAMPOS };
    const jurDef = (opts.registro || []).find((j) => j.id === t.jurisdiccion);
    try { if (jurDef) pack = await cargarPack(jurDef); } catch { /* sin pack: documento igual */ }
  }
  const formato = opts.formato || cargarFormato();
  const v = opts.veredicto || computarVeredicto(t.cifras || {}, t.controles || {}, pack);
  const jurDef = (opts.registro || []).find((j) => j.id === t.jurisdiccion);
  const jurLabel = jurDef ? `${jurDef.provincia} — ${jurDef.consejo}`
    : (pack.nombre || t.jurisdiccion || "—");
  return { pack, formato, v, jurDef, jurLabel };
}

// Construye el modelo de datos del informe (lo MISMO que se imprimía, sin tocar el motor).
function modelo(t, { pack, formato, v, jurDef, jurLabel }) {
  const fmt = (n) => formatear(n, formato);
  const estado = t.estado || "en_curso";
  const campos = (pack.campos && pack.campos.length) ? pack.campos : CAMPOS;

  const cifras = campos.map((c) => {
    const val = (t.cifras || {})[c.id];
    const shown = val == null ? "—"
      : c.tipo === "monto" ? fmt(val)
      : c.tipo === "bool" ? (val ? "Sí" : "No")
      : String(val);
    return {
      label: c.label, estado: c.estado || "",
      valor: shown, num: c.tipo === "monto" && val != null, vacio: val == null,
    };
  });

  const cruces = v.res.map((r) => ({
    nombre: r.nombre, estado: r.estado, etiqueta: CRUCE_TXT[r.estado] || r.estado,
    dif: (r.estado === "DIFIERE" && r.diferencia != null) ? `$ ${fmt(r.diferencia)}` : "—",
  }));

  const obs = [];
  for (const sec of pack.secciones || [])
    for (const ctrl of sec.controles || []) {
      const st = (t.controles || {})[ctrl.id];
      if (st === "obs" || st === "na")
        obs.push({ st, etiqueta: st === "obs" ? "Observado" : "N/A", texto: ctrl.texto, cons: ctrl.consecuencia });
    }

  return {
    comitente: t.comitente || "(sin comitente)",
    cuit: t.cuit || "—",
    jurLabel,
    consejo: jurDef && jurDef.consejo ? jurDef.consejo : "",
    meta: [
      ["Jurisdicción", jurLabel],
      ["Agente", t.usuario || "—"],
      ["Versión de reglas", t.pack_version || "—"],
      ["Estado", ESTADO_LABEL[estado] || estado],
      ["Creación", fechaLarga(t.creado)],
      ["Modificación", fechaLarga(t.modificado)],
    ],
    color: v.color, etiqueta: v.etiqueta,
    motivos: (v.desenlace.motivos || []),
    resumen: v.resumen,
    cruces, cifras, obs,
  };
}

// ---------------------------------------------------------------------------
// Dibujo del PDF con pdf-lib. Fuentes estándar (Helvetica) → PDF vectorial,
// liviano (no embebe fuentes) y legible en cualquier visor. Cifras en Courier
// (monoespaciada, tabular) para alinear montos. WinAnsi cubre es-AR (áéíóúñ¿).
// ---------------------------------------------------------------------------
const PAGE_W = 595.28, PAGE_H = 841.89;          // A4 en puntos
const MX = 48, MY = 52;                          // márgenes
const CONT_W = PAGE_W - MX * 2;                  // ancho útil
const rgb01 = (c, rgb) => rgb(c[0] / 255, c[1] / 255, c[2] / 255);

export async function exportarInforme(t, opts = {}) {
  const datos = await resolver(t, opts);
  const m = modelo(t, datos);
  const { PDFDocument, StandardFonts, rgb } = await import(PDFLIB);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Informe — ${m.comitente}`);
  pdf.setProducer("Selega · Ecosistema Escriba");
  pdf.setCreator("Selega");
  const F = await pdf.embedFont(StandardFonts.Helvetica);
  const FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const FM = await pdf.embedFont(StandardFonts.Courier);       // cifras tabulares
  const FMB = await pdf.embedFont(StandardFonts.CourierBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MY;                                          // cursor desde arriba

  const col = (c) => rgb01(c, rgb);
  // Sanea a WinAnsi (Helvetica/Courier no traen glifos fuera de Latin-1): em-dash→guion, etc.
  const wa = (s) => String(s ?? "")
    .replace(/—|–/g, "-").replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"').replace(/…/g, "...").replace(/ /g, " ");
  const W = (s, f, sz) => f.widthOfTextAtSize(wa(s), sz);

  // Salto de página si no entra `alto` desde el cursor. Devuelve true si saltó.
  function asegurar(alto) {
    if (y - alto >= MY) return false;
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MY;
    return true;
  }
  function texto(s, x, sz, { font = F, color = TINTA, baseline = y } = {}) {
    page.drawText(wa(s), { x, y: baseline, size: sz, font, color: col(color) });
  }
  // Recorta un string a un ancho máximo agregando "…" (evita desbordes en celdas).
  function recortar(s, font, sz, maxW) {
    s = wa(s);
    if (W(s, font, sz) <= maxW) return s;
    while (s.length > 1 && W(s + "...", font, sz) > maxW) s = s.slice(0, -1);
    return s.replace(/\s+$/, "") + "...";
  }
  // Envuelve `s` a líneas que entren en `maxW`. Devuelve array de líneas.
  function envolver(s, font, sz, maxW) {
    const out = []; let linea = "";
    for (const palabra of wa(s).split(/\s+/)) {
      const tent = linea ? linea + " " + palabra : palabra;
      if (W(tent, font, sz) <= maxW || !linea) linea = tent;
      else { out.push(linea); linea = palabra; }
    }
    if (linea) out.push(linea);
    return out.length ? out : [""];
  }

  // ---- Membrete: logo bordó + marca + jurisdicción a la derecha, regla bordó ----
  const logoS = 26;
  page.drawRectangle({ x: MX, y: y - logoS, width: logoS, height: logoS, color: col(BORDO) });
  // tilde blanca dentro del logo (líneas vectoriales finas)
  const lx = MX, ly = y - logoS;
  page.drawLine({ start: { x: lx + 6, y: ly + 13 }, end: { x: lx + 11, y: ly + 8 }, thickness: 2, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: lx + 11, y: ly + 8 }, end: { x: lx + 20, y: ly + 19 }, thickness: 2, color: rgb(1, 1, 1) });
  texto("Selega", MX + logoS + 10, 15, { font: FB, color: BORDO, baseline: y - 9 });
  texto("Control de Estados Contables para Legalizaciones", MX + logoS + 10, 8.5, { color: GRIS, baseline: y - 20 });
  const jur = recortar(m.jurLabel, FB, 8.5, CONT_W * 0.4);
  texto(jur, PAGE_W - MX - W(jur, FB, 8.5), 8.5, { font: FB, color: GRIS2, baseline: y - 6 });
  y -= logoS + 8;
  page.drawLine({ start: { x: MX, y }, end: { x: PAGE_W - MX, y }, thickness: 1.4, color: col(BORDO) });
  y -= 24;

  // ---- Título: comitente + CUIT ----
  texto(recortar(m.comitente, FB, 19, CONT_W), MX, 19, { font: FB, baseline: y });
  y -= 16;
  texto(`CUIT ${m.cuit}`, MX, 10.5, { font: FM, color: GRIS2, baseline: y });
  y -= 22;

  // ---- Metadatos: grilla de 3 columnas (etiqueta arriba en versalita, valor abajo) ----
  asegurar(72);
  const metaPadX = 12, metaPadY = 11, colW = (CONT_W - metaPadX * 2) / 3, filas = Math.ceil(m.meta.length / 3);
  const metaH = metaPadY * 2 + filas * 28 - 8;
  page.drawRectangle({ x: MX, y: y - metaH, width: CONT_W, height: metaH, color: col(PAPEL_CAJA), borderColor: col([0xd8, 0xd8, 0xde]), borderWidth: 1 });
  m.meta.forEach(([k, val], i) => {
    const cx = MX + metaPadX + (i % 3) * colW;
    const cy = y - metaPadY - Math.floor(i / 3) * 28;
    texto(k.toUpperCase(), cx, 7, { font: FB, color: GRIS, baseline: cy - 7 });
    texto(recortar(val, F, 10, colW - 8), cx, 10, { baseline: cy - 19 });
  });
  y -= metaH + 22;

  // ---- Caja de desenlace: borde grueso + fondo del color del veredicto ----
  const sem = SEM[m.color] || SEM.amarillo;
  asegurar(56);
  const motivosLineas = m.motivos.length
    ? m.motivos.flatMap((mo) => envolver("• " + mo, F, 9.5, CONT_W - 28))
    : envolver("Sin observaciones que impidan el desenlace.", F, 9.5, CONT_W - 28);
  const desH = 40 + motivosLineas.length * 13;
  page.drawRectangle({ x: MX, y: y - desH, width: CONT_W, height: desH, color: col(sem.fondo), borderColor: col(sem.borde), borderWidth: 1.2 });
  page.drawRectangle({ x: MX, y: y - desH, width: 4, height: desH, color: col(sem.borde) }); // barra lateral
  texto("DESENLACE", MX + 16, 7.5, { font: FB, color: GRIS, baseline: y - 16 });
  texto(m.etiqueta, MX + 16 + W("DESENLACE", FB, 7.5) + 10, 14, { font: FB, color: sem.txt, baseline: y - 18 });
  let my = y - 34;
  for (const ln of motivosLineas) { texto(ln, MX + 16, 9.5, { color: GRIS2, baseline: my }); my -= 13; }
  y -= desH + 24;

  // ---- Helper de tabla: cabecera + filas con celdas alineadas. cols: [{w, align, font}]. ----
  function tituloSeccion(titulo, resumen) {
    asegurar(26);
    texto(titulo.toUpperCase(), MX, 9, { font: FB, color: BORDO, baseline: y - 8 });
    if (resumen) {
      const rw = W(resumen, FM, 8);
      texto(resumen, PAGE_W - MX - rw, 8, { font: FM, color: GRIS, baseline: y - 8 });
    }
    y -= 12;
    page.drawLine({ start: { x: MX, y }, end: { x: PAGE_W - MX, y }, thickness: 0.8, color: col(LINEA) });
    y -= 12;
  }
  // Dibuja una fila (array de celdas {txt, font, color, align}) en x acumulado por `cols`.
  function fila(celdas, cols, sz, { headerLine = false } = {}) {
    asegurar(18);
    let x = MX;
    celdas.forEach((cel, i) => {
      const cw = cols[i].w, font = cel.font || F, color = cel.color || TINTA;
      const s = recortar(cel.txt, font, sz, cw - 8);
      const tx = cel.align === "right" ? x + cw - 8 - W(s, font, sz) : x + 4;
      texto(s, tx, sz, { font, color, baseline: y - 11 });
      x += cw;
    });
    y -= 17;
    page.drawLine({ start: { x: MX, y: y + 5 }, end: { x: PAGE_W - MX, y: y + 5 }, thickness: headerLine ? 1.2 : 0.5, color: col(headerLine ? LINEA2 : LINEA) });
  }

  // ---- Cruces numéricos (nombre | estado | diferencia) ----
  tituloSeccion("Cruces numéricos",
    `OK ${m.resumen.ok} · Difiere ${m.resumen.difiere} · N/A ${m.resumen.na} · Falta ${m.resumen.falta}`);
  const colCru = [{ w: CONT_W * 0.56 }, { w: CONT_W * 0.2 }, { w: CONT_W * 0.24 }];
  fila([{ txt: "Control cruzado", font: FB, color: GRIS }, { txt: "Estado", font: FB, color: GRIS },
    { txt: "Diferencia", font: FB, color: GRIS, align: "right" }], colCru, 7.5, { headerLine: true });
  if (m.cruces.length) {
    for (const c of m.cruces)
      fila([{ txt: c.nombre }, { txt: c.etiqueta, font: FB, color: EST_COLOR[c.estado] || TINTA },
        { txt: c.dif, font: FM, color: c.estado === "DIFIERE" ? EST_COLOR.DIFIERE : GRIS, align: "right" }], colCru, 9);
  } else {
    fila([{ txt: "Sin cruces en esta jurisdicción.", color: GRIS }], [{ w: CONT_W }], 9);
  }
  y -= 12;

  // ---- Controles observados (estado | texto+consecuencia) ----
  tituloSeccion("Controles observados");
  if (m.obs.length) {
    const stW = 78;
    for (const o of m.obs) {
      const lineas = envolver(o.texto, F, 9, CONT_W - stW - 8);
      const consLineas = o.cons ? envolver(o.cons, F, 8, CONT_W - stW - 8) : [];
      const filaH = Math.max(13, lineas.length * 12 + consLineas.length * 11 + 4);
      asegurar(filaH + 4);
      texto(o.etiqueta.toUpperCase(), MX + 4, 8, { font: FB, color: o.st === "obs" ? EST_COLOR.FALTA_DATO : GRIS, baseline: y - 10 });
      let ty = y - 10;
      for (const ln of lineas) { texto(ln, MX + stW, 9, { color: GRIS2, baseline: ty }); ty -= 12; }
      for (const ln of consLineas) { texto(ln, MX + stW, 8, { color: GRIS, baseline: ty }); ty -= 11; }
      y -= filaH + 4;
      page.drawLine({ start: { x: MX, y: y + 5 }, end: { x: PAGE_W - MX, y: y + 5 }, thickness: 0.5, color: col(LINEA) });
    }
  } else {
    texto("Sin controles observados.", MX, 9, { color: GRIS, baseline: y - 6 });
    y -= 16;
  }
  y -= 12;

  // ---- Cifras de los estados contables (concepto | valor) ----
  tituloSeccion("Cifras de los estados contables");
  const colCif = [{ w: CONT_W * 0.7 }, { w: CONT_W * 0.3 }];
  fila([{ txt: "Concepto", font: FB, color: GRIS }, { txt: "Valor", font: FB, color: GRIS, align: "right" }],
    colCif, 7.5, { headerLine: true });
  for (const c of m.cifras) {
    const lbl = c.estado ? `${c.label}  (${c.estado})` : c.label;
    fila([{ txt: lbl, color: GRIS2 },
      { txt: c.valor, font: c.num ? FM : F, color: c.vacio ? [0xa0, 0xa0, 0xaa] : TINTA, align: "right" }], colCif, 9);
  }

  // ---- Pie en TODAS las páginas: "Generado por Selega · Ecosistema Escriba" + fecha ----
  const fechaPie = fechaLarga(new Date().toISOString());
  const piezas = ["Generado por Selega · Ecosistema Escriba", fechaPie];
  if (m.consejo) piezas.push(m.consejo);
  const pie = piezas.join("   ·   ");
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MX, y: MY - 12 }, end: { x: PAGE_W - MX, y: MY - 12 }, thickness: 0.8, color: col(LINEA) });
    p.drawText(wa(pie), { x: MX, y: MY - 24, size: 8, font: F, color: col(GRIS) });
    const pg = `${i + 1} / ${pages.length}`;
    p.drawText(pg, { x: PAGE_W - MX - F.widthOfTextAtSize(pg, 8), y: MY - 24, size: 8, font: F, color: col(GRIS) });
  });

  // ---- Descarga del archivo (sin diálogo de impresión) ----
  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `informe-${sanitizarNombre(m.comitente)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
