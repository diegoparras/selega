// app.js — Vista de control de Selega. Cablea: jurisdicción → cifras → cruces
// en vivo → checklist → desenlace. 100% local (sin requests salvo LLM gateado).
import { CAMPOS, EJEMPLO } from "./core/schema.js";
import { correrCruces, resumen } from "./core/crosses.js";
import { corroboracionCifras } from "./core/motor-cruces.js";
import { extraer } from "./core/extraer-anclas.js";
import { crucesAObservaciones, desenlace, ETIQUETA_DESENLACE } from "./core/decision.js";
import { cargarRegistro, cargarPack } from "./rules/loader.js";
import { montarAdmin } from "./admin.js";
import { esc, eyeify } from "./util.js";
import { me, login, logout } from "./session.js";
import { PdfView } from "./pdf-view.js";
import * as recon from "./recon/index.js";
import { cargarFormato, guardarFormato, parseMonto as parseMontoF, extraerNumero, formatear } from "./core/formato.js";
import { fingerprint, mejorPlantilla } from "./core/plantillas.js";
import { aviso, confirmar, pedir } from "./modal.js";
import { SEMAFORO, ORDEN_SEM, ESTADO_LABEL } from "./core/veredicto.js";
import { montarExpediente } from "./expediente.js";
import { montarSuper } from "./super.js";

const $ = (s, r = document) => r.querySelector(s);
let formato = cargarFormato();                       // miles / decimal / negativos (configurable)
const fmt = (n) => formatear(n, formato);
const parseMonto = (s) => parseMontoF(s, formato);

let defs = CAMPOS;            // definición ACTIVA de cifras (del pack; semilla = CAMPOS canónicas)
const vaciar = () => Object.fromEntries(defs.map((c) => [c.id, null]));
let cifras = vaciar();
let pack = null;
let pv = null;                // lienzo PDF (pdf.js)
let campoObjetivo = null;     // cifra-destino del OCR de región (la que el humano tocó)
const observChecklist = {}; // id control -> consecuencia activa (si "observado")
let checklistEstado = {};   // id control -> valor del select ("ok"|"obs"|"na"|"") para guardar/restaurar
let registroGlobal = [];    // registro de jurisdicciones (para reabrir trabajos)
let ultimoDesenlace = "legaliza"; // código del último desenlace computado (para guardar + bandeja)
let rolActual = "agente";   // rol del usuario logueado (agente/supervisor/auditor/admin)
const verTodo = () => ["supervisor", "auditor", "admin"].includes(rolActual); // bandeja global
const soloLectura = () => rolActual === "auditor";                            // auditor no escribe

// SEMAFORO/ORDEN_SEM viven en core/veredicto.js (única fuente, compartida con el Expediente).
let requiereRevision = false; // flag del Consejo (Admin): ¿los controles pasan por el supervisor?
let jurisHabilitadas = [];    // jurisdicciones que atiende el install (superadmin); [] = todas

// Barra de progreso compartida (render del PDF, OCR…). frac=null la oculta.
function progreso(frac, texto = "", eta = "") {
  const p = document.querySelector("#ocr-progreso");
  if (frac == null) { p.classList.add("hidden"); return; }
  p.classList.remove("hidden");
  document.querySelector("#ocr-prog-fill").style.width = `${Math.min(100, Math.round(frac * 100))}%`;
  document.querySelector("#ocr-prog-txt").textContent = texto;
  document.querySelector("#ocr-prog-eta").textContent = eta;
}

// El humano marca a qué cifra va el OCR de región tocando su campo (solo montos).
function setObjetivo(def, el) {
  document.querySelectorAll(".objetivo").forEach((n) => n.classList.remove("objetivo"));
  campoObjetivo = def.tipo === "monto" ? def.id : null;
  if (campoObjetivo) el.classList.add("objetivo");
}

// ---- Vistas: inicio (hero) · bandeja · control · admin ----
function ocultarVistas() {
  for (const v of ["#vista-inicio", "#vista-control", "#vista-admin", "#vista-bandeja", "#vista-expediente", "#vista-super"]) $(v).classList.add("hidden");
}
function mostrarInicio() { ocultarVistas(); $("#vista-inicio").classList.remove("hidden"); }
function mostrarControl() { ocultarVistas(); $("#vista-control").classList.remove("hidden"); }
function mostrarBandeja() { ocultarVistas(); $("#vista-bandeja").classList.remove("hidden"); pintarBandeja($("#bandeja-lista"), $("#bandeja-titulo"), $("#bandeja-sub")); }
function mostrarExpediente() { ocultarVistas(); $("#vista-expediente").classList.remove("hidden"); }
// La "casa" depende del rol: supervisor/auditor viven en la bandeja; agente/admin en el inicio.
function irAHome() { ["supervisor", "auditor"].includes(rolActual) ? mostrarBandeja() : mostrarInicio(); }

// ---- Bloques del rail: chips de estado + auto-abrir lo que falla ----
function setChip(sel, clase, txt) { const e = $(sel); if (!e) return; e.className = "bq-chip " + clase; e.textContent = txt; }
function actualizarChips(res) {
  const s = resumen(res);
  setChip("#chip-cruces", s.difiere ? "bad" : s.falta ? "warn" : "ok",
    s.difiere ? `✗ ${s.difiere} no cierra(n)` : s.falta ? `? faltan ${s.falta}` : `✓ ${s.ok} cierran`);
  const obs = Object.values(observChecklist).filter(Boolean).length;
  setChip("#chip-controles", obs ? "warn" : "ok", obs ? `${obs} observado(s)` : "sin observaciones");
  const cargadas = defs.filter((c) => cifras[c.id] != null).length;
  setChip("#chip-cifras", "neutral", `${cargadas}/${defs.length}`);
}
// Abre los bloques con problema (y cierra los OK). Se llama al CARGAR un balance,
// no en cada tecla, para no pelear con la edición manual.
function acomodarBloques() {
  const res = correrCruces(cifras, pack && pack.cruces);
  const s = resumen(res);
  $("#bq-cruces").open = !!(s.difiere || s.falta);
  $("#bq-controles").open = Object.values(observChecklist).some(Boolean);
  $("#bq-cifras").open = false;
}

