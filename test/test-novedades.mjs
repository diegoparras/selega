// test-novedades.mjs — Novedades por version: salen del CHANGELOG.md (una sola fuente) y se
// muestran en el log de arranque (deploy en EasyPanel), en la UI al entrar despues de una
// actualizacion y en el Release de GitHub. Sin frameworks, como el resto de los tests.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as nov from "../server/novedades.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok " : "  FALLA ") + msg); if (!cond) fallos++; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const MUESTRA = `# Changelog

Formato basado en Keep a Changelog.

## [0.3.0] - 2026-11-21

### Nuevo
- **Novedades** en la UI: se ven al entrar
  despues de una actualizacion (\`GET /api/novedades\`).

### Corregido
- Un arreglo corto.

## [0.2.1] - 2026-11-20

### Corregido
- Otro arreglo.

## [0.2.0] - 2026-11-19

### Nuevo
- Algo grande.
`;

console.log("== Parser del CHANGELOG ==");
{
  const v = nov.parsear(MUESTRA);
  ok(igual(v.map((x) => x.version), ["0.3.0", "0.2.1", "0.2.0"]), "versiones en orden");
  ok(v[0].fecha === "2026-11-21", "fecha de la version");
  ok(igual(v[0].secciones.map((s) => s.titulo), ["Nuevo", "Corregido"]), "secciones");
  ok(igual(v[0].secciones[0].items, ["**Novedades** en la UI: se ven al entrar despues de una actualizacion (`GET /api/novedades`)."]),
    "item multilinea unido");
  ok(igual(nov.parsear(MUESTRA.replace(/\n/g, "\r\n")).map((x) => x.version), ["0.3.0", "0.2.1", "0.2.0"]), "tolera CRLF");
}

console.log("== Desde la ultima version vista ==");
{
  const v = nov.parsear(MUESTRA);
  ok(igual(nov.desde(v, "0.2.0", "0.3.0").map((x) => x.version), ["0.3.0", "0.2.1"]), "de la mas nueva a la mas vieja");
  ok(igual(nov.desde(v, "0.3.0", "0.3.0"), []), "ya vista: nada que mostrar");
  ok(igual(nov.desde(v, null, "0.3.0").map((x) => x.version), ["0.3.0"]), "primera vez: solo la actual");
  ok(igual(nov.desde(v, "0.2.0", "0.2.1").map((x) => x.version), ["0.2.1"]), "nunca muestra versiones posteriores a la que corre");
  ok(igual(nov.desde(v, "0.10.0", "0.3.0"), []), "compara como version, no como texto");
}

console.log("== Texto plano para el log y markdown para el Release ==");
{
  const [v] = nov.parsear(MUESTRA);
  ok(igual(nov.lineasLog(v), [
    "Nuevo: Novedades en la UI: se ven al entrar despues de una actualizacion (GET /api/novedades).",
    "Corregido: Un arreglo corto.",
  ]), "lineas de log sin markdown");
  const md = nov.notasMarkdown(v);
  ok(/^### Nuevo\n- \*\*Novedades\*\* en la UI/.test(md), "markdown conserva el formato");
  ok(/### Corregido\n- Un arreglo corto\./.test(md), "markdown trae todas las secciones");
}

console.log("== Cartel de arranque ==");
{
  const v = nov.parsear(MUESTRA);
  const l = nov.cartelArranque("0.3.0", v, 60);
  ok(l.every((x) => x.length <= 60), "ningun renglon pasa el ancho (sin scroll lateral)");
  ok(/^=+$/.test(l[0]) && /^=+$/.test(l[l.length - 1]), "enmarcado con rayas");
  ok(l[1] === "SELEGA v0.3.0  (2026-11-21)", "primero la version y la fecha");
  ok(l[2] === "Que cambia en esta version:", "despues que cambia");
  ok(l[3] === "- Nuevo: Novedades en la UI: se ven al entrar despues de una", "corta al ancho");
  ok(/^ {4}actualizacion/.test(l[4]), "la continuacion queda sangrada");
  ok(!l.some((x) => /\*\*|`/.test(x)), "sin markdown");
  ok(nov.cartelArranque("0.3.0", v).every((x) => x.length <= 80), "por defecto, 80 columnas");
  const sin = nov.cartelArranque("9.9.9", v, 60);
  ok(sin[1] === "SELEGA v9.9.9", "version sin seccion: igual la muestra");
  ok(sin[2] === "Sin notas para esta version en el CHANGELOG.", "y avisa que no hay notas");
  ok(nov.cartelArranque("1.0.0", null)[2] === "Sin notas para esta version en el CHANGELOG.", "sin CHANGELOG no rompe");
}

console.log("== El CHANGELOG real tiene la seccion de la version de package.json ==");
{
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  let v = [];
  try { v = nov.parsear(readFileSync(join(root, "CHANGELOG.md"), "utf8")); } catch { /* falta el archivo */ }
  const actual = v.find((x) => x.version === version);
  ok(!!actual, `existe "## [${version}]" en CHANGELOG.md`);
  ok(!!actual && actual.secciones.some((s) => s.items.length), `la seccion ${version} no esta vacia`);
  ok(v.length > 0 && v[0].version === version, "la version de package.json es la primera del CHANGELOG");
  ok(nov.todas().some((x) => x.version === version), "todas() lee el CHANGELOG de la instalacion");
}

console.log(fallos ? `\nFALLARON ${fallos}` : "\nTODO OK");
process.exit(fallos ? 1 : 0);
