// config.js — configuración del backend desde variables de entorno.
// La API key de OpenRouter NUNCA llega al navegador: vive acá (env) o en la tabla
// config del servidor. El cliente solo habla con /api/llm (proxy).
export const config = {
  port: Number(process.env.PORT) || 8080,
  // PostgreSQL: el datastore en serio (historial/auditoría/packs concurrente y durable).
  // En Docker, DATABASE_URL apunta al servicio `db`. Sin env (dev local), usamos el
  // Postgres del compose expuesto en 127.0.0.1:55432 (IPv4 explícito por Node 17+).
  databaseUrl: process.env.DATABASE_URL || "postgresql://selega:selega@127.0.0.1:55432/selega",
  // Si está en env, tiene prioridad y ni se guarda en la base.
  openrouterKeyEnv: process.env.OPENROUTER_KEY || "",
  adminEmail: process.env.SELEGA_ADMIN_EMAIL || "admin@selega.local",
  adminPass: process.env.SELEGA_ADMIN_PASS || "", // si vacío, se genera y se imprime una vez
  cookieName: "selega_session",
  oidcCookieName: "selega_oidc", // transacción OIDC (verifier/state/nonce) en modo federado
  sessionTtlMs: 1000 * 60 * 60 * 12, // 12 h
  // --- Federación opcional con Lockatus (el hub de identidad de la suite) ---
  // Default 'local' = login propio multiusuario, sin cambios. En 'federado', el login
  // delega en Lockatus (OIDC); el callback hace find-or-create del usuario por email y
  // mapea el rol que asigna el hub → el resto de Selega (gating por rol) no cambia.
  authMode: process.env.AUTH_MODE === "federado" ? "federado" : "local",
  lockatus: {
    issuer: (process.env.LOCKATUS_ISSUER || "").replace(/\/$/, ""),
    clientId: process.env.LOCKATUS_CLIENT_ID || "selega",
    redirectUri: process.env.LOCKATUS_REDIRECT_URI || "",
  },
  // Poné SELEGA_SECURE_COOKIE=1 cuando Selega esté detrás de TLS (reverse proxy / HTTPS):
  // la cookie de sesión solo viaja por HTTPS. En dev/HTTP local queda en 0.
  cookieSecure: process.env.SELEGA_SECURE_COOKIE === "1",
  // Privacidad del proxy de IA nube (OpenRouter): por defecto exigimos que el proveedor
  // NO retenga ni entrene con el prompt (provider.data_collection="deny"). Es el DEFAULT
  // de fábrica para EECC de terceros. DATA_COLLECTION_DENY=OFF (o 0/false/no) permite
  // proveedores que sí retienen — solo tiene sentido cuando el destino es un entorno que
  // controlás. El superadmin puede sobreescribir este default desde Sistema → Nube.
  dataCollectionDeny: /^(off|0|false|no)$/i.test(process.env.DATA_COLLECTION_DENY || "") ? "0" : "1",
};
