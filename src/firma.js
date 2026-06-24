// firma.js — Panel de verificación de firma digital (Trustux) en el lienzo de Selega.
// Manda el PDF actual a /api/firma/verificar (server-side, gateado por cap_firma) y pinta
// el veredicto con iconos. Solo se monta si el superadmin habilitó la firma (firma_disponible).
import { esc } from "./util.js";

// Iconos SVG inline (sin emojis). Heredan color por currentColor desde la clase de estado.
const ICO = {
  check: '<svg class="firma-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg class="firma-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  alert: '<svg class="firma-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v4.5"/><path d="M12 17h.01"/></svg>',
  dot: '<svg class="firma-ico" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="12" cy="12" r="3"/></svg>',
  shield: '<svg class="firma-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6l-7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
};

// estado → { icono, clase de color, texto }
const SEM = {
  valida:      { ico: ICO.shield, cls: "c-ok", txt: "Firma válida" },
  observada:   { ico: ICO.alert, cls: "c-warn", txt: "Firma con observaciones" },
  invalida:    { ico: ICO.x, cls: "c-bad", txt: "Firma inválida" },
  "sin-firma": { ico: ICO.dot, cls: "c-mut", txt: "El documento no tiene firma digital" },
};

// getBytes: () => ArrayBuffer|null  — devuelve los bytes del PDF actualmente cargado.
export function initFirma({ getBytes }) {
  const btn = document.querySelector("#btn-verificar-firma");
  const out = document.querySelector("#firma-result");
  const chip = document.querySelector("#chip-firma");
  if (!btn || !out) return;

  btn.onclick = async () => {
    const bytes = getBytes();
    if (!bytes) { out.innerHTML = `<p class="firma-hint">Primero importá un PDF.</p>`; return; }
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Verificando…";
    out.innerHTML = `<p class="firma-hint">Verificando la firma…</p>`;
    try {
      const r = await fetch("/api/firma/verificar", {
        method: "POST", headers: { "Content-Type": "application/pdf" }, body: bytes.slice(0) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      out.innerHTML = render(data);
      if (chip) {
        const g = SEM[data.global] || SEM["sin-firma"];
        chip.textContent = g.txt.replace(/^Firma /, "");
        chip.className = "bq-chip firma-chip " + g.cls;
      }
    } catch (e) {
      out.innerHTML = `<p class="firma-hint firma-error">${esc(e.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  };
}

// Línea de detalle: icono + color + texto.
function linea(ok, okTxt, malTxt) {
  return ok
    ? `<li class="c-ok">${ICO.check}<span>${esc(okTxt)}</span></li>`
    : `<li class="c-bad">${ICO.x}<span>${esc(malTxt)}</span></li>`;
}
function lineaNota(txt) {
  return `<li class="c-mut">${ICO.dot}<span>${esc(txt)}</span></li>`;
}

function render({ firmas = [], global }) {
  const g = SEM[global] || SEM["sin-firma"];
  const cab = `<div class="firma-global ${g.cls}">${g.ico}<strong>${esc(g.txt)}</strong></div>`;
  if (!firmas.length) return cab;

  const cards = firmas.map((f) => {
    const s = SEM[f.estado] || SEM.observada;
    const fr = f.firmante || {};
    const ident = [fr.nombre || "Firmante desconocido",
      fr.cuit ? `CUIT ${fr.cuit}` : null, fr.rol || null].filter(Boolean).join(" · ");
    const rev = f.revocacion || {};
    const revLinea = rev.revocado
      ? `<li class="c-bad">${ICO.x}<span>certificado revocado</span></li>`
      : (rev.metodo === "no-verificada"
        ? lineaNota("revocación no verificada (offline)")
        : `<li class="c-ok">${ICO.check}<span>certificado vigente</span></li>`);
    const extra = `algoritmo ${f.algoritmo || "?"}`
      + (f.selloTiempo?.presente ? " · con sello de tiempo" : "")
      + (f.firmadoEl ? " · firmado " + f.firmadoEl.slice(0, 10) : "");
    const obs = (f.observaciones || []).filter(Boolean).map((o) => `<li>${esc(o)}</li>`).join("");
    return `<div class="firma-card">
      <div class="firma-card-top ${s.cls}">${s.ico}<strong>${esc(s.txt)}</strong></div>
      <div class="firma-firmante">${esc(ident)}</div>
      <ul class="firma-detalle">
        ${linea(!!f.integridad?.ok, "no se modificó tras firmar", "modificado tras firmar")}
        ${linea(!!f.cadena?.confiable, f.cadena?.raiz || "cadena hasta una raíz confiable", "no llega a una raíz confiable")}
        ${revLinea}
        ${lineaNota(extra)}
      </ul>
      ${obs ? `<ul class="firma-obs">${obs}</ul>` : ""}
    </div>`;
  }).join("");
  return cab + cards;
}
