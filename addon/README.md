# Addon Shaman: Forever

El lado del juego del sitio. **Avisa, no te lleva de la mano**: vos elegís por dónde ir.

- **Al entrar a una zona:**
  - Las misiones de esa zona que conviene agarrar para la dungeon que viene: quién las da, dónde está y a qué cadena llevan.
  - Las mejoras de equipo que hay en esa zona, de misiones y vendedores.
- **Al subir de nivel:**
  - Dónde va el punto de talento, según el orden de leveling de tu spec (talentsforever).
  - Lo que viene en los próximos niveles (por defecto, 2).
- **Al entrar a una dungeon:**
  - Cuántas misiones de esa dungeon tenés y cuáles te faltan.
  - Qué te sirve de ahí, tanto lo que tiran los jefes como las recompensas de las misiones.
- **En el tooltip de un ítem:** cuánto mejor o peor es que lo que tenés puesto.
- **Clic en un aviso:** pone la flecha de TomTom hasta quien da la misión. Sin TomTom, deja una marca en el mapa.
- **Avisos que no se repiten:** cada aviso salta solo una vez. Si lo marcás como "Listo", no aparece más.
- **Registro para investigar:** `/sf registro` muestra los niveles, zonas, dungeons y misiones aceptadas y entregadas, con la hora, para copiar.

Escribí `/sf ayuda` en el juego para ver todos los comandos.

## De dónde salen los datos

- **Mejoras de equipo:** el camino de Equipo › Tu camino de la web, para cada raza y spec.
- **Misiones de dungeon y quién las da:**
  - [foreverchanges.pro/dungeon-quests](https://foreverchanges.pro/dungeon-quests) para las dungeons hasta nivel ~30, incluidas las nuevas de Forever.
  - QuestieDB para el resto. De QuestieDB tomamos solo datos sueltos (nombre, niveles, NPC, coordenadas), nunca sus archivos.
- **Talentos:** los órdenes de leveling de talentsforever.com, los mismos que muestra Talentos › Calculadora.

## Para desarrollar

- `node scripts/build-addon.js` vuelve a generar `ShamanForever/Data.lua`. Usa la cache de `scripts/sync.js` y, si está instalado, el QuestieDB del juego (para los mapas de TomTom).
- `lua5.1 scripts/test-addon.lua Orc Enhancement 20 "The Barrens" [instanceId]` prueba el addon sin el juego: simula las funciones del juego y muestra los avisos que daría. Con `WEAPON=<itemId>` simulás un arma equipada y con `ONQUEST="914 962"` misiones en el registro.
- Para instalarlo, copiá la carpeta `ShamanForever` a `_classic_beta_/Interface/AddOns/` (en el lanzamiento, a `_forever_`).
