# Especificaciones de diseño y construcción — familia Escriba (para Selega)

Documento **completo y exacto** del sistema de diseño + patrones de construcción del
ecosistema (Escriba · Fisherboy · Extracta · Anonimal). Todo el CSS/JS de acá está sacado
tal cual del producto de referencia (Fisherboy `app/ui/index.html`). Copiá, cambiá **solo
el acento y el logo**, y Selega queda coherente con la familia.

Índice
1. Principios
2. Estructura del archivo y carga
3. Tokens (CSS variables) — completo
4. Tipografía
5. Layout y responsive
6. Íconos
7. Movimiento (keyframes)
8. Componentes (CSS exacto)
9. Patrones con JavaScript
10. Convenciones de arquitectura
11. Checklist para Selega

---

## 1. Principios (no negociables)

1. **Claro por defecto** (`data-theme="light"`), con toggle a oscuro persistido. **Anti-FOUC**:
   el tema se aplica antes de pintar (§9.1).
2. **Acento propio y único** por producto, usado con moderación (botón primario, foco, links,
   detalles). Escriba=coral `#e06a3a`; Fisherboy=teal `#0f8f6a`/`#2bbf94`. **Selega elige el suyo.**
3. **Sin emojis.** Íconos = SVG de línea (`stroke: currentColor`, width 1.7–2, caps/join round).
4. **Inter Variable** (UI) + **JetBrains Mono** (datos/código/URLs).
5. **Español neutro**, frases cortas, botones en infinitivo/sustantivo.
6. **Aire y sutileza**: bordes casi invisibles, sombras en dos capas, radios generosos.
7. **Movimiento sobrio** (120–220 ms; "pop"/"reveal" al aparecer).
8. **i18n y handoff** desde el día 1 (§9.3, §9.6).
9. **Nunca** hardcodear color: todo `var(--…)`; tintes con `color-mix`.
10. **Foco siempre visible** (`--ring`).

---

## 2. Estructura del archivo y carga

Página única autocontenida (sin build step): `<style>` con variables + un `<script>`. Orden
del `<head>` (importa para evitar flashes):

```html
<!doctype html>
<html lang="es" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Selega · …</title>
<meta name="theme-color" content="#fafafb" />
<!-- 1) Anti-FOUC del tema: ANTES de cualquier CSS -->
<script>try{var t=localStorage.getItem("selega-theme")||"light";
  document.documentElement.setAttribute("data-theme",t);}catch(e){}</script>
<!-- 2) i18n (define window.I18N antes del script principal) -->
<script src="/i18n.js"></script>
<!-- 3) Tipografía (idealmente auto-hospedada, ver §4) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/inter/index.css" />
<!-- 4) (si renderizás markdown) -->
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js"></script>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,…(logo de Selega)…" />
<style>/* tokens + componentes */</style>
</head>
```

> **Favicon**: SVG inline en `data:` con el logo (cuadrado redondeado, fondo = acento).

---

## 3. Tokens (CSS variables) — completo

Pegá tal cual. **Para Selega cambiá solo**: las 4 líneas de acento (`--blue`, `--blue-press`,
`--accent`, `--accent-2`) en cada tema, `--on-accent`, el rgba de `--ring` y de la sombra del
acento. El resto (superficies, texto, semántica) se mantiene igual en toda la familia.

