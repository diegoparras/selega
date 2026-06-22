<div align="center">

<img src="public/logo.svg" width="76" alt="Selega" />

# Selega

**Si cierra, se legaliza.**

Control de Estados Contables para Legalizaciones — asistente on-prem para las Secretarías
Técnicas de los Consejos Profesionales de Ciencias Económicas. Subís el balance, los **cruces
numéricos** validan los EECC en vivo y proponen el desenlace (legaliza / observa / certifica
firma / deniega). **Local, exacto, multi-jurisdicción.**

![Local](https://img.shields.io/badge/local-100%25-a8324a) ![Self-hosted](https://img.shields.io/badge/self--hosted-✓-a8324a) ![Docker](https://img.shields.io/badge/Docker-incluye_PostgreSQL-a8324a) ![Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-a8324a)

</div>

---

## Qué hace

- **14 cruces numéricos de EECC** (A=P+PN, PN entre ESP y EEPN, ER=EEPN, variación del EFE,
  amortizaciones de anexos, RECPAM, seg. social, PN negativo, prescindencia de sindicatura…).
  Son el invariante que **caza errores de extracción y de armado**. Cada cifra se pinta
  **verde** si un cruce la corrobora o **ámbar** si entra en uno que no cierra.
- **Lienzo de PDF** con extracción local + **OCR por región** y provenance.
- **Cifras, cruces y checklist editables por jurisdicción** desde Admin, sin tocar código.
- **5 roles** (agente · supervisor · auditor · admin · superadmin), workflow de revisión
  configurable, expediente read-only exportable, bandeja con semáforo.
- **IA gateada y pluggable**: tanque **local** (Ollama, p.ej. Qwen2.5-VL en CPU) o **nube**
  (OpenRouter), local-first. Apagada por defecto; la API key vive server-side.

---

## ⚡ Instalación en 1 minuto (Docker)

> **Incluye su propia base de datos PostgreSQL.** No tenés que instalar ni provisionar nada
> aparte: el `docker-compose.yml` levanta Selega **y** su Postgres juntos.

```bash
git clone https://github.com/diegoparras/selega.git && cd selega
cp .env.example .env                # editá POSTGRES_PASSWORD (poné algo fuerte)
docker compose up -d --build
docker compose logs selega          # acá aparece la contraseña de admin generada (una vez)
# → http://localhost:8088
```

Eso es todo: dos contenedores (`selega` + `selega-db`), un volumen para los datos.

---

## 🚀 Instalar en un panel (Dokploy · Easypanel · Coolify · Portainer)

Todos soportan Docker Compose. **La forma recomendada en todos es conectar este repo de
GitHub** (el panel buildea la imagen solo). Si tu panel solo deja *pegar un compose*, usá el
[bloque image-only](#pegar-compose-image-only) de más abajo (baja la imagen ya publicada).

> En cualquier panel: la **única variable obligatoria** es `POSTGRES_PASSWORD`. Dejá
> `SELEGA_ADMIN_PASS` vacío → Selega genera una contraseña de admin y la imprime **una vez**
> en los logs del contenedor. El resto tiene defaults sanos (ver [Variables](#variables-de-entorno)).

### Dokploy
1. **Create → Compose**.
2. *Provider*: GitHub → repo `diegoparras/selega`, branch `main`.
3. En **Environment**, pegá tu `.env` (al menos `POSTGRES_PASSWORD=...`).
4. **Deploy**. Mirá los **Logs** del servicio `selega` para la contraseña de admin.
5. (Opcional) En **Domains** asigná un dominio con HTTPS y agregá `SELEGA_SECURE_COOKIE=1`.

### Easypanel
1. **+ Service → App** (o **Compose** si tu versión lo trae).
2. *Source*: GitHub → `diegoparras/selega`.
3. **Environment**: cargá las variables (`POSTGRES_PASSWORD`, etc.).
4. **Deploy**. La contraseña de admin sale en los logs.
5. Easypanel pone TLS solo → activá `SELEGA_SECURE_COOKIE=1`.

### Coolify
1. **+ New → Docker Compose** (Public/Private Repository) → `diegoparras/selega`.
2. Coolify detecta el `docker-compose.yml`.
3. Cargá las **Environment Variables** (`POSTGRES_PASSWORD`…).
4. **Deploy**. Logs → contraseña de admin. Coolify da TLS → `SELEGA_SECURE_COOKIE=1`.

### Portainer (Stacks)
1. **Stacks → Add stack**.
2. *Build method*: **Repository** → URL `https://github.com/diegoparras/selega`, compose path
   `docker-compose.yml`. (O **Web editor** y pegá el [compose image-only](#pegar-compose-image-only).)
3. En **Environment variables** agregá `POSTGRES_PASSWORD` (y lo que quieras).
4. **Deploy the stack**. La contraseña de admin está en los logs del contenedor `selega`.

<a name="pegar-compose-image-only"></a>
### Pegar un compose (image-only, sin buildear)

Si tu panel solo deja pegar un compose sin clonar el repo, usá este — baja la imagen ya
publicada en GHCR:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: selega
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?poné una contraseña fuerte}
      POSTGRES_DB: selega
    volumes: [ "selega-pg:/var/lib/postgresql/data" ]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U selega -d selega"]
      interval: 5s
      timeout: 3s
      retries: 12
    restart: unless-stopped
  selega:
    image: ghcr.io/diegoparras/selega:latest
    ports: [ "8088:8080" ]
    environment:
      SELEGA_ADMIN_EMAIL: ${SELEGA_ADMIN_EMAIL:-admin@selega.local}
      SELEGA_ADMIN_PASS: ${SELEGA_ADMIN_PASS:-}
      SELEGA_SECURE_COOKIE: ${SELEGA_SECURE_COOKIE:-0}
      DATABASE_URL: "postgresql://selega:${POSTGRES_PASSWORD}@db:5432/selega"
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
volumes:
  selega-pg:
```

---

## Variables de entorno

| Variable | Default | Para qué |
|---|---|---|
| `POSTGRES_PASSWORD` | — (**obligatoria**) | contraseña de la base. Poné algo fuerte. |
| `SELEGA_ADMIN_EMAIL` | `admin@selega.local` | usuario del primer superadmin. |
| `SELEGA_ADMIN_PASS` | *(vacío)* | dejalo vacío → se **genera** y se imprime una vez en los logs. |
| `SELEGA_SECURE_COOKIE` | `0` | poné `1` detrás de HTTPS/TLS (cookie solo por HTTPS). |
| `SELEGA_PORT` | `8088` | puerto del host. |
| `OPENROUTER_KEY` | *(vacío)* | opcional, IA en la nube. Mejor cargarla desde Admin. |
| `POSTGRES_USER` / `POSTGRES_DB` | `selega` | usuario / nombre de la base. |

---

## Primer ingreso

1. `docker compose logs selega` (o los logs del panel) → copiá la contraseña de admin generada.
2. Entrá con `SELEGA_ADMIN_EMAIL` y esa contraseña. Sos **superadmin**.
3. Menú ⋮ → **Sistema**: elegí qué jurisdicciones atiende esta instalación y configurá los motores.
4. Menú ⋮ → **Administración**: creá usuarios (agente/supervisor/auditor/admin) y editá reglas.

## Actualizar

```bash
git pull && docker compose up -d --build      # build desde el repo
# o, con la imagen publicada:
docker compose pull && docker compose up -d
```

## Producción (importante)

Antes de exponerlo a internet, leé [SECURITY.md](SECURITY.md). En resumen:

- **TLS**: poné Selega detrás de un reverse proxy con HTTPS (Caddy/nginx, o el TLS del panel) y
  seteá `SELEGA_SECURE_COOKIE=1`. (Dokploy/Easypanel/Coolify dan TLS automático.)
- **Secretos fuertes** en `.env` (nunca subas `.env` a git). `SELEGA_ADMIN_PASS` vacío → autogenerada.
- **Cerrá el puerto de Postgres** (no exponer `db` al host en producción).
- **Backups** del volumen `selega-pg` — es el registro de legalizaciones.

El contenedor corre como **usuario no-root**, con CSP + security headers, scrypt, sesión HMAC,
lockout de login y queries parametrizadas. Auditado con semgrep / OWASP ZAP / Trivy / gitleaks
(ver [SECURITY.md](SECURITY.md)).

## Imagen Docker

Publicada en GHCR en cada push: `ghcr.io/diegoparras/selega:latest`. La construye un GitHub
Action ([.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml)).

## Stack

Vanilla JS (ES modules, sin framework) · Node.js (server HTTP propio) · PostgreSQL (`pg`) ·
Docker · pdf.js / Tesseract.js / pdf-lib vendorizados · Ollama opcional para IA local.
Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Licencia

[Apache-2.0](LICENSE) · Parte de la familia **Escriba**.
