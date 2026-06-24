// cades.js — Motor de verificación de firma CAdES (CMS / PKCS#7) de Trustux.
//
// CAdES firma datos sueltos (no un PDF ni un XML): un .p7m lleva el contenido adentro
// (enveloping) y un .p7s es la firma desprendida de un archivo aparte (detached). Es el mismo
// SignedData que vive dentro de un PDF firmado (PAdES), así que reusa TODO el motor PAdES:
// integridad, identidad (CUIT), cadena, revocación por CRL y allowlist de algoritmos.
import { ContentInfo, SignedData } from "pkijs";
import { toAB } from "./pades.js";
import { initEngine, cargarCert, certDelFirmante, identidadDe, validarCadena,
         chequearRevocacion, algoritmoDe } from "./verify.js";

const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";
const OID_TIMESTAMP = "1.2.840.113549.1.9.16.2.14";
const buscarAttr = (attrs, oid) => attrs?.attributes?.find((a) => a.type === oid) || null;

/** Parsea un CMS desde DER o PEM (-----BEGIN PKCS7-----) → pkijs.ContentInfo. */
function parseCMS(buf) {
  let der = buf;
  const head = buf.slice(0, 32).toString("latin1");
  if (/-----BEGIN/.test(head)) {
    const b64 = buf.toString("latin1").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    der = Buffer.from(b64, "base64");
  }
  return ContentInfo.fromBER(toAB(Buffer.from(der)));
}

/**
 * Verifica una firma CAdES (CMS / PKCS#7).
 * @param {Buffer} cms  el .p7m (con contenido) o .p7s (desprendido)
 * @param {{trustRoots?: any[], crls?: any[], contenido?: Buffer}} opts  contenido externo si es detached
 * @returns {Promise<{firmas: object[], global: string}>}
 */
export async function verificarCms(cms, { trustRoots = [], crls = [], contenido = null } = {}) {
  initEngine();
  const v = { estado: "invalida", integridad: {}, firmante: {}, cadena: {}, revocacion: {}, observaciones: [] };
  try {
    const ci = parseCMS(cms);
    const sd = new SignedData({ schema: ci.content });
    const cert = certDelFirmante(sd);
    const si = sd.signerInfos[0];

    // 0) Algoritmo de digest (MD5/SHA-1 → inválida aunque cierre).
    const algo = algoritmoDe(si);
    v.algoritmo = algo.nombre;
    if (algo.debil) v.observaciones.push(`Algoritmo de digest inseguro: ${algo.nombre} (firma no confiable)`);

    // 1) Integridad. Si el contenido va embebido (enveloping, .p7m) pkijs lo toma solo;
    //    si es desprendido (.p7s) hace falta el archivo original.
    const eContent = sd.encapContentInfo?.eContent;
    const desprendido = !eContent;
    if (desprendido && !contenido) {
      v.observaciones.push("Firma desprendida (.p7s): falta el archivo original para verificar la integridad.");
    }
    let intacta = false;
    try {
      const args = { signer: 0, checkChain: false };
      if (desprendido && contenido) args.data = toAB(contenido);
      const r = await sd.verify(args);
      intacta = typeof r === "boolean" ? r : !!(r && (r.signatureVerified ?? r.verified));
    } catch (e) {
      v.observaciones.push(`Verificación criptográfica falló: ${e.message}`);
    }
    v.integridad = { ok: intacta && !algo.debil, desprendido };

    // 1b) Momento de firma + sello de tiempo.
    try { const at = buscarAttr(si?.signedAttrs, OID_SIGNING_TIME); v.firmadoEl = at ? at.values[0].toDate().toISOString() : null; }
    catch { v.firmadoEl = null; }
    v.selloTiempo = { presente: !!buscarAttr(si?.unsignedAttrs, OID_TIMESTAMP) };

    // 2) Identidad + 2b) revocación + 3) cadena (idénticos a PAdES).
    if (cert) {
      v.firmante = identidadDe(cert);
      v.revocacion = chequearRevocacion(cert, sd, crls);
      if (v.revocacion.revocado) v.observaciones.push(`Certificado revocado${v.revocacion.fecha ? " el " + v.revocacion.fecha.slice(0, 10) : ""}.`);
      v.cadena = await validarCadena([cert], trustRoots);
      if (!v.cadena.confiable && trustRoots.length) v.observaciones.push("Cadena no confiable: sin ruta a una raíz cargada.");
      if (!trustRoots.length) v.observaciones.push("Sin trust store cargado: no se evaluó la cadena.");
    } else {
      v.revocacion = { metodo: "no-verificada", revocado: false };
      v.cadena = { ok: false, confiable: false, raiz: null };
      v.observaciones.push("La firma no incluye el certificado del firmante.");
    }

    // 4) Veredicto (semáforo).
    if (!v.integridad.ok || v.revocacion.revocado) v.estado = "invalida";
    else if (v.cadena.confiable) v.estado = "valida";
    else v.estado = "observada";
  } catch (e) {
    v.observaciones.push(`No se pudo parsear la firma CMS: ${e.message}`);
  }

  return { firmas: [v], global: v.estado };
}