```css
:root {
  --bg: #0a0a0c; --bg-2: #101014; --panel: #141418;
  --card: rgba(255,255,255,0.04); --card-2: rgba(255,255,255,0.022);
  --border: rgba(255,255,255,0.10); --hairline: rgba(255,255,255,0.16);
  --text: #ededf0; --muted: #8b8b96; --muted-2: #bdbdc7;
  --blue: #2bbf94; --blue-press: #20a37c; --accent: #2bbf94; --accent-2: #20a37c;  /* ← acento (dark) */
  --on-accent: #04231a;
  --ok: #3fb950; --warn: #d6a01a; --err: #f85149;
  --radius: 12px; --radius-lg: 16px;
  --ring: 0 0 0 3px rgba(43,191,148,.26);                     /* rgba del acento */
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
  color-scheme: dark;
}
[data-theme="light"] {
  --bg: #fafafb; --bg-2: #ffffff; --panel: #ffffff;
  --card: rgba(15,15,20,0.028); --card-2: rgba(15,15,20,0.016);
  --border: rgba(15,15,20,0.10); --hairline: rgba(15,15,20,0.17);
  --text: #16161a; --muted: #70707b; --muted-2: #3c3c44;
  --blue: #0f8f6a; --blue-press: #0c7355; --accent: #0f8f6a; --accent-2: #0c7355;  /* ← acento (light) */
  --on-accent: #ffffff;
  --ok: #1a7f37; --warn: #9a6700; --err: #cf222e;
  --ring: 0 0 0 3px rgba(15,143,106,.20);
  --shadow: 0 1px 2px rgba(15,15,20,.04), 0 12px 32px -16px rgba(15,15,20,.16);
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: "Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text); background: var(--bg);
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  letter-spacing: -.011em; transition: background .4s, color .4s;
}
.wrap { max-width: 940px; margin: 0 auto; padding: 22px clamp(20px, 6vw, 84px) 100px; }
```

**Tabla de tokens**

| Token | Rol |
|---|---|
| `--bg`, `--bg-2`, `--panel` | superficies (fondo, fondo-2, paneles) |
| `--card`, `--card-2` | rellenos translúcidos (controles, secciones) |
| `--border`, `--hairline` | bordes (≈10% y ≈16% de opacidad) |
| `--text`, `--muted`, `--muted-2` | texto principal / tenue / intermedio |
| `--accent`/`--blue`, `--accent-2`/`--blue-press` | acento y su estado activo |
| `--on-accent` | texto sobre el acento |
| `--ok`, `--warn`, `--err` | semántica |
| `--radius` 12 / `--radius-lg` 16 | radios base |
| `--ring` | anillo de foco (sombra del acento) |
| `--shadow` | sombra de elevación (dos capas) |
| `--mono` | fuente monoespaciada |

---

## 4. Tipografía

- **UI: Inter Variable** (Fontsource). La familia es `"Inter Variable"` → primera en el stack,
  con `-apple-system`/`"Segoe UI"` de fallback. **Producción: auto-hospedar** la fuente para no
  depender del CDN (si no llega, cae a Segoe UI, que se parece pero no es Inter).
- **Datos/código/URLs: JetBrains Mono** (`var(--mono)`).
- **Smoothing**: `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility`.
- **Tracking**: cuerpo `-.011em`; `h1` `-.03em`; logo/títulos `-.02em`.

**Escala (valores exactos)**

| Rol | size | weight | line-height | otros |
|---|---|---|---|---|
| `h1` (hero) | `clamp(34px, 6vw, 60px)` | 600 | 1.05 | `letter-spacing:-.03em` |
| `.sub` (hero) | `clamp(16px, 2.2vw, 20px)` | — | 1.45 | color `--muted`, `max-width:600px` |
| logo | 19px | 600 | — | `-.02em` |
| input / select | 14.5px | — | — | |
| label / field-label | 12.5–13px | 500 | — | color `--muted-2` |
| `.help` | 11.5px | — | 1.45 | color `--muted`; `b`→`--muted-2` |
| `.badge` | 12px | 600 | — | pill |
| botón pill | 15px | 600 | — | |
| markdown h1/h2/h3 | 1.5 / 1.3 / 1.12 em | 600 | 1.25 | |

---

## 5. Layout y responsive

- Contenedor: `.wrap { max-width: 940px; margin:0 auto; padding: 22px clamp(20px,6vw,84px) 100px; }`
- Grillas de 2 columnas (`.controls-grid`, `.adv-grid`) → **1 columna** en `max-width: 560px`.
- `.url-row` pasa a columna en mobile.
- Hero centrado, `max-width` del subtítulo 600px.

```css
.controls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
.adv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
@media (max-width: 560px) {
  .controls-grid, .adv-grid { grid-template-columns: 1fr; }
  .url-row { flex-direction: column; }
}
```

---

## 6. Íconos

