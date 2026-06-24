// xades.js — Motor de verificación de firma XML (XAdES / XML-DSig) de Trustux.
//
// Las facturas electrónicas de AFIP/ARCA y muchos comprobantes viajan firmados en XML,
// no en PDF. Este motor responde lo mismo que el de PAdES (integridad, identidad del
// firmante, cadena hasta una raíz de confianza, veredicto con semáforo), pero sobre XML.
//
// Usa el stack de PeculiarVentures (xadesjs/xmldsigjs) para la parte criptográfica del XML,
// y reutiliza identidadDe()/validarCadena() del motor PAdES para el certificado. Sin red.
import * as xadesjs from "xadesjs";
import { Crypto } from "@peculiar/webcrypto";
import { DOMParser, XMLSerializer, DOMImplementation } from "@xmldom/xmldom";
import { cargarCert, identidadDe, validarCadena } from "./verify.js";

const DSIG = "http://www.w3.org/2000/09/xmldsig#";

// pkijs (motor PAdES) y xmldsigjs (motor XAdES) comparten el engine de crypto global: si
// pkijs lo toca entre dos Verify(), el segundo falla ("Key is not of type 'CryptoKey'").
// Por eso re-afirmamos el engine de xadesjs justo antes de cada verificación.
const _crypto = new Crypto();
let _domListo = false;
function fijarEngineXml() {
  xadesjs.Application.setEngine("NodeJS", _crypto);
  if (!_domListo) {
    // En Node no hay DOM global: registramos el de @xmldom/xmldom para xml-core.
    xadesjs.setNodeDependencies({ DOMParser, XMLSerializer, DOMImplementation });
    _domListo = true;
  }
}

/**
 * Verifica todas las firmas XML de un documento.
 * @param {string|Buffer} xml
 * @param {{trustRoots?: import('pkijs').Certificate[]}} opts
 * @returns {Promise<{firmas: object[], global: string}>}
 */
export async function verificarXml(xml, { trustRoots = [] } = {}) {
  fijarEngineXml();
  const doc = new DOMParser().parseFromString(String(xml), "application/xml");
  const nodos = Array.from(doc.getElementsByTagNameNS(DSIG, "Signature"));
  const firmas = [];

  for (const nodo of nodos) {
    const v = { estado: "invalida", integridad: {}, firmante: {}, cadena: {}, observaciones: [] };
    try {
      const signed = new xadesjs.SignedXml(doc);
      signed.LoadXml(nodo);

      // 1) Integridad: ¿la firma cierra y los digests coinciden? (detecta XML alterado tras firmar)
      let intacta = false;
      try { fijarEngineXml(); intacta = await signed.Verify(); }
      catch (e) { v.observaciones.push(`Verificación XML falló: ${e.message}`); }
      v.integridad = { ok: intacta };

      // 2) Identidad: el certificado embebido en <X509Certificate> (base64 DER).
      const certNode = nodo.getElementsByTagNameNS(DSIG, "X509Certificate")[0];
      if (certNode && certNode.textContent) {
        const der = Buffer.from(certNode.textContent.replace(/\s+/g, ""), "base64");
        const cert = cargarCert(der);
        v.firmante = identidadDe(cert);
        // 3) Cadena hasta una raíz de confianza (mismo motor que PAdES).
        v.cadena = await validarCadena([cert], trustRoots);
        if (!v.cadena.confiable && trustRoots.length) v.observaciones.push("Cadena no confiable: sin ruta a una raíz cargada.");
        if (!trustRoots.length) v.observaciones.push("Sin trust store cargado: no se evaluó la cadena.");
      } else {
        v.cadena = { ok: false, confiable: false, raiz: null };
        v.observaciones.push("La firma no incluye el certificado del firmante.");
      }

      // 4) Veredicto (semáforo).
      if (!v.integridad.ok) v.estado = "invalida";
      else if (v.cadena.confiable) v.estado = "valida";
      else v.estado = "observada";
    } catch (e) {
      v.observaciones.push(`No se pudo parsear la firma XML: ${e.message}`);
    }
    firmas.push(v);
  }

  const peor = ["invalida", "observada", "valida"];
  const global = firmas.length
    ? firmas.map((f) => f.estado).sort((a, b) => peor.indexOf(a) - peor.indexOf(b))[0]
    : "sin-firma";
  return { firmas, global };
}
