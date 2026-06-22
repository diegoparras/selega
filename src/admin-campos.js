// admin-campos.js — Editor VISUAL de las CIFRAS (campos) del control, por jurisdicción.
// Las cifras dejan de estar hardcodeadas: son DATA del pack (como cruces y checklist).
// El admin edita nombre/tipo/grupo o agrega cifras nuevas (ej. una reserva, una nota).
// El id NO se cambia una vez creado: los cruces lo referencian.
import { cargarPack, guardarPackCustom } from "./rules/loader.js";
import { CAMPOS } from "./core/schema.js";
import { esc } from "./util.js";
import { aviso, confirmar } from "./modal.js";

const TIPOS = [["monto", "Monto ($)"], ["enum", "Opciones (lista)"], ["bool", "Sí / No"]];
const ESTADOS = ["ESP", "EEPN", "ER", "EFE", "Anexo", "Informe", "Carátula", "Notas"];

export async function montarConstructorCampos(host, registro, onChange) {
  let jurId = registro[0].id, pack = null;

  host.innerHTML = `
    <div class="panel">
      <h2>Cifras del control</h2>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <label class="badge">Jurisdicción</label>
        <select id="cm-jur">${registro.map((j) => `<option value="${j.id}">${esc(j.provincia)} — ${esc(j.consejo)}</option>`).join("")}</select>
        <span id="cm-origen" class="badge"></span>
      </div>
      <p class="adm-hint">Las cifras que el agente carga y que los cruces usan. Editá nombre, grupo o tipo, o agregá nuevas. El <strong>id</strong> no se cambia (los cruces lo referencian).</p>
      <div class="cm-head"><span>id</span><span>Nombre visible</span><span>Grupo</span><span>Tipo</span><span>Opciones</span><span></span></div>
      <div id="cm-lista" class="cm-lista"></div>
      <div class="cm-add">
        <span class="adm-hint">Agregar una cifra nueva:</span>
        <div class="adm-acciones">
          <input id="cm-id" placeholder="id (ej. reserva_legal)" style="width:160px">
          <input id="cm-label" placeholder="Nombre visible">
          <select id="cm-estado">${ESTADOS.map((e) => `<option>${e}</option>`).join("")}</select>
          <select id="cm-tipo">${TIPOS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
          <input id="cm-opciones" placeholder="opciones (coma) si es lista" style="width:200px">
          <button id="cm-add">Agregar cifra</button>
        </div>
      </div>
    </div>`;

  const $ = (s) => host.querySelector(s);

  function render() {
    $("#cm-origen").textContent = pack._origen === "custom" ? "custom (editado)" : "del repo / semilla";
    const campos = pack.campos || [];
    $("#cm-lista").innerHTML = campos.map((c, i) => `
      <div class="cm-row" data-i="${i}">
        <code class="cm-id" title="${esc(c.id)}">${esc(c.id)}</code>
        <input class="cm-f" data-k="label" data-i="${i}" value="${esc(c.label || "")}">
        <select class="cm-f" data-k="estado" data-i="${i}">${ESTADOS.map((e) => `<option ${e === c.estado ? "selected" : ""}>${e}</option>`).join("")}</select>
        <select class="cm-f" data-k="tipo" data-i="${i}">${TIPOS.map(([v, l]) => `<option value="${v}" ${v === c.tipo ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input class="cm-f cm-op" data-k="opciones" data-i="${i}" value="${esc((c.opciones || []).join(", "))}" placeholder="opciones" ${c.tipo === "enum" ? "" : 'style="visibility:hidden"'}>
        <button class="cm-del" data-i="${i}" title="Quitar" aria-label="Quitar">✕</button>
      </div>`).join("") || `<p class="adm-hint">Sin cifras. Agregá la primera abajo.</p>`;

    $("#cm-lista").querySelectorAll(".cm-f").forEach((el) => el.onchange = () => {
      const i = +el.dataset.i, k = el.dataset.k, c = pack.campos[i];
      if (k === "opciones") c.opciones = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      else c[k] = el.value;
      if (k === "tipo") { if (el.value !== "enum") delete c.opciones; else if (!c.opciones) c.opciones = []; persistir(); render(); return; }
      persistir();
    });
    $("#cm-lista").querySelectorAll(".cm-del").forEach((b) => b.onclick = async () => {
      const c = pack.campos[+b.dataset.i];
      if (!(await confirmar("Quitar cifra", `¿Quitar "${c.label}"? Los cruces que la usan dejarán de cerrar.`, { peligro: true, okText: "Quitar" }))) return;
      pack.campos.splice(+b.dataset.i, 1); persistir(); render();
    });
  }

  async function persistir() {
    // Re-leé el pack más fresco y superponé SOLO los campos (no pisar cruces/checklist de otra solapa).
    let latest = null;
    try { const r = await fetch(`/api/packs/${encodeURIComponent(jurId)}`); if (r.ok) { const j = await r.json(); if (j && Object.keys(j).length) latest = j; } } catch { /* sin custom aún */ }
    const out = latest ? { ...latest, campos: pack.campos } : pack;
    out._origen = "custom";
    try { await guardarPackCustom(jurId, out); pack = out; }
    catch (e) { aviso("No se pudo guardar", "No se pudo guardar en el servidor: " + e.message); return; }
    // Avisá a las otras solapas (cruces) que las cifras cambiaron → refrescan sus selectores.
    window.dispatchEvent(new CustomEvent("selega:campos", { detail: { jurId } }));
    onChange?.();
  }

  $("#cm-add").onclick = () => {
    const id = $("#cm-id").value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const label = $("#cm-label").value.trim();
    if (!id || !label) { aviso("Faltan datos", "Cargá id y nombre."); return; }
    if (pack.campos.some((c) => c.id === id)) { aviso("ID repetido", "Ya existe una cifra con ese id."); return; }
    const tipo = $("#cm-tipo").value;
    const c = { id, label, estado: $("#cm-estado").value, tipo };
    if (tipo === "enum") c.opciones = $("#cm-opciones").value.split(",").map((s) => s.trim()).filter(Boolean);
    pack.campos.push(c);
    $("#cm-id").value = ""; $("#cm-label").value = ""; $("#cm-opciones").value = "";
    persistir(); render();
  };

  async function cargar() {
    pack = await cargarPack(registro.find((j) => j.id === jurId));
    if (!Array.isArray(pack.campos) || !pack.campos.length) pack.campos = CAMPOS.map((c) => ({ ...c }));
    render();
  }
  $("#cm-jur").onchange = (e) => { jurId = e.target.value; cargar(); };
  await cargar();
}
