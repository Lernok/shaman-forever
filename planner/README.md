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

Packs hechos (`planner/packs/`):

- `sf-tauren-enh`: Tauren Mejora hasta 35 con RFC, Ruins of Lordaeron, WC, SFK,
  City of Dalaran y Excavation Site: Wetlands (sin BFD), 36 h bajo el modelo.