// ---- Drag para reordenar los bloques (orden persistido por usuario) ----
const ORDEN_KEY = "selega.rail.orden";
function aplicarOrdenBloques() {
  let orden; try { orden = JSON.parse(localStorage.getItem(ORDEN_KEY) || "null"); } catch { orden = null; }
  if (!orden) return;
  const rail = $("#rail");
  orden.forEach((id) => { const el = document.getElementById(id); if (el) rail.appendChild(el); });
}
function montarDragBloques() {
  const rail = $("#rail");
  rail.querySelectorAll(".bloque").forEach((b) => {
    b.querySelector(".bq-grip").addEventListener("pointerdown", () => { b.draggable = true; });
    b.addEventListener("dragstart", () => b.classList.add("arrastrando"));
    b.addEventListener("dragend", () => {
      b.classList.remove("arrastrando"); b.draggable = false;
      rail.querySelectorAll(".bloque").forEach((x) => x.classList.remove("dropzona"));
      const orden = [...rail.querySelectorAll(".bloque")].map((x) => x.id);
      try { localStorage.setItem(ORDEN_KEY, JSON.stringify(orden)); } catch { /* sin storage */ }
    });
  });
  rail.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = rail.querySelector(".arrastrando"); if (!dragging) return;
    const tras = [...rail.querySelectorAll(".bloque:not(.arrastrando)")]
      .find((b) => e.clientY < b.getBoundingClientRect().top + b.offsetHeight / 2);
    if (tras) rail.insertBefore(dragging, tras); else rail.appendChild(dragging);
  });
}

// ---- Cifras grid ----
function montarCifras() {
  const cont = $("#cifras");
  cont.innerHTML = "";
  for (const c of defs) {
    const lab = document.createElement("label");
    lab.innerHTML = `${esc(c.label)}<span class="est">${esc(c.estado)}</span>`; // esc: los campos salen del pack editable
    lab.dataset.prov = c.id;
    cont.appendChild(lab);
    let input;
    if (c.tipo === "enum") {
      input = document.createElement("select");
      input.innerHTML = `<option value="">—</option>` + (c.opciones || []).map((o) => `<option>${esc(o)}</option>`).join("");
    } else if (c.tipo === "bool") {
      input = document.createElement("select");
      input.innerHTML = `<option value="">—</option><option value="true">Sí</option><option value="false">No</option>`;
    } else {
      input = document.createElement("input");
      input.type = "text"; input.inputMode = "decimal"; input.placeholder = "—";
    }
    input.dataset.campo = c.id;
    input.addEventListener("input", onCifra);
    input.addEventListener("change", onCifra);
    input.addEventListener("focus", () => setObjetivo(c, input));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); focusSiguienteCifra(input); } });
    cont.appendChild(input);
  }
}
// Teclado: Enter salta a la cifra siguiente (carga ágil para el de 30/día).
function focusSiguienteCifra(actual) {
  const todos = [...document.querySelectorAll("#cifras [data-campo]")];
  const next = todos[todos.indexOf(actual) + 1];
  if (next) next.focus(); else actual.blur();
}
function onCifra(e) {
  const campo = e.target.dataset.campo;
  const def = defs.find((c) => c.id === campo);
  const v = e.target.value;
  if (def.tipo === "monto") cifras[campo] = parseMonto(v);
  else if (def.tipo === "bool") cifras[campo] = v === "" ? null : v === "true";
  else cifras[campo] = v || null;
  recomputar();
}
function pintarCifras() {
  for (const el of document.querySelectorAll("[data-campo]")) {
    const v = cifras[el.dataset.campo];
    const def = defs.find((c) => c.id === el.dataset.campo);
    if (v == null) { el.value = ""; continue; }
    el.value = def.tipo === "monto" ? fmt(v) : def.tipo === "bool" ? String(v) : v;
  }
}

// ---- Cruces ----
function recomputar() {
  const res = correrCruces(cifras, pack && pack.cruces); // cruces del pack activo (por jurisdicción)
  const cont = $("#cruces");
  cont.innerHTML = res.map((r) => {
    const ico = { OK: "✓", DIFIERE: "✗", "N/A": "·", FALTA_DATO: "?" }[r.estado];
    const dif = r.estado === "DIFIERE" && r.diferencia != null
      ? `<span class="dif">$ ${fmt(r.diferencia)}</span>` : "";
    return `<div class="cruce"><span class="ico ${esc(r.estado)}">${ico}</span>
      <span>${esc(r.nombre)}</span>${dif}</div>`;
  }).join("");
  const s = resumen(res);
  $("#resumen-cruces").textContent = `✓ ${s.ok}   ✗ ${s.difiere}   · ${s.na}   ? ${s.falta}`;

  // Desenlace: observaciones de cruces + de checklist
  const obs = [...crucesAObservaciones(res),
    ...Object.entries(observChecklist).filter(([, c]) => c).map(([id, c]) => ({ origen: id, consecuencia: c }))];
  const d = desenlace(obs, {});
  ultimoDesenlace = d.resultado;                       // código (para guardar + semáforo de la bandeja)
  $("#desenlace").textContent = ETIQUETA_DESENLACE[d.resultado] || d.resultado;
  $("#veredicto").className = "veredicto des-" + (SEMAFORO[d.resultado] || "amarillo");
  $("#motivos").innerHTML = d.motivos.map((m) => `<li>${m}</li>`).join("");
  actualizarChips(res);
  marcarCorroboracion(res);
}

// Confianza por cifra DERIVADA DE LOS CRUCES: verde = la corrobora un cruce que cierra;
// ámbar = aparece en un cruce que NO cierra (revisá). Sin marca = no la validan los cruces.
function marcarCorroboracion(res) {
  const corr = corroboracionCifras(res);
  for (const el of document.querySelectorAll("#cifras [data-campo]")) {
    const st = corr[el.dataset.campo];
    el.classList.toggle("corr-ok", st === "ok");
    el.classList.toggle("corr-mal", st === "mal");
    el.title = st === "ok" ? "Corroborada por los cruces" : st === "mal" ? "Aparece en un cruce que no cierra — revisá" : "";
  }
}

