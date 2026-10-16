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
- **Clic en un aviso:** pone una marca en el mapa y abre el mapa ahí, en el paso de la cadena en que estás: quien da el paso que sigue o, si ya lo tenés, a quién entregarlo. Las cadenas con varios comienzos (Call of Fire empieza con cuatro NPC) cuentan el que hayas hecho y, si no empezaste, eligen el de tu zona; las misiones de otra raza o de la zona inicial de otra raza quedan al final. `/sf flecha` usa la flecha de TomTom en vez de la marca.
- **La ventana** se abre y se cierra con el **botón del minimapa** (se arrastra alrededor del minimapa; `/sf minimapa` lo oculta), con la lista de addons del minimapa o con `/sf`. Esc no la cierra: queda abierta hasta que la cierres, también después de un /reload. Pestañas Avisos / Listos / Descartados: "Listo" y la cruz sacan el aviso en el momento y lo pasan a su pestaña, desde donde se puede devolver (`/sf reiniciar` vuelve a mostrar todo). Se mueve arrastrándola y queda donde la dejaste, también después de un /reload. El tooltip de un aviso sale al costado de la ventana (del lado con lugar), así no la tapa. Si ya tenés la misión de un aviso (o un paso de su cadena), el renglón se pinta de azul y dice "Ya tenés la misión"; se actualiza solo al aceptar o entregar una misión.
- **Shift + clic en un ítem** (en las bolsas, un link del chat, AtlasLoot, las recompensas de una misión): si sale de una misión, marca en el mapa a quién hablarle en el paso de la cadena en que estás. Si ya tenés ese paso, marca a quién entregárselo. Con el chat abierto, Shift + clic sigue linkeando el ítem como siempre.
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

- `node scripts/build-addon.js` vuelve a generar `ShamanForever/Data.lua`. Usa la cache de `scripts/sync.js` y, si está instalado, el addon QuestieDB del juego: sus mapas (para TomTom) y sus misiones, NPC y objetos de las zonas nuevas de Forever (Isla Zephras…) que los archivos del repo de QuestieDB todavía no tienen (`scripts/lib/questiedb-baked.js` los lee del .toc).
- `lua5.1 scripts/test-addon.lua Orc Enhancement 20 "The Barrens" [instanceId]` prueba el addon sin el juego: simula las funciones del juego y muestra los avisos que daría. Con `WEAPON=<itemId>` simulás un arma equipada, con `ONQUEST="914 962"` misiones en el registro, con `DONE="..."` misiones hechas y con `MARK=<itemId>` un Shift + clic en ese ítem. Lua 5.1 para Windows queda en `.cache/lua51/lua5.1.exe`.
- Para instalarlo, copiá la carpeta `ShamanForever` a `_classic_beta_/Interface/AddOns/` (en el lanzamiento, a `_forever_`).
