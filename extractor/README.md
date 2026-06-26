# Selega — Sidecar de extracción de PDFs (texto + tablas)

Microservicio **FastAPI** que extrae **texto + items con posición + tablas** de PDFs
digitales usando engines Python potentes. Vive en un **contenedor aparte**: el PDF lo
manda el server **local** de Selega (no la nube) y **nunca se escribe a disco**.

Es **opcional** y suma a lo que Selega ya hace (pdf.js en el navegador, `pdf-parse` +
OCR en el server Node). El Node lo consume vía `server/extractor-client.js`, que solo
se activa si está seteada la variable `EXTRACTOR_URL` (si no, la feature queda OFF y
nada cambia).

## Engines

| Engine        | Qué hace                                              | Items con coords | Tablas |
| ------------- | ---------------------------------------------------- | :--------------: | :----: |
| `pymupdf`     | Texto rápido + posición (DEFAULT)                    |        sí        |   —    |
| `pdfplumber`  | Words con bbox + base de tablas (`extract_tables`)   |        sí        |   sí   |
| `pdfminer`    | Layout fino (LTTextLine) para casos difíciles        |        sí        |   —    |
| `pypdf`       | Texto simple, sin posición                           |        no        |   —    |

Las **tablas** (`?tables=1`) siempre se extraen con **pdfplumber**, sea cual sea el
`engine` elegido para el texto. Los imports son *lazy* por engine.

## API

### `GET /health`
`{ "ok": true, "engines": [...], "max_pdf_mb": 50 }`

### `POST /extract`
- **Body**: el PDF como binario crudo (`content-type: application/pdf`).
- **Query**:
  - `engine` = `pymupdf` (default) | `pdfplumber` | `pdfminer` | `pypdf`
  - `tables` = `1` para incluir tablas (opcional).

**Respuesta** (coords **normalizadas 0..1**, origen **top-left**, mismo espíritu que
`_items` de `src/pdf-view.js`, para que el Node pueda mapearlas):

```json
{
  "engine": "pymupdf",
  "paginas": [
    { "n": 1, "texto": "…", "items": [ { "str": "Total", "x": 0.12, "y": 0.34, "w": 0.08, "h": 0.02 } ] }
  ],
  "tablas": [
    { "n": 1, "filas": [["A","B"],["1","2"]], "rows": 2, "cols": 2 }
  ]
}
```

## Seguridad / privacidad

- **Sin disco**: todo en memoria (`BytesIO`).
- **Sin red saliente**: el proceso solo recibe el PDF y devuelve JSON.
- **Tope de tamaño**: `MAX_PDF_MB` (default 50). Rechaza no-PDF (`%PDF-`).
- Corre como usuario **no-root** en el contenedor; **sin puerto público** (solo red interna).

## Correr local (dev)

```bash
cd extractor
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8099
# probar:
curl -s -X POST --data-binary @muestra.pdf \
  "http://127.0.0.1:8099/extract?engine=pymupdf&tables=1" | python -m json.tool
```

## Docker

Build/standalone:

```bash
docker build -t selega-extractor ./extractor
docker run --rm -p 127.0.0.1:8099:8099 selega-extractor
```

### docker-compose

El servicio `extractor` ya está en `docker-compose.yml` (build `./extractor`, **sin
puerto público**, en la red interna del compose). Para activarlo desde el server Node,
pasale la URL interna por entorno:

```yaml
# en el servicio `selega`, bloque environment:
EXTRACTOR_URL: "http://extractor:8099"
```

Si **no** seteás `EXTRACTOR_URL`, Selega ignora el sidecar (feature OFF).
