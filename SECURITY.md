# Seguridad — Selega

Selega maneja datos sensibles de terceros (estados contables) en una instalación on-prem.
La seguridad es prioridad de diseño. Si encontrás una vulnerabilidad, reportala en privado a
**diegoparras@gmail.com** (no abras un issue público).

## Postura

- **scrypt** para contraseñas + comparación en tiempo constante (`timingSafeEqual`).
- Sesión como **cookie firmada HMAC-SHA256** (HttpOnly, SameSite=Strict, `Secure` detrás de TLS).
- **Lockout** anti-fuerza-bruta en el login.
- **Queries 100% parametrizadas** (sin concatenación SQL).
- **`esc()`** en toda salida a HTML; **CSP** + `X-Frame-Options` + `nosniff` + COOP + Permissions-Policy.
- API key de IA **write-only**, nunca llega al navegador. La extracción y el tanque local
  procesan **sin que el balance salga del servidor**.
- Contenedor corre como **usuario no-root**. Secretos por entorno (nunca en el repo).
- Roles con gating server-side (agente/supervisor/auditor/admin/superadmin); IDOR y escalada
  de privilegios verificados.

## Auditoría (2026-06)

Toolchain profesional, todo verde salvo los riesgos aceptados de abajo:

| Herramienta | Tipo | Resultado |
|---|---|---|
| semgrep (p/security-audit, javascript, nodejs, xss, command-injection) | SAST | 0 hallazgos |
| OWASP ZAP (baseline DAST) | DAST | 0 fallas (60 pass) |
| gitleaks | secretos en el repo | sin fugas |
| Trivy (paquetes instalados) + npm audit | SCA | 0 vulnerabilidades |
| retire.js | libs vendorizadas (pdf.js/tesseract/pdf-lib) | sin CVEs |
| Trivy + hadolint + Checkov + Dockle | imagen / IaC | corregidos (no-root, healthcheck) |
| Tests manuales (curl) | IDOR / authz / forja de sesión / SSRF | todo rechazado |

### Cómo re-correr los scanners

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep scan --config p/security-audit /src
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/src" aquasec/trivy fs --scanners vuln,secret,misconfig /src
MSYS_NO_PATHCONV=1 docker run --rm -v "$PWD:/repo" zricethezav/gitleaks detect --source=/repo
MSYS_NO_PATHCONV=1 docker run --rm zaproxy/zap-stable zap-baseline.py -t http://host.docker.internal:8088
npm audit && npx retire --path public/vendor
```

## Riesgos aceptados (con justificación)

1. **Deps transitivas de `pdf-parse` (canvas/render): picomatch, tar, ip-address, brace-expansion.**
   Tienen CVEs de tipo ReDoS de **severidad baja** (EPSS < 0,5%). Las arrastra el motor de
   render de PDF, no nuestro código, y **no están en el camino de explotación**: solo extraemos
   *texto* (no le pasamos globs/tar/IPs controladas por el atacante a esas libs). Se actualizan
   cuando `pdf-parse` saque una versión que las suba. Riesgo residual: bajo.

2. **CVEs del SO base (Debian `node:22-slim`): perl-base, zlib1g, ncurses, etc.**
   Mayormente marcados `will_not_fix` / `fix_deferred` por Debian (no hay parche disponible), en
   paquetes que el runtime de Node no invoca sobre input no confiable. Mitigación: mantener la
   imagen base actualizada (`docker compose build --pull`). Riesgo residual: bajo.

## Endurecimiento pendiente para producción

Ver la sección *Despliegue en producción* del [README](README.md): TLS + `SELEGA_SECURE_COOKIE=1`,
cerrar el puerto de Postgres, backups del volumen, secretos fuertes en `.env`.
