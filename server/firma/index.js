// firma/index.js — Adaptador de Trustux (firma-core) para Selega.
// Verifica firmas PAdES server-side (igual que la extracción, el PDF no sale del contenedor;
// acá ni se persiste). Capacidad gateada por el superadmin vía cap_firma (apagada por defecto).
//
// El trust store son los .pem de ./trust/ (AC Raíz República Argentina + ACs del Consejo).
// Se cargan una vez al arrancar; agregar/quitar raíces = soltar/borrar un .pem y reiniciar.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verificar, cargarCert, cargarCRL } from "./verify.js";

const TRUST_DIR = join(dirname(fileURLToPath(import.meta.url)), "trust");

let _roots = null, _rootsInfo = null, _crls = null;
function cargarTrust() {
  if (_roots) return;
  _roots = []; _rootsInfo = []; _crls = [];
  let files = [];
  try { files = readdirSync(TRUST_DIR); } catch { /* sin dir */ }
  for (const f of files) {
    try {
      if (/\.(pem|crt|cer)$/i.test(f)) {
        const cert = cargarCert(readFileSync(join(TRUST_DIR, f)));
        _roots.push(cert);
        const cn = cert.subject.typesAndValues.find((t) => t.type === "2.5.4.3");
        _rootsInfo.push({ archivo: f, cn: cn ? cn.value.valueBlock.value : f });
      } else if (/\.crl$/i.test(f)) {
        _crls.push(cargarCRL(readFileSync(join(TRUST_DIR, f))));
      }
    } catch { /* archivo ilegible: lo ignoramos */ }
  }
}

/** Verifica todas las firmas de un PDF. El PDF no se guarda. */
export async function verificarFirmaPdf(pdf) {
  cargarTrust();
  return verificar(pdf, { trustRoots: _roots, crls: _crls });
}

/** Raíces de confianza activas (para mostrar en Admin). */
export function trustRootsInfo() {
  cargarTrust();
  return _rootsInfo;
}
