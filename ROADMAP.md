# Ideas y pendientes

## Cómo actualizar los datos

```
node scripts/sync.js              # build más nueva de Forever en wago.tools
node scripts/fetch-recipes.js     # fuentes de recetas (classicwowforever.com), cuando haga falta refrescarlas
node scripts/test-rules.js        # después de tocar js/talent-rules.js
```

`sync.js` baja talentos (talentsforever.com), tablas del cliente (wago.tools), números de ítems (Wowhead) y fuentes
(QuestieDB), escribe `reports/changes-<desde>-to-<hasta>.md` y corre todos los validadores. Si cambió un tooltip del
cliente, falla y dice qué plantilla de `data/i18n/client-es.json` traducir.

## Posibilidades (no decididas)

- **Pick rate por talento en la calculadora.** talentsforever.com publica en `popular.js` qué porcentaje de builds toma cada talento (general y por spec), y lo muestra sobre sus árboles. Se podría mostrar igual en la nuestra. Por ahora no: es una función propia de ellos y sus datos de analytics no están en el export CC BY. Si se retoma, pedirles permiso o limitarse a linkear su vista.
- **Aviso automático de builds nuevas** (tarea programada que mire wago.tools y avise).

## Pendientes

- BiS / equipo completo por fase: esperar a que haya ítems post-30 confirmados (la beta está topada en 30).
- Fuentes de armas nuevas de Forever que no se craftean: cargarlas en `data/item-sources.json` a medida que la comunidad las reporte.
- Verificar en juego las fuentes "asumidas de Classic" de las armas a medida que se pueda (la beta llega hasta 30).
- Profesiones: completar las fuentes de recetas que classicwowforever todavía marca como desconocidas.
