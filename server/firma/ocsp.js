// ocsp.js — Validación de estado por OCSP (Online Certificate Status Protocol) para Trustux.
//
// Una respuesta OCSP es la firma de una autoridad diciendo "tal certificado está vigente /
// revocado" en un momento dado. Acá validamos una respuesta YA OBTENIDA (sin red): verifica su
// firma contra el emisor y devuelve el estado del certificado. La consulta online (ir a buscar
// la respuesta al responder de la AIA) es un extra opcional — el motor es offline-first.
import { OCSPResponse, OCSPRequest } from "pkijs";
import { toAB } from "./pades.js";
import { initEngine } from "./verify.js";

// status OCSP: 0 = good (vigente), 1 = revoked (revocado), 2 = unknown.
/**
 * Valida una respuesta OCSP (DER) para un certificado contra su emisor. Sin red.
 * @returns {Promise<{aplicable:boolean, revocado?:boolean, status?:number}>}
 */
export async function validarRespuestaOCSP(leaf, issuer, der) {
  initEngine();
  let resp;
  try { resp = OCSPResponse.fromBER(toAB(Buffer.from(der))); }
  catch { return { aplicable: false }; }
  if (resp.responseStatus?.valueBlock?.valueDec !== 0) return { aplicable: false }; // no "successful"
  let st;
  try { st = await resp.getCertificateStatus(leaf, issuer); } // verifica la firma + matchea el CertID
  catch { return { aplicable: false }; }
  if (!st?.isForCertificate) return { aplicable: false };
  return { aplicable: true, revocado: st.status === 1, status: st.status };
}

// OID del accessMethod OCSP dentro de la extensión Authority Information Access.
const OID_AIA = "1.3.6.1.5.5.7.1.1";
const OID_AD_OCSP = "1.3.6.1.5.5.7.48.1";

/** Extrae la URL del responder OCSP de la extensión AIA del certificado (o null). */
export function urlOCSP(leaf) {
  try {
    const aia = (leaf.extensions || []).find((e) => e.extnID === OID_AIA);
    const descs = aia?.parsedValue?.accessDescriptions || [];
    const d = descs.find((x) => x.accessMethod === OID_AD_OCSP);
    return d?.accessLocation?.value || null;
  } catch { return null; }
}

/**
 * Consulta ONLINE el estado de un certificado (va al responder de su AIA). Best-effort y
 * OPT-IN: requiere red y que el certificado declare un responder. Devuelve {aplicable:false}
 * si no hay AIA o falla la red. Pensado para usarse detrás de un flag, no por defecto.
 */
export async function consultarOCSPOnline(leaf, issuer, { timeoutMs = 4000 } = {}) {
  initEngine();
  const url = urlOCSP(leaf);
  if (!url) return { aplicable: false, motivo: "el certificado no declara responder OCSP" };
  try {
    const req = new OCSPRequest();
    await req.createForCertificate(leaf, { hashAlgorithm: "SHA-1", issuerCertificate: issuer });
    const der = Buffer.from(req.toSchema(true).toBER());
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/ocsp-request" }, body: der, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { aplicable: false, motivo: `responder HTTP ${r.status}` };
    const respDer = Buffer.from(await r.arrayBuffer());
    return await validarRespuestaOCSP(leaf, issuer, respDer);
  } catch (e) {
    return { aplicable: false, motivo: e.message };
  }
}
