// firma/index.js — Adaptador de Trustux (firma-core) para Selega. Verifica firmas server-side
// (igual que la extracción: el documento no sale del contenedor ni se persiste). Capacidad
// gateada por el superadmin vía cap_firma (apagada por defecto).
//
// Soporta los tres estándares: PAdES (PDF), XAdES (XML / facturas AFIP) y CAdES (CMS .p7m/.p7s),
// detectando el tipo por contenido. Revocación por CRL del trust store (offline) y OCSP online
// opcional (gateada aparte por cap_firma_ocsp).
//
// El trust store son los .pem y .crl de ./trust/. Se cargan una vez al arrancar; agregar/quitar
// raíces = soltar/borrar un archivo y reiniciar.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verificar, cargarCert, cargarCRL } from "./verify.js";
import { verificarXml } from "./xades.js";
import { verificarCms } from "./cades.js";

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

/**
 * Verifica un documento firmado (PDF, XML o CMS). Detecta el tipo por su contenido.
 * @param {Buffer} buf
 * @param {{ocspOnline?: boolean}} opts  ocspOnline = consulta de revocación online (gateada por superadmin)
 */
export async function verificarFirma(buf, { ocspOnline = false } = {}) {
  cargarTrust();
  const head = buf.slice(0, 256).toString("latin1").replace(/^﻿/, "").trimStart();
  if (head.startsWith("%PDF")) {
    return { tipo: "PDF (PAdES)", ...(await verificar(buf, { trustRoots: _roots, crls: _crls, ocspOnline })) };
  }
  if (head.startsWith("<")) {
    return { tipo: "XML (XAdES)", ...(await verificarXml(buf.toString("utf8"), { trustRoots: _roots })) };
  }
  if (/^-----BEGIN (PKCS7|CMS)/.test(head) || buf[0] === 0x30) {
    return { tipo: "CMS (CAdES)", ...(await verificarCms(buf, { trustRoots: _roots, crls: _crls })) };
  }
  const e = new Error("Formato no reconocido: se espera un PDF, un XML o un CMS (.p7m/.p7s) firmado.");
  e.code = "formato";
  throw e;
}

/** Compat: el balance de Selega es un PDF; este alias mantiene las llamadas existentes. */
export const verificarFirmaPdf = (buf, opts) => verificarFirma(buf, opts);

/** Raíces de confianza activas (para mostrar en Admin). */
export function trustRootsInfo() {
  cargarTrust();
  return _rootsInfo;
}
