# Retomar: Shaman: Forever (estado al 2026-10-14)

Leer esta primera parte antes de seguir. Debajo está la historia del proyecto (plan de fases y sesiones).

## 2026-10-17: foco en el sitio y el addon (las guías de ruta, en pausa)

- **Decisión del usuario**: las guías de ruta para Polestar (`planner/`, packs) quedan en pausa (errores de pathing que el usuario no puede revisar, poco tiempo). Prioridad: que el sitio y el addon anden perfectos y con buen flujo. Los 8 packs se sacaron del juego a `.cache/tools/backup-packs-installed/`; el sweep y el e2e los leen de ahí (`PACKS=` para otra carpeta).
- **Parche 70450 (17-oct)**: árbol Elemental nuevo (sin Call of Thunder ni Improved Fire Nova; Trial by Fire, Elemental Mastery; Lava Burst fila 5), Tidal/Totemic Focus cambian de fila, ~20 textos del cliente. La sync diaria fallaba por eso: plantillas en `data/i18n/client-es.json`, builds en `data/builds.json` (los `code` populares son posicionales: con un árbol nuevo hay que reemplazarlos por el ranking actual, no "pasan" igual), casos de `scripts/test-rules.js`, guías (elemental, restoration, overview) y novedades. Addon 0.18.3: talentos regenerados (`talents build --build 1.60.1.70450`).
- **Addon 0.18.4**: misiones de dungeon en una fila por dungeon; setup sin ofrecer packs. `scripts/test-journey.lua [raza] [spec]`: un personaje del 1 al 30 sin ruta, qué dice y muestra por nivel (ventana máx. 8–11 filas).
- **Addon 0.19–0.20**: ventana más simple (sin chips, solo la X); fila de talento; entrenador (qué comprar y qué saltear por spec, `data/training.json`, guías de la comunidad, sin probar en Forever; panel al lado del entrenador con "Comprar lo recomendado"); misiones de totem por raza (los ítems de totem siguen haciendo falta).
- **Addon 0.21 (18-oct, el usuario leveando una Tauren)**: avisar solo lo que se puede hacer ya, al llegar al lugar. Anticipo 0 por defecto (las partidas viejas pasan a 0 una vez, `cdb.nowFirst`). Al subir de nivel salta solo lo de la zona donde estás (`zoneTips`); al entrar a una zona: misiones de dungeon que se pueden cargar ya (si el premio es del camino de equipo, la fila es el ítem: Orgrimmar a los 12–13 → Axe of Orgrimmar por Hidden Enemies), el entrenador si está ahí y tenés hechizos, la misión de totem que empieza ahí. `test-journey.lua` visita la capital cada 2 niveles e imprime qué salta.
- **WoWSims (18-oct)**: wowsims/forever (simulador, MIT) y wowsims/gamedata (MIT: el cliente exportado cada 3 h con hotfixes). (1) `scripts/client-items.js`: los números de cada ítem del cliente sobre los tooltips de Wowhead (Wowhead Forever quedó viejo: armas de caster que perdieron el poder con hechizos — confirmado con ItemEffect de Classic Era vs ItemXItemEffect de Forever —, crítico/golpe como índice `critRating`/`hitRating`, stats cambiados); también los ítems que manda el servidor (vienen de los hotfixes). Corre en el sync. (2) `scripts/patch-news.js` → `data/patch-notes.json` → panel "Qué cambió para Shaman en cada parche" en Novedades. (3) `WEIGHTS` de `js/gear-plan.js` desde los pesos medidos por WoWSims a 60 (ui/specs/shaman/*/presets.ts), ajustados para levear (Intelecto de Enhancement 0,75 en vez de 1: Mental Dexterity llena recién ~17 y la armadura). Resto: WoWSims todavía no tiene pesos.
- **Celular** (55 de 78 visitas): `scripts/mobile-check.js` (390 y 360 px, en Chequeos), toques de ≥40 px en pantallas táctiles, textos "pasá el mouse o tocá".
- **Foros oficiales de Blizzard** (Reddit bloquea herramientas; el foro tiene API: `us.forums.blizzard.com/en/wow/search.json?q=...`): debates de Grace of Air vs Windfury Totem para Enhancement, "The Big Shaman Fixlist", un reporte de Healing Wave que cura 30–40% menos a objetivos de más nivel dentro de dungeons (sin confirmar).

## Dónde estamos

- **El sitio está lanzado** (lanzamiento suave del 2026-10-13): https://lernok.github.io/shaman-forever/ (repo Lernok/shaman-forever, rama `main` = GitHub Pages). El usuario lo compartió en un par de Discords y en Twitter. Primeras visitas: 21 en dos días (AR/EE. UU./Canadá), sin errores.
- **Funciones**: "Armá tu Shaman" (raza, spec, profesiones, nivel); Equipo › Tu camino (un tramo a la vez, "Ver detalles y reportar", casilla "Sumar drops de jefes" apagada por defecto) y Armas; Talentos; Hechizos; Profesiones; Guía; Clase; Novedades. Español e inglés, anda en celular.
- **Primer feedback (Discord, issue #6, cerrada)**: el camino de Resto ignoraba el Healer's Staff (Excavation Site: Wetlands). Se arregló la valoración en `js/gear-plan.js` (`SAME`: los stats que hacen lo mismo para una spec valen igual por punto: +curación = poder con hechizos para Resto, daño de hechizos/escuela = poder con hechizos para Elemental; Enhancement sin cambios). Las Robes of Arugal estaban bien, pero solo aparecen con drops: queda etiquetado `tema: drops`.

## Cómo funciona la operación (todo automático)

| Cuándo | Qué | Dónde |
|---|---|---|
| Cada push / PR | Chequeos: build-data, archivos generados al día, test-rules, `check-site.js`, `smoke.js` (Playwright, 128 vistas, abre la ventana de reporte) | `.github/workflows/check.yml` |
| Cada hora | Respuestas del formulario → issues `feedback` (una por ítem; etiquetas tipo/spec/página; sin duplicados) | `feedback.yml` + `scripts/feedback.js`, secreto `FEEDBACK_CSV` |
| 06:00 AR | Sync de datos del juego → PR para aprobar (corre también check-site y smoke) | `sync.yml` |
| 08:41 AR | Visitas de GoatCounter → comentario en la issue #7 "Resumen de feedback" | `visits.yml` + `scripts/visits.js`, secreto `GOATCOUNTER_TOKEN` |
| 09:07 AR | Rutina en la nube "Revisar feedback · Shaman: Forever" (`trig_01S1JEvdgAZWNbSXH1CPbdKY`): corre `/revisar-feedback` en modo rutina (etiqueta, comenta, PRs en ramas `feedback/N`, nunca a main; resumen en la #7; notifica al celular si hay algo) | claude.ai/code; entorno con red completa y variable `GOATCOUNTER_TOKEN` |

- **Workflows (2026-10-15)**: acciones con Node 24 (checkout/setup-node v6, cache v5) y `runs-on: ubuntu-24.04` fijo (ubuntu-latest pasa a Ubuntu 26 el 19-oct y puede romper Playwright 1.48). El sync ya no abre PR si solo cambia la fecha (meta, index.html, o un re-export de talentsforever igual salvo `generated`). Los PR del sync quedan con Chequeos en "action_required": es normal, el sync corre los mismos chequeos adentro.
- **Reportes**: ventana dentro del sitio (`js/feedback.js`) que manda al formulario de Google (`Site.FEEDBACK` en `js/site.js`: texto `entry.239420346`, contexto `entry.663155691` = `tipo | #página | Raza Spec (facción) | profesiones | lvl N | pieza`; tipo = idea/bug/data/piece).
- **Errores de visitantes**: si una página se rompe, muestra un aviso con el botón de reporte y manda el evento `error/Página: mensaje` a GoatCounter.
- **Revisar a mano**: el usuario dice "revisá el feedback" → skill `/revisar-feedback` (`.claude/skills/revisar-feedback/SKILL.md`). Herramientas: `node scripts/plan.js path|slot <Slot>|item <id> --race --spec --faction --profs [--drops]` (el mismo motor que la página) y `node scripts/visits.js [días]` (la clave local está en `.goatcounter-token`, ignorado por git).
- **Ojo con la rutina**: si se edita desde la página de claude.ai, recargarla antes; si no, vuelve a escribir las instrucciones viejas. Para cambiarla desde acá: `RemoteTrigger` update con `job_config.ccr` (environment_id `env_01DhiBRZPymYTLgc86aY4RXt`, events[0].data = {type:'user', message:{role, content}}).

## Decisiones del usuario vigentes

- Los drops de jefes siguen **opcionales** (casilla apagada). Si se juntan varios reportes `tema: drops`, avisarle: en ese caso la quiere activada por defecto.
- Botón del camino: "Ver detalles y reportar" / "Ocultar detalles".
- Los reportes que llegan por otros lados (Discord, Reddit) se registran como issue, **preguntando antes**.

## Inicio y primera visita (2026-10-14)

- Diagnóstico: en la primera visita el formulario "Armá tu Shaman" tapaba todo; en celular mide dos pantallas, sin cruz y con "Listo" al fondo. Inicio tenía el doble de vistas que Equipo.
- Cambios: "Listo"/"Explorar sin elegir" fijos abajo del formulario; cruz y Escape desde la primera visita (cuentan como explorar sin elegir); con el Shaman armado, "Tu Shaman" va arriba de todo en el Inicio y "Tu camino de equipo" es el primer enlace, destacado.
- Medición: eventos `setup/listo: <spec>`, `setup/explorar`, `setup/cerrar` (solo primera visita), en la sección "Armá tu Shaman" de `scripts/visits.js` y del comentario diario en la #7. Con una o dos semanas de datos, mirar cuántos terminan el formulario contra cuántos lo cierran.
- **Inicio = "Tu plan"** (pedido del usuario: "post selección no me orienta nada"). Con el Shaman armado, el Inicio muestra tu nivel (se cambia ahí) y tres bloques: 1) dónde levear y 2–3 mejoras de equipo que valen la pena (ganancia × duración, ventana nivel−2…+5; `gearNow` en `js/home.js`), 2) talento de ahora y el siguiente (orden de leveo 10→60 de la spec), 3) meta de habilidad por profesión y crafteos que no aparecen arriba. Más un enlace a la Guía. Investigación previa: tours que arrancan solos se terminan ~23% (contra ~69% si los abre la persona), los jugadores quieren guías que arranquen en su nivel y no sean rígidas, los competidores (wowforeverbuilds, Zockify, Wowhead) tienen inicios-menú sin plan personal. Por eso no hay tour automático.
- **Celular**: barra fija abajo (Inicio, Equipo, Talentos, Guía, Más) en ≤700px; la tira de arriba se oculta (`--nav-h: 0`).
- **Celular, más** (7f48ead, 981395e): tocar un ítem muestra nuestra ficha con botón "Abrir en Wowhead ↗" (`UI.tip.bind`) en vez de salir del sitio; encabezados compactos ≤600px con "Ver más" (`clampBanner` en app.js); en Equipo › Tu camino el nivel y los tramos van en una fila (tramos deslizables); con pantalla táctil (`pointer: coarse`) botones, toggles, selects y desplegables miden ≥36px.
- Idea pendiente: un "¿No sabés qué spec?" en el formulario (wowforeverbuilds tiene un quiz de clase); un "¿Cómo uso el sitio?" de 3 pasos solo si los números muestran que hace falta.
- El sync del 14-oct se cortó a la hora: el build nuevo (70374) pidió ~6000 tooltips que la caché de GitHub no tenía, y como se cortó, no guardó nada. Ahora guarda la caché aunque falle y tiene hasta 2,5 h.

## Investigación del 2026-10-15 (sitio + addon)

Informe: https://claude.ai/artifact/CG758aFmjsGGA3zDXSTodn. Resumen: nuestra diferencia es el plan personal (nadie más lo tiene); en Forever no andan WeakAuras ni Pawn (el tooltip del addon cubre ese hueco); el addon 0.2.1 sacó `C_SuperTrack.SetSuperTrackedUserWaypoint` (protegido en Forever). Orden propuesto: 1) probar el addon antes del 21/22-oct, 2) página "Addons y macros para Shaman" (Cooldown Manager, totems, imbuiciones; macros probadas por el usuario), 3) plan del día del lanzamiento (carpeta y versión del juego pueden cambiar), 4) dungeons en el sitio reusando los datos del addon, 5) addon en CurseForge (categoría Forever, empaquetador de BigWigs) después del 4-nov, 6) preparación para las raids del 9-dic (Barrow Deeps, Hyjal Summit, Onyxia).

## Macros (2026-10-16)

Hechizos › Macros (`js/macros.js`). Pedido del usuario: juntar en un botón lo que es lo mismo para enemigo y aliado (LB/HW, CL/CH, Purge/curas…). Decisiones: nombres en el idioma del juego (el usuario probó en el juego que en inglés NO andan con el cliente en español): `data/macro-names.js` sale de `node scripts/macro-names.js` (SpellName de wago.tools, enUS/esMX/esES; correrlo de nuevo cuando cambien los hechizos, p. ej. Elemental Mastery todavía no está), la página elige idioma (sitio en español → esMX); el límite de 255 cuenta bytes UTF-8; sin Shift/Ctrl por defecto (la gente los usa para otras cosas), quedan como opción; Alt = curarte a vos (por defecto); mouseover opcional. Los hechizos de talento (Riptide, Stormstrike, Lava Burst, NS…) solo aparecen si el orden de leveo de la spec los toma. Ninguna macro pasa de 255 caracteres (con mouseover, Ancestral Spirit y Purge van solo al objetivo). Las condiciones `[harm]/[help]` andan en Forever (el usuario tiene una). "A probar": Purge/Cure Poison→Cure Disease en dos líneas (supone que Cure Poison sin veneno falla sin GCD), NS+HW en un clic, Totemic Projection `[@cursor]`, Elemental Mastery+Lava Burst (aparece cuando EM esté en los datos).

Parche del 15-oct (notas de Blizzard): Elemental muy mejorado (Lava Burst a 21 puntos con rango 4, vuelve Elemental Mastery a 31, CL −35% maná), raciales rehechos, totems de raid. talentsforever todavía no lo tenía; el sync lo va a traer. Revisar a mano la Guía de Elemental y las recomendaciones de raza cuando llegue.

## Addon y datos por raza (2026-10-16)

- `data/quest-races.json` (de `node scripts/quest-races.js`, local: necesita el QuestieDB instalado en el juego): misiones solo para algunas razas (Call of Fire de Skyborne, 97257). `build-data.js` lo suma a las fuentes y `js/gear-plan.js` las descarta para otras razas. Correrlo de nuevo cuando cambien las fuentes de quest.
- Addon: datos de misiones de las zonas nuevas desde el QuestieDB instalado (`scripts/lib/questiedb-baked.js`, CBOR en el .toc). Cadenas con varios comienzos (`qalt`), paso actual leído desde el final; marca en el mapa + abre el mapa (TomTom solo con `/sf flecha`); pestañas Avisos/Listos/Descartados; botón del minimapa; Esc no cierra; todo por personaje salvo el idioma.
- Pedido siguiente del usuario: profesiones en el addon (detectarlas en el juego y avisar mejoras crafteables según su tramo 1-75, 75-150…, como "Tu plan" de la web).

## Addon 0.12.0 y rutas con Polestar (2026-10-16)

- Addon: pestañas Avisos (Todos/Misiones/Dungeons/Profesiones) · En curso · Ocultos; avisos lejanos filtrados por continente (otro continente ≥35%, fuera de ruta ≥20%); recompensas con equipo, bolsas y XP en el tooltip de quien da misiones; profesiones leídas del personaje (crafteos por tramo, uno por casillero); piezas mejores en las bolsas cuentan; ventana redimensionable con candado; atajos de teclado; ocultar en combate; convive con Polestar (no avisa lo que su guía ya cubre). Nada de esto probado en el juego todavía salvo lo que el usuario fue confirmando (mapa, tamaño).
- Hecho (16-oct, tarde): Polestar **0.2.4 instalado** en el juego (0.2.3 respaldada en `.cache/tools/backup-polestar-023`) y packs **Tauren, Orco y Enano Mejora** con entrada temprana a las dungeons, instalados (PolestarPack_ShamanForever{Tauren,Orco,Enano}Mejora). Detalle en planner/README.md. Las variantes normales quedan en `.cache/tools/packs/sf-*-enh`. Addon **0.14.0** (instalado, sin probar en el juego): sigue la ruta de Polestar (la guía abierta y las que siguen por `next`): fila "Próxima dungeon de tu ruta" (nivel, misiones que faltan, mejoras; clic marca la entrada), en el paso "Dungeon:" la ventana muestra esa dungeon, mejoras de equipo de la ruta con "En tu ruta: <guía>" y las de afuera con "Fuera de tu ruta" (solo si valen ≥20%); se refresca con STEP_CHANGED/GUIDE_CHANGED de Polestar. Misiones con tiempo (17-oct): make-pack detecta el límite en el texto ("ten minutes", "time limit", "before ... expires") y deja aceptar y entregar seguidos en pasos "Timed quest"/"Turn in:" que reorder.js no toca; el addon (0.18.2, `qtimer` en Data.lua) avisa en el tooltip del NPC "Con tiempo: N min". repack.sh rearma también las rutas caster. Ventana del addon en strata LOW (debajo de los diálogos). Specs, profesiones y setup (17-oct, madrugada): rutas Elemental y Resto ("caster", sin modelo de armas de Mejora) para Tauren 37,2 h, Orco/Troll 37,2, Skyborne 36,4, Enano 33,8 (`planner/routes-caster.sh`, packs sf-*-cast instalados, sin variantes todavía). Addon 0.18.0: asistente inicial (spec, ventana sola sí/no, "Abrir mi ruta" en Polestar según raza, spec y nivel; `/sf setup`), aviso si tu spec no es la de la ruta abierta, Camping 101 de tus profesiones (todas, incluidas recolección y secundarias) en el campamento de tu raza, menos ruido: con ruta no hay filas de "agarrá" de dungeons (las resume la próxima dungeon), fuera de ruta solo ≥35%, al subir de nivel abre solo los 3 avisos más importantes, avisos de zona solo de la ruta. Mecánicas de Forever (16-oct, noche): las misiones que quedan como `complete` (fogata /sit de The Great Outdoors, escoltas, "hablar con") llevan el texto del juego como tip y flecha opcional al objeto/NPC/punto del evento (objects.json, npcs.json); un "kill" de NPC amistoso (faction) ya no se convierte en kill (Camping 101). Las misiones nuevas de Mulgore ya estaban en la ruta; faltan las Camping 101 de profesiones (una por profesión). Pegajosos y nivel (16-oct, noche): medidas de las guías de Zygor del usuario (suscriptor; solo números, nada copiado, ver memoria) y de WoW-Pro: reorder.js agrega objetivos pegajosos (objetivo de la misma zona, 600 yd, hasta 5 pasos antes, como `optional`; 27-63 por ruta) y pone los "Reach level N" en bichos de ese nivel cerca de donde estás (1200 yd). `scripts/route-bench.js` compara con una guía de referencia. Orden tipo Zygor (16-oct, noche): `planner/reorder.js` reordena los pasos de cada guía entre barreras (hearth, vuelos, dungeons, nivel, sin lugar) por menor caminata con orden aceptar<objetivos<entregar, cadenas pre/next y nivel mínimo; une pasos del mismo pueblo (80 yd) y objetivos cercanos (120 yd). 5-11% menos caminata, ~150-190 pasos unidos por ruta. repack.sh lo corre en cada ruta. XP real (16-oct, noche): addon 0.16.0 guarda la XP de cada misión (ventana de recompensa y entrega) en ShamanForeverDB.qxp; `scripts/import-quest-xp.js` la pasa a `planner/quest-xp.json` (recompensa completa) y el simulador la usa con `SF_QUEST_XP` (parche; hay que `sim world --rebuild`). 35 de 890 misiones de las rutas no tienen XP en los datos (sobre todo las nuevas de 1-12). Pendiente: cuando haya datos, importar y re-simular todo. make-pack: misiones de transición (`breadcrumbFor`) que el simulador tomaba tarde o nunca se aceptan donde ya estás con quien las da y se entregan antes de su destino; pasos "Reach level N" con flecha al campamento de bichos más cercano (loadCamps del export), opcional. Flecha (16-oct, noche): make-pack cambia `complete <q>` por un `kill`/`collect ... quest q.N` por objetivo (si todos son de matar o juntar y no es de dungeon), así el compilador de Polestar pone lugar y zonas: ~1000-1500 objetivos con flecha por pack; quedan 67-126 `complete` (objetos/eventos sin lugar en los datos). `planner/repack.sh` rearma los 4 packs desde las rutas ya simuladas. Addon 0.15.1: la próxima dungeon aparece recién a lead+2 niveles y nunca abre la ventana sola; una ventana abierta sola se cierra cuando no queda nada (abierta a mano, no). Cliente del usuario en enUS (`/sf idioma es`). Variantes (16-oct, noche): cada pack trae además rutas sin las dungeons que más se saltean (Horda: sin WC, sin SFK, sin WC ni SFK; Enano: con Ruins of Lordaeron, sin Stockade), ids `<pack>/<tag>-NN-zona` con su carpeta (`planner/routes-variants.sh`, `planner/merge-variant.js`). Addon **0.15.0**: clic derecho en la fila de próxima dungeon o `/sf saltear` pasa a la ruta sin esa dungeon (la más parecida a la tuya), en la guía de tu nivel y, si puede, de tu zona (por mapa); sin variante, en su paso salta el paso de Polestar. Barrido: 1251 corridas, 0 fallas; e2e con Polestar real ok. Packs finales (16-oct, tarde): Tauren, **Orco y Troll** (un pack), **Skyborne** y Enano (Hall of Thanes, Deadmines, Stockade, Excavation, Dalaran: 32,7 h); Horda suma SM Graveyard (salvo Skyborne). Detalle y comparaciones en planner/README.md. Addon 0.14.1: nombres de dungeon de Polestar ("Scarlet Monastery: Graveyard") mapeados a los nuestros; `.cache/tools/addon-sweep.sh` prueba el addon en cada guía de cada pack instalado (333 corridas, 0 fallas); `scripts/test-polestar-e2e.js` carga Polestar real + el pack Orco/Troll + nuestro addon en el cliente falso de Polestar (talentos registrados, próxima dungeon, vista del paso de dungeon, vuelve al saltearlo: todo ok). Pack viejo de prueba "Shaman: Forever" (solo Call of Earth) sacado del juego a `.cache/tools/backup-polestar-023`. El aviso de talento en el chat se calla si el recordatorio de talentos de Polestar está activo. Prueba: `PPACK=<Guides.lua del pack> PGUIDE=<id> PSTEP=<n> lua5.1 scripts/test-addon.lua …`.
- Antes: **rutas de Shaman como packs de Polestar** con el planner. Elecciones del usuario: dungeons nuevas de Forever siempre (Ruins of Lordaeron, Excavation Site: Wetlands, City of Dalaran), RFC y RoL casi seguidas, después WC, SFK sí, BFD no. Orco y Tauren primero; Enano después.

## Pendiente

- **Del 29-oct al 2-nov**: post principal en Reddit (actualización del 8 al 12-nov con datos 30–60). El usuario tiene que confirmar qué subreddits existen y sus reglas (Reddit bloquea las herramientas). Ya hay textos escritos para Twitter y Discord en español e inglés.
- **4-nov (lanzamiento del juego)**: revisar los textos "tope de la beta"/"nivel 30"; la nota de fin de beta se oculta sola después del 21-oct.
- **Con los datos post-30/60**: cargar los datos por página (hoy ~2,3 MB, ~260 KB comprimidos, en cada visita).
- **Afinar con feedback real**: pesos y umbrales (UPGRADE 5%, MIN_LEVELS, MIN_FIT 0.5), zonas de la ruta.
- **Totems/abalorios**: casi sin datos útiles por debajo de 60.

## Reglas de trabajo

- Responder en español rioplatense.
- Antes de pushear: `node scripts/build-data.js` y chequeo en navegador (servir con `python -m http.server 8765 --bind 127.0.0.1` y ctrl+shift+r; para celular, un iframe de 375px), o `CHROME=1 node scripts/smoke.js` con playwright instalado (`npm i --no-save playwright@1.48.2`, por ejemplo en el scratchpad con NODE_PATH).
- Scripts de parche como archivos `.py` escritos con Write: los heredoc de bash se comen las barras y las comillas.
- `node scripts/sync.js --offline` re-parsea desde la caché; después, `git checkout reports/`.
- Para comparar planes de antes y después de tocar `gear-plan.js`: un script que cargue las dos versiones del motor y recorra combinaciones de Shaman (raza, spec, profesiones, drops) contando qué piezas cambian. Enhancement no debería cambiar si no se lo toca.

---

# Historia

## Estado del repo al cortar (2026-10-13, antes de la Fase 1)

- `main` en GitHub = todo hasta el ordenamiento del pipeline (commit `fix http: check the cached copy too…`). El sync diario de GitHub funciona con el pipeline nuevo (`scripts/lib/http.js`, etc.; ver `ARQUITECTURA.md`).
- (Histórico, ya resuelto y subido) Dos commits viejos:
  - `2cec2ca` Professions: cooking, fishing and first aid (script `scripts/build-consumables.js` → `data/consumables.json`: recetas de Cocina/Primeros Auxilios desde el cliente, efecto desde Wowhead, materiales, peces de AllTheThings). **Los datos sirven**, se reusan en la Fase 4.
  - `b3402ff` Professions reorganized around your plan (secciones plan / profesion / cocina / auxilios / sistemas, `data/camp.json` con los objetos de campamento citados). Al usuario **no le gustó**: "todo mezclado y confuso", ítems de Merchant's Favor engañosos, cocina con comidas que no son de pesca, repetitivo. Se **rehace** en la Fase 4; `camp.json`, `consumables.json` y el fix del lector de ATT (comentarios `--[[ ]]`) se conservan.
- Antes de pushear algo: correr el barrido de páginas (ver memoria / sesiones anteriores) y `node scripts/build-data.js` (corre `check-data.js`).

## Lo que pidió el usuario (sus palabras, resumido)

1. Alguien que empieza Shaman entra, elige **raza, spec y profesiones** (ej. Orco, Enhancement, Skinning + Leatherworking) y el sitio le arma un **camino de equipo acorde a las rutas de leveo comunes** de esa raza/facción. Que la página no sea solo datos: que te dé los datos que te sirven. Opción para **ver todo** como si no hubieras elegido nada.
2. **Merchant's Favor**: las recetas de Favor son engañosas; hay que llenar y entregar Waylaid Crates ("deploys raros"), en la práctica se destraban **1–2 recetas por tramo**. Acotarlas.
3. Profesiones no es solo "lo mejor": también lo **accesible** mientras leveás. **Tramos cortos** (1–10 dura poco) no justifican craftear algo que cambiás enseguida; 30–40 dura mucho más.
4. **Progresión de equipo para todos los slots**, como la de armas, pero no tan lineal: recomendar quests tipo "si estás leveando en tal zona, no te pierdas este ítem".
5. **Cocina y pesca**: solo recetas **de pesca**, como camino conjunto para subir las dos (son complementarias), las que sirven a tu spec o para subir puntos y destrabar recetas. Lo armado ahora se siente disperso y repetitivo.
6. Todo el algoritmo es MUY complejo: armarlo bien, con referencias.

## Investigación ya hecha

- **Merchant's Favor** (wowforeverbuilds.com/merchants-favor, wowhandbook, sportskeeda, overgear ACA, foro oficial beta): Waylaid Crates caen raras de mobs desde nivel 10 (Apprentice/Journeyman 10, Expert 20, Artisan 35); se llenan con un bundle (ej. 20 Copper Bar), se entregan en Three Corners (Redridge, Alianza) / Crossroads (Barrens, Horda). Favor por caja **sin confirmar** (5–50 según fuente). Recetas 30–90 Favor en tramos bajos, hasta ~1000. Perk Legacy Performance Bonus: 15% de doble Favor. Foro: "Crafted merchant's favor gear is really strong". El costo en Favor de cada receta ya está en `data/recipes.json` (texto `learn`: "Pattern for N Merchant's Favor").
- **Rutas de leveo Forever** (wowforeverbuilds.com/leveling/route/horde y /alliance, The Forever Era, Overgear): Horda Durotar/Mulgore/Tirisfal → Barrens/Silverpine → Ashenvale/Hillsbrad/Stonetalon/Thousand Needles/Wetlands → Arathi/Desolace/STV → Badlands/Dustwallow/Feralas/Tanaris/Hinterlands → Azshara/Burning Steppes/Plaguelands/Felwood/Un'Goro/Winterspring. Alianza: Elwynn/Dun Morogh/Teldrassil → Westfall/Loch Modan/Darkshore → Redridge → Wetlands/Duskwood/Ashenvale… Zonas nuevas: Zephras Isle (1–12, Skyborne), Riverglades (mid 30s–40s). Dungeons nuevos: Hall of Thanes 13–18, Ruins of Lordaeron 15–20, Excavation Site 24–29, City of Dalaran 28–33, The Drowned City 35–40, Krol'dok 40–55, Alcaz Prison 48–53, Blackmaw Hold 55–60, Shaper's Terrace 58–60. Ninguna guía nombra quests ni ítems: **eso es lo que diferencia al sitio**.
- **Guías de equipo de leveo** (Wowhead Classic shaman leveling, Zockify): solo arma + alguna quest suelta. No hay referencia que haga esto completo.
- **Hueco grave en los datos**: `scripts/sync.js` `itemTables()` solo agrega armas, escudos, off-hands, totems y **armadura crafteada**. La armadura no crafteada no está: de **884** piezas de armadura que son recompensa de quest (QuestieDB itemKeys: `questRewards` = índice 5 en 0-based), `data/items.json` tiene **53** (faltan 364 verdes, 63 azules, 160 épicas, 97 sin ItemSparse).

## Plan acordado (fases)

### Fase 1 — Datos (automáticos, en el sync diario)
- `sync.js` `itemTables()`: sumar **toda la armadura usable por Shaman** (Cloth, Leather, Mail, Shield, Neck, Ring, Trinket, capa = Cloth slot Back) con calidad ≥ verde y nivel ≤ 60 (decidir si incluir blancas de quest de nivel muy bajo). Más tooltips de Wowhead la primera vez (~30 min), después caché.
- Fuentes de cada pieza con el mismo motor de las armas: generalizar `scripts/lib/weapon-sources.js` a **item-sources** (no solo armas) y `build-weapons.js` → un `build-gear.js` (o extender) con `asap`/`rec` por fuente (ya existe la regla: objetivo más difícil de la cadena, grupo −3/−5, solo −1/−3, facción por cadena, quests de otras clases fuera).
- **Nivel de cada zona**, automático: distribución de niveles de las quests de cada zona (QuestieDB `zoneOrSort` + ATT por archivo de zona) → banda de la zona. Cruzar con foreverchanges /dungeon-quests para dungeons.
- **Zona de inicio por raza** (Orco/Troll Durotar, Tauren Mulgore, No-muerto Tirisfal, Enano Dun Morogh, Draenei?, Skyborne Zephras Isle…: verificar qué razas son Shaman en Forever en `data/shaman.json` `racials`).
- Costo en Favor por receta (parsear `recipes.json`), y qué recetas son de entrenador.

### Fase 2 — "Tu personaje"
- Selector arriba (junto a spec/facción): **raza** (fija facción y zona de inicio), spec, **profesiones** (ya existe `UI.store` 'profs', compartido con Equipo). Opción "ver todo".
- Ruta de zonas por tramo derivada de las bandas de zona + inicio de la raza.

### Fase 3 — Algoritmo de equipo (slot por slot)
- **Valor** por pieza para el spec: pesos simples y declarados (Enh: Fuerza > Agilidad > PA > Intelecto…; Ele: daño con hechizos > Intelecto…; Resto: curación > Intelecto > Espíritu/MP5), armadura: cuero hasta 40, malla desde 40.
- **Accesibilidad** (orden): quest en zona de tu ruta > quest de dungeon > crafteo de entrenador de tu profesión > receta de Favor (**tope 1–2 por tramo**, las de más valor) > drop de boss (opcional, "si te cae").
- **Duración**: niveles que te dura antes de que algo accesible la supere; ponderar por tiempo de leveo (un nivel 30–40 tarda mucho más que uno 1–10); en tramos bajos solo lo gratis/de paso; no recomendar lo que cambiás en ≤2–3 niveles.
- **Salida**: "No te pierdas" por zona ("En Barrens, la quest X da estas botas, te duran hasta el 24") y equipo recomendado por tramo. Cada recomendación dice **por qué** (como las armas: "te dura 8 niveles, quest en tu ruta").
- Es una aproximación (no hay pesos medidos de Forever; niveles de zonas nuevas estimados): decirlo.

### Fase 4 — Rehacer Profesiones y Cocina sobre eso
- **Profesiones**: solo lo que de verdad conviene craftear (lo que entra en tu camino de equipo) + tus 1–2 recetas de Favor por tramo con su costo. Simple, sin volcado de datos.
- **Cocina y pesca**: un único camino de subida conjunta con **solo recetas de pescado**: qué pescar, dónde (`consumables.json` `fish`, de AllTheThings), qué cocinar para subir puntos y destrabar recetas, y cuáles le sirven a tu spec.
- Primeros auxilios y Sistemas: cortos, aparte.

## Notas técnicas para no tropezar
- Escribir scripts de parche con la herramienta Write (no heredoc de bash: se come las barras invertidas).
- Repo en LF (`.gitattributes`). Verificar refactors con snapshot de `data/` + diff, y barrido de todas las páginas × specs × facciones × idiomas en el navegador.
- Fuentes y sus reglas: ver `ARQUITECTURA.md` y la memoria `reference_wow_forever_data_sources.md`.

## Avance 2026-10-13 (sesiones 2 y 3)

Hecho (commits locales, sin pushear):
- **Fase 1**: `sync.js` agrega toda la armadura (con `slot`); `lib/item-sources.js` (ex weapon-sources) con la regla de nivel compartida `placer()`; `build-gear.js` → `data/gear.json`; `fetch-levels`/`fetch-item-sources` cubren todo el equipo; `lib/recipes.js` (costo en Favor, nivel de entrenador) → fuentes `crafted` traen `learn`; `build-zones.js` → `data/zones.json` (banda de cada zona por facción = ventana más angosta con 3/4 de sus quests; dungeons; inicio por raza). Razas Shaman: Orco, Troll, Tauren, Skyborne (Horda), Enano (Alianza).
- **Fase 2**: selector de raza en el encabezado (razas de la facción + "Cualquiera" = ver todo); `js/route.js` (zonas por nivel; zonas de inicio de otras razas excluidas).
- **Fase 3 (motor + página)**: `js/gear-plan.js` (valor = ilvl × parte útil de stats con pesos declarados; totems/abalorios por texto del efecto; acceso ruta > dungeon > entrenador > Favor (2 por cada 10 niveles) > jefe; duración ponderada; mínimo de niveles por tipo) y `js/gear-path.js` = sección **Equipo › Tu camino** (primera). `build-data` genera `data/gear.js` recortado.
- `data/items.js` ya no se genera (nadie lo leía).

Sesión 3 (después):
- Sync completo con red hecho (7755 ítems; 6700 piezas de armadura; 681 quests de equipo con nivel). Ítems de prueba/placeholder ("TEST", "DNT", "Monster - …") excluidos en `sync.js`. El changelog agrupa altas/bajas grandes en una línea.
- Ajustes del camino con datos reales: intendentes de BG y oficiales de honor = vendedores PvP; quests de evento (sin nivel ni zona) y zonas de inicio de otras razas fuera; mínimo 40% de stats útiles; anillos/abalorios sin repetir; el arma es un slot más del plan (Enh por DPS).
- **Fase 4 hecha**: Cocina y Pesca = un camino de subida con solo recetas de pescado (zonas de tu ruta primero, comida para tu spec, +5% XP de Forever); Profesiones › Tu plan = solo lo que entra en tu camino (crafteos y 1–2 recetas de Favor por tramo con costo); se quitó "Por profesión".
- Barrido en navegador: 3 specs × 2 facciones × razas × 2 idiomas × 16 páginas sin errores ni textos rotos; móvil (375 px) sin scroll horizontal.
- `data/gear.js` pesa ~1,3 MB (weapons.js ~0,6 MB).

Sesión 4 (2026-10-13, tarde), **todo subido a GitHub** (`6032983`, Pages desplegado):
- Cocina: se sacó el camino de pesca (el usuario prefiere mandar a wow-professions.com para subir Cocina/Pesca). Quedó "Cocina" = links a esas guías + mejor comida por spec y por tramo (versión de b3402ff).
- Celular: tocar = acción (suma punto de talento / abre link), mantener apretado = detalle (`UI.tip.longPress`, tarjeta arriba o abajo lejos del dedo). Aviso en la calculadora (`.touch-only`/`.mouse-only`).
- Ícono de Skyborne: `race_skyborne_male` (en `data/shaman.json`, dato manual).
- Tu camino: sin profesiones elegidas = **sin crafteos** (antes = cualquiera, y eso tapaba quests). Las quests de ruta que solo un crafteo supera quedan en "No te pierdas" como **alternativa gratis** (`st.alt`).
- Barrido: 672 combinaciones (idiomas × specs × facciones × razas × profesiones × páginas) sin errores; 18 páginas a 375 px sin scroll horizontal (con iframe: resize_window no achica la ventana maximizada).

Sesión 5 (pulido, subido `b71c868`):
- Recetas cruzadas por **id de ítem** (`fetch-recipes.js` lee los objetos embebidos de classicwowforever): nombres repetidos Classic/Forever ya no se mezclan.
- Ícono de Skyborne corregido en `build-data.js` (`ICON_FIX`): el sync guarda `shaman.json` tal cual lo publica talentsforever.
- Camino: quests de clase (`access 'class'`), fuera quests de eventos/raids/PvP/otras profesiones y vendedores en zonas solo de la otra facción (`Route.reachable`); pesos de Enh como su guía (Int 0.5, Agi 0.5).
- Guía: arma al 30 = la de tu camino; Inicio y novedades al día; páginas de armas filtran por raza; changelog sin la entrada de "5061 ítems" (era el cambio de alcance, no del juego).

Falta / ideas:
- Totems: lista completa (en Forever casi no hay antes del 60; los "Icon" del cliente no tienen fuente ni efecto). Panel "Totems antes del 60" en Tu camino; efecto de tu spec 0.8, utilidad 0.4, de otra spec 0.2; Favor nunca en un totem que no es de tu spec.
- gear.js 1,3 MB -> 0,7 MB (82 KB comprimido): solo piezas que alguna spec usa y los campos que lee la página; verificado que los planes son idénticos en 210 combinaciones (script de comparación en el scratchpad: cmpplan.js).
Sesión 6 (rediseño pedido por el usuario: menos pestañas, menos redundancia, entrega más clara):
- **Armá tu Shaman** (`js/setup.js`): en la primera visita, raza (define facción), spec, profesiones y nivel (opcional). El encabezado es una etiqueta que reabre el selector (`Site.setMany`). Inicio = "Tu Shaman" con accesos a guía, talentos, camino y profesiones.
- **Equipo** en 2 pestañas: *Tu camino* = un tramo de 10 niveles a la vez (el de tu nivel), quests de tu ruta con ★, alternativas gratis adentro, "Ver por qué" a pedido, totems plegados; *Armas* = gráfico + mejores por tramo + todas las armas plegadas (se fueron Progresión, Quests de dungeon y Todas como pestañas; links viejos redirigen a Armas). Profesiones solo desde el perfil (sin profesiones = sin crafteos propios, también en Armas).
- Hechizos › Por nivel resalta tus próximos 10 niveles. Profesiones › Tu plan usa las profesiones del perfil.
- `build-data.js` versiona scripts/CSS en index.html (`?v=hash`) para que tras un deploy nunca se mezcle HTML nuevo con JS viejo.
- Decisiones del usuario: un tramo a la vez; plegar detalle (no interruptor simple/avanzado); selector en primera visita + etiqueta.

Sesión 6b (feedback del usuario sobre Tu camino):
- Ruta: las zonas que siguen a las de inicio (banda desde ≤12) solo en el continente de tu raza (`HOME` en route.js): Orco/Trol/Tauren/Skyborne = Kalimdor (sin Silverpine), Enano = Reinos del Este.
- Dungeons en tierra de la otra facción (`DUNGEON_SIDE`: Deadmines, Stockade, Hall of Thanes = Alianza; Ragefire = Horda) no cuentan sus drops ni vendedores (Tu camino y Armas).
- Quests fuera de ruta: mínimo 5 niveles de duración, y se ven como "fuera de tu ruta".

Sesión 6c (chequeo fino de stats, pedido del usuario):
- Valor de una pieza = suma de stats × COST (puntos de presupuesto) × peso de la spec (antes: ilvl × % útil, que ignoraba cuántos stats trae; ej. Leggings of the Fang perdían contra unos verdes).
- MIN_FIT 0.5 calculado sin Aguante (NEUTRAL). "Curación hasta X y daño hasta Y" = un solo stat (el daño no gasta presupuesto). Enh: Fuerza 1, Agi 0.55, Int 0.5, crit 0.8 (derivados de conversiones, comentados en gear-plan.js). Ele: crit/golpe de hechizos, Naturaleza/Fuego; melee crit/hit 0.
- sync.js lee % con decimales, crit/golpe de hechizos, "spells and attacks", daño por escuela (Shadow/Arcane/Holy como otherDamage, peso 0), Defense/Dodge.
- Quests de ruta quedan como "alternativa segura" a drops de jefe. Drops de campos de batalla = PvP.
- Auditoría del camino: `node scripts/plan.js path|slot <Slot>|item <id> --race --spec --faction --profs [--drops]` (reemplaza a audit.js y legs.js del scratchpad). Revisar reportes: comando `/revisar-feedback` (.claude/skills/revisar-feedback/SKILL.md). Rutina en la nube "Revisar feedback · Shaman: Forever" (trig_01S1JEvdgAZWNbSXH1CPbdKY), todos los días 12:07 UTC (9:07 en Argentina): corre ese skill en modo rutina (etiqueta, comenta, PRs en ramas feedback/N, resumen en la issue "Resumen de feedback"). Prueba del 2026-10-14 OK (lee las issues con mcp__github). Entorno de la rutina: red completa y variable GOATCOUNTER_TOKEN; si guardás la rutina desde la página, recargala antes porque si no vuelve a escribir las instrucciones viejas. Visitas: `node scripts/visits.js [días]` (clave local en .goatcounter-token, ignorado por git) y `.github/workflows/visits.yml`, que todas las mañanas deja el resumen en la issue #7 "Resumen de feedback" (secreto GOATCOUNTER_TOKEN). La rutina también comenta en la #7.


Sesión 7 (2026-10-13/14, lanzamiento): GoatCounter; formulario de Google y después la ventana de reporte dentro del sitio; bandeja de issues; chequeos en cada push (check-site, smoke); avisos de error y eventos en GoatCounter; skill `/revisar-feedback` y `scripts/plan.js`; rutina diaria en la nube; `visits.js` y `visits.yml`; resúmenes de spec reescritos; primer feedback de Discord (arreglo `SAME` en gear-plan.js). El estado está arriba.
