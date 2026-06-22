// veredicto.js — Cómputo del veredicto y mapeos de estado, COMPARTIDOS entre la vista
// control (edición en vivo) y el Expediente (read-only). Única fuente de verdad para
// SEMAFORO y para "qué observa el checklist". Funciones puras: no tocan globales.
import { correrCruces, resumen } from "./crosses.js";
import { crucesAObservaciones, desenlace, ETIQUETA_DESENLACE } from "./decision.js";

// Desenlace técnico → color del semáforo.
export const SEMAFORO = { legaliza: "verde", subsanar_borrador: "amarillo", certifica_firma: "amarillo", deniega: "rojo" };
export const ORDEN_SEM = { rojo: 0, amarillo: 1, verde: 2 }; // los problemas primero

// Estado del workflow humano (ortogonal al desenlace técnico) → etiqueta legible.
export const ESTADO_LABEL = {
  en_curso: "En curso", pendiente_revision: "Pendiente de revisión",
  aprobado: "Aprobado", devuelto: "Devuelto", cerrado: "Cerrado",
};

// Observaciones que aportan los controles marcados "obs" (mismo criterio que el listener
// del checklist en el control: solo "obs" suma su consecuencia).
export function obsDeControles(controles, pack) {
  const out = [];
  for (const sec of (pack && pack.secciones) || [])
    for (const ctrl of sec.controles || [])
      if (controles && controles[ctrl.id] === "obs") out.push({ origen: ctrl.id, consecuencia: ctrl.consecuencia });
  return out;
}

// Veredicto completo desde cifras + controles GUARDADOS + pack (reproduce el del control).
export function computarVeredicto(cifras, controles, pack) {
  const res = correrCruces(cifras, pack && pack.cruces);
  const obs = [...crucesAObservaciones(res), ...obsDeControles(controles, pack)];
  const d = desenlace(obs, {}); // mismas opts que el control → veredicto idéntico
  return {
    res, resumen: resumen(res), desenlace: d,
    etiqueta: ETIQUETA_DESENLACE[d.resultado] || d.resultado,
    color: SEMAFORO[d.resultado] || "amarillo",
  };
}
