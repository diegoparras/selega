// verify.js — Motor de verificación de firma de Trustux (PAdES, JS puro vía pkijs).
//
// Por cada firma del PDF responde: integridad (¿se modificó tras firmar?), identidad
// del firmante (nombre, CUIT, AC), cadena hasta una raíz de confianza, y un veredicto
// con semáforo (válida / observada / inválida). Sin red: todo se resuelve con el
// documento y el trust store.
//
// Funciona igual en Node y en el browser (mismo pkijs). Acá el engine se cablea con la
// WebCrypto de Node; en el browser, pkijs toma `globalThis.crypto` solo.
import * as asn1js from "asn1js";
import { ContentInfo, SignedData, Certificate, CertificateRevocationList,
         CertificateChainValidationEngine, setEngine, CryptoEngine } from "pkijs";
import { webcrypto } from "node:crypto";
import { extraerFirmas, toAB } from "./pades.js";
import { validarRespuestaOCSP, consultarOCSPOnline } from "./ocsp.js";

let _engineListo = false;
export function initEngine() {
  if (_engineListo) return;
  const eng = new CryptoEngine({ name: "trustux", crypto: webcrypto });
  setEngine("trustux", eng, eng);
  _engineListo = true;
}

const OID = { CN: "2.5.4.3", SERIAL: "2.5.4.5", OU: "2.5.4.11", O: "2.5.4.10" };
const hex = (u8) => Buffer.from(u8).toString("hex");

// Algoritmos de digest: nombre legible + cuáles se aceptan. MD5 y SHA-1 están rotos
// (colisiones) → una firma que los use no da garantía de integridad: la marcamos inválida.
const DIGEST = {
  "1.2.840.113549.2.5": "MD5", "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.1": "SHA-256", "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
};
const DIGEST_DEBIL = new Set(["MD5", "SHA-1"]);
/** Nombre del algoritmo de digest de un SignerInfo y si es inseguro (compartido PAdES/CAdES). */
export function algoritmoDe(si) {
  const nombre = DIGEST[si?.digestAlgorithm?.algorithmId] || si?.digestAlgorithm?.algorithmId || "?";
  return { nombre, debil: DIGEST_DEBIL.has(nombre) };
}
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";
const OID_TIMESTAMP = "1.2.840.113549.1.9.16.2.14"; // RFC 3161 signature-time-stamp (unsigned attr)

// Busca un atributo (firmado o no) del SignerInfo por OID.
function buscarAttr(attrs, oid) {
  return attrs?.attributes?.find((a) => a.type === oid) || null;
}

/** Carga un certificado desde PEM o DER → pkijs.Certificate. */
export function cargarCert(pemOrDer) {
  let der = pemOrDer;
  if (typeof pemOrDer === "string" || /-----BEGIN/.test(pemOrDer.toString("latin1").slice(0, 64))) {
    const b64 = pemOrDer.toString("latin1").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    der = Buffer.from(b64, "base64");
  }
  return Certificate.fromBER(toAB(Buffer.from(der)));
}

/** Carga una lista de revocación (CRL) desde PEM o DER → pkijs.CertificateRevocationList. */
export function cargarCRL(pemOrDer) {
  let der = pemOrDer;
  if (typeof pemOrDer === "string" || /-----BEGIN/.test(pemOrDer.toString("latin1").slice(0, 64))) {
    const b64 = pemOrDer.toString("latin1").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    der = Buffer.from(b64, "base64");
  }
  return CertificateRevocationList.fromBER(toAB(Buffer.from(der)));
}

/** Identidad del firmante a partir del certificado (compartida por los motores PAdES y XAdES). */
export function identidadDe(cert) {
  const get = (oid) => {
    const tv = cert.subject.typesAndValues.find((t) => t.type === oid);
    return tv ? tv.value.valueBlock.value : null;
  };
  return {
    nombre: get(OID.CN),
    cuit: (get(OID.SERIAL) || "").replace(/^CUIT\s*/i, "") || null,
    rol: get(OID.OU),
    organizacion: get(OID.O),
  };
}

/** Valida una cadena de certificados hasta una raíz de confianza (compartida PAdES/XAdES). */
export async function validarCadena(certs, trustRoots = []) {
  initEngine();
  if (!certs.length || !trustRoots.length) return { ok: false, confiable: false, raiz: null };
  const engine = new CertificateChainValidationEngine({ certs, trustedCerts: trustRoots });
  const res = await engine.verify();
  const confiable = !!res.result;
  return { ok: confiable, confiable, raiz: confiable ? nombreRaiz(res) : null };
}