- **SVG de línea inline**, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
  `stroke-width` 1.7–2, `stroke-linecap/linejoin="round"`.
- Clase base `.ico { width:18px; height:18px; stroke: currentColor; fill: none; stroke-width: 2; }`
  (tamaños chicos 13–17px según contexto).
- Heredan color del contexto (`currentColor`) → se tematizan solos.
- Cero dependencias de icon-fonts ni emojis.

---

## 7. Movimiento (keyframes exactas)

```css
@keyframes pop      { from { opacity: 0; transform: translateY(-6px) scale(.97); } }                 /* menú */
@keyframes cardpop  { from { opacity: 0; transform: translateY(8px) scale(.98); } }                  /* card login */
@keyframes dl-pop   { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity:1; transform:none; } } /* modal */
@keyframes reveal   { from { opacity: 0; transform: translateY(8px); } }                             /* genérico */
```
Transiciones de control: `.12s–.2s`. Tema del `body`: `.4s`. `:active` → `transform: scale(.97)`
o `translateY(1px)`.

---

## 8. Componentes (CSS exacto)

### 8.1 Topbar / logo / badge / status / icon-btn
```css
.topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; }
.logo { display: inline-flex; align-items: center; gap: 11px; font-weight: 600; font-size: 19px; letter-spacing: -.02em; flex-shrink: 0; }
.logomark { width: 30px; height: 30px; border-radius: 8px; display: block; }   /* fondo = acento */
.spacer { flex: 1; }
.topbar-actions { display: flex; align-items: center; gap: 8px; }

.badge { font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--border); text-transform: capitalize; }
/* variantes de estado: color propio + tinte translúcido del mismo color + borde del mismo color */
.badge.dios   { background: rgba(240,169,140,.16); color: #f0a98c; border-color: rgba(240,169,140,.35); }
.badge.angel  { background: rgba(127,178,240,.14); color: #7fb2f0; border-color: rgba(127,178,240,.32); }
.badge.humano { background: rgba(150,150,150,.14); color: var(--muted-2); }

.icon-btn { width: 38px; height: 38px; border-radius: 11px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; font-size: 16px; transition: background .2s, border-color .2s; display: grid; place-items: center; }
.icon-btn:hover { background: var(--card-2); border-color: var(--hairline); }

.status-chip { display: inline-flex; align-items: center; gap: 9px; height: 38px; padding: 0 13px; border-radius: 11px; border: 1px solid var(--border); background: var(--card); color: var(--muted-2); font-size: 13px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); transition: background .3s, box-shadow .3s; }
.status-dot.ok   { background: var(--ok);  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 22%, transparent); }
.status-dot.crit { background: var(--err); box-shadow: 0 0 0 3px color-mix(in srgb, var(--err) 22%, transparent); }
```

### 8.2 Hero
```css
header.hero { text-align: center; margin: 14px 0 34px; }
h1 { font-size: clamp(34px, 6vw, 60px); line-height: 1.05; margin: 6px 0 14px; font-weight: 600; letter-spacing: -.03em; }
.sub { color: var(--muted); font-size: clamp(16px, 2.2vw, 20px); max-width: 600px; margin: 0 auto; line-height: 1.45; }
```

### 8.3 Panel e inputs
```css
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow); }
.field-label { font-size: 13px; font-weight: 500; color: var(--muted-2); margin: 0 0 7px; display: block; }
.url-row { display: flex; gap: 10px; align-items: stretch; }
.url-row input { flex: 1; }

textarea, input[type="text"], input[type="url"], input[type="number"], select {
  width: 100%; background: var(--card-2); border: 1px solid var(--border); color: var(--text);
  border-radius: 9px; padding: 12px 14px; font: inherit; font-size: 14.5px; outline: none;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
input:focus, select:focus { border-color: var(--accent); box-shadow: var(--ring); background: var(--bg-2); }
input::placeholder { color: var(--muted); }

/* select con flecha SVG propia (no la nativa) — el stroke usa el hex de --muted; ajustá si cambia */
select { appearance: none; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b8b96' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 13px center; padding-right: 34px;
}
select option { background: var(--panel); color: var(--text); }

textarea { font-family: var(--mono); font-size: 13px; padding: 10px 12px; resize: vertical; }
textarea:focus { border-color: var(--accent); box-shadow: var(--ring); background: var(--bg-2); }
```

