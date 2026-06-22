// extraer-anclas.js — Extractor de cifras EECC por anclas de rótulo. PURO y
// compartido (servidor y navegador): recibe el texto por página → localiza estados
// por cuerpo → saca las 18 cifras. Port del extractor validado en Python (~21/22).

const NUM = /-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|-?\d+,\d{2}/g;
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const parse = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
const preparar = (l) => String(l).replace(/\((\d[\d.]*(?:,\d{2})?)\)/g, "-$1"); // negativos contables
const nums = (line) => [...preparar(line).matchAll(NUM)].map((m) => parse(m[0]));

function buscarNum(lns, pred, salto = 0, ventana = 10) {
  for (let i = 0; i < lns.length; i++) {
    if (pred(norm(lns[i]))) {
      const acc = [];
      for (const cand of lns.slice(i, i + 1 + ventana)) {
        for (const n of nums(cand)) { acc.push(n); if (acc.length > salto) return acc[salto]; }
      }
    }
  }
  return null;
}

const total = (pal, ...excl) => (l) =>
  (l.includes(`total ${pal}`) || l.includes(`total del ${pal}`) || l.includes(`total de ${pal}`))
  && !l.includes("corriente") && !excl.some((x) => l.includes(x));

const REGLAS = {
  activo_total: [total("activo"), 0],
  pasivo_total: [total("pasivo", "patrimonio", "mas patrimonio", "+ patrimonio", "neto"), 0],
  pn_esp: [(l) => (l.includes("patrimonio neto") && !l.includes("total") && !l.includes("evolucion") && !l.includes("mas") && !l.includes("estado"))
    || l.trim() === "total del patrimonio neto" || l.trim() === "total patrimonio neto", 0],
  caja_bancos_cierre: [(l) => l.includes("caja y bancos") || l.includes("efectivo y equivalentes") || l.includes("caja y banco") || l.includes("disponibilidades"), 0],
  caja_bancos_inicio: [(l) => l.includes("caja y bancos") || l.includes("efectivo y equivalentes") || l.includes("caja y banco") || l.includes("disponibilidades"), 1],
  resultado_final_er: [(l) => (l.includes("resultado final") || l.includes("resultado del ejercicio") || l.includes("resultado neto del ejercicio")
    || l.includes("superavit") || l.includes("deficit") || l.includes("ganancia (perdida) del ejercicio") || l.includes("ganancia del ejercicio"))
    && !l.includes("ajuste") && !l.includes("antes"), 0],
  resultado_eepn: [(l) => l.includes("resultado del ejercicio") || l.includes("superavit") || l.includes("deficit") || l.includes("resultado del periodo"), 0],
  efvo_inicio: [(l) => l.includes("efectivo al inicio") || l.includes("al inicio del ejercicio"), 0],
  efvo_cierre: [(l) => l.includes("efectivo al cierre") || l.includes("al cierre del ejercicio"), 0],
  variacion_efe: [(l) => (l.includes("aumento") || l.includes("disminucion")) && l.includes("efectivo") && !l.includes("variaciones del"), 0],
  flujo_operativo: [(l) => l.includes("flujo neto") && (l.includes("operativ") || l.includes("operacion")), 0],
  flujo_inversion: [(l) => l.includes("flujo neto") && l.includes("inversi"), 0],
  flujo_financiacion: [(l) => l.includes("flujo neto") && l.includes("financ"), 0],
  recpam_efectivo: [(l) => l.includes("recpam del efectivo") || (l.includes("recpam") && l.includes("efectivo")), 0],
};

const CUERPO = {
  esp: (t) => t.includes("total del activo") || t.includes("total activo"),
  er: (t) => t.includes("estado de resultados") || t.includes("estado de recursos y gastos") || t.includes("total de recursos")
    || t.includes("total recursos") || t.includes("resultado del ejercicio") || t.includes("resultado final") || t.includes("resultado neto del ejercicio"),
  eepn: (t) => t.includes("saldos al cierre") || (t.includes("evolucion del patrimonio neto") && t.includes("resultado del ejercicio")),
  efe: (t) => t.includes("efectivo al cierre") || t.includes("flujo neto de efectivo") || t.includes("causas de las variaciones del efectivo")
    || (t.includes("al cierre del ejercicio") && t.includes("fondos")) || (t.includes("del efectivo") && (t.includes("aumento") || t.includes("disminucion"))),
};

