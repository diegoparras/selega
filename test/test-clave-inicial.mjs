// test-clave-inicial.mjs — La contrasena que se genera para el primer admin (sin SELEGA_ADMIN_PASS)
// nunca va al log: los registros del contenedor los ve cualquiera con acceso al panel. Queda en
// un archivo 0600 y el log solo dice donde leerla. Sin frameworks, como el resto de los tests.
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { guardarClaveInicial, avisoClaveInicial, ARCHIVO_CLAVE_INICIAL } from "../server/clave-inicial.js";

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok " : "  FALLA ") + msg); if (!cond) fallos++; };

const dir = mkdtempSync(join(tmpdir(), "selega-clave-"));
const ruta = guardarClaveInicial("clave-de-prueba-123", dir);
ok(ruta === join(dir, ARCHIVO_CLAVE_INICIAL), "la clave queda en el directorio indicado");
ok(readFileSync(ruta, "utf8").trim() === "clave-de-prueba-123", "el archivo tiene la clave");
if (process.platform !== "win32") ok((statSync(ruta).mode & 0o777) === 0o600, "permisos 0600");

const aviso = avisoClaveInicial({ email: "admin@x", ruta });
ok(aviso.some((l) => l.includes(ruta)), "el aviso dice donde leerla");
ok(aviso.every((l) => !l.includes("clave-de-prueba-123")), "el aviso NUNCA lleva la clave");
ok(aviso.some((l) => l.includes("SELEGA_ADMIN_PASS")), "el aviso dice como fijarla");

const noDir = join(dir, "soy-un-archivo");
writeFileSync(noDir, "x");
let error = null;
try { guardarClaveInicial("otra", noDir); } catch (e) { error = e; }
ok(error !== null, "si no se puede escribir, tira");
const avisoError = avisoClaveInicial({ email: "admin@x", error });
ok(avisoError.some((l) => l.includes("SELEGA_ADMIN_PASS")), "sin archivo, el aviso dice como entrar igual");
ok(avisoError.every((l) => !l.includes("otra")), "tampoco lleva la clave");

console.log(fallos ? `\n${fallos} FALLA(S)` : "\nTODO OK (clave inicial)");
process.exit(fallos ? 1 : 0);
