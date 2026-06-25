// informe.js — Renderer de INFORME PDF (documento A4 propio, NO un print de la web).
// Toma un trabajo `t` + pack + formato + veredicto ya computado y arma un documento
// limpio dentro de #doc-print (oculto en pantalla; el @media print muestra SOLO eso).
// No duplica el motor: reusa computarVeredicto/cargarPack/formatear/esc.
import { computarVeredicto, ESTADO_LABEL } from "./core/veredicto.js";
import { CAMPOS } from "./core/schema.js";
import { cargarPack } from "./rules/loader.js";
import { cargarFormato, formatear } from "./core/formato.js";
import { esc } from "./util.js";

const fechaLarga = (s) => s ? new Date(s).toLocaleString("es-AR", {
  day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "—";

// Estado del cruce → texto (sin emojis: "OK"/"Difiere"/"N/A"/"Falta dato").
const CRUCE_TXT = { OK: "OK", DIFIERE: "Difiere", "N/A": "N/A", FALTA_DATO: "Falta dato" };

// Logo Selega inline (mismo trazo que public/logo.svg) para que viaje en el documento impreso.
const LOGO = `<svg class="doc-logo" viewBox="0 0 64 64" role="img" aria-label="Selega">
  <rect width="64" height="64" rx="15" fill="#a8324a"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="#ffffff" stroke-width="3.5"/>
  <path d="M23 33 l6 6 l12 -15" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Devuelve (o crea una vez) el contenedor #doc-print, oculto en pantalla.
function contenedorDoc() {
  let el = document.getElementById("doc-print");
  if (!el) {
    el = document.createElement("div");
    el.id = "doc-print";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
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

// Construye el HTML del documento y lo inyecta en #doc-print. No imprime (eso lo hace exportarInforme).
export async function renderInforme(t, opts = {}) {
  const { pack, formato, v, jurDef, jurLabel } = await resolver(t, opts);
  const fmt = (n) => formatear(n, formato);
  const estado = t.estado || "en_curso";

  // Cifras de los EECC (campos del pack o canónicos).
  const campos = (pack.campos && pack.campos.length) ? pack.campos : CAMPOS;
  const cifrasHtml = campos.map((c) => {
    const val = (t.cifras || {})[c.id];
    const shown = val == null ? "—"
      : c.tipo === "monto" ? fmt(val)
      : c.tipo === "bool" ? (val ? "Sí" : "No")
      : val;
    const esMonto = c.tipo === "monto" && val != null;
    return `<tr>
      <td class="doc-cif-lbl">${esc(c.label)}<span class="doc-cif-est">${esc(c.estado || "")}</span></td>
      <td class="doc-cif-val${esMonto ? " num" : ""}${val == null ? " vacia" : ""}">${esc(String(shown))}</td>
    </tr>`;
  }).join("");

  // Cruces numéricos (nombre | estado | diferencia).
  const crucesHtml = v.res.map((r) => {
    const dif = r.estado === "DIFIERE" && r.diferencia != null
      ? `$ ${esc(fmt(r.diferencia))}` : "—";
    return `<tr>
      <td>${esc(r.nombre)}</td>
      <td class="doc-est doc-est-${esc(r.estado).toLowerCase().replace(/[^a-z]/g, "")}">${esc(CRUCE_TXT[r.estado] || r.estado)}</td>
      <td class="doc-est-dif num">${dif}</td>
    </tr>`;
  }).join("");

  // Controles observados (obs / N/A) — el resto no aporta al informe.
  const obsRows = [];
  for (const sec of pack.secciones || [])
    for (const ctrl of sec.controles || []) {
      const st = (t.controles || {})[ctrl.id];
      if (st === "obs" || st === "na") obsRows.push({ ctrl, st });
    }
  const obsHtml = obsRows.length
    ? `<table class="doc-tabla doc-obs"><tbody>${obsRows.map((o) => `<tr>
        <td class="doc-obs-st doc-obs-${o.st}">${o.st === "obs" ? "Observado" : "N/A"}</td>
        <td>${esc(o.ctrl.texto)}<span class="doc-obs-cons">${esc(o.ctrl.consecuencia)}</span></td>
      </tr>`).join("")}</tbody></table>`
    : `<p class="doc-vacio">Sin controles observados.</p>`;

  const motivosHtml = (v.desenlace.motivos || []).length
    ? `<ul class="doc-motivos">${v.desenlace.motivos.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`
    : `<p class="doc-motivos-vacio">Sin observaciones que impidan el desenlace.</p>`;

  const cont = contenedorDoc();
  cont.innerHTML = `
    <article class="doc doc-${esc(v.color)}">
      <header class="doc-membrete">
        ${LOGO}
        <div class="doc-membrete-txt">
          <div class="doc-marca">Selega</div>
          <div class="doc-sub">Control de Estados Contables para Legalizaciones</div>
        </div>
        <div class="doc-jur">${esc(jurLabel)}</div>
      </header>

      <h1 class="doc-titulo">${esc(t.comitente || "(sin comitente)")}</h1>
      <div class="doc-cuit">CUIT ${esc(t.cuit || "—")}</div>

      <dl class="doc-meta">
        <div><dt>Jurisdicción</dt><dd>${esc(jurLabel)}</dd></div>
        <div><dt>Agente</dt><dd>${esc(t.usuario || "—")}</dd></div>
        <div><dt>Versión de reglas</dt><dd>${esc(t.pack_version || "—")}</dd></div>
        <div><dt>Estado</dt><dd>${esc(ESTADO_LABEL[estado] || estado)}</dd></div>
        <div><dt>Creación</dt><dd>${esc(fechaLarga(t.creado))}</dd></div>
        <div><dt>Modificación</dt><dd>${esc(fechaLarga(t.modificado))}</dd></div>
      </dl>

      <section class="doc-desenlace doc-des-${esc(v.color)}">
        <div class="doc-des-cab">
          <span class="doc-des-lbl">Desenlace</span>
          <strong class="doc-des-txt">${esc(v.etiqueta)}</strong>
        </div>
        ${motivosHtml}
      </section>

      <section class="doc-seccion">
        <h2 class="doc-h2">Cruces numéricos
          <span class="doc-resumen">OK ${v.resumen.ok} · Difiere ${v.resumen.difiere} · N/A ${v.resumen.na} · Falta ${v.resumen.falta}</span>
        </h2>
        <table class="doc-tabla doc-cruces">
          <thead><tr><th>Control cruzado</th><th>Estado</th><th class="num">Diferencia</th></tr></thead>
          <tbody>${crucesHtml || `<tr><td colspan="3" class="doc-vacio">Sin cruces en esta jurisdicción.</td></tr>`}</tbody>
        </table>
      </section>

      <section class="doc-seccion">
        <h2 class="doc-h2">Controles observados</h2>
        ${obsHtml}
      </section>

      <section class="doc-seccion">
        <h2 class="doc-h2">Cifras de los estados contables</h2>
        <table class="doc-tabla doc-cifras">
          <thead><tr><th>Concepto</th><th class="num">Valor</th></tr></thead>
          <tbody>${cifrasHtml}</tbody>
        </table>
      </section>

      <footer class="doc-pie">
        <span>Generado por Selega · Ecosistema Escriba</span>
        <span class="doc-pie-sep">·</span>
        <span>${esc(fechaLarga(new Date().toISOString()))}</span>
        ${jurDef && jurDef.consejo ? `<span class="doc-pie-sep">·</span><span>${esc(jurDef.consejo)}</span>` : ""}
      </footer>
    </article>`;
  return cont;
}

// Render + imprimir (el navegador ofrece "Guardar como PDF"). Marca <body> para que el
// @media print del informe gane y NO se mezcle con el print del expediente.
export async function exportarInforme(t, opts = {}) {
  await renderInforme(t, opts);
  document.body.classList.add("imprimiendo-informe");
  const limpiar = () => document.body.classList.remove("imprimiendo-informe");
  window.addEventListener("afterprint", limpiar, { once: true });
  // Fallback por si afterprint no dispara (algunos navegadores headless): saca la clase enseguida.
  setTimeout(limpiar, 0);
  window.print();
}
