// pades.js — Extrae las firmas de un PDF (PAdES) sin dependencias pesadas.
//
// Una firma PAdES vive en un diccionario de firma con dos campos clave:
//   /ByteRange [a b c d]  → los bytes firmados son file[a..a+b] ++ file[c..c+d].
//                           El hueco (a+b .. c) contiene el /Contents.
//   /Contents <hex…>      → el blob DER de la firma (CMS/PKCS#7 detached), en hex,
//                           rellenado con ceros hasta un largo fijo.
//
// Devuelve una entrada por firma con: el rango, el contenido firmado y el DER de la firma.

const RE_BYTERANGE = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;

/**
 * @param {Buffer} buf  el PDF completo
 * @returns {Array<{byteRange:number[], signedContent:Buffer, cms:Buffer, coversWholeFile:boolean}>}
 */
export function extraerFirmas(buf) {
  // Recorremos el archivo en latin1 para ubicar los /ByteRange por offset de bytes
  // (latin1 = 1 char por byte, así los índices del regex coinciden con offsets reales).
  const txt = buf.toString("latin1");
  const firmas = [];

  for (let m; (m = RE_BYTERANGE.exec(txt)); ) {
    const br = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    const [a, b, c, d] = br;

    // Contenido firmado: los dos segmentos, salteando el hueco del /Contents.
    const signedContent = Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]);

    // El hueco contiene "<HEX…>"; extraemos el hex y lo pasamos a DER.
    const gap = buf.subarray(a + b, c).toString("latin1");
    const hex = gap.match(/<([0-9A-Fa-f]+)>/);
    if (!hex) continue; // ByteRange sin Contents legible → no es una firma utilizable
    const cms = Buffer.from(hex[1], "hex");

    // ¿La firma cubre hasta el final del archivo? El segundo segmento [c,d] normalmente
    // llega al EOF. Si quedan bytes con contenido después, esta firma cubre solo una
    // revisión previa (caso legítimo en multi-firma) o hubo un agregado posterior.
    const cola = buf.subarray(c + d).toString("latin1").trim();
    const coversWholeFile = cola.length === 0;

    firmas.push({ byteRange: br, signedContent, cms, coversWholeFile });
  }
  return firmas;
}

/** Convierte un Buffer a ArrayBuffer ajustado (lo que esperan pkijs/WebCrypto). */
export function toAB(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
