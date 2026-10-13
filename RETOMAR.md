# Retomar: camino de equipo personalizado (plan acordado el 2026-10-13)

Leer esto entero antes de seguir. Al usuario le encantó el plan; arrancar por la **Fase 1**.

## Estado del repo al cortar

- `main` en GitHub = todo hasta el ordenamiento del pipeline (commit `fix http: check the cached copy too…`). El sync diario de GitHub funciona con el pipeline nuevo (`scripts/lib/http.js`, etc.; ver `ARQUITECTURA.md`).
- **Dos commits locales SIN subir** (no pushear tal cual):
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

## Avance 2026-10-13 (sesión 2)
- Conteo de candidatos de armadura (Cloth/Leather/Mail en todos los slots + capa + Neck/Ring/Trinket, verde+, nivel ≤ 60, filtro de clase): **~6960** (2699 con ItemSparse, 4265 sin ItemSparse: Wowhead decide si existen). Ya están 968 (crafteadas); quedan **~5950 tooltips nuevos** de Wowhead (el primer sync va a tardar bastante; después, caché).
- `lib/weapon-sources.js` `classify()` ya es genérico (sirve para cualquier ítem); lo atado a armas está en `fetch-item-sources.js` (WEAPON_KINDS), `fetch-levels.js` (`isWeapon`) y `build-weapons.js`.
- Próximo paso: en `sync.js` `itemTables()` agregar toda la armadura (con campo `slot` desde InventoryType) y correr el sync con red.
