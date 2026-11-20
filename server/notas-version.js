// notas-version.js — Notas de la version de package.json, sacadas del CHANGELOG.md (las usa el
// CI para el resumen de la corrida y el Release). Sale con error si la version no tiene su
// seccion: ningun deploy sin decir que cambia.
//   node server/notas-version.js            -> markdown de la version actual
//   node server/notas-version.js --version  -> solo el numero
import { todas, notasMarkdown, versionInstalada } from "./novedades.js";

const version = versionInstalada();
if (process.argv.includes("--version")) {
  process.stdout.write(version);
} else {
  const v = todas().find((x) => x.version === version);
  if (!v || !v.secciones.length) {
    console.error(`CHANGELOG.md no tiene la seccion "## [${version}]" (o esta vacia): agregala antes de publicar.`);
    process.exit(1);
  }
  process.stdout.write(notasMarkdown(v));
}
