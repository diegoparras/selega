// Test del núcleo: los cruces sobre el caso ejemplo deben cerrar (10 OK), y un
// caso negativo (pasivo roto) debe reportar la diferencia exacta. Sin frameworks.
import { correrCruces, resumen, OK, DIFIERE } from "../src/core/crosses.js";
import { EJEMPLO } from "../src/core/schema.js";
import { crucesAObservaciones, desenlace } from "../src/core/decision.js";

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fallos++; };

console.log("== Cruces sobre ejemplo (positivo limpio) ==");
const res = correrCruces(EJEMPLO);
const r = resumen(res);
console.log(`  resumen: ✓${r.ok} ✗${r.difiere} ·${r.na} ?${r.falta}`);
ok(r.ok === 10, "10 cruces OK");
ok(r.difiere === 0, "0 cruces DIFIEREN");
ok(desenlace(crucesAObservaciones(res)).resultado === "legaliza", "desenlace = legaliza");

console.log("== Caso negativo (rompo pasivo +1.000.000) ==");
const malo = { ...EJEMPLO, pasivo_total: EJEMPLO.pasivo_total + 1_000_000 };
const c1 = correrCruces(malo).find((x) => x.id === 1);
ok(c1.estado === DIFIERE && Math.abs(c1.diferencia + 1_000_000) < 0.01,
   `cruce 1 DIFIERE con dif. exacta (${c1.diferencia})`);
ok(desenlace(crucesAObservaciones(correrCruces(malo))).resultado === "deniega",
   "desenlace = deniega (denegación directa)");

console.log(fallos ? `\nFALLARON ${fallos}` : "\nTODO OK ✅");
process.exit(fallos ? 1 : 0);