### 8.4 Botón primario (pill) + acciones
```css
.btn-pill { border: 0; cursor: pointer; border-radius: 999px; padding: 12px 26px; font-size: 15px; font-weight: 600; color: var(--on-accent); background: var(--blue); transition: background .2s, transform .08s, filter .2s; white-space: nowrap; }
.btn-pill:hover { background: var(--blue-press); }
.btn-pill:active { transform: translateY(1px); }
.btn-pill:disabled { opacity: .55; cursor: not-allowed; }
.actions { margin-top: 20px; display: flex; justify-content: flex-end; }
```

### 8.5 Ayuda, mini-botones, campo sensible
```css
.field label { display: block; font-size: 12.5px; font-weight: 500; color: var(--muted-2); margin: 0 0 7px; }
.help { font-size: 11.5px; color: var(--muted); margin: 6px 0 0; line-height: 1.45; }
.help b { color: var(--muted-2); font-weight: 600; }
.mini-btn { background: var(--card); border: 1px solid var(--border); color: var(--accent); border-radius: 7px; padding: 2px 8px; font: inherit; font-size: 11px; cursor: pointer; margin-left: 8px; }
.mini-btn:hover { background: var(--card-2); border-color: var(--hairline); }
.mini-btn.on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
/* dato sensible: difuminado salvo foco o "ojo" */
.sensitive { filter: blur(4.5px); transition: filter .12s; }
.sensitive:focus, .sensitive.reveal { filter: none; }
```

### 8.6 Switch (toggle)
```css
.switch { display: flex; align-items: center; gap: 11px; cursor: pointer; font-size: 14px; color: var(--text); margin: 4px 0 0; user-select: none; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.switch .track { width: 38px; height: 22px; border-radius: 999px; background: var(--border); position: relative; transition: background .18s; flex-shrink: 0; }
.switch .track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--muted-2); transition: transform .18s, background .18s; }
.switch input:checked + .track { background: var(--accent); }
.switch input:checked + .track::after { transform: translateX(16px); background: #fff; }
.switch input:focus-visible + .track { box-shadow: var(--ring); }
```
HTML: `<label class="switch"><input type="checkbox"><span class="track"></span><span>Texto</span></label>`

### 8.7 Sección colapsable ("avanzado")
```css
.adv-toggle { width: 100%; margin: 18px 0 0; padding: 12px 14px; text-align: left; background: var(--card-2);
  border: 1px solid var(--border); border-radius: 11px; color: var(--muted-2); font: inherit; font-size: 13px;
  font-weight: 500; cursor: pointer; transition: background .15s, border-color .15s; }
.adv-toggle:hover { background: var(--card); border-color: var(--hairline); }
.adv-toggle .caret { color: var(--accent); display: inline-block; transition: transform .18s; }
.adv-toggle[aria-expanded="true"] .caret { transform: rotate(90deg); }
.adv-panel { margin-top: 12px; display: grid; gap: 14px; }
.adv-section { background: var(--card-2); border: 1px solid var(--border); border-radius: 12px; padding: 16px 16px 18px; }
.adv-head { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 14px; }
```

### 8.8 Tarjeta de acción acentuada (ej. "Descargar")
```css
.dlcard { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 16px;
  background: color-mix(in srgb, var(--accent) 8%, var(--card-2));
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 12px; padding: 12px 14px; }
.dlcard-lbl { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--accent); }
.dlbtn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer;
  color: var(--accent); background: var(--bg-2); border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  border-radius: 8px; padding: 7px 13px; transition: background .14s, transform .08s, border-color .14s; }
.dlbtn:hover { background: color-mix(in srgb, var(--accent) 13%, var(--bg-2)); border-color: var(--accent); }
.dlbtn:active { transform: scale(.97); }
.editbtn { /* botón sólido del acento */ color: var(--on-accent); background: var(--accent); border: 1px solid var(--accent);
  border-radius: 8px; padding: 7px 13px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; margin-left: auto;
  display: inline-flex; align-items: center; gap: 6px; transition: background .14s, transform .08s; }
.editbtn:hover { background: var(--blue-press); }
```

