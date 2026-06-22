// extraer.js — Extracción de cifras de EECC desde un PDF, en el BACKEND (Node).
// Texto vía pdf-parse (nativo) y, si está escaneado, OCR de respaldo (Tesseract CLI).
// La lógica de anclas es COMPARTIDA con el cliente: src/core/extraer-anclas.js.
// 100% local: el PDF nunca sale del contenedor.
import { extraer } from "../src/core/extraer-anclas.js";

// OCR de respaldo para PDFs escaneados (sin capa de texto). Renderiza cada página
// a PNG con pdftoppm y la lee con Tesseract (español). Devuelve texto por página.
async function ocrPdf(buffer) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const fs = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const run = promisify(execFile);

  const dir = await fs.mkdtemp(join(tmpdir(), "selega-ocr-"));
  try {
    const pdf = join(dir, "in.pdf");
    await fs.writeFile(pdf, buffer);
    await run("pdftoppm", ["-png", "-r", "200", pdf, join(dir, "p")], { timeout: 120000 });
    const pngs = (await fs.readdir(dir)).filter((f) => f.endsWith(".png")).sort();
    const pages = [];
    for (const f of pngs) {
      const { stdout } = await run("tesseract", [join(dir, f), "stdout", "-l", "spa"],
        { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
      pages.push(stdout);
    }
    return pages;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function extraerDePDF(buffer) {
  const { PDFParse } = await import("pdf-parse");
  const r = await new PDFParse({ data: buffer }).getText();
  let pages = r.pages.map((p) => p.text || "");
  let fuente = "nativo";
  if (pages.join("").trim().length < 50) {     // PDF escaneado → OCR
    pages = await ocrPdf(buffer);
    fuente = "ocr";
  }
  return { ...extraer(pages), _fuente: fuente };
}
