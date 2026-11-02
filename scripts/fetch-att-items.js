// Where Forever's new gear comes from, by AllTheThings (MIT): the quest that
// rewards it, the boss or creature that drops it, the vendor that sells it for
// gold (lib/att.js items()). Used for the new pieces nothing else knows
// (foreverchanges.pro and QuestieDB have no source for them).
//
//   node scripts/fetch-att-items.js     (then fetch-levels.js, build-weapons.js, build-gear.js)
//
// Writes data/item-sources-att.json: { items: { id: { name, sources: [...] } } }

const { readJSON, writeJSON } = require('./lib/files');
const att = require('./lib/att');
const itemSources = require('./lib/item-sources');

(async () => {
  const { items } = readJSON('data/items.json');
  const found = att.items(await att.files());
  const out = {};
  Object.values(items).filter(i => i.era === 'new' && !i.crafted && (itemSources.isWeapon(i) || itemSources.isGear(i))).forEach(i => {
    if (found[i.id]) out[i.id] = { name: i.name, sources: found[i.id] };
  });
  // A change in AllTheThings' layout that breaks the reading would empty this
  // quietly: stop instead, so the sync opens its issue.
  const prev = readJSON('data/item-sources-att.json', {});
  const had = Object.keys(prev.items || {}).length;
  const now = Object.keys(out).length;
  if (had >= 50 && now < had / 2) throw new Error('AllTheThings: fuente para ' + now + ' ítems nuevos (antes ' + had + '); ¿cambió el formato?');
  writeJSON('data/item-sources-att.json', {
    _readme: 'De dónde sale el equipo nuevo de Forever según AllTheThings (misión, jefe o bicho, vendedor por oro). Generado por scripts/fetch-att-items.js; no editar a mano: las correcciones van en data/item-sources.json.',
    source: 'https://github.com/ATTWoWAddon/AllTheThings (MIT)', items: out
  });
  const by = {};
  Object.values(out).forEach(x => x.sources.forEach(s => { by[s.type] = (by[s.type] || 0) + 1; }));
  console.log('AllTheThings: fuente para ' + now + ' piezas nuevas (' + Object.entries(by).map(([k, v]) => k + ' ' + v).join(', ') + ').');
})().catch(e => { console.error(e.message); process.exit(1); });