// ---- Checklist desde el rule-pack ----
function montarChecklist() {
  const cont = $("#checklist");
  cont.innerHTML = "";
  checklistEstado = {};                                   // estado fresco por jurisdicción
  for (const k of Object.keys(observChecklist)) delete observChecklist[k];
  for (const sec of pack.secciones || []) {
    const det = document.createElement("details");
    det.className = "sec";
    det.innerHTML = `<summary>${esc(sec.id)}. ${esc(sec.titulo)} <span class="badge">${esc(sec.ref || "")}</span></summary>`;
    for (const ctrl of sec.controles || []) {
      const row = document.createElement("div");
      row.className = "ctrl";
      row.innerHTML = `<span class="txt">${esc(ctrl.texto)}<br><span class="cons">→ ${esc(ctrl.consecuencia)}</span></span>`;
      const sel = document.createElement("select");
      sel.dataset.ctrl = ctrl.id;
      sel.innerHTML = `<option value="">Pendiente</option><option value="ok">OK</option><option value="obs">Observado</option><option value="na">N/A</option>`;
      sel.addEventListener("change", () => {
        checklistEstado[ctrl.id] = sel.value;
        observChecklist[ctrl.id] = sel.value === "obs" ? ctrl.consecuencia : null;
        recomputar();
      });
      row.appendChild(sel);
      det.appendChild(row);
    }
    cont.appendChild(det);
  }
}

// ---- Jurisdicción ----
async function cambiarJurisdiccion(jur) {
  pack = await cargarPack(jur);
  defs = (pack.campos && pack.campos.length) ? pack.campos : CAMPOS; // cifras del pack (editables por jurisdicción)
  montarCifras(); pintarCifras();   // re-render la grilla con los campos de esta jurisdicción
  montarChecklist();
  recomputar();
}

function mostrarLogin() {
  return new Promise((resolve) => {
    $("#login").classList.remove("hidden");
    $("#login-form").onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#login-form button");
      $("#login-err").textContent = "";
      btn.disabled = true; const orig = btn.textContent; btn.textContent = "Ingresando…";
      try {
        const u = await login($("#login-email").value.trim(), $("#login-pass").value);
        $("#login").classList.add("hidden");
        resolve(u);
      } catch (err) {
        $("#login-err").textContent = err.message;
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    };
  });
}

// ---- Provenance: de dónde salió cada cifra en el PDF ----
let provenance = {}; // campo -> { pagina, rect:{x,y,w,h} en 0..1 }
const NUMRE = /-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|-?\d+,\d{2}/g;
const numerosEn = (s) => [...String(s).replace(/\((\d[\d.]*(?:,\d{2})?)\)/g, "-$1").matchAll(NUMRE)]
  .map((m) => Number(m[0].replace(/\./g, "").replace(",", ".")));

async function calcularProvenance(paginas) {
  provenance = {};
  paginas = paginas || await pv.textoNativoConPos();
  for (const def of defs) {
    if (def.tipo !== "monto") continue;
    const v = cifras[def.id];
    if (v == null) continue;
    for (const p of paginas) {
      const it = p.items.find((i) => numerosEn(i.str).some((n) => Math.abs(n - v) < 0.5));
      if (it) { provenance[def.id] = { pagina: p.num, rect: { x: it.x, y: it.y, w: it.w, h: it.h } }; break; }
    }
  }
  marcarProvenance();
}
function marcarProvenance() {
  for (const lab of document.querySelectorAll("label[data-prov]")) {
    const id = lab.dataset.prov;
    const p = provenance[id];
    lab.classList.toggle("tiene-prov", !!p);
    lab.onclick = p ? () => pv.resaltar(p.pagina, p.rect) : null;
    if (p) lab.title = `Ver en el PDF (pág. ${p.pagina})`;
  }
}

