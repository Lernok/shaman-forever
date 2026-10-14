# Retomar: camino de equipo personalizado (plan acordado el 2026-10-13)

Leer esto entero antes de seguir. Al usuario le encantó el plan; arrancar por la **Fase 1**.

## Estado del repo al cortar

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
- Scripts de auditoría en el scratchpad: audit.js (camino completo con stats), legs.js (candidatos de un slot).

Falta / ideas:
- Esperar feedback. Textos "tope de la beta"/"nivel 30" a revisar el 4-nov (lanzamiento).
- Afinar con el usuario: pesos de stats, umbrales (UPGRADE 5%, MIN_LEVELS, MIN_FIT 0.4), zonas que propone la ruta.
- Lanzamiento (6d): GoatCounter activo (Site.GOATCOUNTER='lernok', visitas en lernok.goatcounter.com, localhost no cuenta). Formulario de Google activo (Site.FEEDBACK en js/site.js): pregunta abierta + "Datos de la página" (entry.663155691), que el sitio rellena con tipo | página | Shaman | profesiones | nivel | pieza; las respuestas llegan a la pestaña Respuestas del formulario (prueba recibida el 2026-10-13). Reddit: soft launch hasta el 21-oct, post principal del 29-oct al 2-nov, actualización del 8 al 12-nov.
- Totems/abalorios: casi sin datos útiles por debajo de 60 (los "Icon" nuevos de Forever no traen efecto).
