// test-firma.mjs — Verifica el cableado de la firma (Trustux) dentro de Selega.
// El gate cap_firma se prueba a nivel de API; acá probamos el motor vendorizado end-to-end
// (carga del trust store ./server/firma/trust + veredicto correcto sobre los fixtures).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verificarFirmaPdf, trustRootsInfo } from "../server/firma/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (f) => readFileSync(join(HERE, "fixtures-firma", f));

let ok = 0;
const test = async (n, fn) => {
  try { await fn(); ok++; console.log(`  ✓ ${n}`); }
  catch (e) { console.error(`  ✗ ${n}\n    ${e.message}`); process.exitCode = 1; }
};

console.log("firma (Trustux en Selega)");

await test("trust store cargado (raíz de prueba presente)", () => {
  assert.ok(trustRootsInfo().length >= 1, "no se cargó ninguna raíz de ./server/firma/trust");
});

await test("PDF íntegro → 🟢 válida, CUIT del contador", async () => {
  const r = await verificarFirmaPdf(fx("01-firmado-integro.pdf"));
  assert.equal(r.global, "valida");
  assert.equal(r.firmas[0].integridad.ok, true);
  assert.equal(r.firmas[0].firmante.cuit, "20-12345678-9");
});

await test("PDF alterado → 🔴 inválida (integridad rota)", async () => {
  const r = await verificarFirmaPdf(fx("02-firmado-alterado.pdf"));
  assert.equal(r.global, "invalida");
  assert.equal(r.firmas[0].integridad.ok, false);
});

await test("PDF con SHA-1 → 🔴 inválida (algoritmo inseguro)", async () => {
  const r = await verificarFirmaPdf(fx("05-firma-sha1.pdf"));
  assert.equal(r.global, "invalida");
  assert.equal(r.firmas[0].algoritmo, "SHA-1");
});

await test("PDF de cert revocado → 🔴 inválida (CRL del trust store)", async () => {
  const r = await verificarFirmaPdf(fx("06-firmado-revocado.pdf"));
  assert.equal(r.global, "invalida");
  assert.equal(r.firmas[0].revocacion.revocado, true);
});

console.log(`\n${ok}/5 OK`);