### 8.9 Menú kebab (⋯)
```css
.menu-wrap { position: relative; }
.menu { position: absolute; right: 0; top: calc(100% + 8px); min-width: 220px; background: var(--panel);
  border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); padding: 6px; z-index: 60;
  display: flex; flex-direction: column; gap: 1px; animation: pop .14s cubic-bezier(.2,.8,.2,1); }
.menu-head { padding: 4px 7px 6px; }
.menu-sep { height: 1px; background: var(--border); margin: 5px 4px; }
.menu-item { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; background: none; border: 0;
  color: var(--text); font: inherit; font-size: 14px; padding: 9px 11px; border-radius: 8px; cursor: pointer; transition: background .12s; }
.menu-item:hover { background: var(--card); }
.menu-item > span:first-child { width: 18px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; color: var(--muted-2); transition: color .12s; }
.menu-item:hover > span:first-child { color: var(--text); }
.mi-ico { width: 17px; height: 17px; }
.menu-item.danger:hover { color: var(--err); background: color-mix(in srgb, var(--err) 10%, transparent); }
.menu-item.danger:hover > span:first-child { color: var(--err); }
.lang-row { cursor: default; } .lang-row:hover { background: none; }
.lang-row select { margin-left: auto; font: inherit; font-size: 12.5px; color: var(--text); background: var(--card-2); border: 1px solid var(--border); border-radius: 7px; padding: 4px 7px; cursor: pointer; }
```
HTML (orden de items): **badge** (head) · sep · Cambiar tema · Idioma (con `<select>`) ·
Configuración · Acerca de · sep · Salir (`.danger`).

### 8.10 Modal (overlay + card)
```css
.modal-back { position: fixed; inset: 0; z-index: 130; display: grid; place-items: center; padding: 24px;
  background: color-mix(in srgb, var(--bg) 50%, rgba(0,0,0,.55)); backdrop-filter: blur(6px); animation: reveal .18s; }
.modal-card { position: relative; width: min(460px, 94vw); background: var(--panel); border: 1px solid var(--border);
  border-radius: 18px; box-shadow: var(--shadow); padding: 20px; overflow: hidden; animation: dl-pop .22s cubic-bezier(.2,.9,.3,1.2); }
.modal-x { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; display: grid; place-items: center;
  border-radius: 9px; border: 1px solid var(--border); background: color-mix(in srgb, var(--panel) 70%, transparent);
  color: var(--muted-2); cursor: pointer; }
.modal-x:hover { color: var(--text); border-color: var(--accent); }
```
Botones del modal: `.modal-btn` neutro (`var(--card-2)` + borde, hover borde acento) y
`.modal-btn.primary` (`var(--accent)` + texto blanco). Modal de aviso/confirm: card centrada
con ícono ⚠️ en círculo `color-mix(in srgb, var(--warn) 16%, transparent)`, título, cuerpo,
fila `Cancelar` / `Continuar`.

### 8.11 Gate / login (overlay difuminado)
```css
.gate { position: fixed; inset: 0; display: grid; place-items: center; z-index: 100; padding: 20px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  -webkit-backdrop-filter: blur(12px) saturate(1.1); backdrop-filter: blur(12px) saturate(1.1); }
.gate-card { width: 100%; max-width: 340px; background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 28px 26px; text-align: center; box-shadow: var(--shadow);
  animation: cardpop .2s cubic-bezier(.2,.8,.2,1); }
.gate .logomark { width: 44px; height: 44px; margin: 0 auto 12px; }
.gate h2 { font-size: 18px; margin: 0 0 4px; font-weight: 600; }
.gate p { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
.gate input { text-align: center; }
.gate .err { color: var(--err); font-size: 12.5px; margin-top: 10px; min-height: 16px; }
```
Clave: el gate **cubre desde el primer paint con el sitio difuminado detrás** (nunca
"contenido → tapa"); la `.gate-card` aparece solo cuando hace falta (ej. 401).

