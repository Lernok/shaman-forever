# Addon Shaman: Forever

El lado del juego del sitio. **Avisa, no te lleva de la mano**: vos elegís por dónde ir.

- **Al subir de nivel:** las mejoras de equipo de tus próximos niveles (por defecto 2 antes), de misiones y vendedores. Es el mismo camino que Equipo › Tu camino de la web, para tu raza y spec.
- **Al entrar a una zona:** las mejoras que hay en esa zona.
- **Al entrar a una dungeon:** qué te sirve de ahí, tanto lo que tiran los jefes como las recompensas de sus misiones, y si tenés la misión o no.
- **En el tooltip de un ítem:** cuánto mejor o peor es que lo que tenés puesto.
- Cada aviso salta solo **una vez**. Si lo marcás como "Listo", no aparece más.
- `/sf registro` muestra un registro de niveles, zonas, dungeons y misiones con la hora, para copiar. Con eso medimos cuánto tarda de verdad cada cosa.

Escribí `/sf ayuda` en el juego para ver todos los comandos.

## Para desarrollar

- `node scripts/build-addon.js` vuelve a generar `ShamanForever/Data.lua` a partir de los datos de la web.
- `lua5.1 scripts/test-addon.lua Orc Enhancement 20 "The Barrens" [instanceId]` prueba el addon sin el juego: simula las funciones del juego y muestra los avisos que daría.
- Para instalarlo, copiá la carpeta `ShamanForever` a `_classic_beta_/Interface/AddOns/` (en el lanzamiento, a `_forever_`).
