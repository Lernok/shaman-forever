// Builds data/gear.json: every piece of armor a Shaman can wear (cloth,
// leather, mail, shields, off-hands, totems, cloaks, necks, rings, trinkets),
// with exact numbers (data/items.json) and where it comes from
// (scripts/lib/item-sources.js), each source placed at the level you can
// really get it, by the same rule as weapons (build-weapons.js). Offline.
//
//   node scripts/build-gear.js
const path = require('path');
const { readJSON, writeJSON } = require('./lib/files');
const itemSources = require('./lib/item-sources');

const cacheDir = path.join(__dirname, '..', '.cache');
const { build, items } = readJSON('data/items.json');
const S = itemSources.open(cacheDir, build);
const levels = readJSON('data/levels.json', { quests: {}, npcs: {} });
const P = itemSources.placer(levels);

const gear = Object.values(items).filter(itemSources.isGear).map(i => {
  const sources = P.placedSources(S, i);
  const obtain = Math.min(...sources.map(s => s.rec));
  return {
    id: i.id, name: i.name, kind: i.kind, slot: i.slot, quality: i.quality, req: i.req, obtain, ilvl: i.ilvl, bind: i.bind,
    armor: i.armor, block: i.block, stats: i.stats || {}, bonus: i.bonus || {}, equip: i.equip || [], use: i.use || [], chance: i.chance || [],
    era: i.era, numbers: i.numbers || 'forever', icon: i.icon || null, raceMask: i.raceMask, sources
  };
}).sort((a, b) => a.obtain - b.obtain || (b.ilvl || 0) - (a.ilvl || 0) || a.id - b.id);

writeJSON('data/gear.json', { build, gear });

const count = t => gear.filter(g => g.sources.some(s => s.type === t)).length;
const slots = {};
gear.forEach(g => { slots[g.slot] = (slots[g.slot] || 0) + 1; });
console.log('Equipo: ' + gear.length + ' · crafteo ' + count('crafted') + ' · jefe ' + count('boss') + ' · drop ' + count('drop') +
  ' · trash ' + count('trash') + ' · quest ' + count('quest') + ' · vendedor ' + count('vendor') +
  ' · sin registrar (Classic) ' + count('unrecorded') + ' · desconocida (nuevas) ' + count('unknown'));
console.log('  por slot: ' + Object.entries(slots).map(([k, v]) => k + ' ' + v).join(', '));
