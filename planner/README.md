# Planner de rutas (sobre el simulador de Polestar)

Cambios al simulador de rutas de [Polestar](https://github.com/fitzforge/polestar)
(GPL-3.0, (c) The Polestar authors) para las rutas de Shaman: Forever. El parche
se aplica sobre el commit `66da541195e5a50cbbbfa74136f202b45cbd5a9f` de Polestar.

Qué agrega:

- **Nivel ideal de dungeon**: una dungeon se hace recién cuando el personaje está
  a `dungeonBossGap` niveles o menos de su jefe más alto (2 para DPS: a +3 los
  hechizos fallan 17%; 3 para healer).
- **Misiones de dungeon de paso**: si la ruta pasa a `pickRadius` yardas o menos
  de quien da una misión de dungeon, la agarra ahí (si el nivel mínimo y las
  previas lo permiten, con el registro de `questLogMax` = 40 misiones). Así se
  llega a la dungeon con todo aceptado y no hay viajes extra.
- **Armas** (`SF_WEAPONS=planner/weapons-enhancement.json`, generado con
  `node planner/build-weapons.js` desde los datos del sitio): cada misión o jefe
  que da una 2H mejor la equipa (los jefes con chance `dropWin`), y el tiempo de
  matar se multiplica por (DPS de un arma blanca de tu nivel / DPS de tu arma) ^
  `weaponAlpha`.
- **Continuaciones de la dungeon**: las misiones que siguen a una de dungeon, sin
  objetivos y entregadas cerca de la entrada (Hidden Enemies 5729/5730 con Thrall),
  se hacen al salir.
- **Misiones lejanas**: antes de la dungeon no se viaja más de `dungeonFetchMax`
  segundos por una misión que no se agarró de paso (Varimathras en Undercity).
- **Tope de nivel** (`SF_CAP=30`): las rutas se puntúan hasta ese nivel
  mientras el juego llegue hasta ahí.

Cómo correrlo (Node 24 y Lua 5.1; ver docs de Polestar):

```
git clone https://github.com/fitzforge/polestar && cd polestar
git checkout 66da541195e5a50cbbbfa74136f202b45cbd5a9f && git apply ../planner/polestar-sim-shaman.patch
node tools/polestar.js data build --questie "<AddOns de Forever>"
node tools/polestar.js dungeons build --source "<AddOns>/ForeverDungeonJournal"
SF_CAP=30 node tools/polestar.js sim run --faction horde --race Orc --class Shaman --dungeons
```

## Rutas a medida como packs de Polestar

Además del parche de arriba:

- **Dungeons elegidas** (`SF_DUNGEONS="Ragefire Chasm,Ruins of Lordaeron,…"`):
  solo esas dungeons (y sus misiones); cada una que la ruta deja afuera cuesta
  `SF_MISSING` horas (10 por defecto), así la búsqueda las mete todas.
- **Rango de nivel por dungeon** (`SF_DUNGEON_LEVELS="Ragefire Chasm:13-16,…"`):
  fuera de su rango la corrida no cuenta.
- **Distancia al jefe** (`SF_BOSS_GAP`, 2 por defecto): cuántos niveles puede
  llevarte el jefe más alto al entrar. Con 3 (DPS en grupo) se entra antes:
  el 16-oct, Tauren Mejora con 3 y rangos tempranos dio 36,3 h hasta 35
  contra 36,1 h, con RFC a 13, SFK a 23,6 y Excavation a 29.
- **Viajes**: el modelo necesita `data/forever/travel.json` (vuelos, zepelines,
  barcos, posadas). Sin él no hay transporte y Reinos del Este queda fuera de
  alcance para la Horda. Se arma con `node tools/polestar.js travel build` y
  después `sim world --faction horde --rebuild`.

Del resultado a un pack instalable:

```
SF_CAP=35 SF_DUNGEONS="…" SF_DUNGEON_LEVELS="…" SF_WEAPONS=<planner/weapons-enhancement.json> \
  node tools/polestar.js sim run --faction horde --race Tauren --class Shaman --dungeons --workers 3 --paths 300000
node tools/polestar.js sim export --result data/sim/results/horde-tauren-shaman-dungeons.json --out <export>
node tools/polestar.js new <pack> --id sf-tauren-enh --title "…" --author Lernok --license CC-BY-4.0 --yes
node planner/make-pack.js <export> <pack> sf-tauren-enh "Shaman: Forever · Tauren Mejora"
cd <pack> && polestar lint && LUA=<lua5.1> polestar playtest && polestar install --dest "<AddOns>"
```

`make-pack.js` renombra las guías al id del pack, las agrupa en una carpeta del
menú, cambia la nota "Run <dungeon>" por un paso con la entrada, agrega la
aceptación de las misiones de dungeon que el simulador agarró de paso (al final
de la última visita a la zona de quien la da, si no antes de la dungeon), las
marca `optional` y les pone las coordenadas del diario de dungeons cuando
Polestar no las tiene.

Packs hechos (`planner/packs/`), 16-oct. Las dungeons salen de lo que más
hace la gente en cada facción (guías de Forever) más las elecciones del usuario,
comparadas en el simulador (`planner/experiments.sh`); los packs se arman con
`planner/routes-final.sh`. Todos con entrada temprana (`SF_BOSS_GAP=3`),
Polestar 0.2.4, lint 0 errores y playtest completo. Horas hasta 35:

- `sf-tauren-enh`: Tauren. RFC 13, RoL 17, WC 20,5, SFK 23,6, Excavation 30,
  Dalaran 30, SM Graveyard 31,5; 36,0 h.
- `sf-orc-enh`: Orco y Troll (`RACES="Orc, Troll"`, mismo inicio). Las mismas
  dungeons; 35,9 h.
- `sf-sky-enh`: Skyborne (Zephras Isle), sin SM Graveyard (le caía a 33,8 y
  costaba media hora); 35,9 h.
- `sf-dwarf-enh`: Enano. Hall of Thanes 13, Deadmines 19,5, Stockade 27,5,
  Excavation 28,7, Dalaran 30; 32,7 h.

Comparaciones (experiments.sh): Horda + RFK 36,6 h, + SM GY 35,9, sin WC 35,6
(el usuario quiere WC). Alianza con RoL 34,1 h (+1,4 y es viaje hostil), con
Gnomeregan 33,5, con RoL+SFK+Stockade 34,9, la anterior (RoL, SFK, sin
Stockade) 34,0.

Variantes en el mismo pack (`planner/routes-variants.sh`, después de
routes-final.sh): las dungeons que más se saltean según guías y foros (WC y
SFK para la Horda; para la Alianza se suma la opción con Ruins of Lordaeron,
que los testers dicen que vale el viaje, y sin Stockade). Horas hasta 35:
Tauren sin WC 35,8 · sin SFK 36,7 · sin ambas 36,0; Orco/Troll 36,6 · 36,3 ·
35,8; Skyborne 35,0 · 35,2 · 34,4; Enano con RoL 34,1 · sin Stockade 32,3.
Diferencias de menos de ~0,5 h son ruido de la búsqueda.

### Polestar 0.2.4

El parche aplica limpio sobre `v0.2.4` (probado el 2026-10-16). Con la 0.2.4 hay
que volver a correr `data build`, `dungeons build`, `travel build` y
`sim world --rebuild`; el pack sale en formato 2 (marca lo que pide grupo) y
necesita Polestar 0.2.4. `sf-tauren-enh` está regenerado así (27 guías, lint 0
errores, playtest 27/27).

### Plan de talentos de Shaman para Polestar

Polestar 0.2.4 trae planes de talentos (anillo en el próximo talento, números de
orden, recordatorio), solo para Paladín. El de Shaman sale de los órdenes de
leveo del sitio:

```
node planner/talents-for-polestar.js <checkout>        # talents/forever/shaman.json
# en el checkout: SHAMAN (línea 373) en CLASSES de tools/lib/talents/build.js
node tools/polestar.js talents build --plans <carpeta con shaman.json> --out <salida>
node planner/polestar-talents-to-addon.js <salida>/Builds.lua addon/ShamanForeverGuide/PolestarTalents.lua
```

El `talents build` repite cada punto con las reglas del cliente: pasarle
`--build <versión>` del cliente actual (1.60.1.70450 desde el 17-oct, con el
árbol Elemental nuevo); los 3 planes (153 puntos) pasan. El addon registra el
plan en Polestar al cargar (si Polestar 0.2.4 está). Regenerarlo cada vez que
un parche cambie los árboles.
