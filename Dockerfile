FROM node:22-slim
WORKDIR /app
# OCR para PDFs escaneados: Tesseract (+ español) y poppler (pdftoppm) horneados.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-spa poppler-utils \
    && rm -rf /var/lib/apt/lists/*
# Deps primero (cache). `pg` es JS puro → sin toolchain nativo.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . /app
EXPOSE 8080
# Privacidad por arquitectura: la única salida externa es el proxy LLM (gateado).
# La base es PostgreSQL (servicio `db` del docker-compose), conectada por DATABASE_URL.
CMD ["node", "server/index.js"]
