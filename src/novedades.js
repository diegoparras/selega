// novedades.js — "Qué cambió" en cada versión (sale del CHANGELOG.md vía GET /api/novedades).
// Al entrar después de una actualización se muestra UNA vez por navegador (localStorage guarda la
// última versión vista); el historial se abre desde el menú (Novedades) y desde "Acerca de".
// Las notas vienen en markdown mínimo: se ESCAPA el HTML primero y recién después se convierten
// **negrita** y `código` (nunca se inyecta HTML del CHANGELOG tal cual).
import { esc } from "./util.js";

const KEY = "selega.versionVista";
const I_X = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';

export function md(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}

function html(versiones) {
  return versiones.map((v) =>
    `<div class="nov-ver"><b>v${esc(v.version)}</b>${v.fecha ? `<span>${esc(v.fecha)}</span>` : ""}</div>` +
    v.secciones.map((s) => `<div class="nov-sec">${esc(s.titulo)}</div><ul class="nov-list">${s.items.map((i) => `<li>${md(i)}</li>`).join("")}</ul>`).join("")
  ).join("");
}

let back = null;
function montar() {
  if (back) return back;
  back = document.createElement("div");
  back.className = "modal-back hidden";
  back.innerHTML = `
    <div class="modal-card nov-card" role="dialog" aria-modal="true" aria-labelledby="nov-tit">
      <button class="modal-x" type="button" aria-label="Cerrar">${I_X}</button>
      <h3 class="modal-tit" id="nov-tit">Novedades</h3>
      <div class="modal-cuerpo"><p class="nov-bajada"></p><div class="nov-cuerpo"></div></div>
      <div class="modal-acciones"><button type="button" class="nov-ok">Entendido</button></div>
    </div>`;
  document.body.appendChild(back);
  const cerrar = () => back.classList.add("hidden");
  back.querySelector(".modal-x").onclick = cerrar;
  back.querySelector(".nov-ok").onclick = cerrar;
  back.addEventListener("click", (e) => { if (e.target === back) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !back.classList.contains("hidden")) cerrar(); });
  return back;
}

function mostrar(r, bajada) {
  const b = montar();
  b.querySelector(".nov-bajada").innerHTML = bajada;
  b.querySelector(".nov-cuerpo").innerHTML = r.versiones.length
    ? html(r.versiones)
    : '<p class="nov-vacio">No hay notas para esta versión.</p>';
  b.classList.remove("hidden");
  setTimeout(() => b.querySelector(".nov-ok").focus(), 40);
}

async function pedir(qs) {
  const r = await fetch("/api/novedades" + qs, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
}

/** Tras el login: si la versión instalada es nueva para este navegador, avisa qué cambió (una vez). */
export async function avisarNovedades() {
  let vista = null;
  try { vista = localStorage.getItem(KEY); } catch { /* sin storage */ }
  let r;
  try { r = await pedir(vista ? "?desde=" + encodeURIComponent(vista) : ""); } catch { return; }
  if (!r || !r.version) return;
  try { localStorage.setItem(KEY, r.version); } catch { /* sin storage */ }
  if (vista === r.version || !r.versiones.length) return;
  // No tapar otro modal abierto (login, aviso, configuración): queda en el menú, Novedades.
  if ([...document.querySelectorAll(".modal-back")].some((m) => m !== back && !m.classList.contains("hidden"))) return;
  mostrar(r, `Selega se actualizó a la <strong>v${esc(r.version)}</strong>. Esto cambió desde la última versión que viste:`);
}

/** Historial (menú, Novedades / Acerca de, Qué cambió): de la más nueva a la más vieja. */
export async function verNovedades() {
  try {
    const r = await pedir("?todas=1");
    mostrar({ ...r, versiones: r.versiones.slice(0, 15) },
      `Versión instalada: <strong>v${esc(r.version)}</strong>. Últimas versiones, de la más nueva a la más vieja:`);
  } catch (e) {
    mostrar({ versiones: [] }, `No se pudieron leer las novedades (${esc(e.message)}).`);
  }
}
