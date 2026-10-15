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