// Revocación OFFLINE: ¿el serial del firmante figura en alguna CRL de su emisor?
// Mira las CRL embebidas en la firma (PAdES-LT valida sin red) y las provistas por el
// trust store. No sale a la red: si no hay CRL del emisor, queda "no-verificada".
export function chequearRevocacion(cert, sd, crlsProvistas) {
  const embebidas = (sd.crls || []).filter((c) => c instanceof CertificateRevocationList);
  const todas = [...embebidas, ...crlsProvistas];
  if (!todas.length) return { metodo: "no-verificada", revocado: false };
  const esEmbebida = (crl) => embebidas.includes(crl);
  const issuer = cert.issuer.toString();
  const serial = hex(cert.serialNumber.valueBlock.valueHexView);
  const delEmisor = todas.filter((crl) => crl.issuer.toString() === issuer);
  if (!delEmisor.length) {
    return { metodo: embebidas.length ? "embebida" : "crl-provista", revocado: false, observacion: "sin CRL del emisor" };
  }
  for (const crl of delEmisor) {
    const hit = (crl.revokedCertificates || []).find(
      (rc) => hex(rc.userCertificate.valueBlock.valueHexView) === serial);
    if (hit) {
      let fecha = null;
      try { fecha = hit.revocationDate.value.toISOString(); } catch { /* sin fecha legible */ }
      return { metodo: esEmbebida(crl) ? "embebida" : "crl-provista", revocado: true, fecha };
    }
  }
  return { metodo: esEmbebida(delEmisor[0]) ? "embebida" : "crl-provista", revocado: false };
}

const attr = (cert, oid) => {
  const tv = cert.subject.typesAndValues.find((t) => t.type === oid);
  return tv ? tv.value.valueBlock.value : null;
};

/** Encuentra el certificado del firmante (el referenciado por el SignerInfo). */
export function certDelFirmante(sd) {
  const si = sd.signerInfos[0];
  const certs = (sd.certificates || []).filter((c) => c instanceof Certificate);
  // SID por issuer+serial: casamos por número de serie.
  const sidSerial = si?.sid?.serialNumber?.valueBlock?.valueHexView;
  if (sidSerial) {
    const want = hex(sidSerial);
    const m = certs.find((c) => hex(c.serialNumber.valueBlock.valueHexView) === want);
    if (m) return m;
  }
  // Fallback: el certificado hoja (subject ≠ issuer).
  return certs.find((c) => c.subject.toString() !== c.issuer.toString()) || certs[0] || null;
}

/**
 * Verifica todas las firmas de un PDF.
 * @param {Buffer} pdf
 * @param {{trustRoots?: Certificate[]}} opts
 * @returns {Promise<{firmas: object[], global: string}>}
 */
