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
