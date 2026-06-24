// lockatus.js — cliente OIDC mínimo para federar Selega con Lockatus (el hub de identidad de la
// suite). ESM, SIN dependencias nuevas: verifica los tokens RS256 con node:crypto contra el JWKS
// del hub (offline). Se usa solo si AUTH_MODE=federado. Espejo del cliente de Fulgoria.
import { createPublicKey, verify as cryptoVerify, randomBytes, createHash } from "node:crypto";

const partToJson = (p) => JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
const b64url = (b) => Buffer.from(b).toString("base64url");

// PKCE + identificadores de transacción (state/nonce). Stateless: viajan firmados en una cookie.
export function pkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
export const randomId = () => b64url(randomBytes(12));

export function createLockatus({ issuer, clientId, redirectUri }) {
  issuer = String(issuer).replace(/\/$/, "");
  let jwksCache = null, jwksAt = 0;

  async function jwks() {
    if (jwksCache && Date.now() - jwksAt < 3600e3) return jwksCache;
    const r = await fetch(issuer + "/jwks.json");
    jwksCache = ((await r.json()).keys) || []; jwksAt = Date.now();
    return jwksCache;
  }

  // Verifica un JWT RS256 con la clave pública del hub (JWKS) y chequea los claims.
  async function verifyJwt(token, { audience, nonce } = {}) {
    const [h, p, s] = String(token).split(".");
    if (!h || !p || !s) throw new Error("jwt malformado");
    const header = partToJson(h);
    const keys = await jwks();
    const jwk = keys.find((k) => k.kid === header.kid) || keys[0];
    if (!jwk) throw new Error("sin clave en el JWKS");
    const pub = createPublicKey({ key: jwk, format: "jwk" });
    if (!cryptoVerify("RSA-SHA256", Buffer.from(h + "." + p), pub, Buffer.from(s, "base64url"))) throw new Error("firma inválida");
    const c = partToJson(p);
    if (c.iss !== issuer) throw new Error("iss inválido");
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (audience && !aud.includes(audience)) throw new Error("aud inválido");
    if (c.exp && c.exp * 1000 < Date.now()) throw new Error("token expirado");
    if (nonce && c.nonce !== nonce) throw new Error("nonce inválido");
    return c;
  }

  return {
    authorizeUrl({ state, nonce, challenge }) {
      return issuer + "/authorize?" + new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: "code",
        scope: "openid email", state, nonce, code_challenge: challenge, code_challenge_method: "S256",
      }).toString();
    },
    async exchange({ code, verifier }) {
      const r = await fetch(issuer + "/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }).toString(),
      });
      const tok = await r.json().catch(() => ({}));
      if (!tok.access_token) throw new Error("no se pudo canjear el código");
      return tok;
    },
    verifyJwt,
  };
}
