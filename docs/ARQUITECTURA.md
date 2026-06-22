# Arquitectura de Selega

## 1. Posición en la familia Escriba

Selega **es el producto**; Fulgoria **es un motor que Selega usa**. No al revés.
El funcional vive en Selega (sube el balance, recorre el checklist, ve los cruces, decide
el desenlace); la extracción es **un paso** dentro de ese flujo. Son **hermanos** que comparten
un núcleo, no padre-hijo.

```
                       Familia Escriba
                            │
        ┌──────── núcleo de extracción (compartido) ────────┐
        │   pdf.js · ocr.js (Tesseract) · parseAmount ·      │
        │   plantillas/fingerprint · filas por Y · arnés de  │
        │   validación por fórmula (invariantes de dominio)  │
        └────────────┬─────────────┬──────────────┬──────────┘
                     ▼             ▼              ▼
                 Fulgoria       Selega       Fisherboy
              (extractos      (legalización     (...)
               bancarios)      de EECC)
              regla del       13 cruces + checklist 18 secc.
               saldo          + motor de decisión + auditoría
```

**Factorización pendiente:** sacar de Fulgoria lo que es *mecánica* (núcleo) de lo que es
*dominio-banco*. Candidatos a núcleo, ya escritos en Fulgoria:

| Módulo Fulgoria | Qué aporta | Reutiliza en Selega |
|---|---|---|
| `src/pdf.js` | parseo PDF (PDF.js, browser) | sí, tal cual |
| `src/ocr.js` | OCR local (Tesseract.js) para escaneados | sí, tal cual |
| `src/extract.js` `parseAmount`/`parseAmountCell` | importes es-AR, paréntesis negativos, "último importe de la celda" | sí — mejor que el regex que hicimos en el prototipo |
| `src/template.js` | plantilla por geometría (x_band + fingerprint) reutilizable por formato | sí — **disuelve la meseta del 66%**: el funcional marca cada estudio una vez |
| `formula` de la plantilla | invariante de validación | Selega lo reemplaza por los **13 cruces** |

## 2. Capas de Selega

```
src/core/      schema.js (18 cifras) · crosses.js (13 cruces) · decision.js (desenlace)
src/rules/     loader.js  + rules/*.json  (un pack por jurisdicción)
src/           app.js (UI control) · admin.js (config) · llm.js (capa LLM gateada)
```

- **`core/`** es puro dominio, sin UI ni jurisdicción ni red. Es lo que validamos toda la
  sesión en Python, portado a JS (test en `test/test-core.mjs`).
- **`rules/`**: cada Consejo define catálogo de controles, cruces habilitados y consecuencias.
  `AR-NQN.json` está cargado; el resto hereda de `_base.json` y se completa desde Admin.

## 3. El "tipo de documento EECC"

Fulgoria modela **filas de movimientos con una columna de saldo**. Un EECC es otra forma:
**varias tablas chicas** (ESP/ER/EEPN/EFE/anexos) de **celdas rotuladas**, validadas por
**igualdades cruzadas entre tablas**. Por eso Selega define un *profile* propio sobre el
núcleo:

- **Localización**: ubicar cada estado por título/cuerpo (lo del prototipo `localizar.py`).
- **Roles de celda**: en vez de columnas de movimientos, las 18 cifras canónicas (`schema.js`).
- **Validación**: los 13 cruces (`crosses.js`) en vez de una sola fórmula de saldo.
- **Plantilla**: marcar las celdas de cada formato de estudio una vez → reutilizable.

## 4. Extracción: tres caminos, mismo esquema

El esquema de 18 cifras lo puede llenar:
1. **Manual** (grilla) — siempre disponible.
2. **Motor Fulgoria** (plantilla local por formato) — sin red, privado. *Camino por defecto.*
3. **LLM** (OpenRouter multimodelo) — generaliza a cualquier formato, **pero manda datos a la
   nube** → **gateado** (`llm.js`): habilitado en Admin + API key + autorización por documento.

En los tres casos, **los cruces son la red de seguridad**: el humano confirma, y ningún número
inconsistente pasa.

## 5. Multi-jurisdicción y administración

- `rules/_registry.json`: las 24 jurisdicciones. `estado: completo|plantilla`.
- Desde **Admin** se edita el rule-pack de cualquier jurisdicción (se guarda local y pisa al
  del repo), se carga la API key de OpenRouter, y se gestionan usuarios con límites de uso.
- Los **cruces son universales** (normas FACPCE rigen en todo el país); lo que cambia por
  Consejo es el catálogo de controles formales y sus consecuencias.

## 6. Privacidad por arquitectura

Igual que Fulgoria: todo en el navegador / self-host, sin un solo request externo por defecto.
La excepción es la capa LLM, opt-in y consentida. Datos sensibles de terceros → quedan adentro.
