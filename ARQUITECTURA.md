# Cómo está armado el sitio

Sitio estático (GitHub Pages): `index.html` carga los datos como variables globales (`data/*.js`) y los scripts de `js/`. No hay build del lado del navegador.

## Datos: el sync diario

`node scripts/sync.js` (lo corre GitHub Actions todos los días; `--offline` usa solo el caché):

| Paso | Script | Fuentes | Escribe |
|---|---|---|---|
| 1 | `sync.js` | wago.tools (tablas del cliente; si está caído, copias de AllTheThings), talentsforever.com, QuestieDB, Wowhead (tooltips de ítems) | `shaman.json`, `items.json`, `meta.json`, `changelog.json`, `reports/changes-*.md` |
| 2 | `fetch-item-sources.js` | foreverchanges.pro | `item-sources-fc.json` |
| 3 | `fetch-levels.js` | QuestieDB, AllTheThings, Wowhead (NPCs y quests) | `levels.json` |
| 4 | `build-weapons.js` | lo anterior + `item-sources.json` (a mano) | `weapons.json`, `reports/conflicts.md` |
| 5 | `build-professions.js` | `items.json` + `recipes.json` | `professions.json` |
| 5b | `build-consumables.js` | tablas del cliente (recetas de Cocina y Primeros Auxilios), Wowhead (efecto y materiales), AllTheThings (dónde pescar), QuestieDB (de dónde sale la receta) | `consumables.json` |
| 6 | `build-data.js` | todo lo anterior + `data/guides/*.json`, `builds.json`, `news.json` | `data/*.js`; corre los validadores y `check-data.js` |

`fetch-recipes.js` (recetas de classicwowforever.com) se corre a mano; sus páginas duran un mes en caché.

### Descargas (`scripts/lib/http.js`)

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
