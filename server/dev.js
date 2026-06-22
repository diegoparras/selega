// dev.js — Arranque local para previsualización/desarrollo (no Docker). Fija un
// puerto propio y delega en index.js. No se usa en producción (ahí corre index.js).
//
// SEGURIDAD: NO fijamos SELEGA_ADMIN_PASS. Si lo hiciéramos, seedAdmin() resetearía
// la pass del superadmin (incluso una fuerte ya provisionada) a un valor versionado en
// un repo público. Sin esa var, index.js genera una pass aleatoria y la imprime una vez.
process.env.PORT ||= "8090";
process.env.SELEGA_ADMIN_EMAIL ||= "admin@selega.local";
await import("./index.js");
