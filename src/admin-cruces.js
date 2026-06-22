// admin-cruces.js — Constructor VISUAL de cruces (la joya de Fase 2). El Admin arma
// cada cruce eligiendo campos/operador/comparador/condición/consecuencia → genera el
// spec (data del motor) → lo guarda en el pack custom de la jurisdicción. Bidireccional:
// se ve el JSON que se guarda. Evaluación EN VIVO contra el Ejemplo (Abigail).
import { cargarPack, guardarPackCustom } from "./rules/loader.js";
import { CAMPOS, EJEMPLO } from "./core/schema.js";
import { evaluarCruce } from "./core/motor-cruces.js";
import { formatear } from "./core/formato.js";
import { esc } from "./util.js";
import { aviso, confirmar } from "./modal.js";

const MONTOS = CAMPOS.filter((c) => c.tipo === "monto");
const COMPARADORES = ["=", "≠", "≤", "≥", ">", "<"];
const OPS = ["", "+", "−", "×", "÷"];
const CONSECUENCIAS = [
  ["denegacion_directa", "Denegación directa"],
  ["subsanable_tasa_borrador", "Observación subsanable (tasa borrador)"],
  ["se_certifica_firma", "Se certifica la firma"],
  ["observacion", "Observación (no bloqueante)"],
];
const CONDICIONES = [
  ["siempre", "Siempre", "siempre"],
  ["efe_directo", "EFE es directo", { campo: "metodo_efe", op: "=", valor: "directo" }],
  ["efe_indirecto", "EFE es indirecto", { campo: "metodo_efe", op: "=", valor: "indirecto" }],
  ["sa_sas", "Es SA o SAS", { campo: "tipo_societario", op: "en", valor: ["SA", "SAS"] }],
  ["pn_negativo", "El PN es negativo", { campo: "pn_esp", op: "<", valor: 0, sinDato: "falta" }],
];
let _camposListener = null; // handler global del evento "selega:campos" (se reemplaza al re-montar Admin)
const condKey = (cond) => {
  if (!cond || cond === "siempre") return "siempre";
  const m = CONDICIONES.find(([, , spec]) => spec !== "siempre" && JSON.stringify(spec) === JSON.stringify(cond));
  return m ? m[0] : "siempre";
};
const ICONO = { OK: "✓", DIFIERE: "✗", "N/A": "·", FALTA_DATO: "?" };