### 8.12 Markdown renderizado (contenido rico)
```css
.md { background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px;
  font-size: 14px; line-height: 1.65; color: var(--text); word-break: break-word; }
.md h1,.md h2,.md h3 { letter-spacing: -.02em; line-height: 1.25; margin: 1.1em 0 .5em; font-weight: 600; }
.md h1 { font-size: 1.5em; } .md h2 { font-size: 1.3em; } .md h3 { font-size: 1.12em; }
.md a { color: var(--accent); }
.md code { font-family: var(--mono); font-size: .88em; background: var(--card); padding: 1px 5px; border-radius: 5px; }
.md pre { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; }
.md table { border-collapse: collapse; width: 100%; font-size: .92em; }
.md th, .md td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.md blockquote { border-left: 3px solid var(--accent); margin: .6em 0; padding-left: 12px; color: var(--muted-2); }
```
Render seguro: `DOMPurify.sanitize(marked.parse(md))`.

---

## 9. Patrones con JavaScript

### 9.1 Tema (anti-FOUC + toggle)
Head (ya en §2):
```js
try{var t=localStorage.getItem("selega-theme")||"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}
```
Toggle:
```js
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  document.getElementById("themeIcon").innerHTML = t === "dark" ? ICO_SUN : ICO_MOON; // ícono en su span, no el botón
  try { localStorage.setItem("selega-theme", t); } catch(e) {}
}
themeBtn.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});
try { applyTheme(localStorage.getItem("selega-theme") || "light"); } catch(e) { applyTheme("light"); }
```

### 9.2 Menú kebab (abrir/cerrar)
```js
const menuBtn = document.getElementById("menuBtn"), menu = document.getElementById("headerMenu");
function closeMenu(){ menu.classList.add("hidden"); menuBtn.setAttribute("aria-expanded","false"); }
menuBtn.addEventListener("click", (e) => { e.stopPropagation();
  const open = menu.classList.toggle("hidden") === false; menuBtn.setAttribute("aria-expanded", String(open)); });
document.addEventListener("click", (e) => {
  if (!menu.classList.contains("hidden") && !menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.classList.contains("hidden")) closeMenu(); });
```

### 9.3 i18n (contrato completo)
`i18n.js`:
```js
(function () {
  const LANGS = ["es","en","fr","pt","it","zh","ja"];
  const NAMES = { es:"Español", en:"English", fr:"Français", pt:"Português", it:"Italiano", zh:"中文", ja:"日本語" };
  const D = { es: { "clave": "texto", /* … */ }, en: { /* … */ }, /* fr/pt/it/zh/ja */ };
  let cur = "es";
  function t(key, vars){ let s=(D[cur]&&D[cur][key])||(D.es&&D.es[key])||key;
    if(vars) for(const k in vars) s=s.replace(new RegExp("\\{"+k+"\\}","g"), vars[k]); return s; }
  function apply(root){ root=root||document;
    root.querySelectorAll("[data-i18n]").forEach(el=>el.textContent=t(el.getAttribute("data-i18n")));
    root.querySelectorAll("[data-i18n-html]").forEach(el=>el.innerHTML=t(el.getAttribute("data-i18n-html")));
    root.querySelectorAll("[data-i18n-ph]").forEach(el=>el.setAttribute("placeholder",t(el.getAttribute("data-i18n-ph"))));
    root.querySelectorAll("[data-i18n-title]").forEach(el=>el.setAttribute("title",t(el.getAttribute("data-i18n-title"))));
    document.documentElement.setAttribute("lang", cur); }
  function setLang(l){ if(!D[l]) l="es"; cur=l; try{localStorage.setItem("selega-lang",l);}catch(e){} apply(document); }
  try { const s=localStorage.getItem("selega-lang"); if(s&&D[s])cur=s;
    else { const n=(navigator.language||"es").slice(0,2).toLowerCase(); if(D[n])cur=n; } } catch(e){}
  window.I18N = { LANGS, NAMES, t, apply, setLang, get lang(){return cur;} };
})();
```
- Marcado: `data-i18n` (texto), `data-i18n-html` (innerHTML con `<b>`/`<br>`), `data-i18n-ph`
  (placeholder), `data-i18n-title`. Strings de JS: `I18N.t("clave", {var})`.
