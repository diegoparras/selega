# app.py — Sidecar FastAPI de extracción de PDFs digitales (texto + tablas).
#
# Sentido: Selega ya extrae digital por el navegador (pdf.js) y por el server Node
# (/api/extraer con pdf-parse + OCR de respaldo). Este sidecar SUMA extractores
# Python potentes para tablas y volumen, en un contenedor APARTE. El PDF lo manda
# el server LOCAL de Selega (no la nube): el documento nunca sale de la máquina.
#
# Privacidad por arquitectura:
#   - Nada se escribe a disco (todo en memoria, BytesIO).
#   - No hay red saliente: este proceso solo recibe el PDF y devuelve JSON.
#   - Tamaño máximo configurable (MAX_PDF_MB) para no agotar memoria.
#
# Formato de salida (mismo espíritu que `_items` de src/pdf-view.js, para que el
# Node pueda mapear coords): coordenadas NORMALIZADAS 0..1 con origen TOP-LEFT.
#   { engine, paginas: [{ n, texto, items: [{ str, x, y, w, h }] }], tablas?: [...] }
#
# Engines (lazy import por engine, así arranca liviano y no exige todo instalado):
#   - pymupdf  (fitz)      → texto rápido + items con posición. DEFAULT.
#   - pdfplumber           → mismo formato de items + base de `tablas` (?tables=1).
#   - pdfminer.six         → layout fino (LTTextLine/LTChar) para casos difíciles.
#   - pypdf                → texto simple, sin posición (items vacíos).
import io
import os

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

app = FastAPI(
    title="Selega PDF Extractor (sidecar)",
    version="1.0.0",
    docs_url=None,        # sin Swagger UI público: es un sidecar interno
    redoc_url=None,
    openapi_url=None,
)

# Tope de tamaño del PDF (defensa de memoria). Default 50 MB; ajustable por env.
MAX_PDF_MB = float(os.environ.get("MAX_PDF_MB", "50"))
MAX_PDF_BYTES = int(MAX_PDF_MB * 1024 * 1024)

ENGINES = ("pymupdf", "pdfplumber", "pdfminer", "pypdf")


# --------------------------------------------------------------------------- #
# Helpers de normalización
# --------------------------------------------------------------------------- #
def _norm_item(str_, x0, y_top, w, h, pw, ph):
    """Arma un item con coords normalizadas 0..1 y origen TOP-LEFT.
    x0/y_top ya vienen en píxeles de página con Y desde arriba; pw/ph = tamaño página."""
    if pw <= 0 or ph <= 0:
        return None
    s = (str_ or "").strip()
    if not s:
        return None
    return {
        "str": str_,
        "x": round(x0 / pw, 6),
        "y": round(y_top / ph, 6),
        "w": round((w or 0) / pw, 6),
        "h": round((h or 0) / ph, 6),
    }


# --------------------------------------------------------------------------- #
# Engine: PyMuPDF (fitz) — DEFAULT. Texto rápido + items con posición.
# --------------------------------------------------------------------------- #
def _extract_pymupdf(data: bytes):
    import fitz  # PyMuPDF

    paginas = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for i, page in enumerate(doc):
            rect = page.rect
            pw, ph = float(rect.width), float(rect.height)
            # MuPDF ya usa origen top-left → directo a normalizar.
            d = page.get_text("dict")
            items = []
            for block in d.get("blocks", []):
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        bx0, by0, bx1, by1 = span.get("bbox", (0, 0, 0, 0))
                        it = _norm_item(span.get("text", ""), bx0, by0,
                                        bx1 - bx0, by1 - by0, pw, ph)
                        if it:
                            items.append(it)
            paginas.append({
                "n": i + 1,
                "texto": page.get_text("text"),
                "items": items,
            })
    return paginas


# --------------------------------------------------------------------------- #
# Engine: pdfplumber — items con posición + base de tablas.
# --------------------------------------------------------------------------- #
def _extract_pdfplumber(data: bytes):
    import pdfplumber

    paginas = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, page in enumerate(pdf.pages):
            pw, ph = float(page.width), float(page.height)
            items = []
            # `words` trae bbox top/bottom con origen top-left (top, bottom desde arriba).
            for wd in page.extract_words(use_text_flow=False, keep_blank_chars=False):
                x0 = float(wd["x0"])
                top = float(wd["top"])
                w = float(wd["x1"]) - x0
                h = float(wd["bottom"]) - top
                it = _norm_item(wd.get("text", ""), x0, top, w, h, pw, ph)
                if it:
                    items.append(it)
            paginas.append({
                "n": i + 1,
                "texto": page.extract_text() or "",
                "items": items,
            })
    return paginas


