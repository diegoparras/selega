// cruces-cpcen.js — Los 13 cruces de CPCEN (Neuquén) expresados como DATA para el
// motor genérico (motor-cruces.js). Es el SEED por defecto; cada jurisdicción puede
// customizarlo desde el constructor visual del Admin. JSON puro → va al rule-pack.

export const CRUCES_CPCEN = [
  { id: 1, nombre: "Igualdad patrimonial (A = P + PN)", tipo: "comparacion", condicion: "siempre",
    izq: ["activo_total"], comparador: "=", der: ["pasivo_total", "+", "pn_esp"], tolerancia: 1,
    consecuencia: "denegacion_directa", ref: "RT 9" },

  { id: 2, nombre: "PN: ESP = EEPN", tipo: "comparacion", condicion: "siempre",
    izq: ["pn_esp"], comparador: "=", der: ["pn_cierre_eepn"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 3, nombre: "Resultado: ER = EEPN", tipo: "comparacion", condicion: "siempre",
    izq: ["resultado_final_er"], comparador: "=", der: ["resultado_eepn"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 4, nombre: "Efectivo: ESP = EFE (cierre)", tipo: "comparacion", condicion: "siempre",
    izq: ["caja_bancos_cierre"], comparador: "=", der: ["efvo_cierre"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 5, nombre: "Variación EFE = cierre − inicio", tipo: "comparacion", condicion: "siempre",
    izq: ["variacion_efe"], comparador: "=", der: ["efvo_cierre", "−", "efvo_inicio"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 51, nombre: "Variación EFE = Op + Inv + Fin", tipo: "comparacion", condicion: "siempre",
    izq: ["variacion_efe"], comparador: "=", der: ["flujo_operativo", "+", "flujo_inversion", "+", "flujo_financiacion"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 6, nombre: "Resultado: ER = EFE (indirecto)", tipo: "comparacion",
    condicion: { campo: "metodo_efe", op: "=", valor: "indirecto" }, detalleNA: "EFE no indirecto",
    izq: ["resultado_final_er"], comparador: "=", der: ["resultado_efe_concil"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 7, nombre: "Amortizaciones: ER = EFE (indirecto)", tipo: "comparacion",
    condicion: { campo: "metodo_efe", op: "=", valor: "indirecto" }, detalleNA: "EFE no indirecto",
    izq: ["amort_er"], comparador: "=", der: ["amort_efe"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 8, nombre: "Imp. Ganancias: ER = EFE (indirecto)", tipo: "comparacion",
    condicion: { campo: "metodo_efe", op: "=", valor: "indirecto" }, detalleNA: "EFE no indirecto",
    izq: ["ig_er"], comparador: "=", der: ["ig_efe"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 9, nombre: "RECPAM del efectivo expuesto en EFE", tipo: "presencia",
    condicion: { campo: "metodo_efe", op: "=", valor: "directo" }, detalleNA: "EFE no directo",
    campo: "recpam_efectivo", debe: "presente", faltaEstado: "DIFIERE",
    detalleOK: "línea propia presente", detalleFalta: "no se expone línea de RECPAM", consecuencia: "denegacion_directa" },

  { id: 10, nombre: "Amortizaciones: Anexo Bs.Uso = Anexo Gastos", tipo: "comparacion", condicion: "siempre",
    izq: ["amort_anexo_bsuso_ejercicio"], comparador: "=", der: ["amort_anexo_gastos"], tolerancia: 1, consecuencia: "denegacion_directa" },

  { id: 11, nombre: "Seg. social art. 10 ley 17.250", tipo: "presencia", condicion: "siempre",
    campo: "deuda_seg_social_art10", debe: "presente", faltaEstado: "DIFIERE",
    detalleOK: "deuda SIPA declarada", detalleFalta: "falta leyenda de deuda previsional", consecuencia: "denegacion_directa" },

  { id: 12, nombre: "Nota por PN negativo", tipo: "presencia",
    condicion: { campo: "pn_esp", op: "<", valor: 0, sinDato: "falta" }, detalleNA: "PN positivo",
    campo: "tiene_nota_pn_negativo", debe: "verdadero", faltaEstado: "DIFIERE",
    detalleOK: "nota presente", detalleFalta: "PN<0 SIN nota exigida", consecuencia: "denegacion_directa" },

  { id: 13, nombre: "Nota prescindencia sindicatura (SA/SAS)", tipo: "presencia",
    condicion: { campo: "tipo_societario", op: "en", valor: ["SA", "SAS"] }, detalleNA: "otro tipo societario",
    campo: "tiene_nota_prescindencia_sindicatura", debe: "verdadero", faltaEstado: "DIFIERE",
    detalleOK: "nota art. 284 presente", detalleFalta: "falta nota de prescindencia", consecuencia: "denegacion_directa" },
];
