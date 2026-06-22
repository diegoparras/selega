// expediente.js — Vista EXPEDIENTE read-only para supervisor (con acciones) y auditor.
// Orientada al RESULTADO, no a la edición: NO reusa el control del agente ni sus globales.
// Carga el pack de la jurisdicción "a un costado" (cargarPack devuelve objeto fresco) y
// reproduce el veredicto con computarVeredicto (mismo cómputo que el control).
import { computarVeredicto, ESTADO_LABEL } from "./core/veredicto.js";
import { CAMPOS } from "./core/schema.js";
import { cargarPack } from "./rules/loader.js";
import { cargarFormato, formatear } from "./core/formato.js";
import { esc } from "./util.js";
import { pedir } from "./modal.js";

const ICONO_CRUCE = { OK: "✓", DIFIERE: "✗", "N/A": "·", FALTA_DATO: "?" };
const fecha = (s) => s ? new Date(s).toLocaleString("es-AR") : "—";

// Renderiza el expediente de un trabajo en `cont`.
// opts: { acciones (bool, muestra Aprobar/Devolver), registro, onVolver, onRevisar(accion,nota) }
export async function montarExpediente(cont, t, opts = {}) {
  const registro = opts.registro || [];
  const jurDef = registro.find((j) => j.id === t.jurisdiccion);
  let pack = { cruces: [], secciones: [] };
  try { if (jurDef) pack = await cargarPack(jurDef); } catch { /* sin pack: se muestra igual */ }
  const formato = cargarFormato();
  const fmt = (n) => formatear(n, formato);
  const v = computarVeredicto(t.cifras || {}, t.controles || {}, pack);

  const jurLabel = jurDef ? `${jurDef.provincia} — ${jurDef.consejo}` : (t.jurisdiccion || "—");
  const estado = t.estado || "en_curso";

  // Controles marcados (observado / N/A) — el resto (ok/pendiente) no aporta al expediente.
  const obsRows = [];
  for (const sec of pack.secciones || [])
    for (const ctrl of sec.controles || []) {
      const st = (t.controles || {})[ctrl.id];
      if (st === "obs" || st === "na") obsRows.push({ ctrl, st });
    }

  const cifrasHtml = (pack.campos && pack.campos.length ? pack.campos : CAMPOS).map((c) => {
    const val = (t.cifras || {})[c.id];
    const shown = val == null ? "—" : c.tipo === "monto" ? fmt(val) : c.tipo === "bool" ? (val ? "Sí" : "No") : val;
    return `<div class="exp-cifra"><span class="exp-cifra-lbl">${esc(c.label)}<span class="est">${esc(c.estado)}</span></span><span class="exp-cifra-val${val == null ? " vacia" : ""}">${esc(String(shown))}</span></div>`;
  }).join("");

  const crucesHtml = v.res.map((r) => {
    const dif = r.estado === "DIFIERE" && r.diferencia != null ? `<span class="dif">$ ${fmt(r.diferencia)}</span>` : "";
    return `<div class="cruce"><span class="ico ${esc(r.estado)}">${ICONO_CRUCE[r.estado]}</span><span>${esc(r.nombre)}</span>${dif}</div>`;
  }).join("");

  const obsHtml = obsRows.length
    ? obsRows.map((o) => `<div class="exp-obs"><span class="exp-obs-st ${o.st}">${o.st === "obs" ? "Observado" : "N/A"}</span><span class="exp-obs-txt">${esc(o.ctrl.texto)} <em>→ ${esc(o.ctrl.consecuencia)}</em></span></div>`).join("")
    : `<p class="exp-vacio">Sin controles observados.</p>`;

  cont.innerHTML = `
    <div class="exp">
      <div class="exp-barra">
        <button class="ghost" id="exp-volver">← Volver a la bandeja</button>
        <span class="sp" style="flex:1"></span>
        <button class="ghost" id="exp-exportar">Exportar</button>
      </div>

      <div class="exp-cabecera exp-seccion">
        <h1>${esc(t.comitente || "(sin comitente)")}</h1>
        <div class="exp-meta">
          <span><b>CUIT</b> ${esc(t.cuit || "—")}</span>
          <span><b>Jurisdicción</b> ${esc(jurLabel)}</span>
          <span><b>Agente</b> ${esc(t.usuario || "—")}</span>
          <span><b>Reglas</b> ${esc(t.pack_version || "—")}</span>
          <span><b>Creado</b> ${esc(fecha(t.creado))}</span>
          <span><b>Modificado</b> ${esc(fecha(t.modificado))}</span>
        </div>
        <span class="exp-estado estado-${esc(estado)}">${esc(ESTADO_LABEL[estado] || estado)}</span>
      </div>

      <div class="exp-veredicto exp-seccion veredicto des-${esc(v.color)}">
        <div class="ver-top"><span class="ver-dot"></span><strong class="ver-txt">${esc(v.etiqueta)}</strong></div>
        <ul class="ver-motivos">${v.desenlace.motivos.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
      </div>

      <div class="exp-seccion">
        <h2>Cruces numéricos <span class="exp-resumen">✓ ${v.resumen.ok} · ✗ ${v.resumen.difiere} · · ${v.resumen.na} · ? ${v.resumen.falta}</span></h2>
        <div class="exp-cruces">${crucesHtml}</div>
      </div>

      <div class="exp-seccion">
        <h2>Controles observados</h2>
        ${obsHtml}
      </div>

      <div class="exp-seccion">
        <h2>Cifras de los EECC</h2>
        <div class="exp-cifras">${cifrasHtml}</div>
      </div>

      <div class="exp-seccion">
        <h2>Traza de auditoría</h2>
        <div id="exp-audit"><p class="exp-vacio">Cargando…</p></div>
      </div>

      ${opts.acciones ? `<div class="exp-acciones" id="exp-acciones">
        <button id="exp-aprobar">Aprobar / Firmar</button>
        <button id="exp-devolver" class="ghost">Devolver al agente</button>
      </div>` : ""}
    </div>`;

  // Navegación + export
  cont.querySelector("#exp-volver").onclick = () => opts.onVolver && opts.onVolver();
  cont.querySelector("#exp-exportar").onclick = () => window.print();

  // Acciones del supervisor
  if (opts.acciones && opts.onRevisar) {
    cont.querySelector("#exp-aprobar").onclick = () => opts.onRevisar("aprobar", "");
    cont.querySelector("#exp-devolver").onclick = async () => {
      const nota = await pedir("Devolver al agente", { label: "Motivo de la devolución", placeholder: "Qué falta corregir…" });
      if (nota === null) return;            // canceló
      opts.onRevisar("devolver", nota);
    };
  }

  // Traza de auditoría (append-only): quién, cuándo, qué.
  try {
    const audit = await (await fetch(`/api/trabajos/${t.id}/audit`)).json();
    const cont2 = cont.querySelector("#exp-audit");
    cont2.innerHTML = (audit || []).length
      ? `<ol class="exp-timeline">${audit.map((a) => `<li><span class="exp-ts">${esc(fecha(a.ts))}</span><span class="exp-act">${esc(a.accion)}</span><span class="exp-by">${esc(a.usuario || "")}</span>${a.detalle ? `<span class="exp-det">${esc(a.detalle)}</span>` : ""}</li>`).join("")}</ol>`
      : `<p class="exp-vacio">Sin registros de auditoría.</p>`;
  } catch { /* la auditoría es complementaria, no bloquea el expediente */ }
}
