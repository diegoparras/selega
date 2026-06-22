// decision.js — Motor de decisión / desenlace (Selega)
// Computa el desenlace agregado de un trabajo a partir de las observaciones y su
// consecuencia, con la prioridad de la Res. 141 CPCEN (spec §7). Agnóstico de
// jurisdicción: las consecuencias las define el rule-pack de cada provincia.

export const CONSEC = {
  DENEGACION: "denegacion_directa",
  SUBSANABLE: "subsanable_tasa_borrador",
  CERTIFICA_FIRMA: "se_certifica_firma",
  LEGALIZA: "se_legaliza",
  OBSERVACION: "observacion",
};

// Mapea cruces que DIFIEREN a observaciones, con la consecuencia que define CADA cruce
// (data del rule-pack). Por el árbol del Excel CPCEN (Guia controles 2026, columna
// "Denegación directa"), los 14 cruces son denegación directa; pero la consecuencia es
// configurable por cruce, así que la tomamos del resultado (fallback: denegación).
export function crucesAObservaciones(resultados) {
  return resultados
    .filter((r) => r.estado === "DIFIERE")
    .map((r) => ({ origen: `cruce_${r.id}`, texto: r.nombre,
                   consecuencia: r.consecuencia || CONSEC.DENEGACION, detalle: r.detalle }));
}

export function desenlace(observaciones, { tasaBorrador = false, tasaUrgente = false } = {}) {
  const tiene = (cs) => observaciones.some((o) => o.consecuencia === cs);
  const motivos = [];
  let resultado;

  if (tiene(CONSEC.DENEGACION)) {
    if (tasaBorrador) { resultado = "subsanar_borrador";
      motivos.push("Causal de denegación directa, pero abonó tasa borrador: se devuelve para corregir."); }
    else { resultado = "deniega";
      motivos.push("Causal de denegación directa sin tasa borrador: se devuelve el trabajo."); }
  } else if (tiene(CONSEC.SUBSANABLE)) {
    resultado = tasaBorrador ? "subsanar_borrador" : "legaliza";
    motivos.push(tasaBorrador ? "Observación subsanable con tasa borrador."
      : "Observación subsanable sin tasa borrador: si el profesional opta por no corregir, se legaliza.");
  } else if (tiene(CONSEC.CERTIFICA_FIRMA)) {
    resultado = "certifica_firma";
    motivos.push("Falla que degrada a certificación de firma (Res. 141 §6.3/6.4).");
  } else {
    resultado = "legaliza";
    motivos.push("Sin observaciones que impidan: se legaliza.");
  }

  if (tasaUrgente && observaciones.length) {
    motivos.push("Tasa urgente con observación: pierde el carácter de urgente (Res. 676/21) y vuelve a la lista general de reingresos.");
  }
  return { resultado, motivos };
}

export const ETIQUETA_DESENLACE = {
  legaliza: "Se legaliza",
  subsanar_borrador: "Se devuelve para corregir (tasa borrador)",
  certifica_firma: "Se certifica solo la firma",
  deniega: "Se deniega / se devuelve",
};
