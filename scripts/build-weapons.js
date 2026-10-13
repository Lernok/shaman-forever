// Builds data/weapons.json: every weapon a Shaman can use, with exact numbers
// (data/items.json) and where it comes from (scripts/lib/item-sources.js),
// each source placed at the level you can really get it (data/levels.json,
// from scripts/fetch-levels.js). Offline: reads only files already on disk.
//
//   node scripts/build-weapons.js
//
// Also writes reports/conflicts.md when hand-reported facts disagree with the
// automatic sources (the sync adds it to its pull request).
const path = require('path');
const { readJSON, writeJSON, writeText } = require('./lib/files');
const itemSources = require('./lib/item-sources');

const cacheDir = path.join(__dirname, '..', '.cache');
const { build, items } = readJSON('data/items.json');
const S = itemSources.open(cacheDir, build);
const levels = readJSON('data/levels.json', { quests: {}, npcs: {} });
const P = itemSources.placer(levels);
const conflicts = S.conflicts.bind(S);

const weapons = Object.values(items).filter(itemSources.isWeapon).map(i => {
  const sources = P.placedSources(S, i);
  // Default placement (recommended, any faction); the page recomputes it for
  // the chosen faction, toggles and level mode.
  const obtain = Math.min(...sources.map(s => s.rec));
  return {
    id: i.id, name: i.name, kind: i.kind, quality: i.quality, req: i.req, obtain, ilvl: i.ilvl, bind: i.bind,
    dps: i.dps, speed: i.speed, dmgMin: i.dmgMin, dmgMax: i.dmgMax,
    stats: i.stats || {}, bonus: i.bonus || {}, equip: i.equip || [], chance: i.chance || [],
    era: i.era, numbers: i.numbers || 'forever', icon: i.icon || null, raceMask: i.raceMask, sources
  };
}).sort((a, b) => a.obtain - b.obtain || b.dps - a.dps || a.id - b.id);

writeJSON('data/weapons.json', { build, weapons });

const notes = conflicts().concat(P.factionNotes);
writeText('reports/conflicts.md', '# Datos en conflicto\n\n' + (notes.length
  ? 'Valores cargados a mano que no coinciden con las fuentes automáticas. Si el dato manual es el correcto, agregale `override: { campo: "motivo" }` en data/item-sources.json.\n\n' + notes.map(n => '- ' + n).join('\n') + '\n'
  : 'Ninguno.\n'));
if (notes.length) console.log('Conflictos de datos: ' + notes.length + ' (reports/conflicts.md)');

const count = t => weapons.filter(w => w.sources.some(s => s.type === t)).length;
console.log('Armas: ' + weapons.length + ' · crafteo ' + count('crafted') + ' · jefe ' + count('boss') + ' · drop ' + count('drop') +
  ' · trash ' + count('trash') + ' · quest ' + count('quest') + ' · vendedor ' + count('vendor') +
  ' · sin registrar (Classic) ' + count('unrecorded') + ' · desconocida (nuevas) ' + count('unknown') +
  ' · con números de Classic ' + weapons.filter(w => w.numbers === 'classic').length);
