FROM python:3.12-slim
WORKDIR /app

# Deps primero (cache). Sin compiladores: todas las wheels son binarias en slim.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Seguridad: usuario NO-root. Mitiga escape de contenedor (Trivy DS-0002).
RUN useradd --create-home --uid 1000 extractor
USER extractor

# Sin puerto público: el sidecar solo lo alcanza el server Node por la red interna
# del compose. Igual EXPOSE documenta el puerto interno.
EXPOSE 8099

# Healthcheck: el endpoint /health responde liviano (sin tocar el filesystem).
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8099/health',timeout=3).status==200 else 1)"

# 1 worker: el trabajo es CPU-bound y el sidecar es de uso local/baja concurrencia.
# Escalá con WEB_CONCURRENCY si hace falta.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8099"]