// ---- LLM (escotilla gateada): extraer las cifras con IA por el proxy del servidor ----
function schemaCifras() {
  const props = {};
  for (const c of defs) {
    if (c.tipo === "monto") props[c.id] = { type: ["number", "null"] };
    else if (c.tipo === "bool") props[c.id] = { type: ["boolean", "null"] };
    else props[c.id] = { type: ["string", "null"] };
  }
  return { type: "object", properties: props, additionalProperties: false };
}
async function leerConIA() {
  let estim = "";
  try {
    const pr = await (await fetch("/api/llm/precio")).json();
    if (pr.pricing) {
      const cIn = parseFloat(pr.pricing.prompt || 0), cOut = parseFloat(pr.pricing.completion || 0);
      estim = ` Costo estimado ~$${(cIn * 6000 + cOut * 500).toFixed(4)} (modelo ${pr.model}).`;
    }
  } catch { /* sin precio: seguimos igual */ }
  if (!pv.doc) { aviso("Falta el documento", "Cargá un PDF primero."); return; }
  if (!(await confirmar("Leer con IA", `Selega va a leer el balance con un modelo de visión. Si hay un modelo LOCAL configurado, se procesa en el servidor (no sale); si no, va a la nube gateada.${estim}\n\n¿Continuar?`))) return;
  const btn = $("#btn-ia"); const orig = btn.textContent; btn.disabled = true;
  try {
    // Renderizá las páginas a imágenes (un modelo de visión lee el balance escaneado).
    const n = Math.min(pv.doc.numPages, 10);
    const imgs = [];
    for (let i = 1; i <= n; i++) {
      btn.textContent = `Imagen ${i}/${n}…`;
      imgs.push((await pv.canvasPagina(i, { escala: 1.5 })).toDataURL("image/jpeg", 0.7));
    }
    btn.textContent = "Leyendo con IA…";
    const r = await fetch("/api/llm", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: "Sos un experto contable argentino. Mirá las imágenes de los estados contables y extraé las cifras. Los números argentinos usan punto como separador de miles y coma como decimal (ej: 196.343.896,44). Devolvé SOLO el JSON pedido; usá null donde no encuentres el dato. Cada monto puede venir como número o como el string EXACTO tal como aparece (con sus puntos y coma).",
        user: "Extraé las cifras de estos estados contables.", images: imgs, schema: schemaCifras() }) });
    if (r.status === 403) { aviso("IA no disponible", "El procesamiento con IA está apagado. Pedile al Admin/Superadmin que lo active (nube o motor local)."); return; }
    if (r.status === 503) { aviso("Falta la API key", "Falta cargar la API key de OpenRouter en Admin."); return; }
    if (r.status === 429) { aviso("Límite alcanzado", "Alcanzaste tu límite de uso de IA."); return; }
    if (!r.ok) { aviso("No se pudo procesar", "La IA no pudo procesar: " + ((await r.json().catch(() => ({}))).error || r.status)); return; }
    const { content, costo, motor } = await r.json();
    const ia = JSON.parse(content);
    let puestas = 0;
    for (const c of defs) {                              // el modelo LEE, nosotros PARSEAMOS (formato AR)
      let v = ia[c.id];
      if (v == null) continue;
      if (c.tipo === "monto" && typeof v === "string") v = parseMonto(v);
      if (v == null || (typeof v === "number" && Number.isNaN(v))) continue;
      cifras[c.id] = v; puestas++;
    }
    pintarCifras(); recomputar();
    const motorTxt = motor === "local" ? "IA local (sin costo)" : `IA nube · $${(costo || 0).toFixed(4)}`;
    $("#hint-region").textContent = `${motorTxt}: leyó ${puestas} cifra(s) de ${n} página(s).`;
  } catch (e) { aviso("Error con la IA", e.message); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

// ---- Plantillas: auto-reconocimiento de formatos (motor de escala) ----
function textoEnRegion(paginas, pagina, rect) {
  const p = paginas[pagina - 1];
  if (!p || !rect) return "";
  return (p.items || []).filter((it) => {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
  }).map((it) => it.str).join(" ");
}

// Aplica una plantilla: lee la región de cada cifra que falte y la completa.
async function aplicarPlantilla(pl, paginas) {
  let puestas = 0;
  for (const [campo, loc] of Object.entries(pl.campos || {})) {
    if (cifras[campo] != null) continue;            // no pisar lo ya extraído
    const n = extraerNumero(textoEnRegion(paginas, loc.pagina, loc.rect), formato);
    if (n != null) { cifras[campo] = n; provenance[campo] = loc; puestas++; }
  }
  if (puestas) { pintarCifras(); marcarProvenance(); recomputar(); }
  return puestas;
}

// Al cargar un PDF: ¿conozco este formato? Si matchea una plantilla, la aplico.
async function autoReconocer(paginas) {
  try {
    const fp = fingerprint(paginas);
    if (fp.length < 5) return; // escaneado / sin texto nativo → no hay vocabulario
    const jur = $("#jurisdiccion").value;
    const lista = await (await fetch(`/api/plantillas?jur=${encodeURIComponent(jur)}`)).json();
    lista.forEach((pl) => { pl._fp = JSON.parse(pl.fingerprint || "[]"); pl.campos = JSON.parse(pl.campos || "{}"); });
    const m = mejorPlantilla(fp, lista, 0.6);
    if (!m) return;
    const puestas = await aplicarPlantilla(m.plantilla, paginas);
    $("#hint-region").textContent = `Formato reconocido: "${m.plantilla.nombre}" (${Math.round(m.score * 100)}%) — completé ${puestas} cifra(s) desde la plantilla.`;
  } catch { /* silencioso: la plantilla es una ayuda, no un bloqueo */ }
}

async function guardarPlantilla() {
  const campos = { ...provenance };
  if (!Object.keys(campos).length) { aviso("Sin cifras para guardar", "No hay cifras ubicadas para guardar. Cargá un PDF y dejá que se ubiquen (o marcá regiones)."); return; }
  const nombre = await pedir("Guardar como plantilla", { label: "Nombre de la plantilla (ej. estudio o formato)", valor: $("#comitente").value || "", placeholder: "Estudio Pérez · Balance anual" });
  if (!nombre) return;
  try {
    const fp = fingerprint(await pv.textoNativoConPos());
    const r = await fetch("/api/plantillas", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, jurisdiccion: $("#jurisdiccion").value, fingerprint: fp, campos }) });
    if (!r.ok) throw new Error(`Error ${r.status}`);
    aviso("Plantilla guardada", `Plantilla "${nombre}" guardada (${Object.keys(campos).length} cifras). Los próximos balances de este formato se auto-completan.`);
  } catch (e) { aviso("No se pudo guardar", "No se pudo guardar la plantilla: " + e.message); }
}

// ---- Navegación de páginas: slider (deslizador) + nº de página editable ----
let totalPaginas = 1;
function montarNav(total) {
  totalPaginas = total;
  const sl = document.querySelector("#pdf-slider");
  sl.min = 1; sl.max = total; sl.value = 1;
  document.querySelector("#pdf-pag-num").max = total;
  document.querySelector("#pdf-pag-total").textContent = total;
  marcarPaginaActiva(1);
}
function marcarPaginaActiva(n) {
  document.querySelector("#pdf-slider").value = n;          // sincroniza el slider
  const inp = document.querySelector("#pdf-pag-num");
  if (document.activeElement !== inp) inp.value = n;        // no pisar mientras el usuario tipea
}