const optCampos = (lista, sel, vacio) =>
  (vacio ? `<option value="">—</option>` : "") +
  lista.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.label)}</option>`).join("");

export async function montarConstructorCruces(host, registro, onChange) {
  let jurId = registro[0].id, pack = null, editId = null;
  // Campos del pack ACTIVO (editables por jurisdicción); semilla = CAMPOS canónicas.
  const campos = () => (pack && pack.campos && pack.campos.length ? pack.campos : CAMPOS);
  const montos = () => campos().filter((c) => c.tipo === "monto");
  const labelCampo = (id) => (campos().find((c) => c.id === id) || {}).label || id;

  host.innerHTML = `
    <div class="panel">
      <h2>Constructor de cruces numéricos</h2>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <label class="badge">Jurisdicción</label>
        <select id="cx-jur">${registro.map((j) => `<option value="${j.id}">${esc(j.provincia)} — ${esc(j.consejo)}</option>`).join("")}</select>
        <span id="cx-origen" class="badge"></span>
      </div>
      <div id="cx-lista" class="cx-lista"></div>
    </div>

    <div class="panel">
      <h2 id="cx-form-tit">Nuevo cruce</h2>
      <div class="cx-form">
        <label>Nombre<input id="cx-nom" type="text" placeholder="Ej.: Igualdad patrimonial"></label>
        <label>Aplica si<select id="cx-cond">${CONDICIONES.map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select></label>
        <label>Tipo<select id="cx-tipo"><option value="comparacion">Comparación numérica</option><option value="presencia">Presencia / nota</option></select></label>

        <div id="cx-grp-comp" class="cx-sub">
          <label>Izquierda<select id="cx-izq">${optCampos(MONTOS)}</select></label>
          <label>Comparador<select id="cx-comp">${COMPARADORES.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <label>Tolerancia $<input id="cx-tol" type="number" value="1" step="1" min="0" style="width:90px"></label>
          <div class="cx-der">
            <label>Derecha<select id="cx-a">${optCampos(MONTOS)}</select></label>
            <select id="cx-op">${OPS.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}</select>
            <select id="cx-b">${optCampos(MONTOS, "", true)}</select>
          </div>
        </div>

        <div id="cx-grp-pres" class="cx-sub hidden">
          <label>Campo<select id="cx-campo">${optCampos(CAMPOS, "", false)}</select></label>
          <label>Debe<select id="cx-debe"><option value="presente">estar presente</option><option value="verdadero">ser verdadero (Sí)</option></select></label>
        </div>

        <label>Si no cierra<select id="cx-cons">${CONSECUENCIAS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
        <label>Referencia<input id="cx-ref" type="text" placeholder="Ej.: RT 9 · Res. 141"></label>
        <label class="cx-chk"><input id="cx-activo" type="checkbox" checked> Activo</label>
      </div>

      <div class="cx-preview">
        <div class="cx-prev-label">Vista previa</div>
        <div id="cx-formula" class="cx-formula"></div>
        <div id="cx-eval" class="cx-eval"></div>
      </div>
      <pre id="cx-json" class="cx-json"></pre>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button id="cx-save">Guardar cruce</button>
        <button id="cx-nuevo" class="ghost">Limpiar / nuevo</button>
      </div>
    </div>
  `;

  const $ = (s) => host.querySelector(s);
  const val = (s) => $(s).value;

  function specDesdeForm() {
    const tipo = val("#cx-tipo");
    const cond = CONDICIONES.find(([k]) => k === val("#cx-cond"))[2];
    const spec = {
      id: editId != null ? editId : `c_${Date.now()}`,
      nombre: val("#cx-nom").trim() || "(sin nombre)",
      tipo, condicion: cond,
      consecuencia: val("#cx-cons"),
      ref: val("#cx-ref").trim(),
      activo: $("#cx-activo").checked,
    };
    if (tipo === "presencia") {
      spec.campo = val("#cx-campo");
      spec.debe = val("#cx-debe");
      spec.faltaEstado = "DIFIERE";
    } else {
      spec.izq = [val("#cx-izq")];
      spec.comparador = val("#cx-comp");
      spec.tolerancia = Number(val("#cx-tol")) || 0;
      const op = val("#cx-op"), b = val("#cx-b");
      spec.der = op && b ? [val("#cx-a"), op, b] : [val("#cx-a")];
    }
    return spec;
  }

  function legible(spec) {
    if (spec.tipo === "presencia")
      return `${spec.debe === "verdadero" ? "Debe ser Sí" : "Debe estar presente"}: ${labelCampo(spec.campo)}`;
    const der = spec.der.map((t, i) => (i % 2 === 0 ? labelCampo(t) : t)).join(" ");
    return `${labelCampo(spec.izq[0])} ${spec.comparador} ${der}${spec.comparador === "=" ? ` (± $${spec.tolerancia})` : ""}`;
  }

  function actualizarPreview() {
    const tipo = val("#cx-tipo");
    $("#cx-grp-comp").classList.toggle("hidden", tipo !== "comparacion");
    $("#cx-grp-pres").classList.toggle("hidden", tipo !== "presencia");
    $("#cx-b").parentElement.style.opacity = val("#cx-op") ? 1 : 0.4;
    const spec = specDesdeForm();
    $("#cx-formula").textContent = legible(spec);
    const r = evaluarCruce(spec, EJEMPLO);
    const col = r.estado === "OK" ? "var(--ok)" : r.estado === "DIFIERE" ? "var(--bad)" : "var(--muted)";
    const msg = r.estado === "DIFIERE" && r.diferencia != null ? `difiere por $${formatear(Math.abs(r.diferencia))}`
      : r.estado === "OK" ? "cierra" : r.estado === "N/A" ? "no aplica" : "falta dato";
    $("#cx-eval").innerHTML = `<span style="color:${col};font-weight:600">${ICONO[r.estado]} ${msg}</span>
      <span style="color:var(--muted)"> — evaluado contra el Ejemplo (Abigail)</span>`;
    $("#cx-json").textContent = JSON.stringify(spec, null, 2);
  }

  function cargarEnForm(spec) {
    editId = spec.id;
    $("#cx-form-tit").textContent = `Editando: ${spec.nombre}`;
    $("#cx-nom").value = spec.nombre || "";
    $("#cx-cond").value = condKey(spec.condicion);
    $("#cx-tipo").value = spec.tipo || "comparacion";
    $("#cx-cons").value = spec.consecuencia || "denegacion_directa";
    $("#cx-ref").value = spec.ref || "";
    $("#cx-activo").checked = spec.activo !== false;
    if (spec.tipo === "presencia") {
      $("#cx-campo").value = spec.campo || CAMPOS[0].id;
      $("#cx-debe").value = spec.debe || "presente";
    } else {
      $("#cx-izq").value = (spec.izq || [MONTOS[0].id])[0];
      $("#cx-comp").value = spec.comparador || "=";
      $("#cx-tol").value = spec.tolerancia != null ? spec.tolerancia : 1;
      const d = spec.der || [MONTOS[0].id];
      $("#cx-a").value = d[0]; $("#cx-op").value = d[1] || ""; $("#cx-b").value = d[2] || "";
    }
    actualizarPreview();
    host.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function limpiarForm() {
    editId = null;
    $("#cx-form-tit").textContent = "Nuevo cruce";
    $("#cx-nom").value = ""; $("#cx-cond").value = "siempre"; $("#cx-tipo").value = "comparacion";
    $("#cx-cons").value = "denegacion_directa"; $("#cx-ref").value = ""; $("#cx-activo").checked = true;
    $("#cx-tol").value = 1; $("#cx-op").value = ""; $("#cx-b").value = "";
    actualizarPreview();
  }

  function renderLista() {
    $("#cx-origen").textContent = pack._origen === "custom" ? "custom (editado)" : "del repo / semilla";
    const cruces = pack.cruces || [];
    $("#cx-lista").innerHTML = cruces.map((c) => {
      const r = evaluarCruce(c, EJEMPLO);
      const col = r.estado === "OK" ? "var(--ok)" : r.estado === "DIFIERE" ? "var(--bad)" : "var(--muted)";
      const cons = (CONSECUENCIAS.find(([v]) => v === c.consecuencia) || [, "—"])[1];
      return `<div class="cx-item ${c.activo === false ? "off" : ""}">
        <span class="cx-ico" style="color:${col}">${ICONO[r.estado]}</span>
        <div class="cx-item-txt"><strong>${esc(c.nombre)}</strong>
          <span class="cx-item-sub">${esc(legible(c))} · ${esc(cons)}</span></div>
        <label class="cx-toggle" title="Activar / desactivar"><input type="checkbox" data-tg="${esc(String(c.id))}" ${c.activo === false ? "" : "checked"}></label>
        <a class="link" data-ed="${esc(String(c.id))}">editar</a>
        <a class="link" data-del="${esc(String(c.id))}">borrar</a>
      </div>`;
    }).join("") || `<p style="color:var(--muted)">Esta jurisdicción no tiene cruces. Agregá el primero abajo.</p>`;

    $("#cx-lista").querySelectorAll("[data-ed]").forEach((a) =>
      a.onclick = () => cargarEnForm(pack.cruces.find((c) => String(c.id) === a.dataset.ed)));
    $("#cx-lista").querySelectorAll("[data-del]").forEach((a) =>
      a.onclick = async () => { if (await confirmar("Borrar cruce", "¿Borrar este cruce?", { peligro: true, okText: "Borrar" })) { pack.cruces = pack.cruces.filter((c) => String(c.id) !== a.dataset.del); persistir(); } });
    $("#cx-lista").querySelectorAll("[data-tg]").forEach((chk) =>
      chk.onchange = () => { const c = pack.cruces.find((c) => String(c.id) === chk.dataset.tg); c.activo = chk.checked; persistir(); });
  }

  async function persistir() {
    // Re-leé el pack más fresco y superponé SOLO los cruces (no pisar cifras/checklist de otra solapa).
    let latest = null;
    try { const r = await fetch(`/api/packs/${encodeURIComponent(jurId)}`); if (r.ok) { const j = await r.json(); if (j && Object.keys(j).length) latest = j; } } catch { /* sin custom aún */ }
    const out = latest ? { ...latest, cruces: pack.cruces } : pack;
    out._origen = "custom";
    try { await guardarPackCustom(jurId, out); pack = out; }
    catch (e) { aviso("No se pudo guardar", "No se pudo guardar en el servidor: " + e.message); return; }
    renderLista();
    onChange?.();
  }

  // Repobla los selectores de campo con las cifras del pack ACTIVO (montos para las fórmulas).
  function refrescarPickers() {
    const m = montos();
    $("#cx-izq").innerHTML = optCampos(m);
    $("#cx-a").innerHTML = optCampos(m);
    $("#cx-b").innerHTML = optCampos(m, "", true);
    $("#cx-campo").innerHTML = optCampos(campos(), "", false);
  }

  async function cargar() {
    pack = await cargarPack(registro.find((j) => j.id === jurId));
    if (!Array.isArray(pack.cruces)) pack.cruces = [];
    refrescarPickers();
    limpiarForm();
    renderLista();
  }

  $("#cx-jur").onchange = (e) => { jurId = e.target.value; cargar(); };
  ["#cx-nom", "#cx-cond", "#cx-tipo", "#cx-izq", "#cx-comp", "#cx-tol", "#cx-a", "#cx-op", "#cx-b",
   "#cx-campo", "#cx-debe", "#cx-cons", "#cx-ref", "#cx-activo"].forEach((s) => {
    const el = $(s); el.addEventListener("input", actualizarPreview); el.addEventListener("change", actualizarPreview);
  });
  $("#cx-nuevo").onclick = limpiarForm;
  $("#cx-save").onclick = () => {
    const spec = specDesdeForm();
    const i = pack.cruces.findIndex((c) => String(c.id) === String(spec.id));
    if (i >= 0) pack.cruces[i] = spec; else pack.cruces.push(spec);
    persistir();
    limpiarForm();
  };

  // Si el editor de Cifras agrega/edita campos, recargá (refresca los selectores). Reemplazá
  // el listener anterior para no acumularlos al re-abrir Admin (evita el leak).
  if (_camposListener) window.removeEventListener("selega:campos", _camposListener);
  _camposListener = (e) => { if (!e.detail || e.detail.jurId === jurId) cargar(); };
  window.addEventListener("selega:campos", _camposListener);

  await cargar();
}
