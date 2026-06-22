// admin-checklist.js — Constructor VISUAL del checklist de controles formales. El Admin
// arma secciones y controles (texto, consecuencia, referencia) desde la interfaz → escribe
// pack.secciones del rule-pack custom de la jurisdicción. Complementa al constructor de
// cruces: juntos son "el sistema de control armado desde la pantalla" (Fase 2).
import { cargarPack, guardarPackCustom } from "./rules/loader.js";
import { esc } from "./util.js";
import { aviso, confirmar } from "./modal.js";

const CONS = [
  ["denegacion_directa", "Denegación directa"],
  ["subsanable_tasa_borrador", "Subsanable (tasa borrador)"],
  ["se_certifica_firma", "Certifica firma"],
  ["observacion", "Observación"],
];

export async function montarConstructorChecklist(host, registro, onChange) {
  let jurId = registro[0].id, pack = null;

  host.innerHTML = `
    <div class="panel">
      <h2>Constructor de controles (checklist)</h2>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
        <label class="badge">Jurisdicción</label>
        <select id="ck-jur">${registro.map((j) => `<option value="${j.id}">${esc(j.provincia)} — ${esc(j.consejo)}</option>`).join("")}</select>
        <span id="ck-origen" class="badge"></span>
        <span style="flex:1"></span>
        <button id="ck-add-sec" class="ghost">+ Sección</button>
      </div>
      <div id="ck-secs"></div>
    </div>
  `;

  const $ = (s) => host.querySelector(s);

  async function persistir() {
    // Re-leé el pack más fresco y superponé SOLO las secciones (no pisar cifras/cruces de otra solapa).
    let latest = null;
    try { const r = await fetch(`/api/packs/${encodeURIComponent(jurId)}`); if (r.ok) { const j = await r.json(); if (j && Object.keys(j).length) latest = j; } } catch { /* sin custom aún */ }
    const out = latest ? { ...latest, secciones: pack.secciones } : pack;
    out._origen = "custom";
    try { await guardarPackCustom(jurId, out); pack = out; }
    catch (e) { aviso("No se pudo guardar", "No se pudo guardar en el servidor: " + e.message); return; }
    $("#ck-origen").textContent = "custom (editado)";
    onChange?.();
  }

  function render() {
    $("#ck-origen").textContent = pack._origen === "custom" ? "custom (editado)" : "del repo / semilla";
    const secs = pack.secciones || [];
    $("#ck-secs").innerHTML = secs.map((s, si) => `
      <details class="ck-sec" open>
        <summary>${esc(String(s.id || ""))}. ${esc(s.titulo || "(sección)")} <span class="badge">${(s.controles || []).length} ctrl</span></summary>
        <div class="ck-sec-head">
          <label>Título<input data-si="${si}" data-f="titulo" value="${esc(s.titulo || "")}"></label>
          <label>Referencia<input data-si="${si}" data-f="ref" value="${esc(s.ref || "")}" style="width:170px"></label>
          <button class="ghost mini" data-addc="${si}">+ control</button>
          <button class="ghost mini" data-delsec="${si}">borrar sección</button>
        </div>
        <div class="ck-ctrls">
          ${(s.controles || []).map((c, ci) => `
            <div class="ck-ctrl">
              <input class="ck-txt" data-si="${si}" data-ci="${ci}" data-f="texto" value="${esc(c.texto || "")}" placeholder="Texto del control">
              <select data-si="${si}" data-ci="${ci}" data-f="consecuencia">
                ${CONS.map(([v, t]) => `<option value="${v}" ${c.consecuencia === v ? "selected" : ""}>${t}</option>`).join("")}
              </select>
              <input data-si="${si}" data-ci="${ci}" data-f="ref" value="${esc(c.ref || "")}" placeholder="ref" style="width:110px">
              <a class="link" data-delc="${si}:${ci}" title="Borrar control">✕</a>
            </div>`).join("")}
        </div>
      </details>`).join("") || `<p style="color:var(--muted)">Esta jurisdicción no tiene controles. Agregá la primera sección.</p>`;
    bind();
  }

  function bind() {
    // Edición de campos: input mantiene el modelo en memoria; change (blur) persiste.
    $("#ck-secs").querySelectorAll("[data-f]").forEach((el) => {
      const si = +el.dataset.si, ci = el.dataset.ci, f = el.dataset.f;
      const aplicar = () => {
        const obj = ci != null ? pack.secciones[si].controles[+ci] : pack.secciones[si];
        obj[f] = el.value;
      };
      el.addEventListener("input", aplicar);
      el.addEventListener("change", () => { aplicar(); persistir(); });
    });
    $("#ck-secs").querySelectorAll("[data-addc]").forEach((b) => b.onclick = () => {
      const si = +b.dataset.addc, s = pack.secciones[si];
      s.controles = s.controles || [];
      s.controles.push({ id: `${s.id}.${s.controles.length + 1}`, texto: "", ref: "", consecuencia: "observacion" });
      persistir(); render();
    });
    $("#ck-secs").querySelectorAll("[data-delsec]").forEach((b) => b.onclick = async () => {
      if (await confirmar("Borrar sección", "¿Borrar la sección completa?", { peligro: true, okText: "Borrar" })) { pack.secciones.splice(+b.dataset.delsec, 1); persistir(); render(); }
    });
    $("#ck-secs").querySelectorAll("[data-delc]").forEach((a) => a.onclick = () => {
      const [si, ci] = a.dataset.delc.split(":").map(Number);
      pack.secciones[si].controles.splice(ci, 1); persistir(); render();
    });
  }

  $("#ck-add-sec").onclick = () => {
    pack.secciones = pack.secciones || [];
    pack.secciones.push({ id: String(pack.secciones.length + 1), titulo: "Nueva sección", ref: "", controles: [] });
    persistir(); render();
  };

  async function cargar() {
    pack = await cargarPack(registro.find((j) => j.id === jurId));
    if (!Array.isArray(pack.secciones)) pack.secciones = [];
    render();
  }
  $("#ck-jur").onchange = (e) => { jurId = e.target.value; cargar(); };

  await cargar();
}
