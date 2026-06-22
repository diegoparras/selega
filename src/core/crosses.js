// crosses.js — Compatibilidad. Los 13 cruces YA NO están hardcodeados acá: son DATA
// (cruces-cpcen.js, seed del rule-pack) evaluada por el motor genérico (motor-cruces.js).
// Esta capa mantiene la firma vieja para la UI y los tests. Verificado idéntico al
// motor hardcodeado anterior en Abigail + 5 casos borde (test/test-motor.mjs).
//
// correrCruces(cifras) usa el set CPCEN por defecto; correrCruces(cifras, cruces) corre
// un set propio (el del rule-pack de la jurisdicción / lo que arme el Admin).
import { correrCrucesData, resumen as resumenMotor, OK, DIFIERE, NA, FALTA, TOL_DEFECTO } from "./motor-cruces.js";
import { CRUCES_CPCEN } from "./cruces-cpcen.js";

export const TOL = TOL_DEFECTO;
export { OK, DIFIERE, NA, FALTA };

export function correrCruces(cifras, cruces = CRUCES_CPCEN) {
  return correrCrucesData(cifras, cruces);
}

export const resumen = resumenMotor;
