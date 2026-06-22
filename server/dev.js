// dev.js — Arranque local para previsualización/desarrollo (no Docker). Fija un
// puerto propio y delega en index.js. No se usa en producción (ahí corre index.js).
process.env.PORT ||= "8090";
process.env.SELEGA_ADMIN_PASS ||= "pepe";
process.env.SELEGA_ADMIN_EMAIL ||= "pepe";
await import("./index.js");
