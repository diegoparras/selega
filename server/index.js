// index.js — Servidor de Selega: sirve la app estática y enruta /api/* al backend.
// Self-host / Docker. La única salida externa es el proxy LLM (gateado, server-side).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { initDb, seedAdmin } from "./db.js";
import { handle } from "./api.js";

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), "..")); // raíz de la app
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".png": "image/png", ".wasm": "application/wasm",
  ".woff2": "font/woff2", ".woff": "font/woff", ".gz": "application/gzip",
  ".traineddata": "application/octet-stream" };
const BLOQUEADO = (p) => p.startsWith("/server") || p.startsWith("/node_modules") ||
  p.endsWith(".db") || p.includes(".db-") || p === "/package.json" || p.startsWith("/test");

const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  try {
    if (path === "/api" || path.startsWith("/api/")) return await handle(req, res, path);
    const txt = { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" };
    if (BLOQUEADO(path)) { res.writeHead(403, txt); return res.end("forbidden"); }
    const file = normalize(join(root, path === "/" ? "/index.html" : path));
    if (!file.startsWith(root)) { res.writeHead(403, txt); return res.end("forbidden"); }
    const data = await readFile(file);
    // Los vendors (pdf.js/tesseract/pdf-lib/fuentes, ~24MB) son INMUTABLES → cache larga
    // (evita re-bajarlos en cada OCR). El HTML/JS/CSS de la app se bustea con ?v=N → no-cache.
    const inmutable = path.startsWith("/public/vendor/");
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": inmutable ? "public, max-age=31536000, immutable" : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      // Defensa en profundidad: solo recursos propios, sin framing, sin exfiltración a hosts externos.
      // 'wasm-unsafe-eval': habilita SOLO la compilación de WebAssembly (motor OCR Tesseract,
      // vendorizado y local). Es el permiso angosto para WASM — NO habilita eval() de JS.
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; font-src 'self'; " +
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("not found");
  }
});

let passGenerada = null, dbOk = false;

// Salto de puerto si está ocupado (en vez de morir con EADDRINUSE).
let port = config.port;
server.on("error", (e) => {
  if (e.code === "EADDRINUSE" && port < config.port + 20) {
    console.warn(`  Puerto ${port} ocupado, probando ${port + 1}…`);
    port += 1; setTimeout(() => server.listen(port), 80);
  } else { throw e; }
});
server.on("listening", () => {
  const p = server.address().port;
  console.log(`\n  Selega → http://localhost:${p}`);
  if (!dbOk) { console.log("  ⚠ Postgres no disponible — estático + /api/extraer OK; login/persistencia OFF\n"); return; }
  console.log(`  Login:  ${config.adminEmail}`);
  if (passGenerada) console.log(`  Pass:   ${passGenerada}   (generada, se muestra una vez)`);
  else console.log(`  Pass:   (la de SELEGA_ADMIN_PASS o la ya seteada)`);
  console.log("");
});

// Init de la base ANTES de servir. No-fatal: si Postgres no está (ej. preview local
// sin DB), igual levanta para servir la app estática + la extracción de PDF.
(async () => {
  try { await initDb(); passGenerada = await seedAdmin(); dbOk = true; }
  catch (e) {
    console.warn("  ⚠ No se pudo inicializar Postgres:", e.message || e.code || String(e), "| url:", config.databaseUrl);
    if (e.errors) console.warn("     causas:", e.errors.map((x) => x.message || x.code).join("; "));
  }
  server.listen(port);
})();