def _extract_tables_pdfplumber(data: bytes):
    """extract_tables → matrices por página. tablas: [{n, filas:[[celda,...]]}]."""
    import pdfplumber

    tablas = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, page in enumerate(pdf.pages):
            for tab in page.extract_tables() or []:
                # Normalizo None → "" para JSON limpio.
                filas = [[("" if c is None else str(c)) for c in fila] for fila in tab]
                if filas:
                    tablas.append({
                        "n": i + 1,
                        "filas": filas,
                        "rows": len(filas),
                        "cols": max((len(f) for f in filas), default=0),
                    })
    return tablas


# --------------------------------------------------------------------------- #
# Engine: pdfminer.six — layout fino (LTTextLine). Y de pdfminer es bottom-left
# → lo convierto a top-left con la altura de la página.
# --------------------------------------------------------------------------- #
def _extract_pdfminer(data: bytes):
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LAParams, LTTextContainer, LTTextLine

    paginas = []
    for i, layout in enumerate(extract_pages(io.BytesIO(data), laparams=LAParams())):
        pw = float(layout.width) if layout.width else 0.0
        ph = float(layout.height) if layout.height else 0.0
        items = []
        textos = []

        def walk(obj):
            if isinstance(obj, LTTextLine):
                x0, y0, x1, y1 = obj.bbox  # bottom-left origin
                w = x1 - x0
                h = y1 - y0
                y_top = ph - y1  # flip a top-left
                it = _norm_item(obj.get_text(), x0, y_top, w, h, pw, ph)
                if it:
                    items.append(it)
                textos.append(obj.get_text())
            elif isinstance(obj, LTTextContainer):
                for child in obj:
                    walk(child)

        for element in layout:
            walk(element)
        paginas.append({
            "n": i + 1,
            "texto": "".join(textos),
            "items": items,
        })
    return paginas


# --------------------------------------------------------------------------- #
# Engine: pypdf — texto simple, sin posición.
# --------------------------------------------------------------------------- #
def _extract_pypdf(data: bytes):
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    paginas = []
    for i, page in enumerate(reader.pages):
        paginas.append({
            "n": i + 1,
            "texto": page.extract_text() or "",
            "items": [],  # pypdf no expone coords de forma fiable
        })
    return paginas


_DISPATCH = {
    "pymupdf": _extract_pymupdf,
    "pdfplumber": _extract_pdfplumber,
    "pdfminer": _extract_pdfminer,
    "pypdf": _extract_pypdf,
}


# --------------------------------------------------------------------------- #
# Rutas
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health():
    return {"ok": True, "engines": list(ENGINES), "max_pdf_mb": MAX_PDF_MB}


@app.post("/extract")
async def extract(
    request: Request,
    engine: str = Query("pymupdf"),
    tables: int = Query(0),
):
    if engine not in _DISPATCH:
        raise HTTPException(status_code=400,
                            detail=f"engine inválido: {engine!r}. Use uno de {ENGINES}.")

    # Lee el binario del body. Defensa de tamaño por Content-Length y por bytes reales.
    clen = request.headers.get("content-length")
    if clen and clen.isdigit() and int(clen) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF supera {MAX_PDF_MB} MB.")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Body vacío: enviá el PDF como binario.")
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF supera {MAX_PDF_MB} MB.")
    if data[:5] != b"%PDF-":
        raise HTTPException(status_code=400, detail="El binario no parece un PDF (%PDF- ausente).")

    try:
        paginas = _DISPATCH[engine](data)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — el detalle del parser ayuda a diagnosticar
        raise HTTPException(status_code=422,
                            detail=f"No se pudo procesar el PDF con {engine}: {exc}") from exc

    out = {"engine": engine, "paginas": paginas}

    if tables:
        try:
            out["tablas"] = _extract_tables_pdfplumber(data)
        except Exception as exc:  # noqa: BLE001
            # Las tablas son best-effort: no tiran abajo la extracción de texto.
            out["tablas"] = []
            out["tablas_error"] = str(exc)

    return JSONResponse(out)