export async function verificar(pdf, { trustRoots = [], crls = [], ocsps = [], ocspOnline = false } = {}) {
  initEngine();
  const firmas = [];

  for (const f of extraerFirmas(pdf)) {
    const v = { estado: "invalida", integridad: {}, firmante: {}, cadena: {}, observaciones: [],
                provenance: { byteRange: f.byteRange } };
    try {
      const ci = ContentInfo.fromBER(toAB(f.cms));
      const sd = new SignedData({ schema: ci.content });
      const cert = certDelFirmante(sd);
      const si = sd.signerInfos[0];

      // 0) Algoritmo de digest. Si es débil (MD5/SHA-1) la firma no garantiza integridad.
      const digestNom = DIGEST[si?.digestAlgorithm?.algorithmId] || si?.digestAlgorithm?.algorithmId || "?";
      v.algoritmo = digestNom;
      const algoDebil = DIGEST_DEBIL.has(digestNom);
      if (algoDebil) v.observaciones.push(`Algoritmo de digest inseguro: ${digestNom} (firma no confiable)`);

      // 1) Integridad + validez criptográfica de la firma (incluye chequeo de messageDigest).
      let intacta = false;
      try {
        const r = await sd.verify({ signer: 0, data: toAB(f.signedContent), checkChain: false });
        intacta = typeof r === "boolean" ? r : !!(r && (r.signatureVerified ?? r.verified));
      } catch (e) {
        v.observaciones.push(`Verificación criptográfica falló: ${e.message}`);
      }
      // Aunque la firma "cierre", un algoritmo roto la invalida.
      v.integridad = { ok: intacta && !algoDebil, cubreTodo: f.coversWholeFile, modificadoPostFirma: !intacta };

      // 1b) Momento declarado de firma (atributo firmado) y presencia de sello de tiempo (RFC 3161).
      try {
        const at = buscarAttr(si?.signedAttrs, OID_SIGNING_TIME);
        v.firmadoEl = at ? at.values[0].toDate().toISOString() : null;
      } catch { v.firmadoEl = null; }
      v.selloTiempo = { presente: !!buscarAttr(si?.unsignedAttrs, OID_TIMESTAMP) };

      // 2) Identidad del firmante (del certificado, nunca de metadata del PDF).
      if (cert) {
        v.firmante = {
          nombre: attr(cert, OID.CN),
          cuit: (attr(cert, OID.SERIAL) || "").replace(/^CUIT\s*/i, "") || null,
          rol: attr(cert, OID.OU),
          organizacion: attr(cert, OID.O),
        };
      }

      // 2b) Revocación (offline): ¿el certificado está en una CRL de su emisor?
      v.revocacion = cert ? chequearRevocacion(cert, sd, crls) : { metodo: "no-verificada", revocado: false };
      if (v.revocacion.revocado) {
        v.observaciones.push(`Certificado revocado${v.revocacion.fecha ? " el " + v.revocacion.fecha.slice(0, 10) : ""}.`);
      }
      // 2c) OCSP: respuestas provistas/embebidas (offline) refinan la revocación; precede a la CRL.
      // La consulta online (ocspOnline) es OPT-IN — la única salida a la red del motor.
      if (cert && (ocsps.length || ocspOnline)) {
        const certs = (sd.certificates || []).filter((c) => c instanceof Certificate);
        const issuer = certs.find((c) => c.subject.toString() === cert.issuer.toString())
          || trustRoots.find((c) => c.subject.toString() === cert.issuer.toString());
        if (issuer) {
          let resuelto = false;
          for (const der of ocsps) {
            const o = await validarRespuestaOCSP(cert, issuer, der);
            if (o.aplicable) {
              v.revocacion = { metodo: "ocsp", revocado: o.revocado };
              if (o.revocado) v.observaciones.push("Certificado revocado (OCSP).");
              resuelto = true; break;
            }
          }
          if (!resuelto && ocspOnline) {
            const o = await consultarOCSPOnline(cert, issuer);
            if (o.aplicable) {
              v.revocacion = { metodo: "ocsp-online", revocado: o.revocado };
              if (o.revocado) v.observaciones.push("Certificado revocado (OCSP online).");
            }
          }
        }
      }

      // 3) Cadena hasta una raíz de confianza.
      if (cert && trustRoots.length) {
        const certs = (sd.certificates || []).filter((c) => c instanceof Certificate);
        const engine = new CertificateChainValidationEngine({ certs, trustedCerts: trustRoots });
        const res = await engine.verify();
        const confiable = !!res.result;
        v.cadena = { ok: confiable, confiable, raiz: confiable ? nombreRaiz(res) : null };
        if (!confiable) v.observaciones.push(`Cadena no confiable: ${res.resultMessage || "sin ruta a una raíz cargada"}`);
      } else {
        v.cadena = { ok: false, confiable: false, raiz: null };
        if (!trustRoots.length) v.observaciones.push("Sin trust store cargado: no se evaluó la cadena.");
      }

      // 4) Veredicto (semáforo). Integridad rota o certificado revocado → inválida.
      if (!v.integridad.ok || v.revocacion.revocado) v.estado = "invalida";
      else if (v.cadena.confiable) v.estado = "valida";
      else v.estado = "observada";
    } catch (e) {
      v.observaciones.push(`No se pudo parsear la firma: ${e.message}`);
    }
    firmas.push(v);
  }

  // Chequeo a nivel documento: la firma más "externa" (la que llega más lejos en el archivo)
  // debería cubrir hasta el EOF. Si no, hay bytes agregados después de toda firma → sospechoso.
  if (firmas.length) {
    let outIdx = 0, outEnd = -1;
    firmas.forEach((f, i) => {
      const end = f.provenance.byteRange[2] + f.provenance.byteRange[3];
      if (end > outEnd) { outEnd = end; outIdx = i; }
    });
    const out = firmas[outIdx];
    if (!out.integridad.cubreTodo) {
      out.observaciones.push("Hay contenido agregado después de la última firma (posible manipulación).");
      if (out.estado === "valida") out.estado = "observada";
    }
  }

  // Veredicto global = la peor firma.
  const peor = ["invalida", "observada", "valida"];
  const global = firmas.length
    ? firmas.map((f) => f.estado).sort((a, b) => peor.indexOf(a) - peor.indexOf(b))[0]
    : "sin-firma";
  return { firmas, global };
}

function nombreRaiz(res) {
  try {
    const path = res.certificatePath || [];
    const root = path[path.length - 1];
    const tv = root?.subject?.typesAndValues?.find((t) => t.type === OID.CN);
    return tv ? tv.value.valueBlock.value : null;
  } catch { return null; }
}
