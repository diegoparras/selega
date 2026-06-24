// api.js — Router de la API de Selega. Todo bajo /api/*. Auth por cookie firmada.
// El proxy /api/llm guarda la key server-side, valida límite por usuario y audita.
// Persistencia en PostgreSQL (db.js); los repo.* son async → await en cada uso.
import * as repo from "./db.js";
import { config } from "./config.js";
import { verifyPassword, signSession, verifySession } from "./auth.js";
import { extraerDePDF } from "./extraer.js";

// Niveles de usuario. 'funcional' queda como alias histórico de 'agente'.
// superadmin = comisiona el sistema (motores/jurisdicciones/infra); por encima de admin.
const ROLES = ["agente", "supervisor", "auditor", "admin", "superadmin"];

// Defaults de la capa de motores (se sobrescriben desde config por el superadmin).
const CAP_DEFAULTS = { cap_ocr: "1", cap_vlm_local: "0", ollama_url: "http://host.docker.internal:11434", ollama_model: "qwen2.5vl:3b", ia_routing: "local-first", ollama_keep: "demanda", data_collection_deny: config.dataCollectionDeny };
// keep_alive de Ollama: "siempre" = el modelo queda en RAM (rápido); "demanda" = carga al usarlo y se descarga tras 5 min.
const keepAlive = (modo) => (modo === "siempre" ? -1 : "5m");

// Anti-fuerza-bruta del login: lockout en memoria por email (escala on-prem, 1 proceso).
const loginFails = new Map(); // email -> { n, until }
const loginBloqueado = (email) => { const e = loginFails.get(email); return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 1000) : 0; };
function registrarFallo(email) {
  const e = loginFails.get(email) || { n: 0, until: 0 };
  e.n += 1;
  if (e.n >= 5) e.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (e.n - 5)); // 30s,1m,2m,4m… hasta 15m
  loginFails.set(email, e);
}
const limpiarFallos = (email) => loginFails.delete(email);

const json = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};
const readRaw = (req, maxBytes = 30e6) => new Promise((resolve, reject) => {
  const chunks = []; let total = 0, abortado = false;
  req.on("data", (c) => { total += c.length; if (total > maxBytes) { abortado = true; req.destroy(); reject(new Error("archivo demasiado grande")); } else chunks.push(c); });
  req.on("end", () => { if (!abortado) resolve(Buffer.concat(chunks)); });
  req.on("error", reject);
});
const readBody = (req, maxBytes = 2e6) => new Promise((resolve) => {
  let d = "", listo = false;
  const fin = (v) => { if (!listo) { listo = true; resolve(v); } };
  req.on("data", (c) => { d += c; if (d.length > maxBytes) req.destroy(); });
  req.on("end", () => { try { fin(d ? JSON.parse(d) : {}); } catch { fin({}); } });
  req.on("aborted", () => fin({}));
  req.on("error", () => fin({}));
  setTimeout(() => fin({}), 30000); // nunca colgar un handler por un body incompleto
});
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => {
  const i = c.indexOf("="); return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
}).filter((x) => x[0]));

// Modelos de OpenRouter (público, sin key). Cacheado 1h. Lista completa con arquitectura.
let _modelos = null, _modelosTs = 0;
async function modelosTodos(force = false) {
  if (!force && _modelos && Date.now() - _modelosTs < 3600e3) return _modelos;
  try {
    const data = await (await fetch("https://openrouter.ai/api/v1/models")).json();
    _modelos = data.data || [];
    _modelosTs = Date.now();
  } catch { _modelos = _modelos || []; }
  return _modelos;
}
async function preciosModelos() {
  return Object.fromEntries((await modelosTodos()).map((m) => [m.id, m.pricing]));
}
// ¿el modelo ve imágenes? (input_modalities incluye "image")
const esVision = (m) => (m.architecture?.input_modalities || []).includes("image")
  || /image/.test(m.architecture?.modality || "");

// Config de motores (con defaults). cap() devuelve string; jurisHabilitadas() el array.
const cap = async (k) => await repo.getConfig(k, CAP_DEFAULTS[k]);
async function jurisHabilitadas() {
  try { const j = JSON.parse(await repo.getConfig("jurisdicciones", "[]")); return Array.isArray(j) ? j : []; }
  catch { return []; }
}
// Sonda del tanque local: ¿responde Ollama? ¿qué modelos tiene? (enabled ≠ available)
async function probarOllama(url) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${url.replace(/\/$/, "")}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { up: false, modelos: [], error: `HTTP ${r.status}` };
    const d = await r.json();
    return { up: true, modelos: (d.models || []).map((m) => m.name) };
  } catch (e) { return { up: false, modelos: [], error: e.message }; }
}

