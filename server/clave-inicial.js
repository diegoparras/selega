// clave-inicial.js — Contrasena generada del primer admin (sin SELEGA_ADMIN_PASS).
//
// NUNCA va al log: los registros del contenedor los ve cualquiera con acceso al panel y quedan
// guardados. Se escribe en un archivo 0600 (por defecto en el directorio temporal del
// contenedor; SELEGA_SECRETOS_DIR lo cambia, p. ej. a un volumen) y el log solo dice donde
// leerla. Si el archivo no se puede escribir o se pierde, SELEGA_ADMIN_PASS + reinicio resetea
// la contrasena del admin (ver seedAdmin): nunca se queda afuera.
import { writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ARCHIVO_CLAVE_INICIAL = "selega-admin-clave-inicial";

/** Escribe la clave en dir con permisos 0600 y devuelve la ruta. Tira si no puede. */
export function guardarClaveInicial(clave, dir = process.env.SELEGA_SECRETOS_DIR || tmpdir()) {
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, ARCHIVO_CLAVE_INICIAL);
  writeFileSync(ruta, `${clave}\n`, { mode: 0o600 });
  chmodSync(ruta, 0o600); // writeFileSync no cambia los permisos de un archivo que ya existia
  return ruta;
}

/** Renglones del aviso de arranque. Nunca llevan la clave. */
export function avisoClaveInicial({ email, ruta, error }) {
  if (error) {
    return [
      `  Login:  ${email}  (contrasena generada; no se pudo guardar: ${error.message || error})`,
      "  Para entrar: defini SELEGA_ADMIN_PASS y reinicia (resetea la contrasena del admin).",
    ];
  }
  return [
    `  Login:  ${email}  (contrasena generada, no se muestra en el log)`,
    `  Leela desde la consola del servicio:  cat ${ruta}`,
    "  Cambiala despues de entrar y borra ese archivo. Para fijarla: SELEGA_ADMIN_PASS.",
  ];
}
