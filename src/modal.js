// modal.js — Modales reutilizables (sistema de diseño Escriba §8.10/9.4/9.5). Reemplazan
// los alert/confirm/prompt nativos: overlay difuminado + card animada, cierre con Escape
// o click afuera. La app AVISA, no falla mudo. API: aviso() / confirmar() / pedir().

let _back, _resolve;

function montar() {
  if (_back) return;
  _back = document.createElement("div");
  _back.className = "modal-back hidden";
  _back.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <button class="modal-x" aria-label="Cerrar">✕</button>
      <h3 class="modal-tit"></h3>
      <div class="modal-cuerpo"></div>
      <label class="modal-campo hidden"><span class="modal-campo-lbl"></span><input class="modal-input"></label>
      <div class="modal-acciones">
        <button class="ghost modal-cancel">Cancelar</button>
        <button class="modal-ok">Aceptar</button>
      </div>
    </div>`;
  document.body.appendChild(_back);
  const cerrar = (v) => { _back.classList.add("hidden"); const r = _resolve; _resolve = null; if (r) r(v); };
  _back.querySelector(".modal-x").onclick = () => cerrar(null);
  _back.querySelector(".modal-cancel").onclick = () => cerrar(null);
  _back.addEventListener("click", (e) => { if (e.target === _back) cerrar(null); });
  _back.querySelector(".modal-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); _back.querySelector(".modal-ok").click(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !_back.classList.contains("hidden")) cerrar(null); });
}

function abrir({ titulo, cuerpo, okText = "Aceptar", cancelText, peligro, input }) {
  montar();
  _back.querySelector(".modal-tit").textContent = titulo || "";
  _back.querySelector(".modal-cuerpo").innerHTML = cuerpo ? `<p>${cuerpo}</p>` : "";
  const campo = _back.querySelector(".modal-campo"), inp = _back.querySelector(".modal-input");
  campo.classList.toggle("hidden", !input);
  if (input) { _back.querySelector(".modal-campo-lbl").textContent = input.label || ""; inp.value = input.valor || ""; inp.placeholder = input.placeholder || ""; }
  const ok = _back.querySelector(".modal-ok"), cancel = _back.querySelector(".modal-cancel");
  ok.textContent = okText; ok.classList.toggle("peligro", !!peligro);
  cancel.style.display = cancelText === null ? "none" : "";
  if (cancelText) cancel.textContent = cancelText;
  return new Promise((resolve) => {
    _resolve = resolve;
    ok.onclick = () => { const v = input ? inp.value : true; _back.classList.add("hidden"); const r = _resolve; _resolve = null; r(v); };
    _back.classList.remove("hidden");
    if (input) setTimeout(() => inp.focus(), 40); else setTimeout(() => ok.focus(), 40);
  });
}

// Aviso (solo Aceptar). Reemplaza alert().
export const aviso = (titulo, cuerpo) => abrir({ titulo, cuerpo, cancelText: null });
// Confirmación (Cancelar / Confirmar). Reemplaza confirm(). Devuelve boolean.
export const confirmar = (titulo, cuerpo, opts = {}) =>
  abrir({ titulo, cuerpo, okText: opts.okText || "Confirmar", cancelText: opts.cancelText, peligro: opts.peligro }).then(Boolean);
// Pedir un dato (input + Cancelar/Aceptar). Reemplaza prompt(). Devuelve string o null.
export const pedir = (titulo, opts = {}) =>
  abrir({ titulo, cuerpo: opts.cuerpo, okText: opts.okText || "Aceptar",
    input: { label: opts.label, valor: opts.valor, placeholder: opts.placeholder } });
