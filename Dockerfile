FROM node:22-slim
WORKDIR /app
# OCR para PDFs escaneados: Tesseract (+ español) y poppler (pdftoppm) horneados.
# hadolint ignore=DL3008  (Debian slim solo sirve el último; pinnear versiones se rompe en cada update del repo)
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-spa poppler-utils \
    && rm -rf /var/lib/apt/lists/*
# Deps primero (cache). pdf-parse necesita sus deps (pdfjs-dist + canvas para DOMMatrix).
# Los overrides de package.json fijan las transitivas a versiones parcheadas (sin CVE).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . /app
EXPOSE 8080
# Healthcheck (Checkov CKV_DOCKER_2 / CIS-DI-0006): el server responde el index.
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Seguridad: correr como usuario NO-root (`node`, uid 1000, ya viene en la imagen). El server
# solo LEE /app y escribe el OCR en /tmp; no necesita root. Mitiga escape de contenedor (Trivy DS-0002).
USER node
# Privacidad por arquitectura: la única salida externa es el proxy LLM (gateado).
# La base es PostgreSQL (servicio `db` del docker-compose), conectada por DATABASE_URL.
CMD ["node", "server/index.js"]
