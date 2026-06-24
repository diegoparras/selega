// util.js — utilidades chicas y seguras, compartidas por la UI.

// Escapa texto para interpolar en innerHTML sin abrir XSS. Se usa SIEMPRE que se
// mete en el DOM un dato que viene de un rule-pack, del registro o del usuario.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Formato de monto es-AR para mostrar.
export const fmtMonto = (n) =>
  n == null ? "" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---- Ojito mostrar/ocultar en campos de contraseña (compartido en la suite) ----
const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.6 6.6A13.4 13.4 0 0 0 2 11s3.6 7 10 7a9.1 9.1 0 0 0 5.4-1.6"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;
// Envuelve cada input[type=password] aún sin decorar con un botón ojo. Idempotente; pasale el
// contenedor recién pintado para formularios dinámicos (admin). Bajo CSP estricto: sin inline.
export function eyeify(root) {
  (root || document).querySelectorAll('input[type="password"]').forEach((inp) => {
    if (inp.dataset.eye || inp.closest(".pass-wrap")) return;
    inp.dataset.eye = "1";
    const w = document.createElement("span"); w.className = "pass-wrap";
    if (inp.style.width) { w.style.width = inp.style.width; inp.style.width = "100%"; }
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    const b = document.createElement("button");
    b.type = "button"; b.className = "pass-toggle"; b.tabIndex = -1;
    b.setAttribute("aria-label", "Mostrar u ocultar la contraseña");
    b.innerHTML = EYE;
    b.addEventListener("click", () => {
      const s = inp.type === "password";
      inp.type = s ? "text" : "password";
      b.innerHTML = s ? EYE_OFF : EYE;
      inp.focus();
    });
    w.appendChild(b);
  });
}

// ---- Resaltado de sintaxis JSON en un <textarea> (overlay, sin dependencias) ----
function _jHLesc(x) { return x.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
export function jsonHL(s) {
  return _jHLesc(s).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b/g,
    (m, str, colon, num, bool, nul) => {
      if (str !== undefined) return colon ? `<span class="jk">${str}</span>${colon}` : `<span class="js">${str}</span>`;
      if (num !== undefined) return `<span class="jn">${num}</span>`;
      if (bool !== undefined) return `<span class="jb">${bool}</span>`;
      if (nul !== undefined) return `<span class="ju">${nul}</span>`;
      return m;
    });
}
// Envuelve el textarea con un <pre> coloreado detrás (texto del textarea transparente). Copia
// métricas computadas para alinear. Idempotente. Sólo para textareas NO tabbed (acá no rompe layout).
export function jsonHi(ta) {
  if (!ta || ta.dataset.jhl) return; ta.dataset.jhl = "1";
  const cs = getComputedStyle(ta);
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.display = cs.display === "inline" ? "inline-block" : cs.display;
  ta.parentNode.insertBefore(wrap, ta); wrap.appendChild(ta);
  const pre = document.createElement("pre");
  pre.className = "jhl"; pre.setAttribute("aria-hidden", "true");
  ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "whiteSpace",
    "wordBreak", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle", "boxSizing"
  ].forEach(p => { pre.style[p] = cs[p]; });
  pre.style.position = "absolute"; pre.style.inset = "0"; pre.style.margin = "0";
  pre.style.borderColor = "transparent"; pre.style.overflow = "hidden"; pre.style.pointerEvents = "none";
  pre.style.whiteSpace = "pre-wrap"; pre.style.overflowWrap = "break-word"; pre.style.background = "transparent";
  pre.style.color = cs.color;
  wrap.insertBefore(pre, ta);
  ta.style.position = "relative"; ta.style.background = "transparent"; ta.style.color = "transparent";
  ta.style.webkitTextFillColor = "transparent"; ta.style.caretColor = cs.color;
  const upd = () => { pre.innerHTML = jsonHL(ta.value) + "\n"; };
  const sync = () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; };
  ta.addEventListener("input", () => { upd(); sync(); });
  ta.addEventListener("scroll", sync);
  upd();
}