- Init: poblar el `<select>` de idioma con `LANGS`/`NAMES`, `I18N.apply(document)` al cargar,
  y en el `change` → `setLang()` + re-aplicar lo dinámico.
- Proceso: armá es/en a mano y traducí el resto con **un agente por idioma** (preservando
  `{placeholders}`, HTML y nombres propios).

### 9.4 Modal (abrir/cerrar genérico)
```js
function openModal(id){ document.getElementById(id).classList.remove("hidden"); }
function closeModal(el){ el.classList.add("hidden"); }
back.addEventListener("click", (e) => { if (e.target === back) closeModal(back); });   // click afuera
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !back.classList.contains("hidden")) closeModal(back); });
```

### 9.5 Aviso/confirmación (modal reutilizable)
```js
let _onOk = null;
function warnModal(title, body, onOk){ /* set título/cuerpo */ _onOk = onOk; show(); }
okBtn.onclick = () => { const f=_onOk; close(); if(f) f(); };
```
Usalo antes de acciones frágiles o riesgosas (la app **avisa**, no falla mudo).

### 9.6 Handoff entre apps del ecosistema
```js
// emitir
sessionStorage["escriba.handoff"] = JSON.stringify(payload);
location.href = OTRA_APP_URL;   // configurable por <meta> o localStorage
// recibir (al cargar)
const raw = sessionStorage.getItem("escriba.handoff");
if (raw) { sessionStorage.removeItem("escriba.handoff"); consumir(JSON.parse(raw)); }
```

---

## 10. Convenciones de arquitectura (cómo se construye en la familia)

- **Single-page autocontenida** servida por el backend (sin build step). El backend expone
  `GET /` (HTML) y `GET /i18n.js`; el resto es API REST JSON.
- **Roles** con badge (ej. dios/ángel/humano): el rol sale de la sesión, se puede bajar pero
  **nunca escalar**; gating visual (deshabilitar lo no permitido) + gating real en el backend.
- **Endpoints** chicos y explícitos; los que hacen trabajo pesado corren en threadpool/worker.
  Los avisos al usuario salen del backend con detalle claro (status + `detail`/flags).
- **Privacidad/seguridad como default**: si algo puede fallar o filtrar, fail-closed y avisar.
- **Config por entorno** (12-factor): nada de secretos en el código; todo por env vars.
- **i18n y tema** son infraestructura, no afterthought.
- **Coherencia visual**: el producto se distingue por **acento + logo + nombre**, no por
  reinventar componentes.

---

## 11. Checklist para arrancar Selega

- [ ] Copiar tokens (§3) y **elegir el acento de Selega** (claro + oscuro) + `--on-accent`,
      `--ring`, sombra del acento.
- [ ] `<head>` en orden (§2): anti-FOUC del tema → i18n → fuentes → (marked/DOMPurify).
- [ ] Inter Variable + JetBrains Mono (auto-hospedadas en producción).
- [ ] Logo cuadrado redondeado (radio 8px sobre 30px) con fondo = acento; favicon SVG inline.
- [ ] Topbar con menú kebab (§8.9): badge · tema · idioma · configuración · acerca de · salir.
- [ ] Set de íconos SVG de línea (sin emojis).
- [ ] Componentes base (§8): pill, icon-btn, inputs con foco `--ring`, switch, help, panel.
- [ ] Modales con overlay difuminado + cierre click-afuera/Escape (§8.10, §9.4).
- [ ] Gate/login difuminado desde el primer paint si hay auth (§8.11).
- [ ] `i18n.js` con el contrato de §9.3 (es/en mínimo; resto con un agente por idioma).
- [ ] (Si conversa con el ecosistema) handoff `sessionStorage` (§9.6).
- [ ] Responsive: grillas a 1 columna en ≤560px (§5).

---

*Referencia viva: `app/ui/index.html` de Fisherboy (tokens, componentes, menú, modales, i18n)
y la UI de Escriba (markitdown-web). Selega = mismo esqueleto, **acento y logo propios**.*
