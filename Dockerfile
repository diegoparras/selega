FROM node:22-slim
WORKDIR /app
# OCR para PDFs escaneados: Tesseract (+ español) y poppler (pdftoppm) horneados.
# hadolint ignore=DL3008  (Debian slim solo sirve el último; pinnear versiones se rompe en cada update del repo)
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-spa poppler-utils \
    && rm -rf /var/lib/apt/lists/*
# Deps primero (cache). `pg` es JS puro → sin toolchain nativo.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . /app
EXPOSE 8080
# Seguridad: correr como usuario NO-root (`node`, uid 1000, ya viene en la imagen). El server
# solo LEE /app y escribe el OCR en /tmp; no necesita root. Mitiga escape de contenedor (Trivy DS-0002).
USER node
# Privacidad por arquitectura: la única salida externa es el proxy LLM (gateado).
# La base es PostgreSQL (servicio `db` del docker-compose), conectada por DATABASE_URL.
CMD ["node", "server/index.js"]