// ---- Trabajos: persistencia en Postgres (historial + trazabilidad pack_version) ----
function estadoTrabajo() {
  const jur = $("#jurisdiccion").value;
  return {
    jurisdiccion: jur, comitente: $("#comitente").value, cuit: $("#cuit").value,
    tipo: cifras.tipo_societario || "", desenlace: ultimoDesenlace, // código (no el label)
    // Si el Consejo exige visto del supervisor, el control queda PENDIENTE; si no, cerrado.
    estado: requiereRevision ? "pendiente_revision" : "cerrado",
    cifras, controles: checklistEstado,
    pack_version: pack ? `${pack.jurisdiccion || jur}:${pack.version || pack._origen || "?"}` : null,
  };
}
async function guardarTrabajo() {
  const btn = $("#btn-guardar-trab"); const orig = btn.textContent; btn.disabled = true;
  try {
    const r = await fetch("/api/trabajos", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(estadoTrabajo()) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    const { id } = await r.json();
    btn.textContent = `✓ Guardado #${id}`;
    setTimeout(() => { btn.textContent = orig; }, 2500);
  } catch (e) { aviso("No se pudo guardar", "No se pudo guardar el trabajo: " + e.message); btn.textContent = orig; }
  finally { btn.disabled = false; }
}
// Render compartido de la bandeja (semáforo + filas). Lo usan el popup del control
// (#trabajos-lista) y la pantalla-casa de supervisor/auditor (#bandeja-lista).
async function pintarBandeja(cont, tituloEl, subEl) {
  const global = verTodo();   // supervisor/auditor/admin ven la bandeja de TODO el Consejo
  if (tituloEl) tituloEl.textContent = global ? "Bandeja del Consejo" : "Mi bandeja";
  if (subEl) subEl.textContent = global
    ? "Todos los controles del Consejo, los problemas primero."
    : "Tus controles guardados, los problemas primero.";
  cont.innerHTML = "<p style='color:var(--muted)'>Cargando…</p>";
  try {
    const lista = await (await fetch("/api/trabajos" + (global ? "?all=1" : ""))).json();
    const sem = (t) => SEMAFORO[t.desenlace] || "amarillo";
    lista.sort((a, b) => (ORDEN_SEM[sem(a)] - ORDEN_SEM[sem(b)]) || (b.id - a.id)); // problemas primero
    if (!lista.length) { cont.innerHTML = `<p style="color:var(--muted)">${global ? "Todavía no hay trabajos en el Consejo." : "No tenés trabajos guardados todavía."}</p>`; return; }
    const cuenta = { rojo: 0, amarillo: 0, verde: 0 };
    lista.forEach((t) => cuenta[sem(t)]++);
    cont.innerHTML = `<div class="trab-semaforo">
        <span class="sem sem-rojo"></span> ${cuenta.rojo} problema
        <span class="sem sem-amarillo"></span> ${cuenta.amarillo} a revisar
        <span class="sem sem-verde"></span> ${cuenta.verde} listo</div>` +
      lista.map((t) => `
      <div class="trab-row" data-id="${t.id}">
        <span class="sem sem-${sem(t)}" title="${esc(ETIQUETA_DESENLACE[t.desenlace] || "")}"></span>
        <strong>#${t.id} ${esc(t.comitente || "(sin comitente)")}</strong>
        ${t.estado && t.estado !== "en_curso" ? `<span class="trab-estado estado-${esc(t.estado)}">${esc(ESTADO_LABEL[t.estado] || t.estado)}</span>` : ""}
        <span class="trab-meta">${esc(t.jurisdiccion || "")} · ${esc(ETIQUETA_DESENLACE[t.desenlace] || t.estado || "")}${global && t.usuario ? ` · <span class="trab-agente">${esc(t.usuario)}</span>` : ""}${t.pack_version ? ` · <span class="trab-reglas" title="Reglas con las que se controló">reglas ${esc(t.pack_version)}</span>` : ""}</span>
        <span class="trab-fecha">${t.modificado ? new Date(t.modificado).toLocaleString("es-AR") : ""}</span>
      </div>`).join("");
    cont.querySelectorAll(".trab-row").forEach((row) => row.onclick = () => abrirSegunRol(+row.dataset.id));
  } catch (e) { cont.innerHTML = `<p style="color:var(--bad)">Error: ${esc(e.message)}</p>`; }
}
// Popup de la bandeja desde el control (cambiar de balance mientras trabajás).
const listarTrabajos = () => pintarBandeja($("#trabajos-lista"), $("#trabajos-panel .trab-head strong"));
function restaurarChecklist() {
  for (const sel of document.querySelectorAll("#checklist select[data-ctrl]")) {
    sel.value = checklistEstado[sel.dataset.ctrl] || "";
    sel.dispatchEvent(new Event("change")); // re-arma observChecklist con la consecuencia del control
  }
}
async function abrirTrabajo(id) {
  try {
    const t = await (await fetch(`/api/trabajos/${id}`)).json();
    mostrarControl(); // abrir desde cualquier vista (bandeja-casa o popup) muestra el control
    const sel = $("#jurisdiccion");
    if (t.jurisdiccion && sel.value !== t.jurisdiccion) {
      sel.value = t.jurisdiccion;
      const jur = registroGlobal.find((j) => j.id === t.jurisdiccion);
      if (jur) await cambiarJurisdiccion(jur);
    }
    $("#comitente").value = t.comitente || "";
    $("#cuit").value = t.cuit || "";
    cifras = { ...vaciar(), ...(t.cifras || {}) };
    checklistEstado = t.controles || {};
    pintarCifras(); restaurarChecklist(); marcarProvenance(); recomputar(); acomodarBloques();
    $("#trabajos-panel").classList.add("hidden");
  } catch (e) { aviso("No se pudo abrir", "No se pudo abrir el trabajo: " + e.message); }
}

// Al abrir un trabajo desde la bandeja: el agente/admin van al CONTROL (editar);
// el supervisor va al EXPEDIENTE con acciones; el auditor al EXPEDIENTE read-only.
function abrirSegunRol(id) {
  if (rolActual === "supervisor") return abrirExpediente(id, { acciones: true });
  if (rolActual === "auditor") return abrirExpediente(id, { acciones: false });
  return abrirTrabajo(id); // agente / admin → control (sin cambios)
}
async function abrirExpediente(id, opts) {
  try {
    const t = await (await fetch(`/api/trabajos/${id}`)).json();
    mostrarExpediente();
    await montarExpediente($("#vista-expediente"), t, {
      acciones: opts.acciones,
      registro: registroGlobal,
      onVolver: () => mostrarBandeja(),
      onRevisar: opts.acciones ? (accion, nota) => revisar(id, accion, nota) : null,
    });
  } catch (e) { aviso("No se pudo abrir", "No se pudo abrir el expediente: " + e.message); }
}
async function revisar(id, accion, nota) {
  try {
    const r = await fetch(`/api/trabajos/${id}/revision`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, nota }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
    await aviso(accion === "aprobar" ? "Aprobado" : "Devuelto al agente",
      accion === "aprobar" ? "El control quedó aprobado." : "El control volvió al agente con tu nota.");
    mostrarBandeja();
  } catch (e) { aviso("No se pudo registrar", e.message); }
}

async function init() {
  $("#btn-theme").onclick = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    if (dark) { delete document.documentElement.dataset.theme; localStorage.setItem("selega.theme", "light"); }
    else { document.documentElement.dataset.theme = "dark"; localStorage.setItem("selega.theme", "dark"); }
  };

  // Menú kebab del header (tema / Admin / salir). Click afuera o Escape lo cierra.
  const mMenu = $("#hdr-menu"), mBtn = $("#btn-menu");
  mBtn.onclick = (e) => { e.stopPropagation(); const open = mMenu.classList.toggle("hidden") === false; mBtn.setAttribute("aria-expanded", String(open)); };
  mMenu.addEventListener("click", (e) => { if (e.target.closest(".menu-item")) mMenu.classList.add("hidden"); });
  document.addEventListener("click", (e) => { if (!mMenu.classList.contains("hidden") && !mMenu.contains(e.target) && !mBtn.contains(e.target)) mMenu.classList.add("hidden"); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") mMenu.classList.add("hidden"); });

  // "Acerca de Selega": versión (inyectada por el server desde package.json, leída del <meta>) + créditos.
  $("#btn-acerca").onclick = () => {
    const v = document.querySelector('meta[name="selega-version"]')?.content || "";
    const ver = /^\d/.test(v) ? `v${v}` : "—";
    aviso("Acerca de Selega",
      `Selega <strong>${esc(ver)}</strong><br>Control de estados contables para legalizaciones.<br>` +
      `Parte de la familia Escriba.<br><br>Licencia Apache-2.0<br>` +
      `<a href="https://github.com/diegoparras/selega" target="_blank" rel="noopener noreferrer">GitHub</a> · ` +
      `<a href="https://getescriba.com/es/selega/" target="_blank" rel="noopener noreferrer">getescriba.com</a>`);
  };

  // Gate de sesión (Postgres + cookie firmada). Si no hay sesión, mostrar login.
  // Mientras tanto, .booting mantiene oculta la app (splash con logo) para que NO parpadee
  // Selega antes del login. La sacamos recién acá, ya autenticados → primero login, después app.
  let usuario = await me();
  if (!usuario) usuario = await mostrarLogin();
  $("#login").classList.add("hidden");
  document.body.classList.remove("booting");
  // Niveles: 'funcional' es alias histórico de 'agente'. superadmin ⊇ admin.
  const ROL_LABEL = { agente: "Agente", funcional: "Agente", supervisor: "Supervisor", auditor: "Auditor", admin: "Admin", superadmin: "Superadmin" };
  const rol = usuario.role === "funcional" ? "agente" : usuario.role;
  rolActual = rol;
  requiereRevision = !!usuario.requiere_revision; // flag del Consejo (Admin)
  jurisHabilitadas = Array.isArray(usuario.jurisdicciones) ? usuario.jurisdicciones : []; // [] = todas (superadmin scopea)
  document.body.dataset.rol = rol;
  $("#user-info").style.display = "";
  $("#user-info").textContent = `${usuario.email} · ${ROL_LABEL[usuario.role] || usuario.role}${rol === "auditor" ? " (solo lectura)" : ""}`;
  $("#btn-logout").style.display = "";
  $("#btn-logout").onclick = async () => { await logout(); location.reload(); };
  // Admin (config funcional): lo ven admin y superadmin. Sistema/Motores: SOLO superadmin.
  const esAdminOMas = rol === "admin" || rol === "superadmin";
  if (!esAdminOMas) $("#btn-admin").style.display = "none";
  if (rol !== "superadmin") $("#btn-super").style.display = "none";
  // Auditor = solo lectura: el CSS (body[data-rol=auditor]) oculta las acciones de escritura;
  // el rol ya se ve en el menú (user-info). El header queda limpio (logo + ⋮).

  montarCifras();
  const registro = await cargarRegistro();
  registroGlobal = registro;                 // completo (para resolver packs de trabajos viejos)
  // El superadmin scopea qué jurisdicciones atiende el install; el selector muestra SOLO esas.
  // Fail-closed: si hay scope ([ids] no vacío) se respeta aunque filtre a pocas. NO se vuelve a
  // "todas" si el filtro queda vacío (eso era fail-open: el agente vería jurisdicciones que el
  // install no atiende). Sin scope ([]) = todas.
  const jurs = jurisHabilitadas.length
    ? registro.filter((j) => jurisHabilitadas.includes(j.id))
    : registro;
  const sel = $("#jurisdiccion");
  if (!jurs.length) {
    // Scope con ids que ya no existen en el registro: estado inválido → avisar, no romper la app.
    sel.innerHTML = `<option value="">(sin jurisdicciones habilitadas)</option>`;
    sel.disabled = true;
  } else {
    sel.innerHTML = jurs.map((j) => `<option value="${esc(j.id)}">${esc(j.provincia)} — ${esc(j.consejo)}${j.estado === "completo" ? " ✓" : ""}</option>`).join("");
    sel.disabled = jurs.length <= 1;   // una sola jurisdicción → no hay qué elegir
    sel.addEventListener("change", () => cambiarJurisdiccion(registroGlobal.find((j) => j.id === sel.value)));
    await cambiarJurisdiccion(jurs[0]);
  }

  const cargarEjemplo = () => { cifras = { ...EJEMPLO }; pintarCifras(); recomputar(); acomodarBloques(); mostrarControl(); };
  $("#btn-ejemplo").onclick = cargarEjemplo;
  $("#btn-ejemplo-hero").onclick = cargarEjemplo;
  $("#btn-pdf-hero").onclick = () => $("#pdf-input").click();
  $("#btn-bandeja-hero").onclick = () => mostrarBandeja();
  $("#btn-nuevo-bandeja").onclick = () => mostrarInicio();
  $("#btn-inicio").onclick = () => irAHome();
  $("#btn-limpiar").onclick = () => { cifras = vaciar(); provenance = {}; pintarCifras(); marcarProvenance(); recomputar(); };
  $("#btn-guardar-trab").onclick = guardarTrabajo;
  $("#btn-confirmar").onclick = guardarTrabajo;
  $("#btn-observar").onclick = () => { $("#bq-cruces").open = $("#bq-cifras").open = $("#bq-controles").open = true; };
  aplicarOrdenBloques();
  montarDragBloques();
  $("#btn-trabajos").onclick = () => {
    const p = $("#trabajos-panel");
    p.classList.toggle("hidden");
    if (!p.classList.contains("hidden")) listarTrabajos();
  };
  $("#btn-cerrar-trab").onclick = () => $("#trabajos-panel").classList.add("hidden");

  // ---- Configuración de formato de números (miles / decimal / negativos) ----
  $("#fmt-miles").value = formato.miles;
  $("#fmt-decimal").value = formato.decimal;
  $("#fmt-neg").value = formato.negativo;
  $("#btn-formato").onclick = () => $("#cfg-formato").classList.toggle("hidden");
  const aplicarFormato = () => {
    const miles = $("#fmt-miles").value, decimal = $("#fmt-decimal").value;
    if (miles && miles === decimal) {           // miles y decimal no pueden coincidir
      $("#fmt-warn").textContent = "Miles y decimal no pueden ser el mismo signo.";
      $("#fmt-decimal").value = formato.decimal; return;
    }
    $("#fmt-warn").textContent = "";
    formato = { miles, decimal, negativo: $("#fmt-neg").value };
    guardarFormato(formato);
    pintarCifras(); recomputar();               // re-formatea lo mostrado con el nuevo formato
  };
  ["fmt-miles", "fmt-decimal", "fmt-neg"].forEach((id) => $("#" + id).addEventListener("change", aplicarFormato));
  // ---- Lienzo PDF + OCR de región ----
  const hint = (msg) => { $("#hint-region").textContent = msg; };
  const hintBase = "Tocá una cifra y marcá un recuadro sobre el PDF para leerla (OCR)";
  pv = new PdfView($("#pdf-host"), {
    onPagina: marcarPaginaActiva,
    onRegion: async (crop, meta) => {
      if (!campoObjetivo) { hint("Primero tocá la cifra que querés completar"); return; }
      const destino = defs.find((c) => c.id === campoObjetivo);
      hint(`Leyendo región para "${destino.label}"…`);
      try {
        const { texto, confianza } = await recon.reconocer("region", { canvas: crop });
        const n = extraerNumero(texto, formato);
        if (n == null) { hint(`No se leyó un número (“${texto.trim().slice(0, 24)}”). Reintentá.`); return; }
        cifras[campoObjetivo] = n;
        provenance[campoObjetivo] = { pagina: meta.pagina, rect: meta.rect0 }; // marco sin rotar
        pintarCifras(); recomputar(); marcarProvenance();
        hint(`✓ ${destino.label} = ${fmt(n)}  ·  OCR ${Math.round(confianza * 100)}% (p.${meta.pagina})`);
      } catch (err) {
        hint("OCR falló: " + err.message);
      } finally {
        setTimeout(() => hint(hintBase), 5000);
      }
    },
  });
  $("#z-in").onclick = () => pv.zoomIn();
  $("#z-out").onclick = () => pv.zoomOut();
  $("#guardar-plantilla").onclick = guardarPlantilla;
  $("#btn-ia").onclick = leerConIA;
  // Control de rotar FIJO del visor (rota la página actual).
  $("#rot-izq").onclick = () => pv.rotarActual(-1);
  $("#rot-der").onclick = () => pv.rotarActual(1);
  // Menú "Herramientas" (abre/cierra; click afuera o Escape lo cierra).
  const hMenu = $("#herramientas-menu"), hBtn = $("#btn-herramientas");
  hBtn.onclick = (e) => { e.stopPropagation(); const open = hMenu.classList.toggle("hidden") === false; hBtn.setAttribute("aria-expanded", String(open)); };
  hMenu.addEventListener("click", (e) => { if (e.target.closest(".menu-item") && !e.target.closest(".menu-switch")) hMenu.classList.add("hidden"); });
  document.addEventListener("click", (e) => { if (!hMenu.classList.contains("hidden") && !hMenu.contains(e.target) && e.target !== hBtn && !hBtn.contains(e.target)) hMenu.classList.add("hidden"); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") hMenu.classList.add("hidden"); });
  $("#rotar-todo").onclick = () => pv.rotarTodo(1);
  // Auto-enderezar al cargar (toggle persistido por usuario).
  $("#chk-auto").checked = localStorage.getItem("selega.autoenderezar") === "1";
  $("#chk-auto").onchange = () => { try { localStorage.setItem("selega.autoenderezar", $("#chk-auto").checked ? "1" : "0"); } catch { /* sin storage */ } };

  // Slider horizontal: arrastrá para navegar (salto instantáneo mientras deslizás).
  $("#pdf-slider").addEventListener("input", (e) => {
    const n = +e.target.value;
    $("#pdf-pag-num").value = n;
    pv.irAPagina(n, false);
  });
  // Número de página editable: escribís el folio y Enter (o al salir) salta ahí.
  const irAInput = () => {
    let n = parseInt($("#pdf-pag-num").value, 10);
    if (!n || n < 1) n = 1; else if (n > totalPaginas) n = totalPaginas;
    $("#pdf-pag-num").value = n; $("#pdf-slider").value = n;
    pv.irAPagina(n);
  };
  $("#pdf-pag-num").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); irAInput(); $("#pdf-pag-num").blur(); } });
  $("#pdf-pag-num").addEventListener("change", irAInput);
  $("#nav-prev").onclick = () => pv.irAPagina(Math.max(1, (+$("#pdf-slider").value) - 1));
  $("#nav-next").onclick = () => pv.irAPagina(Math.min(totalPaginas, (+$("#pdf-slider").value) + 1));

  // Leer TODAS las páginas con OCR client-side (Tesseract.js, sin servidor). Para
  // escaneados o cuando el automático no pudo. Rotación-aware (lee derecho lo rotado).
  async function leerTodoOCR() {
    if (!pv.paginas.length) return;
    const btn = $("#ocr-todo"); const orig = btn.textContent; btn.disabled = true;
    const prog = $("#ocr-progreso"), fill = $("#ocr-prog-fill"), txt = $("#ocr-prog-txt"), eta = $("#ocr-prog-eta");
    const total = Math.min(pv.paginas.length, pv.doc?.numPages || pv.paginas.length);
    const t0 = performance.now();
    const pintar = (frac, etiqueta) => {
      fill.style.width = `${Math.min(100, Math.round(frac * 100))}%`;
      txt.textContent = etiqueta;
      const el = (performance.now() - t0) / 1000;
      eta.textContent = frac > 0.03 ? `~${Math.max(0, Math.round(el / frac - el))} s restantes` : "";
    };
    prog.classList.remove("hidden");
    pintar(0, "Iniciando OCR (cargando motor)…");
    try {
      const textos = []; let fallos = 0;
      for (let i = 0; i < total; i++) {
        btn.textContent = `OCR ${i + 1}/${total}`;
        try { // una página rota no aborta todo el OCR
          const canvas = await pv.canvasPagina(i + 1, { escala: 2 }); // alta-res, rotada
          const { texto } = await recon.reconocer("canvas", { canvas,
            onProgress: (p) => pintar((i + p) / total, `Leyendo página ${i + 1} de ${total}…`) });
          textos.push(texto || "");
        } catch (ePag) {
          console.warn(`OCR página ${i + 1} falló:`, ePag.message); textos.push(""); fallos++;
        }
        pintar((i + 1) / total, `Página ${i + 1} de ${total} lista`);
      }
      cifras = { ...vaciar(), ...extraer(textos) };
      pintarCifras(); recomputar();
      if (fallos) hint(`OCR completo con ${fallos} página(s) salteada(s). Revisá las cifras.`);
      const s = resumen(correrCruces(cifras));
      pintar(1, "OCR completo");
      hint(`OCR completo. Revisá las cifras (cruces: ✓${s.ok} ✗${s.difiere}). Corregí lo que falte con OCR de región.`);
    } catch (err) {
      hint("OCR falló: " + err.message);
    } finally {
      btn.textContent = orig; btn.disabled = false;
      setTimeout(() => prog.classList.add("hidden"), 1600);
    }
  }
  $("#ocr-todo").onclick = leerTodoOCR;

  $("#guardar-pdf").onclick = async () => {
    const btn = $("#guardar-pdf"); const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "⏳ Guardando…";
    try {
      const bytes = await pv.exportar(); // PDF con rotaciones aplicadas
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = ($("#comitente").value || "documento").replace(/[\\/:*?"<>|]/g, "_");
      a.href = url; a.download = `${base}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      aviso("No se pudo guardar el PDF", err.message);
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  };
  $("#cerrar-lienzo").onclick = () => {
    $("#lienzo").classList.add("hidden");
    document.body.classList.remove("con-pdf");
  };

  async function importarArchivo(file) {
    if (!file || !(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      aviso("Formato no válido", "Tiene que ser un PDF."); return;
    }
    const btn = $("#btn-pdf"); const orig = btn.textContent;
    btn.textContent = "⏳ Leyendo…"; btn.disabled = true;
    try {
      const buf = await file.arrayBuffer();
      // 1) El humano ve el PDF (lienzo client-side; el archivo no sale del navegador).
      mostrarControl();
      document.body.classList.add("con-pdf");
      $("#lienzo").classList.remove("hidden");
      // 1) Render del PDF CON BARRA DE PROGRESO (página X de N + tiempo restante).
      progreso(0.02, "Abriendo el PDF…");           // feedback inmediato (antes de la 1ª página)
      const t0 = performance.now();
      const paginas = await pv.cargar(buf.slice(0), (n, total) => {
        const frac = n / total, el = (performance.now() - t0) / 1000;
        progreso(frac, `Mostrando página ${n} de ${total}…`, frac > 0.05 ? `~${Math.max(0, Math.round(el / frac - el))} s` : "");
      });
      $("#lienzo-info").textContent = `${paginas} pág.`;
      montarNav(paginas);
      $("#comitente").value = file.name.replace(/\.pdf$/i, "");
      if ($("#chk-auto").checked) { progreso(0.95, "Enderezando páginas…"); await pv.autoEnderezar(); }
      // 2) ¿Nativo o escaneado? (lo decide el texto del PDF, ya renderizado).
      const pags = await pv.textoNativoConPos();
      const esNativo = pags.some((p) => p.items.length > 5);
      if (esNativo) {
        // Nativo: extracción por anclas on-prem (probada). Si no puede, NO es fatal.
        progreso(0.97, "Extrayendo cifras del balance…");
        try {
          const r = await fetch("/api/extraer", { method: "POST",
            headers: { "Content-Type": "application/pdf" }, body: buf });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
          const { cifras: extraidas } = await r.json();
          cifras = { ...vaciar(), ...extraidas };
          pintarCifras(); recomputar();
          await calcularProvenance(pags).catch(() => {}); // ubicá cada cifra en el PDF
          await autoReconocer(pags);                      // ¿formato conocido? completá lo que falte
        } catch (exErr) {
          console.warn("Extracción automática no disponible:", exErr.message);
          hint("No se extrajo automático — tocá cada cifra y marcá su recuadro en el PDF (OCR).");
        }
        progreso(null);
        hint(hintBase);
      } else {
        // Escaneado: OCR client-side CON BARRA DE PROGRESO (no el OCR del servidor, que es caja negra).
        progreso(null);
        hint("PDF escaneado — leyéndolo con OCR (mirá la barra de progreso)…");
        await leerTodoOCR();
      }
      acomodarBloques(); // abrir lo que falla, colapsar lo que cierra
    } catch (err) {
      progreso(null);
      // Falla dura: ni siquiera se pudo abrir/renderizar el PDF.
      document.body.classList.remove("con-pdf");
      $("#lienzo").classList.add("hidden");
      aviso("No se pudo abrir el PDF", err.message);
    } finally {
      btn.textContent = orig; btn.disabled = false;
    }
  }

  $("#btn-pdf").onclick = () => $("#pdf-input").click();
  $("#pdf-input").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importarArchivo(f); };

  // Arrastrar y soltar el balance en cualquier parte de la ventana.
  const dz = $("#dropzone");
  document.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) dz.classList.remove("drag"); });
  document.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("drag");
    const f = [...(e.dataTransfer?.files || [])].find((x) => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name));
    if (f) importarArchivo(f);
  });
  $("#btn-admin").onclick = () => {
    const va = $("#vista-admin");
    if (va.classList.contains("hidden")) {
      ocultarVistas();
      va.classList.remove("hidden");
      // El admin ve SOLO las jurisdicciones habilitadas (todas las pantallas).
      montarAdmin(va, jurs, () => cambiarJurisdiccion(registroGlobal.find((j) => j.id === sel.value)), rolActual);
    } else { irAHome(); }
  };
  $("#btn-super").onclick = () => {
    const vs = $("#vista-super");
    if (vs.classList.contains("hidden")) {
      ocultarVistas();
      vs.classList.remove("hidden");
      montarSuper(vs, registro, (accion) => { if (accion === "volver") irAHome(); });
    } else { irAHome(); }
  };
  recomputar();
  irAHome(); // landing por rol: supervisor/auditor → bandeja; agente/admin → inicio
}
init();
eyeify(document);   // ojito en el campo de contraseña del login (estático)
