# Cómo está armado el sitio

Sitio estático (GitHub Pages): `index.html` carga los datos como variables globales (`data/*.js`) y los scripts de `js/`. No hay build del lado del navegador.

## Datos: el sync diario

`node scripts/sync.js` (lo corre GitHub Actions todos los días; `--offline` usa solo el caché):

| Paso | Script | Fuentes | Escribe |
|---|---|---|---|
| 1 | `sync.js` | wago.tools (tablas del cliente; si está caído, copias de AllTheThings), talentsforever.com, QuestieDB, Wowhead (tooltips de ítems) | `shaman.json`, `items.json`, `meta.json`, `changelog.json`, `reports/changes-*.md` |
| 2 | `fetch-item-sources.js` | foreverchanges.pro (quests del equipo nuevo de Forever y datos de Forever de las quests de Classic que dan equipo) | `item-sources-fc.json` |
| 3 | `fetch-levels.js` | QuestieDB, AllTheThings, Wowhead (NPCs y quests), para todas las quests y bosses que dan equipo | `levels.json` |
| 4 | `build-weapons.js` | lo anterior + `item-sources.json` (a mano) | `weapons.json`, `reports/conflicts.md` |
| 4b | `build-gear.js` | lo mismo, para la armadura (tela, cuero, malla, escudos, off-hands, totems, capas, collares, anillos, trinkets), con `slot` | `gear.json` |
| 4c | `build-zones.js` | QuestieDB (nivel y zona de cada quest), AllTheThings (zonas nuevas), AreaTable del cliente, foreverchanges (dungeons) | `zones.json`: banda de nivel de cada zona por facción, de cada dungeon, y zona de inicio de cada raza Shaman |
| 5 | `build-professions.js` | `items.json` + `recipes.json` | `professions.json` |
| 5b | `build-consumables.js` | tablas del cliente (recetas de Cocina y Primeros Auxilios), Wowhead (efecto y materiales), AllTheThings (dónde pescar), QuestieDB (de dónde sale la receta) | `consumables.json` |
| 6 | `build-data.js` | todo lo anterior + `data/guides/*.json`, `builds.json`, `news.json` | `data/*.js` (los que lee el sitio; `items.json` es solo entrada de los pasos); corre los validadores y `check-data.js` |

`fetch-recipes.js` (recetas de classicwowforever.com) se corre a mano; sus páginas duran un mes en caché.

### Descargas (`scripts/lib/http.js`)