async function currentUser(req) {
  const tok = cookies(req)[config.cookieName];
  const sess = verifySession(tok, await repo.sessionSecret());
  if (!sess) return null;
  const u = await repo.getUserByEmail(sess.email);
  return u && u.activo ? u : null;
}

export async function handle(req, res, path) {
  const seg = path.split("/").filter(Boolean); // ["api", ...]
  const m = req.method;

  // ---- auth ----
  if (path === "/api/auth/login" && m === "POST") {
    const { email, password } = await readBody(req);
    const espera = loginBloqueado(email);
    if (espera) return json(res, 429, { error: `Demasiados intentos. Probá de nuevo en ${espera}s.` });
    const u = await repo.getUserByEmail(email);
    if (!u || !u.activo || !verifyPassword(password, u.pass)) {
      registrarFallo(email);
      await repo.auditar(email || "?", null, "login_fallido");
      return json(res, 401, { error: "Credenciales inválidas" });
    }
    limpiarFallos(email);
    const tok = signSession({ email: u.email, exp: Date.now() + config.sessionTtlMs }, await repo.sessionSecret());
    res.setHeader("Set-Cookie", `${config.cookieName}=${tok}; HttpOnly; SameSite=Strict; Path=/${config.cookieSecure ? "; Secure" : ""}; Max-Age=${config.sessionTtlMs / 1000}`);
    await repo.auditar(u.email, null, "login");
    return json(res, 200, { email: u.email, role: u.role });
  }
  if (path === "/api/auth/logout" && m === "POST") {
    res.setHeader("Set-Cookie", `${config.cookieName}=; HttpOnly; Path=/; Max-Age=0`);
    return json(res, 200, { ok: true });
  }
  if (path === "/api/auth/me") {
    const u = await currentUser(req);
    if (!u) return json(res, 401, { error: "no autenticado" });
    // Flags NO sensibles del setup (la API key jamás se expone acá).
    const cloudOn = (await repo.getConfig("llm_enabled", "0")) === "1";
    const localOn = (await cap("cap_vlm_local")) === "1";
    return json(res, 200, { email: u.email, role: u.role, limite: u.limite, usados: u.usados,
      requiere_revision: (await repo.getConfig("requiere_revision", "0")) === "1",
      jurisdicciones: await jurisHabilitadas(),   // [] = todas (el superadmin scopea el install)
      ia_disponible: cloudOn || localOn });
  }

  // ---- extracción de PDF (local, no sale del contenedor; no requiere sesión) ----
  // ---- de acá en adelante requiere sesión ----
  const user = await currentUser(req);
  if (!user) return json(res, 401, { error: "no autenticado" });

  // ---- extracción de PDF (spawnea OCR): autenticada + límite de tamaño (anti-DoS). ----
  if (path === "/api/extraer" && m === "POST") {
    try {
      const buf = await readRaw(req, 30e6); // tope 30MB
      if (!buf.length) return json(res, 400, { error: "PDF vacío" });
      return json(res, 200, { cifras: await extraerDePDF(buf) });
    } catch (e) {
      return json(res, 500, { error: "No se pudo leer el PDF: " + e.message });
    }
  }

  // Jerarquía de niveles. 'funcional' = alias histórico de 'agente'.
  // agente: lo suyo · supervisor: bandeja global + firma · auditor: solo lectura ·
  // admin: config funcional (reglas/usuarios) · superadmin: comisiona el sistema (motores, jurisdicciones, infra).
  const esSuperadmin = user.role === "superadmin";
  const isAdmin = user.role === "admin" || esSuperadmin; // superadmin ⊇ admin
  const esSupervisor = user.role === "supervisor";
  const esAuditor = user.role === "auditor";
  const verTodo = isAdmin || esSupervisor || esAuditor; // bandeja global / vista de auditoría
  const soloLectura = esAuditor;                        // el auditor nunca escribe

  // ---- packs: LECTURA para cualquier usuario autenticado (el agente corre el pack).
  //      La escritura/borrado es admin-only (más abajo, en /api/admin/packs). ----
  if (seg[1] === "packs" && seg[2] && m === "GET") {
    return json(res, 200, (await repo.getPack(seg[2])) || null);
  }

  // ---- jurisdicciones custom/override (DB): el cliente las mergea sobre el registro fijo. ----
  if (path === "/api/jurisdicciones" && m === "GET") {
    return json(res, 200, await repo.listJurisdicciones());
  }

  // ---- plantillas: biblioteca compartida de formatos (un agente marca, todos ganan).
  //      Lectura y alta para cualquier agente; el borrado es admin (más abajo). ----
  if (path === "/api/plantillas" && m === "GET") {
    const jur = new URL(req.url, "http://x").searchParams.get("jur") || "";
    return json(res, 200, await repo.listPlantillas(jur));
  }
  if (path === "/api/plantillas" && m === "POST") {
    if (soloLectura) return json(res, 403, { error: "solo lectura" });
    const b = await readBody(req);
    const id = await repo.crearPlantilla({ nombre: b.nombre || "", jurisdiccion: b.jurisdiccion || "",
      fingerprint: JSON.stringify(b.fingerprint || []), campos: JSON.stringify(b.campos || {}), autor: user.email });
    await repo.auditar(user.email, null, "plantilla", b.nombre || "");
    return json(res, 201, { id });
  }

  // ---- trabajos ----
  if (path === "/api/trabajos" && m === "GET") {
    const all = verTodo && /[?&]all=1/.test(req.url);
    return json(res, 200, await (all ? repo.todosLosTrabajos() : repo.trabajosDe(user.email)));
  }
  if (path === "/api/trabajos" && m === "POST") {
    if (soloLectura) return json(res, 403, { error: "solo lectura" });
    const b = await readBody(req);
    const id = await repo.crearTrabajo({ ...b, usuario: user.email,
      cifras: JSON.stringify(b.cifras || {}), controles: JSON.stringify(b.controles || {}) });
    await repo.auditar(user.email, id, "crear_trabajo", b.comitente || "");
    return json(res, 201, { id });
  }
  if (seg[1] === "trabajos" && seg[2]) {
    const id = Number(seg[2]);
    const t = await repo.getTrabajo(id);
    if (!t) return json(res, 404, { error: "no existe" });
    // Lectura: dueño, o quien ve todo (supervisor/auditor/admin). Escritura: dueño o supervisor/admin.
    const esDueno = t.usuario === user.email;
    if (!esDueno && !verTodo) return json(res, 403, { error: "ajeno" });
    if (seg[3] === "audit") return json(res, 200, await repo.auditoriaDe(id));
    // Revisión del supervisor: aprobar / devolver (con nota → auditoría). Auditor y agente-dueño no.
    if (seg[3] === "revision" && m === "POST") {
      if (!(esSupervisor || isAdmin)) return json(res, 403, { error: "solo supervisor/admin" });
      const b = await readBody(req);
      const nuevo = b.accion === "aprobar" ? "aprobado" : b.accion === "devolver" ? "devuelto" : null;
      if (!nuevo) return json(res, 400, { error: "acción inválida" });
      await repo.setEstadoTrabajo(id, nuevo);
      await repo.auditar(user.email, id, `revision_${b.accion}`, b.nota || "");
      return json(res, 200, { ok: true, estado: nuevo });
    }
    if (m === "GET") return json(res, 200, { ...t, cifras: JSON.parse(t.cifras || "{}"), controles: JSON.parse(t.controles || "{}") });
    if (m === "PUT") {
      if (soloLectura || (!esDueno && !esSupervisor && !isAdmin)) return json(res, 403, { error: "sin permiso de edición" });
      const b = await readBody(req);
      await repo.actualizarTrabajo({ id, comitente: b.comitente ?? t.comitente, cuit: b.cuit ?? t.cuit,
        estado: b.estado ?? t.estado, desenlace: b.desenlace ?? t.desenlace,
        cifras: JSON.stringify(b.cifras ?? JSON.parse(t.cifras || "{}")),
        controles: JSON.stringify(b.controles ?? JSON.parse(t.controles || "{}")) });
      await repo.auditar(user.email, id, "guardar_trabajo", b.estado || "");
      return json(res, 200, { ok: true });
    }
  }

  // ---- precio del modelo configurado (público, para pre-vuelo de costo) ----
  if (path === "/api/llm/precio" && m === "GET") {
    const model = await repo.getConfig("llm_model", "openai/gpt-4o-mini");
    return json(res, 200, { model, pricing: (await preciosModelos())[model] || null });
  }

  // ---- modelos con VISIÓN (leen imágenes) + su precio. Para elegir en Admin.
  //      ?refresh=1 ignora el caché → relee el catálogo en vivo (por si se actualiza). ----
  if (path === "/api/llm/modelos" && m === "GET") {
    const vision = (await modelosTodos(/[?&]refresh=1/.test(req.url)))
      .filter((x) => esVision(x) && parseFloat(x.pricing?.prompt) >= 0 && x.id !== "openrouter/auto")
      .map((x) => ({ id: x.id, name: x.name, pricing: x.pricing }))
      .sort((a, b) => parseFloat(a.pricing?.prompt || 0) - parseFloat(b.pricing?.prompt || 0));
    return json(res, 200, vision);
  }

  // ---- proxy IA: ROUTING local (Ollama, gratis) / nube (OpenRouter, gateada) según política ----
  if (path === "/api/llm" && m === "POST") {
    const routing = await cap("ia_routing"); // local-first | solo-local | solo-nube | nube-first
    const localOn = (await cap("cap_vlm_local")) === "1";
    const cloudKey = config.openrouterKeyEnv || await repo.getConfig("openrouter_key");
    const cloudOn = (await repo.getConfig("llm_enabled", "0")) === "1" && !!cloudKey;
    let orden = routing === "solo-local" ? ["local"]
      : routing === "solo-nube" ? ["nube"]
      : routing === "nube-first" ? ["nube", "local"] : ["local", "nube"]; // local-first (default)
    orden = orden.filter((t) => (t === "local" ? localOn : cloudOn));
    if (!orden.length) return json(res, 403, { error: "IA no disponible (habilitala en Motores o cargá la API key)" });
    if (user.limite > 0 && user.usados >= user.limite) return json(res, 429, { error: "Límite de uso alcanzado" });
    const { system, user: prompt, schema, images } = await readBody(req, 30e6); // imágenes → body grande
    const imgs = Array.isArray(images) ? images : [];

    let lastErr = null;
    for (const tier of orden) {
      try {
        if (tier === "local") {
          // Tanque local: Ollama /api/chat. Las imágenes van como base64 SIN el prefijo data:.
          const url = (await cap("ollama_url")).replace(/\/$/, "");
          const model = await cap("ollama_model");
          const r = await fetch(`${url}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, stream: false, format: "json", keep_alive: keepAlive(await cap("ollama_keep")), options: { temperature: 0 },
              messages: [{ role: "system", content: system },
                { role: "user", content: prompt, images: imgs.map((u2) => u2.replace(/^data:[^,]+,/, "")) }] }) });
          if (!r.ok) throw new Error(`Ollama ${r.status}`);
          const d = await r.json();
          await repo.incUsados(user.email);
          await repo.auditar(user.email, null, "llm_local", model);
          return json(res, 200, { content: d.message?.content ?? null, motor: "local", model, costo: 0 });
        }
        // Nube: OpenRouter (key server-side, costo y límite).
        const model = await repo.getConfig("llm_model", "openai/gpt-4o-mini");
        const userContent = imgs.length
          ? [{ type: "text", text: prompt }, ...imgs.map((u2) => ({ type: "image_url", image_url: { url: u2 } }))]
          : prompt;
        // Privacidad: por defecto exigimos que el proveedor NO retenga/entrene con el balance
        // (data_collection="deny" → OpenRouter rutea solo a proveedores ZDR). El superadmin puede
        // permitirlo (Sistema → Nube, o DATA_COLLECTION_DENY=OFF) si controla el destino.
        const dcDeny = (await cap("data_collection_deny")) === "1";
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST",
          headers: { Authorization: `Bearer ${cloudKey}`, "Content-Type": "application/json", "X-Title": "Selega" },
          body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
            provider: { data_collection: dcDeny ? "deny" : "allow" },
            ...(schema && { response_format: { type: "json_schema", json_schema: { name: "cifras", schema } } }) }) });
        if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
        const data = await r.json();
        const u = data.usage || {};
        const p = (await preciosModelos())[model];
        const costo = p ? (u.prompt_tokens || 0) * parseFloat(p.prompt || 0) + (u.completion_tokens || 0) * parseFloat(p.completion || 0) : 0;
        await repo.incUsados(user.email);
        if (costo) await repo.sumarGasto(user.email, costo);
        await repo.auditar(user.email, null, "llm", `${model} $${costo.toFixed(5)}`);
        return json(res, 200, { content: data.choices?.[0]?.message?.content ?? null, motor: "nube", model, usage: u, costo });
      } catch (e) { lastErr = e; await repo.auditar(user.email, null, "llm_error", `${tier} ${e.message}`); }
    }
    return json(res, 502, { error: "La IA no respondió: " + (lastErr?.message || "error") });
  }

  // ---- superadmin: comisiona el sistema (motores + jurisdicciones + infra) ----
  if (seg[1] === "super") {
    if (!esSuperadmin) return json(res, 403, { error: "solo superadmin" });
    // Estado de los MOTORES: enabled (config) + available (sonda en vivo).
    if (path === "/api/super/motores" && m === "GET") {
      const url = await cap("ollama_url");
      const probe = await probarOllama(url); // siempre sondea (para ver si Ollama está aunque el tier esté off)
      const cloudKey = !!(config.openrouterKeyEnv || await repo.getConfig("openrouter_key"));
      return json(res, 200, {
        ocr: { enabled: (await cap("cap_ocr")) === "1", available: true, detalle: "Tesseract (en el navegador)" },
        local: { enabled: (await cap("cap_vlm_local")) === "1", available: probe.up, url,
          model: await cap("ollama_model"), modelos: probe.modelos, error: probe.error || null },
        nube: { enabled: (await repo.getConfig("llm_enabled", "0")) === "1", available: cloudKey, key_set: cloudKey },
        routing: await cap("ia_routing"),
      });
    }
    if (path === "/api/super/config" && m === "GET") {
      return json(res, 200, {
        cap_ocr: (await cap("cap_ocr")) === "1", cap_vlm_local: (await cap("cap_vlm_local")) === "1",
        ollama_url: await cap("ollama_url"), ollama_model: await cap("ollama_model"), ollama_keep: await cap("ollama_keep"),
        ia_routing: await cap("ia_routing"), data_collection_deny: (await cap("data_collection_deny")) === "1",
        jurisdicciones: await jurisHabilitadas(),
      });
    }
    if (path === "/api/super/config" && m === "PUT") {
      const b = await readBody(req);
      if (b.cap_ocr != null) await repo.setConfig("cap_ocr", b.cap_ocr ? "1" : "0");
      if (b.cap_vlm_local != null) await repo.setConfig("cap_vlm_local", b.cap_vlm_local ? "1" : "0");
      if (b.ollama_url) await repo.setConfig("ollama_url", String(b.ollama_url));
      if (b.ollama_model) await repo.setConfig("ollama_model", String(b.ollama_model));
      if (b.ollama_keep) await repo.setConfig("ollama_keep", String(b.ollama_keep));
      if (b.ia_routing) await repo.setConfig("ia_routing", String(b.ia_routing));
      if (b.data_collection_deny != null) await repo.setConfig("data_collection_deny", b.data_collection_deny ? "1" : "0");
      if (Array.isArray(b.jurisdicciones)) await repo.setConfig("jurisdicciones", JSON.stringify(b.jurisdicciones));
      await repo.auditar(user.email, null, "super_config", "");
      // "Siempre cargado": precalentar el modelo en background (queda en RAM, mata el cold-start).
      if (b.ollama_keep === "siempre" && (await cap("cap_vlm_local")) === "1") {
        const url = (await cap("ollama_url")).replace(/\/$/, "");
        fetch(`${url}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: await cap("ollama_model"), keep_alive: -1, stream: false, messages: [{ role: "user", content: "ok" }] }) }).catch(() => {});
      }
      return json(res, 200, { ok: true });
    }
    // Crear / renombrar un ente (jurisdicción): override de un fijo o ente nuevo.
    if (path === "/api/super/jurisdicciones" && m === "POST") {
      const b = await readBody(req);
      const id = String(b.id || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-");
      if (!id || !b.provincia || !b.consejo) return json(res, 400, { error: "id, provincia y consejo requeridos" });
      await repo.upsertJurisdiccion({ id, provincia: String(b.provincia).trim(), consejo: String(b.consejo).trim() });
      await repo.auditar(user.email, null, "jurisdiccion", id);
      return json(res, 200, { ok: true, id });
    }
    if (seg[2] === "jurisdicciones" && seg[3] && m === "DELETE") {
      await repo.deleteJurisdiccion(seg[3]); await repo.auditar(user.email, null, "jurisdiccion_baja", seg[3]);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "ruta superadmin no encontrada" });
  }

  // ---- admin ----
  if (seg[1] === "admin") {
    if (!isAdmin) return json(res, 403, { error: "solo admin" });
    if (path === "/api/admin/users" && m === "GET") {
      // Un admin NO ve a los superadmins (aislamiento de roles); el superadmin ve a todos.
      const users = await repo.listUsers();
      return json(res, 200, esSuperadmin ? users : users.filter((u) => u.role !== "superadmin"));
    }
    if (path === "/api/admin/users" && m === "POST") {
      const b = await readBody(req);
      if (!b.email || !b.pass) return json(res, 400, { error: "email y contraseña requeridos" });
      if (b.role && !ROLES.includes(b.role)) return json(res, 400, { error: "rol inválido" });
      if ((b.role === "superadmin" || b.role === "admin") && !esSuperadmin) return json(res, 403, { error: "solo un superadmin nombra admins" });
      try { await repo.createUser(b); await repo.auditar(user.email, null, "crear_usuario", `${b.email} (${b.role || "agente"})`); return json(res, 201, { ok: true }); }
      catch (e) { return json(res, 400, { error: String(e.message) }); }
    }
    if (seg[2] === "users" && seg[3] && m === "PUT") {
      const id = Number(seg[3]), b = await readBody(req);
      // Un admin no puede tocar a un superadmin (ni verlo): defensa además del filtro del listado.
      if (!esSuperadmin) {
        const target = (await repo.listUsers()).find((u) => u.id === id);
        if (target && target.role === "superadmin") return json(res, 403, { error: "no podés modificar a un superadmin" });
      }
      if (b.role != null) {
        if (!ROLES.includes(b.role)) return json(res, 400, { error: "rol inválido" });
        if ((b.role === "superadmin" || b.role === "admin") && !esSuperadmin) return json(res, 403, { error: "solo un superadmin nombra admins" });
        await repo.setUserRole(id, b.role); await repo.auditar(user.email, null, "rol_usuario", `${id} → ${b.role}`);
      }
      if (b.limite != null) await repo.setLimite(id, b.limite | 0);
      if (b.activo != null) await repo.setUserActivo(id, b.activo);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === "users" && seg[3] && m === "DELETE") {
      const id = Number(seg[3]);
      if (user.id === id) return json(res, 400, { error: "no podés borrarte a vos mismo" });
      if (!esSuperadmin) {
        const target = (await repo.listUsers()).find((u) => u.id === id);
        if (target && target.role === "superadmin") return json(res, 403, { error: "no podés borrar a un superadmin" });
      }
      await repo.deleteUser(id); await repo.auditar(user.email, null, "borrar_usuario", String(id));
      return json(res, 200, { ok: true });
    }
    if (path === "/api/admin/config" && m === "GET") {
      const model = await repo.getConfig("llm_model", "openai/gpt-4o-mini");
      return json(res, 200, { llm_enabled: (await repo.getConfig("llm_enabled")) === "1", llm_model: model,
        key_set: !!(config.openrouterKeyEnv || await repo.getConfig("openrouter_key")), key_from_env: !!config.openrouterKeyEnv,
        requiere_revision: (await repo.getConfig("requiere_revision", "0")) === "1",
        pricing: (await preciosModelos())[model] || null, gasto_total: await repo.gastoTotal() });
    }
    if (path === "/api/admin/config" && m === "PUT") {
      const b = await readBody(req);
      if (b.llm_enabled != null) await repo.setConfig("llm_enabled", b.llm_enabled ? "1" : "0");
      if (b.requiere_revision != null) await repo.setConfig("requiere_revision", b.requiere_revision ? "1" : "0");
      if (b.llm_model) await repo.setConfig("llm_model", b.llm_model);
      if (b.openrouter_key) await repo.setConfig("openrouter_key", b.openrouter_key); // write-only
      await repo.auditar(user.email, null, "config_llm");
      return json(res, 200, { ok: true });
    }
    if (seg[2] === "packs" && seg[3]) {
      if (m === "GET") return json(res, 200, await repo.getPack(seg[3]) || {});
      if (m === "PUT") { await repo.setPack(seg[3], await readBody(req)); await repo.auditar(user.email, null, "pack", seg[3]); return json(res, 200, { ok: true }); }
      if (m === "DELETE") { await repo.deletePack(seg[3]); return json(res, 200, { ok: true }); }
    }
    if (seg[2] === "plantillas" && seg[3] && m === "DELETE") {
      await repo.borrarPlantilla(Number(seg[3])); return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: "ruta no encontrada" });
}
