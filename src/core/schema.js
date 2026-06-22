// schema.js — Esquema canónico de cifras de EECC (Selega)
// 18 campos numéricos + flags. Es el "esquema" que llena la extracción (manual,
// por plantilla Fulgoria, o por LLM) y que consumen los cruces. Agnóstico de formato.

export const CAMPOS = [
  // Patrimoniales (ESP)
  { id: "activo_total", label: "Activo total", estado: "ESP", tipo: "monto" },
  { id: "pasivo_total", label: "Pasivo total", estado: "ESP", tipo: "monto" },
  { id: "pn_esp", label: "Patrimonio neto (ESP)", estado: "ESP", tipo: "monto" },
  { id: "caja_bancos_cierre", label: "Caja y bancos (cierre)", estado: "ESP", tipo: "monto" },
  { id: "caja_bancos_inicio", label: "Caja y bancos (inicio)", estado: "ESP", tipo: "monto" },
  // Evolución del PN
  { id: "pn_cierre_eepn", label: "PN al cierre (EEPN)", estado: "EEPN", tipo: "monto" },
  { id: "resultado_eepn", label: "Resultado del ejercicio (EEPN)", estado: "EEPN", tipo: "monto" },
  // Resultados
  { id: "resultado_final_er", label: "Resultado final (ER)", estado: "ER", tipo: "monto" },
  // Flujo de efectivo
  { id: "metodo_efe", label: "Método EFE", estado: "EFE", tipo: "enum", opciones: ["directo", "indirecto"] },
  { id: "efvo_inicio", label: "Efectivo al inicio", estado: "EFE", tipo: "monto" },
  { id: "efvo_cierre", label: "Efectivo al cierre", estado: "EFE", tipo: "monto" },
  { id: "variacion_efe", label: "Variación del efectivo", estado: "EFE", tipo: "monto" },
  { id: "flujo_operativo", label: "Flujo operativo", estado: "EFE", tipo: "monto" },
  { id: "flujo_inversion", label: "Flujo de inversión", estado: "EFE", tipo: "monto" },
  { id: "flujo_financiacion", label: "Flujo de financiación", estado: "EFE", tipo: "monto" },
  { id: "recpam_efectivo", label: "RECPAM del efectivo", estado: "EFE", tipo: "monto" },
  // Anexos
  { id: "amort_anexo_bsuso_ejercicio", label: "Amortización Anexo Bs. Uso (ejercicio)", estado: "Anexo", tipo: "monto" },
  { id: "amort_anexo_gastos", label: "Amortización Anexo Gastos", estado: "Anexo", tipo: "monto" },
  // Informe / otros
  { id: "deuda_seg_social_art10", label: "Deuda SIPA art. 10 ley 17.250", estado: "Informe", tipo: "monto" },
  { id: "tipo_societario", label: "Tipo societario", estado: "Carátula", tipo: "enum", opciones: ["SA", "SAS", "SRL", "cooperativa", "sin_fines_lucro", "otro"] },
  { id: "tiene_nota_prescindencia_sindicatura", label: "Nota prescindencia de sindicatura", estado: "Notas", tipo: "bool" },
  { id: "tiene_nota_pn_negativo", label: "Nota por PN negativo", estado: "Notas", tipo: "bool" },
];

export const vacio = () => Object.fromEntries(CAMPOS.map((c) => [c.id, null]));

// Datos de ejemplo (un EECC positivo limpio) — seed de demo.
export const EJEMPLO = {
  activo_total: 196343896.44, pasivo_total: 65705541.22, pn_esp: 130638355.22,
  caja_bancos_cierre: 53865588.98, caja_bancos_inicio: 9886410.27,
  pn_cierre_eepn: 130638355.22, resultado_eepn: 17937895.80, resultado_final_er: 17937895.80,
  metodo_efe: "directo", efvo_inicio: 9886410.27, efvo_cierre: 53865588.98,
  variacion_efe: 43979178.71, flujo_operativo: 80667490.77, flujo_inversion: -39986300.41,
  flujo_financiacion: 3297988.35, recpam_efectivo: -16337493.30,
  amort_anexo_bsuso_ejercicio: 68131095.87, amort_anexo_gastos: 68131095.87,
  deuda_seg_social_art10: 1808371.34, tipo_societario: "SA",
  tiene_nota_prescindencia_sindicatura: true, tiene_nota_pn_negativo: null,
};
