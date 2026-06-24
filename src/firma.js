// firma.js — Panel de verificación de firma digital (Trustux) en el lienzo de Selega.
// Manda el PDF actual a /api/firma/verificar (server-side, gateado por cap_firma) y pinta
// el veredicto con semáforo. Solo se monta si el superadmin habilitó la firma (firma_disponible).
import { esc } from "./util.js";

const SEM = {
  valida:      { dot: "#1f9d57", txt: "Firma válida" },
  observada:   { dot: "#d6a01a", txt: "Firma con observaciones" },
  invalida:    { dot: "#cf4a64", txt: "Firma inválida" },
  "sin-firma": { dot: "#9aa3b6", txt: "El documento no tiene firma digital" },
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
        chip.textContent = g.txt;
        chip.style.background = g.dot;
        chip.classList.remove("neutral");
      }
    } catch (e) {
      out.innerHTML = `<p class="firma-hint firma-error">${esc(e.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  };
}

function linea(ok, okTxt, malTxt) {
  return `<li class="${ok ? "fok" : "fmal"}">${ok ? "✓" : "✗"} ${esc(ok ? okTxt : malTxt)}</li>`;
}

function render({ firmas = [], global }) {
  const g = SEM[global] || SEM["sin-firma"];
  if (!firmas.length) {
    return `<div class="firma-global"><span class="firma-dot" style="background:${g.dot}"></span><strong>${esc(g.txt)}</strong></div>`;
  }
  const cards = firmas.map((f) => {
    const s = SEM[f.estado] || SEM.observada;
    const fr = f.firmante || {};
    const ident = [fr.nombre || "Firmante desconocido",
      fr.cuit ? `CUIT ${fr.cuit}` : null, fr.rol || null].filter(Boolean).join(" · ");
    const rev = f.revocacion || {};
    const revLinea = rev.revocado
      ? `<li class="fmal">✗ certificado revocado</li>`
      : (rev.metodo === "no-verificada"
        ? `<li class="fnota">— revocación no verificada (offline)</li>`
        : `<li class="fok">✓ certificado vigente</li>`);
    const obs = (f.observaciones || []).filter(Boolean).map((o) => `<li>${esc(o)}</li>`).join("");
    return `<div class="firma-card">
      <div class="firma-card-top"><span class="firma-dot" style="background:${s.dot}"></span><strong>${esc(s.txt)}</strong></div>
      <div class="firma-firmante">${esc(ident)}</div>
      <ul class="firma-detalle">
        ${linea(!!f.integridad?.ok, "no se modificó tras firmar", "modificado tras firmar")}
        ${linea(!!f.cadena?.confiable, f.cadena?.raiz || "cadena hasta una raíz confiable", "no llega a una raíz confiable")}
        ${revLinea}
        <li class="fnota">algoritmo ${esc(f.algoritmo || "?")}${f.selloTiempo?.presente ? " · con sello de tiempo" : ""}${f.firmadoEl ? " · firmado " + esc(f.firmadoEl.slice(0, 10)) : ""}</li>
      </ul>
      ${obs ? `<ul class="firma-obs">${obs}</ul>` : ""}
    </div>`;
  }).join("");
  return `<div class="firma-global"><span class="firma-dot" style="background:${g.dot}"></span><strong>${esc(g.txt)}</strong></div>${cards}`;
}
