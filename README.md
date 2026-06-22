<div align="center">

<img src="public/logo.svg" width="76" alt="Selega" />

# Selega

**Si cierra, se legaliza.**

Control de Estados Contables para Legalizaciones. Asistente para las Secretarías Técnicas de
los Consejos Profesionales de Ciencias Económicas. Subís el balance, recorrés el checklist
condicional, y los **cruces numéricos** validan los EECC en vivo y proponen el desenlace
(legaliza / observa / certifica firma / deniega). **Local, exacto, validado por los cruces.**
Multi-jurisdicción (24 provincias).

**Satélite** de la familia **[Escriba](https://github.com/diegoparras)** · usa el motor de **Fulgoria**.

![Local](https://img.shields.io/badge/local-100%25-a8324a) ![Self-hosted](https://img.shields.io/badge/self--hosted-✓-a8324a) ![Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-a8324a)

</div>

---

## Qué hace

- **Cruces numéricos de EECC** (14): A=P+PN, PN entre ESP y EEPN, resultado ER=EEPN,
  variación del EFE por dos vías, amortizaciones entre anexos, RECPAM, seg. social art. 10,
  PN negativo, prescindencia de sindicatura. Son el invariante de dominio que **caza errores
  de extracción y de armado** — ningún número inconsistente pasa silencioso. Cada cifra se
  pinta **verde** si un cruce la corrobora o **ámbar** si entra en uno que no cierra.
- **Lienzo de PDF** con extracción local + **OCR por región** (Tesseract) y provenance
  (tocás una cifra → salta a dónde salió en el PDF).
- **Checklist condicional** con la consecuencia de cada observación (denegación directa /
  subsanable con tasa borrador / se certifica firma / se legaliza) y **motor de decisión** en vivo.
- **Constructor visual del sistema**: cifras, cruces y checklist son **editables desde Admin**
  por jurisdicción, sin tocar código.
- **5 niveles de usuario**: agente (procesa) · supervisor (bandeja global, aprueba/devuelve) ·
  auditor (expediente read-only + exportable) · admin (reglas/usuarios) · superadmin (motores,
  jurisdicciones, infra). Workflow de revisión **configurable**.
- **IA gateada y pluggable**: tanque **local** (Ollama, p.ej. Qwen2.5-VL en CPU) o **nube**
  (OpenRouter), con routing local-first. Apagada por defecto; la API key vive server-side.
- **Multi-jurisdicción**: rule-pack por Consejo (24 provincias) + el superadmin crea/renombra entes.

## Correr (local)

```bash
cp .env.example .env        # editá .env con tus credenciales
docker compose up -d --build
docker compose logs selega  # mostrá la contraseña de admin generada (si dejaste SELEGA_ADMIN_PASS vacío)
# → http://localhost:8088
npm test                    # valida el núcleo de cruces
```

## Despliegue en producción

Selega es on-prem (una caja Docker + Postgres). Antes de exponerlo:

1. **Secretos fuertes en `.env`** — `POSTGRES_PASSWORD` y dejá `SELEGA_ADMIN_PASS` vacío
   (el server genera una y la imprime una vez). Nunca subas `.env` a git.
2. **TLS** — poné Selega detrás de un reverse proxy con HTTPS (Caddy/nginx) y seteá
   `SELEGA_SECURE_COOKIE=1` (la cookie de sesión solo viaja por HTTPS).
3. **Cerrá el puerto de Postgres** — sacá la línea `ports:` del servicio `db` en el compose
   (en dev está bindeado solo a `127.0.0.1`).
4. **Backups** del volumen `selega-pg` (es el registro de legalizaciones).

El server emite security headers (CSP, `X-Frame-Options`, `nosniff`), hashea contraseñas con
scrypt, firma la sesión con HMAC, parametriza todas las queries y tiene lockout anti-fuerza-bruta.

## Privacidad

Todo corre en el navegador / self-host. La **única** salida externa posible es la capa de IA,
gateada (habilitada por el superadmin + API key + routing). El tanque **local** (Ollama) procesa
sin que el balance salga del servidor. Sin IA, Selega no hace un solo request afuera.

## Stack

Vanilla JS (ES modules, sin framework) · Node.js (server HTTP propio) · PostgreSQL (`pg`) ·
Docker · pdf.js / Tesseract.js / pdf-lib vendorizados · Apache-2.0.
Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