Las fuentes de cada ítem salen de `scripts/lib/item-sources.js` (con la regla de nivel `placer`, igual para armas y armadura); cómo se aprende cada receta (entrenador, Merchant's Favor con su costo, drop) de `scripts/lib/recipes.js`.

Toda descarga pasa por `http.get`: un User-Agent, pausa por sitio, reintentos ante 5xx/429, y **nunca guarda una respuesta inválida** (página de error, cuerpo vacío, HTML donde se esperaba JSON). Cada archivo del caché tiene su fecha en `.cache/_fetched.json` y se vuelve a pedir cuando vence:

| Fuente | Vence |
|---|---|
| Tablas del cliente (por build) | nunca (no cambian) |
| Lista de builds de wago.tools | 1 hora |
| talentsforever, QuestieDB, lista de AllTheThings | 12 horas |
| Archivos de AllTheThings | nunca (se guardan por hash: si cambian, cambia el nombre) |
| foreverchanges.pro | 7 días |
| Wowhead: ítem no encontrado / NPC sin nivel | 7 / 3 días |
| Wowhead: NPC con nivel / búsquedas | 60 / 30 días |
| classicwowforever.com | 30 días |

Si una fuente no responde, se usa la última copia buena. Si Wowhead no responde, `fetch-levels` conserva el nivel que ya tenía.

### Qué fuente gana

- **Datos de una quest** (nivel, nivel mínimo, facción, zona, dungeon): ganan las fuentes automáticas (foreverchanges, QuestieDB, AllTheThings). Un valor cargado a mano en `data/item-sources.json` que no coincide **no se usa**: va a `reports/conflicts.md`, que se suma al PR del sync. Para forzarlo: `"override": { "level": "motivo" }`.
- **Lo que solo sabe una persona** (`chain`: las quests anteriores de la cadena, `note`) sale de la carga manual.
- **Facción**: si cualquier paso de la cadena es de una sola facción, la recompensa también.
- **Clase**: una quest de otra clase (máscara de QuestieDB, línea "Class" de foreverchanges, `classes` de AllTheThings) no cuenta como fuente.
- **Nivel recomendado**: el objetivo más difícil de toda la cadena; en grupo (dungeon o elite) −3, solo −1. Lo antes posible: −5 en grupo, −3 solo. Nunca menos que el mínimo de la quest ni más que su nivel. Un boss nuevo sin nivel conocido: techo del dungeon −1.

### Chequeos

`check-data.js` (lo corre `build-data.js`) frena el sync si algo no cierra: facciones y tipos de fuente válidos, recomendado ≥ lo antes posible, ninguna quest de otra clase, sin quests repetidas, todas las armas con ícono, niveles en rango. `build-data.js` además valida talentos, builds y traducciones.

## Sitio (`js/`)

| Archivo | Qué hace |
|---|---|
| `i18n.js` | textos es/en, traducción de tooltips del cliente |
| `ui.js` | lo común: íconos, el único tooltip, tarjeta de ítem, línea de stats, puntos de confianza, encabezado de página, fuentes, preferencias guardadas |
| `site.js` | spec y facción elegidos, colores e íconos de cada spec, secciones |
| `refs.js` | íconos y tarjetas de hechizos y talentos nombrados en el texto |
| `guide.js` | Guía y Clase |
| `talent-rules.js`, `calculator.js` | reglas y calculadora de talentos |
| `weapons.js` | Equipo |
| `professions.js` | Profesiones: tu plan por tramos (las profesiones elegidas se comparten con Equipo), por profesión, cocina y pesca, primeros auxilios, sistemas. Objetos de campamento en `data/camp.json` (a mano, citado) |
| `spellbook.js` | Hechizos |
| `news.js`, `home.js` | Novedades y portada |
| `app.js` | ruteo (`#Página/sección`), encabezado, leyenda |

Archivos con fin de línea LF (`.gitattributes`).

## Calidad y operación

### Chequeos automáticos (`.github/workflows/check.yml`, en cada push y PR)

| Paso | Qué frena |
|---|---|
| `build-data.js` | datos inválidos (`check-data.js`), builds de talentos que no cierran, prosa sin traducir |
| archivos generados al día | un JSON editado sin correr `build-data.js` (el `git diff` después del build tiene que dar vacío) |
| `test-rules.js` | la calculadora de talentos distinta de la lógica de talentsforever.com |
| `check-site.js` | textos de la interfaz que faltan en un idioma o con `{variables}` distintas, claves usadas que no existen, archivos de `index.html` que no están, `<` o `>` en los datos (los datos son texto plano: así ninguna fuente puede meter HTML en el sitio) |
| `smoke.js` | cada página y sección abierta en un navegador real (Chromium) con 5 Shamans distintos en es y en: errores de JavaScript, páginas vacías, "undefined"/"NaN", claves sin traducir |

El sync diario corre `check-site.js` y `smoke.js` con los datos nuevos antes de abrir su PR.
Localmente: `npm i --no-save playwright@1.48.2` y `CHROME=1 node scripts/smoke.js` (usa el Chrome instalado).

### En producción

- **Errores de los visitantes**: si una página se rompe, muestra un aviso con el botón de reporte en vez de quedar en blanco, y el error llega a GoatCounter como evento (`error/Página: mensaje`, uno por mensaje y visita). Junto con cualquier error de JavaScript no atrapado, se ven en lernok.goatcounter.com.
- **Visitas**: GoatCounter (`Site.GOATCOUNTER`), sin cookies. `node scripts/visits.js [días]` las resume (páginas, origen, países, pantallas, idiomas, errores); necesita la clave de la API en `GOATCOUNTER_TOKEN` o `.goatcounter-token` (ignorado por git). Cada mañana `.github/workflows/visits.yml` deja ese resumen como comentario en la issue "Resumen de feedback" (secreto `GOATCOUNTER_TOKEN`), donde lo lee la rutina.
- **Reportes**: formulario de Google (`Site.FEEDBACK`) → planilla publicada como CSV (secreto `FEEDBACK_CSV`) → `.github/workflows/feedback.yml` cada hora → `scripts/feedback.js` crea issues con etiqueta `feedback` (una por ítem, etiquetas de tipo/spec/página, sin duplicados). Revisar: `gh issue list --label feedback`.
- **Revisar reportes**: el comando `/revisar-feedback` (`.claude/skills/revisar-feedback/SKILL.md`) trae las issues, verifica cada pieza con `scripts/plan.js` (el mismo motor de la página: `path`, `slot <Slot>`, `item <id>` para el Shaman del reporte), las etiqueta (`estado:`, `prioridad:`) y prepara los arreglos.
