// test-motor.mjs — Golden test del motor genérico de cruces (motor-cruces.js + datos
// cruces-cpcen.js). Los valores esperados se fijaron verificando idéntico al motor
// hardcodeado anterior (Abigail + casos borde). Si cambia el motor o los datos, esto avisa.
import { correrCruces, resumen } from "../src/core/crosses.js";
import { EJEMPLO, vacio } from "../src/core/schema.js";

const casos = [
  ["Abigail (Ejemplo)", EJEMPLO, { ok: 10, difiere: 0, na: 4, falta: 0 }],
  ["A≠P+PN (rompe cruce 1)", { ...EJEMPLO, activo_total: EJEMPLO.activo_total + 1000 }, { ok: 9, difiere: 1, na: 4, falta: 0 }],
  ["PN<0 sin nota (cruce 12)", { ...vacio(), pn_esp: -5000, tiene_nota_pn_negativo: false }, { ok: 0, difiere: 2, na: 5, falta: 7 }],
  ["SRL (cruce 13 N/A)", { ...EJEMPLO, tipo_societario: "SRL" }, { ok: 9, difiere: 0, na: 5, falta: 0 }],
  ["EFE indirecto (cruces 6-8)", { ...EJEMPLO, metodo_efe: "indirecto" }, { ok: 9, difiere: 0, na: 2, falta: 3 }],
  ["Todo vacío", vacio(), { ok: 0, difiere: 1, na: 5, falta: 8 }],
];

let fallos = 0;
for (const [nombre, cifras, esperado] of casos) {
  const r = resumen(correrCruces(cifras));
  const ok = JSON.stringify(r) === JSON.stringify(esperado);
  console.log(`${ok ? "✓" : "✗"} ${nombre}  ${JSON.stringify(r)}`);
  if (!ok) { fallos++; console.log(`   esperado: ${JSON.stringify(esperado)}`); }
}
console.log(fallos === 0 ? "\n✓ motor OK" : `\n✗ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
