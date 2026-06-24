// super.js — Panel del SUPERADMIN: comisiona el sistema según el server donde se instala.
// Define qué jurisdicciones atiende esta instalación y qué MOTORES de reconocimiento
// están prendidos (OCR / tanque local Ollama / nube), con sonda de disponibilidad en vivo.
// Distinto del admin (que hace la config FUNCIONAL: reglas, usuarios).
import { esc } from "./util.js";
import { aviso, confirmar } from "./modal.js";
import { cargarRegistro } from "./rules/loader.js";

const ROUTINGS = [
  ["local-first", "Local primero, nube si falla"],
  ["solo-local", "Solo local (sin nube)"],
  ["nube-first", "Nube primero, local si falla"],
  ["solo-nube", "Solo nube"],
];

export async function montarSuper(cont, registro, onChange) {
  let cfg = { jurisdicciones: [], cap_vlm_local: false, ollama_url: "", ollama_model: "", ollama_keep: "demanda", ia_routing: "local-first", cap_ocr: true, data_collection_deny: true, cap_firma: false };
  try { cfg = { ...cfg, ...(await (await fetch("/api/super/config")).json()) }; } catch { /* defaults */ }
  const jurSet = new Set(cfg.jurisdicciones || []);

  cont.innerHTML = `
    <div class="adm">
      <div class="adm-head">
        <div>
          <h2 class="adm-title">Sistema</h2>
          <p class="adm-sub">Comisión del despliegue: motores de reconocimiento y jurisdicciones, según el server donde corre. El admin hace la config funcional (reglas, usuarios).</p>
        </div>
        <button class="ghost" id="sup-volver">← Volver</button>
      </div>

      <details class="bloque adm-bloque" open>
        <summary><span class="bq-tit">Entes (jurisdicciones)</span><span class="bq-chip neutral" id="sup-chip-jur">${jurSet.size || "todas"}</span></summary>
        <div class="bq-body">
          <p class="adm-hint">Tildá las que atiende esta instalación (vacío = todas; los agentes solo ven las tildadas). Podés renombrar cualquiera o agregar un ente que no esté en la lista.</p>
          <div id="sup-jur-list" class="sup-jurlist"></div>
          <div class="adm-acciones"><button id="sup-jur-save">Guardar habilitadas</button></div>
          <div class="sup-jur-add">
            <span class="adm-hint">Agregar un ente que no está en la lista de provincias:</span>
            <div class="adm-acciones">
              <input id="sup-nj-id" placeholder="ID (ej. AR-XX)" style="width:120px">
              <input id="sup-nj-prov" placeholder="Provincia / zona">
              <input id="sup-nj-cons" placeholder="Nombre del Consejo / ente">
              <button id="sup-nj-add">Agregar ente</button>
            </div>
          </div>
        </div>
      </details>

      <details class="bloque adm-bloque" open>
        <summary><span class="bq-tit">Motores de reconocimiento</span><span class="bq-chip neutral" id="sup-chip-mot">—</span></summary>
        <div class="bq-body">
          <div class="sup-motor">
            <div class="sup-motor-h"><strong>Texto nativo + OCR</strong><span class="sup-badge ok">siempre</span></div>
            <p class="adm-hint">pdf.js (texto nativo) + Tesseract por región — corren en el navegador, sin costo. Es el camino por defecto.</p>
          </div>

          <div class="sup-motor">
            <div class="sup-motor-h"><strong>Tanque local (Ollama)</strong><span class="sup-badge" id="sup-local-badge">…</span></div>
            <p class="adm-hint">Modelo de visión local en CPU (Gemma/Qwen-VL). Para escaneados y formatos nuevos, sin que el balance salga del server. Gratis: es la escalada (Nivel 2).</p>
            <div class="adm-grid">
              <label>Estado del modelo</label>
              <select id="sup-local-estado">
                <option value="off">Apagado</option>
                <option value="demanda">Bajo demanda (carga al usarlo, ~2 min la 1ª vez)</option>
                <option value="siempre">Siempre cargado (queda en RAM, ~8 s siempre · usa más RAM)</option>
              </select>
              <label>URL de Ollama</label><input id="sup-ollama-url" value="${esc(cfg.ollama_url)}" placeholder="http://host.docker.internal:11434">
              <label>Modelo</label><select id="sup-ollama-model"><option value="${esc(cfg.ollama_model)}">${esc(cfg.ollama_model || "—")}</option></select>
            </div>
            <div class="adm-acciones"><button class="ghost" id="sup-probar">Probar conexión</button><span id="sup-probe-msg" class="adm-hint"></span></div>
          </div>

          <div class="sup-motor">
            <div class="sup-motor-h"><strong>Nube (OpenRouter)</strong><span class="sup-badge" id="sup-nube-badge">…</span></div>
            <p class="adm-hint">Gateada: se configura la API key en Admin → Procesamiento con IA. Acá solo se ve el estado y entra en el routing.</p>
            <div class="adm-grid">
              <label>Privacidad del proveedor</label>
              <select id="sup-datacol">
                <option value="deny">No retener: el proveedor no guarda ni entrena con el balance (recomendado)</option>
                <option value="allow">Permitir retención: solo si controlás el destino del modelo</option>
              </select>
            </div>
            <p class="adm-hint">Por defecto Selega exige proveedores que NO conservan el prompt (los EECC son datos de terceros). Cambialo solo si sabés a qué modelo va.</p>
          </div>

          <div class="adm-grid">
            <label>Política de routing</label>
            <select id="sup-routing">${ROUTINGS.map(([v, l]) => `<option value="${v}" ${cfg.ia_routing === v ? "selected" : ""}>${l}</option>`).join("")}</select>
          </div>
          <div class="adm-acciones"><button id="sup-save">Guardar motores</button></div>
        </div>
      </details>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Firma electrónica</span><span class="bq-chip neutral" id="sup-chip-firma">—</span></summary>
        <div class="bq-body">
          <p class="adm-hint">Verificación de firma digital de PDFs (PAdES) contra raíces de confianza. Apagada por defecto. El PDF se procesa local y NO se persiste. Al activarla aparece la verificación de firma en los expedientes.</p>
          <div class="adm-grid">
            <label>Verificación de firma</label>
            <select id="sup-firma">
              <option value="off">Apagada</option>
              <option value="on">Activada</option>
            </select>
          </div>
          <p class="adm-hint" id="sup-firma-roots">—</p>
        </div>
      </details>
    </div>`;

  cont.querySelector("#sup-volver").onclick = () => onChange?.("volver");
  // Estado del tanque: off / demanda / siempre (combina el toggle y el modo de carga).
  cont.querySelector("#sup-local-estado").value = cfg.cap_vlm_local ? (cfg.ollama_keep || "demanda") : "off";
  cont.querySelector("#sup-datacol").value = cfg.data_collection_deny ? "deny" : "allow";
  // Firma electrónica: toggle con guardado inmediato (cap_firma, gateado server-side).
  cont.querySelector("#sup-firma").value = cfg.cap_firma ? "on" : "off";
  cont.querySelector("#sup-firma").onchange = async (e) => {
    const on = e.target.value === "on";
    try {
      const r = await fetch("/api/super/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cap_firma: on }) });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      cfg.cap_firma = on;
      await aviso(on ? "Firma activada" : "Firma apagada", on ? "La verificación de firma queda disponible en los expedientes." : "La verificación de firma queda oculta.");
      refrescarMotores(false);
    } catch (err) { aviso("No se pudo guardar", err.message); e.target.value = cfg.cap_firma ? "on" : "off"; }
  };

  // ---- Sonda de motores (enabled ≠ available) ----
  const badge = (el, ok, txt) => { el.className = "sup-badge " + (ok ? "ok" : "bad"); el.textContent = txt; };
  async function refrescarMotores(forzarModelos) {
    try {
      const m = await (await fetch("/api/super/motores")).json();
      const lb = cont.querySelector("#sup-local-badge");
      badge(lb, m.local.available, m.local.available ? "conectado" : "no responde");
      const nb = cont.querySelector("#sup-nube-badge");
      badge(nb, m.nube.available, m.nube.enabled ? (m.nube.available ? "activa" : "sin key") : "apagada");
      cont.querySelector("#sup-chip-mot").textContent =
        [m.local.enabled && m.local.available && "local", m.nube.enabled && m.nube.available && "nube"].filter(Boolean).join(" + ") || "solo OCR";
      // estado de la firma electrónica
      if (m.firma) {
        const fch = cont.querySelector("#sup-chip-firma");
        if (fch) { fch.textContent = m.firma.enabled ? "activada" : "apagada"; fch.className = "bq-chip " + (m.firma.enabled ? "ok" : "neutral"); }
        const fr = cont.querySelector("#sup-firma-roots");
        if (fr) fr.textContent = m.firma.roots != null ? `${m.firma.roots} raíz(es) de confianza cargada(s).` : "";
      }
      // poblar modelos disponibles en Ollama
      const sel = cont.querySelector("#sup-ollama-model");
      if (forzarModelos && m.local.modelos.length) {
        const actual = sel.value;
        sel.innerHTML = m.local.modelos.map((n) => `<option value="${esc(n)}" ${n === actual ? "selected" : ""}>${esc(n)}</option>`).join("");
      }
      return m;
    } catch { /* sonda silenciosa */ }
  }
  refrescarMotores(true);

  cont.querySelector("#sup-probar").onclick = async () => {
    const msg = cont.querySelector("#sup-probe-msg"); msg.textContent = "probando…";
    // guardar la URL antes de sondear (así prueba la que está escrita)
    await fetch("/api/super/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ollama_url: cont.querySelector("#sup-ollama-url").value.trim() }) });
    const m = await refrescarMotores(true);
    msg.textContent = m?.local.available ? `OK — ${m.local.modelos.length} modelo(s): ${m.local.modelos.join(", ")}` : `No responde${m?.local.error ? " (" + m.local.error + ")" : ""}`;
  };

  // ---- Entes (jurisdicciones): tildar habilitadas + renombrar + agregar nuevos ----
  let entes = registro.slice();                 // lista mergeada (fijos + DB)
  let dbIds = new Set();                         // ids que viven en la DB (custom/override → borrables)
  const guardarEnte = async (id, provincia, consejo) => {
    const r = await fetch("/api/super/jurisdicciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, provincia, consejo }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    onChange?.(); // que app.js recargue el registro al navegar
  };
  function pintarEntes() {
    const cont2 = cont.querySelector("#sup-jur-list");
    cont2.innerHTML = entes.map((j) => {
      const custom = dbIds.has(j.id);   // fijo = gris · agregado/renombrado = bordó (Selega)
      return `
      <div class="sup-jurrow ${custom ? "custom" : "fijo"}" data-id="${esc(j.id)}">
        <input type="checkbox" class="sup-jur-chk" value="${esc(j.id)}" ${jurSet.has(j.id) ? "checked" : ""}>
        <input class="sup-jur-prov" data-id="${esc(j.id)}" value="${esc(j.provincia || "")}" title="Provincia / zona">
        <input class="sup-jur-cons" data-id="${esc(j.id)}" value="${esc(j.consejo || "")}" title="Consejo / ente">
        ${custom
          ? `<button class="sup-jur-del" data-id="${esc(j.id)}" title="Quitar este ente" aria-label="Quitar"><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>`
          : `<span class="sup-jur-slot"></span>`}
      </div>`;
    }).join("");
    // renombrar (guarda al salir del campo) → crea override (fijo) o actualiza custom
    cont2.querySelectorAll(".sup-jur-prov, .sup-jur-cons").forEach((inp) => inp.onchange = async () => {
      const id = inp.dataset.id;
      const prov = cont2.querySelector(`.sup-jur-prov[data-id="${id}"]`).value.trim();
      const cons = cont2.querySelector(`.sup-jur-cons[data-id="${id}"]`).value.trim();
      try { await guardarEnte(id, prov, cons); dbIds.add(id); pintarEntes(); } catch (e) { aviso("No se pudo guardar", e.message); }
    });
    cont2.querySelectorAll(".sup-jur-del").forEach((a) => a.onclick = async () => {
      if (!(await confirmar("Quitar ente", "Si era un override, vuelve al nombre original; si era un ente nuevo, se elimina. ¿Seguir?", { peligro: true, okText: "Quitar" }))) return;
      try { const r = await fetch(`/api/super/jurisdicciones/${encodeURIComponent(a.dataset.id)}`, { method: "DELETE" }); if (!r.ok) throw new Error(`Error ${r.status}`); await recargarEntes(); onChange?.(); }
      catch (e) { aviso("No se pudo quitar", e.message); }
    });
  }
  async function recargarEntes() {
    try { dbIds = new Set((await (await fetch("/api/jurisdicciones")).json()).map((j) => j.id)); } catch { dbIds = new Set(); }
    try { entes = await cargarRegistro(); } catch { /* deja la lista previa */ }
    pintarEntes();
  }
  recargarEntes();

  cont.querySelector("#sup-jur-save").onclick = async () => {
    const ids = [...cont.querySelectorAll("#sup-jur-list .sup-jur-chk:checked")].map((c) => c.value);
    try {
      const r = await fetch("/api/super/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jurisdicciones: ids }) });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      jurSet.clear(); ids.forEach((i) => jurSet.add(i));
      cont.querySelector("#sup-chip-jur").textContent = ids.length || "todas";
      await aviso("Habilitadas guardadas", "Los usuarios verán el cambio al volver a entrar.");
      onChange?.();
    } catch (e) { aviso("No se pudo guardar", e.message); }
  };
  cont.querySelector("#sup-nj-add").onclick = async () => {
    const id = cont.querySelector("#sup-nj-id").value.trim();
    const prov = cont.querySelector("#sup-nj-prov").value.trim();
    const cons = cont.querySelector("#sup-nj-cons").value.trim();
    if (!id || !prov || !cons) { aviso("Faltan datos", "Cargá id, provincia/zona y nombre del ente."); return; }
    try {
      await guardarEnte(id, prov, cons);
      cont.querySelector("#sup-nj-id").value = ""; cont.querySelector("#sup-nj-prov").value = ""; cont.querySelector("#sup-nj-cons").value = "";
      await recargarEntes();
    } catch (e) { aviso("No se pudo agregar", e.message); }
  };

  cont.querySelector("#sup-save").onclick = async () => {
    const estado = cont.querySelector("#sup-local-estado").value; // off | demanda | siempre
    const body = {
      cap_vlm_local: estado !== "off",
      ollama_keep: estado === "off" ? "demanda" : estado,
      ollama_url: cont.querySelector("#sup-ollama-url").value.trim(),
      ollama_model: cont.querySelector("#sup-ollama-model").value,
      ia_routing: cont.querySelector("#sup-routing").value,
      data_collection_deny: cont.querySelector("#sup-datacol").value === "deny",
    };
    try {
      const r = await fetch("/api/super/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      await aviso("Motores guardados", "La configuración de reconocimiento quedó aplicada.");
      refrescarMotores(false);
    } catch (e) { aviso("No se pudo guardar", e.message); }
  };
}