function localizar(pageTexts) {
  const cats = [...Object.keys(CUERPO), "ax_bsuso", "ax_gastos", "informe"];
  const mapa = Object.fromEntries(cats.map((c) => [c, []]));
  pageTexts.forEach((txt, i) => {
    const t = norm(txt);
    for (const [c, pred] of Object.entries(CUERPO)) if (pred(t)) mapa[c].push(i);
    if (t.includes("bienes de uso") && t.includes("amortiz")) mapa.ax_bsuso.push(i);
    if ((t.includes("gastos") || t.includes("costos")) && t.includes("amortiz")) mapa.ax_gastos.push(i);
    if (t.includes("previsional argentino") || (t.includes("informe") && t.includes("auditor"))) mapa.informe.push(i);
  });
  return mapa;
}

const lineasDe = (pageTexts, idxs, n = 1) =>
  (idxs || []).slice(0, n).flatMap((i) => pageTexts[i].split("\n").map((x) => x.trim()).filter(Boolean));

export function extraer(pageTexts) {
  const mapa = localizar(pageTexts);
  const S = {
    esp: lineasDe(pageTexts, mapa.esp, 1), er: lineasDe(pageTexts, mapa.er, 1),
    eepn: lineasDe(pageTexts, mapa.eepn, 2), efe: lineasDe(pageTexts, mapa.efe, 1),
    ax_bsuso: lineasDe(pageTexts, mapa.ax_bsuso, 1), ax_gastos: lineasDe(pageTexts, mapa.ax_gastos, 1),
    informe: lineasDe(pageTexts, mapa.informe, 3),
  };
  const fulln = norm(pageTexts.join("\n"));
  const ambito = {
    activo_total: S.esp, pasivo_total: S.esp, pn_esp: S.esp, caja_bancos_cierre: S.esp, caja_bancos_inicio: S.esp,
    resultado_final_er: S.er, resultado_eepn: S.eepn, efvo_inicio: S.efe, efvo_cierre: S.efe, variacion_efe: S.efe,
    flujo_operativo: S.efe, flujo_inversion: S.efe, flujo_financiacion: S.efe, recpam_efectivo: S.efe,
  };
  const c = {};
  for (const [campo, lns] of Object.entries(ambito)) {
    const [pred, salto] = REGLAS[campo];
    c[campo] = lns.length ? buscarNum(lns, pred, salto) : null;
  }
  const efen = norm(S.efe.join("\n"));
  c.metodo_efe = (efen.includes("cobros por venta") || efen.includes("cobranzas por venta")) ? "directo" : (S.efe.length ? "indirecto" : null);

  c.pn_cierre_eepn = null;
  for (let i = 0; i < S.eepn.length; i++) {
    if (norm(S.eepn[i]).includes("saldos al cierre")) {
      const seq = S.eepn.slice(i).flatMap(nums);
      if (seq.length >= 2) c.pn_cierre_eepn = seq[seq.length - 2];
      break;
    }
  }
  c.amort_anexo_bsuso_ejercicio = null;
  for (let i = 0; i < S.ax_bsuso.length; i++) {
    if (norm(S.ax_bsuso[i]).startsWith("totales")) {
      const seq = S.ax_bsuso.slice(i, i + 15).flatMap(nums);
      if (seq.length > 4) c.amort_anexo_bsuso_ejercicio = seq[4];
      break;
    }
  }
  c.amort_anexo_gastos = null;
  for (let i = 0; i < S.ax_gastos.length; i++) {
    if (norm(S.ax_gastos[i]).includes("amortiz")) {
      const seq = S.ax_gastos.slice(i, i + 8).flatMap(nums);
      if (seq.length >= 3) c.amort_anexo_gastos = seq[2];
      break;
    }
  }
  const mi = norm(S.informe.join("\n")).match(/previsional argentino[\s\S]*?\$\s*(-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|-?\d+,\d{2})/);
  c.deuda_seg_social_art10 = mi ? parse(mi[1]) : null;

  const head = fulln.slice(0, 800);
  c.tipo_societario = /\bs\.?a\.?s\b/.test(head) ? "SAS" : /\bs\.?a\b/.test(head) ? "SA"
    : /\bs\.?r\.?l\b/.test(head) ? "SRL" : head.includes("cooperativa") ? "cooperativa"
    : (head.includes("asociacion civil") || head.includes("fundacion")) ? "sin_fines_lucro" : "otro";
  c.tiene_nota_prescindencia_sindicatura = /prescindid. de la sindicatura|art.?\s*284/.test(fulln);
  c.tiene_nota_pn_negativo = null;
  return c;
}
