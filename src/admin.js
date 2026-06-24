// admin.js — Pantalla de administración: reglas por jurisdicción, capa LLM (gateada)
// y gestión de usuarios (4 niveles + límites) persistida en Postgres vía /api/admin.
import { cargarPack, guardarPackCustom, borrarPackCustom } from "./rules/loader.js";
import { esc, eyeify } from "./util.js";
import { montarConstructorCampos } from "./admin-campos.js";
import { montarConstructorCruces } from "./admin-cruces.js";
import { montarConstructorChecklist } from "./admin-checklist.js";
import { aviso, confirmar } from "./modal.js";

export function montarAdmin(cont, registro, onChange, rol) {
  // Un admin no es superadmin: no debe poder crear ni promover a superadmin (el server también
  // lo rechaza). El superadmin sí ve la opción. Default conservador si no llega el rol.
  const esSuper = rol === "superadmin";
  cont.innerHTML = `
    <div class="adm">
      <div class="adm-head">
        <div>
          <h2 class="adm-title">Administración</h2>
          <p class="adm-sub">Reglas, capa de IA y usuarios del Consejo. Los cambios afectan a la jurisdicción seleccionada.</p>
        </div>
        <button class="ghost" id="adm-volver">← Volver al control</button>
      </div>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Cifras del control</span><span class="bq-chip neutral">campos</span></summary>
        <div class="bq-body"><div id="adm-campos-host"></div></div>
      </details>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Cruces numéricos</span><span class="bq-chip neutral">constructor visual</span></summary>
        <div class="bq-body"><div id="adm-cruces-host"></div></div>
      </details>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Controles formales</span><span class="bq-chip neutral">checklist</span></summary>
        <div class="bq-body"><div id="adm-checklist-host"></div></div>
      </details>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Procesamiento con IA</span><span class="bq-chip neutral" id="adm-chip-ia">—</span></summary>
        <div class="bq-body">
          <div class="warn-box">Si lo activás, las imágenes/texto del balance se envían a la nube (OpenRouter) para extracción. Por defecto Selega es 100% local. Activalo solo con autorización del Consejo y para los casos que lo justifiquen. La API key vive en el servidor (nunca llega al navegador).</div>
          <div class="adm-grid">
            <label>Habilitado</label>
            <div><label class="switch"><input type="checkbox" id="llm-on"><span class="track"></span></label> <span id="llm-keystatus" class="adm-hint"></span></div>
            <label>API key OpenRouter</label><input id="llm-key" type="password" placeholder="sk-or-… (dejá vacío para no cambiarla)">
            <label>Modelo (con visión)</label><select id="llm-model"><option value="">cargando modelos…</option></select>
          </div>
          <div id="llm-costo" class="adm-costo"></div>
          <div class="adm-acciones">
            <button id="llm-save">Guardar configuración IA</button>
            <button id="llm-refresh" class="ghost" title="Releer el catálogo de modelos de OpenRouter en vivo">Actualizar modelos</button>
          </div>
        </div>
      </details>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Flujo de trabajo</span><span class="bq-chip neutral" id="adm-chip-flujo">—</span></summary>
        <div class="bq-body">
          <div class="adm-grid">
            <label>Revisión del supervisor</label>
            <div><label class="switch"><input type="checkbox" id="cfg-revision"><span class="track"></span></label>
              <span class="adm-hint">Si está activo, los controles del agente quedan <strong>pendientes</strong> hasta que un supervisor los apruebe.</span></div>
          </div>
          <div class="adm-acciones"><button id="flujo-save">Guardar flujo</button></div>
        </div>
      </details>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Usuarios y límites de uso</span><span class="bq-chip neutral" id="adm-chip-users">0</span></summary>
        <div class="bq-body">
          <p class="adm-hint">4 niveles: <strong>agente</strong> controla lo suyo · <strong>supervisor</strong> ve la bandeja de todos y firma · <strong>auditor</strong> solo lectura · <strong>admin</strong> configura. Persisten en Postgres (compartidos en el Consejo).</p>
          <table class="users">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Límite IA</th><th>Usados</th><th></th></tr></thead>
            <tbody id="adm-users"></tbody>
          </table>
          <div class="adm-acciones">
            <input id="u-email" placeholder="email@consejo.org.ar">
            <input id="u-pass" type="password" placeholder="contraseña" style="width:140px">
            <select id="u-role">
              <option value="agente">Agente</option>
              <option value="supervisor">Supervisor</option>
              <option value="auditor">Auditor</option>
              <option value="admin">Admin</option>
              ${esSuper ? '<option value="superadmin">Superadmin</option>' : ""}
            </select>
            <input id="u-lim" type="number" placeholder="límite IA" style="width:110px">
            <button id="u-add">Agregar usuario</button>
          </div>
        </div>
      </details>

      <details class="bloque adm-bloque">
        <summary><span class="bq-tit">Reglas por jurisdicción</span><span class="bq-chip neutral" id="adm-chip-reglas">JSON avanzado</span></summary>
        <div class="bq-body">
          <div class="adm-acciones">
            <select id="adm-jur">${registro.map((j) => `<option value="${j.id}">${j.provincia} — ${j.consejo}</option>`).join("")}</select>
            <button id="adm-cargar" class="ghost">Cargar pack</button>
            <button id="adm-guardar">Guardar como custom</button>
            <button id="adm-reset" class="ghost">Volver al original</button>
          </div>
          <p class="adm-hint">Editá el JSON del catálogo de controles, cruces y consecuencias. Se guarda en el servidor y pisa al del repo para esa jurisdicción.</p>
          <textarea id="adm-json" class="adm-json"></textarea>
        </div>
      </details>
    </div>
  `;

  montarConstructorCampos(cont.querySelector("#adm-campos-host"), registro, onChange);
  montarConstructorCruces(cont.querySelector("#adm-cruces-host"), registro, onChange);
  montarConstructorChecklist(cont.querySelector("#adm-checklist-host"), registro, onChange);

  const jurSel = cont.querySelector("#adm-jur");
  const ta = cont.querySelector("#adm-json");
  const chipReglas = cont.querySelector("#adm-chip-reglas");
  const cargar = async () => {
    const jur = registro.find((j) => j.id === jurSel.value);
    const pack = await cargarPack(jur);
    ta.value = JSON.stringify(pack, null, 2);
    const custom = pack._origen === "custom";
    chipReglas.textContent = custom ? "custom" : "original";
    chipReglas.className = "bq-chip " + (custom ? "warn" : "neutral");
  };
  cont.querySelector("#adm-cargar").onclick = cargar;
  cont.querySelector("#adm-guardar").onclick = async () => {
    let obj;
    try { obj = JSON.parse(ta.value); } catch (e) { aviso("JSON inválido", e.message); return; }
    try { await guardarPackCustom(jurSel.value, obj); aviso("Pack guardado", "Pack custom guardado para " + jurSel.value); onChange?.(); }
    catch (e) { aviso("No se pudo guardar", e.message); }
  };
  cont.querySelector("#adm-reset").onclick = async () => {
    try { await borrarPackCustom(jurSel.value); } catch (e) { aviso("No se pudo restablecer", e.message); return; }
    cargar(); onChange?.();
  };
  jurSel.onchange = cargar; cargar();

  // Flujo de trabajo: ¿los controles requieren visto del supervisor? (flag del Consejo)
  const chipFlujo = cont.querySelector("#adm-chip-flujo");
  async function cargarFlujo() {
    try {
      const c = await (await fetch("/api/admin/config")).json();
      const on = !!c.requiere_revision;
      cont.querySelector("#cfg-revision").checked = on;
      chipFlujo.textContent = on ? "con revisión" : "directo";
      chipFlujo.className = "bq-chip " + (on ? "warn" : "ok");
    } catch { /* sin config: queda en off */ }
  }
  cont.querySelector("#flujo-save").onclick = async () => {
    try {
      const r = await fetch("/api/admin/config", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiere_revision: cont.querySelector("#cfg-revision").checked }) });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      aviso("Flujo guardado", "Los usuarios verán el cambio al volver a entrar.");
      cargarFlujo();
    } catch (e) { aviso("No se pudo guardar", e.message); }
  };
  cargarFlujo();

  let llmEnabledPrev = false, modelosVision = [], gastoTotal = 0;
  const fmt1M = (p) => p ? `entrada $${(+p.prompt * 1e6).toFixed(2)} / salida $${(+p.completion * 1e6).toFixed(2)} por 1M tok` : "precio n/d";
  function pintarCosto() {
    const id = cont.querySelector("#llm-model").value;
    const p = (modelosVision.find((x) => x.id === id) || {}).pricing;
    const previsto = p ? (+p.prompt * 3000 + +p.completion * 600) : null; // lectura típica con visión
    cont.querySelector("#llm-costo").innerHTML =
      `<strong>${esc(id)}</strong>: ${fmt1M(p)}.<br>` +
      `Costo PREVISTO por balance (≈): <strong>${previsto != null ? "$" + previsto.toFixed(4) : "n/d"}</strong>` +
      ` · Costo INCURRIDO (Consejo): <strong>$${(gastoTotal || 0).toFixed(4)}</strong>.<br>` +
      `<span style="font-size:12px">Solo modelos que LEEN IMÁGENES (visión), del más barato al más caro.</span>`;
  }
  async function cargarLLM(refrescar) {
    try {
      const c = await (await fetch("/api/admin/config")).json();
      gastoTotal = c.gasto_total || 0;
      llmEnabledPrev = !!c.llm_enabled;
      cont.querySelector("#llm-on").checked = c.llm_enabled;
      const chipIA = cont.querySelector("#adm-chip-ia");
      chipIA.textContent = c.llm_enabled ? "en la nube" : "100% local";
      chipIA.className = "bq-chip " + (c.llm_enabled ? "warn" : "ok");
      cont.querySelector("#llm-keystatus").textContent = c.key_from_env ? "key desde variable de entorno (servidor)"
        : c.key_set ? "key cargada en el servidor ✓ · requiere además autorización por documento"
        : "sin API key — cargá una abajo";
      const sel = cont.querySelector("#llm-model"), hayKey = c.key_set || c.key_from_env;
      // Los modelos se leen EN VIVO de OpenRouter, pero recién cuando hay API key.
      if (!hayKey) {
        modelosVision = [];
        sel.innerHTML = `<option value="${esc(c.llm_model || "")}">— cargá la API key para ver los modelos —</option>`;
        sel.disabled = true;
        cont.querySelector("#llm-refresh").style.display = "none";
        cont.querySelector("#llm-costo").innerHTML = "Cargá la API key de OpenRouter (abajo) y guardá: ahí aparecen los modelos con visión y sus costos.";
        return;
      }
      sel.disabled = false;
      cont.querySelector("#llm-refresh").style.display = "";
      try { modelosVision = await (await fetch("/api/llm/modelos" + (refrescar ? "?refresh=1" : ""))).json(); } catch { modelosVision = []; }
      const actual = c.llm_model || "openai/gpt-4o-mini";
      const opts = [...modelosVision];
      if (!opts.some((m) => m.id === actual)) opts.unshift({ id: actual, name: actual + " (configurado)", pricing: c.pricing });
      sel.innerHTML = opts.map((m) => `<option value="${esc(m.id)}" ${m.id === actual ? "selected" : ""}>${esc(m.name || m.id)} — ${fmt1M(m.pricing)}</option>`).join("");
      sel.onchange = pintarCosto;
      pintarCosto();
    } catch (e) { cont.querySelector("#llm-costo").textContent = "No se pudo leer la config del servidor: " + e.message; }
  }
  cont.querySelector("#llm-refresh").onclick = () => cargarLLM(true);
  cargarLLM();
  cont.querySelector("#llm-save").onclick = async () => {
    const on = cont.querySelector("#llm-on").checked;
    if (on && !llmEnabledPrev &&
        !(await confirmar("Habilitar IA en la nube", "Vas a habilitar el envío del texto de balances a la nube (OpenRouter). ¿Confirmás que tenés autorización del Consejo?", { okText: "Sí, tengo autorización" }))) {
      cont.querySelector("#llm-on").checked = false; return;
    }
    const body = { llm_enabled: on, llm_model: cont.querySelector("#llm-model").value.trim() || "openai/gpt-4o-mini" };
    const key = cont.querySelector("#llm-key").value.trim();
    if (key) body.openrouter_key = key;
    try {
      const r = await fetch("/api/admin/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      cont.querySelector("#llm-key").value = "";
      aviso("Configuración guardada", "Configuración de IA guardada. Estado: " + (on ? "HABILITADO" : "deshabilitado"));
      cargarLLM();
    } catch (e) { aviso("No se pudo guardar", e.message); }
  };

  const tbody = cont.querySelector("#adm-users");
  const ROLES_ALL = [["agente", "Agente"], ["supervisor", "Supervisor"], ["auditor", "Auditor"], ["admin", "Admin"], ["superadmin", "Superadmin"]];
  // El admin no ve/ofrece el rol superadmin en el selector de edición (el server filtra el listado).
  const ROLES = esSuper ? ROLES_ALL : ROLES_ALL.filter(([v]) => v !== "superadmin");
  const rolLabel = (r) => r === "funcional" ? "Agente" : (ROLES.find((x) => x[0] === r)?.[1] || r);
  const apiUsers = async (metodo, id, body) => {
    const url = "/api/admin/users" + (id ? "/" + id : "");
    const r = await fetch(url, { method: metodo, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    return r.json().catch(() => ({}));
  };
  const pintarUsers = async () => {
    let us = [];
    try { us = await (await fetch("/api/admin/users")).json(); } catch { us = []; }
    tbody.innerHTML = us.map((u) => {
      const rol = u.role === "funcional" ? "agente" : u.role;
      const opts = ROLES.map(([v, l]) => `<option value="${v}" ${v === rol ? "selected" : ""}>${l}</option>`).join("");
      return `<tr>
        <td>${esc(u.email)}${u.activo === false ? ' <span class="adm-hint">(inactivo)</span>' : ""}</td>
        <td><select class="u-role-edit" data-id="${u.id}">${opts}</select></td>
        <td><input class="u-lim-edit" data-id="${u.id}" type="number" value="${u.limite || 0}" style="width:80px"></td>
        <td>${u.usados || 0}</td>
        <td><a class="link u-del" data-id="${u.id}">borrar</a></td></tr>`;
    }).join("") || `<tr><td colspan="5" style="color:var(--muted)">Sin usuarios cargados.</td></tr>`;
    const chipU = cont.querySelector("#adm-chip-users");
    chipU.textContent = us.length || "0"; chipU.className = "bq-chip neutral";
    tbody.querySelectorAll(".u-del").forEach((a) => a.onclick = async () => {
      const u = us.find((x) => String(x.id) === a.dataset.id);
      if (!(await confirmar("Borrar usuario", `¿Borrar a ${u?.email}? Pierde el acceso al sistema.`, { peligro: true, okText: "Borrar" }))) return;
      try { await apiUsers("DELETE", a.dataset.id); pintarUsers(); } catch (e) { aviso("No se pudo borrar", e.message); }
    });
    tbody.querySelectorAll(".u-role-edit").forEach((sel) => sel.onchange = async () => {
      try { await apiUsers("PUT", sel.dataset.id, { role: sel.value }); } catch (e) { aviso("No se pudo cambiar el rol", e.message); pintarUsers(); }
    });
    tbody.querySelectorAll(".u-lim-edit").forEach((inp) => inp.onchange = async () => {
      try { await apiUsers("PUT", inp.dataset.id, { limite: +inp.value | 0 }); } catch (e) { aviso("No se pudo guardar el límite", e.message); }
    });
  };
  cont.querySelector("#u-add").onclick = async () => {
    const email = cont.querySelector("#u-email").value.trim();
    const pass = cont.querySelector("#u-pass").value;
    const role = cont.querySelector("#u-role").value;
    const limite = +cont.querySelector("#u-lim").value || 0;
    if (!email || !pass) { aviso("Faltan datos", "Cargá email y contraseña."); return; }
    try {
      await apiUsers("POST", null, { email, pass, role, limite });
      cont.querySelector("#u-email").value = ""; cont.querySelector("#u-pass").value = ""; cont.querySelector("#u-lim").value = "";
      pintarUsers();
    } catch (e) { aviso("No se pudo crear", e.message); }
  };
  pintarUsers();
  eyeify(cont);   // ojito en contraseña de alta de usuario y API key de IA

  cont.querySelector("#adm-volver").onclick = () => {
    cont.classList.add("hidden");
    document.querySelector("#vista-inicio").classList.remove("hidden");
  };
}
