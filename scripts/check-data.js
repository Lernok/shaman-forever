// Sanity checks on the generated data, run by build-data.js (and so by every
// sync). A failure stops the sync before a broken file reaches a pull request.
//
//   node scripts/check-data.js
const { readJSON } = require('./lib/files');

const errors = [];
const fail = (where, msg) => errors.push(where + ': ' + msg);

const FACTIONS = ['both', 'horde', 'alliance'];
const TYPES = ['crafted', 'boss', 'drop', 'trash', 'quest', 'vendor', 'unknown', 'unrecorded'];
const weapons = readJSON('data/weapons.json', { weapons: [] }).weapons;
const gear = readJSON('data/gear.json', { gear: [] }).gear;
const ids = new Set();
weapons.concat(gear).forEach(w => {
  const at = w.name + ' #' + w.id;
  if (ids.has(w.id)) fail(at, 'repetido');
  ids.add(w.id);
  if (!w.icon) fail(at, 'sin ícono');
  if (!w.sources.length) fail(at, 'sin fuentes');
  const quests = new Set();
  w.sources.forEach(s => {
    if (!TYPES.includes(s.type)) fail(at, 'tipo de fuente desconocido ' + s.type);
    if (!FACTIONS.includes(s.faction)) fail(at, 'facción inválida ' + s.faction + ' (' + (s.quest || s.type) + ')');
    if (s.asap == null || s.rec == null) fail(at, 'fuente sin nivel (' + (s.quest || s.type) + ')');
    else if (s.asap > s.rec) fail(at, 'lo antes posible ' + s.asap + ' > recomendado ' + s.rec + ' (' + (s.quest || s.type) + ')');
    if (s.rec < (w.req || 0)) fail(at, 'recomendado ' + s.rec + ' por debajo del nivel para equipar ' + w.req);
    if (s.classes && !s.classes.includes('Shaman')) fail(at, 'quest de otra clase: ' + s.quest);
    if (s.questId) {
      if (quests.has(s.questId)) fail(at, 'quest repetida ' + s.questId);
      quests.add(s.questId);
    }
  });
  if (w.obtain !== Math.min(...w.sources.map(s => s.rec))) fail(at, 'obtain no coincide con sus fuentes');
});

const levels = readJSON('data/levels.json', { quests: {}, npcs: {} });
Object.entries(levels.quests).forEach(([id, q]) => {
  if (q.hardest && !(q.hardest.level > 0 && q.hardest.level <= 63)) fail('levels quest ' + id, 'nivel fuera de rango ' + q.hardest.level);
});

if (errors.length) {
  console.error('Datos inválidos (' + errors.length + '):\n' + errors.slice(0, 40).map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('Datos verificados: ' + weapons.length + ' armas, ' + gear.length + ' piezas de equipo, ' + Object.keys(levels.quests).length + ' quests con nivel.');
