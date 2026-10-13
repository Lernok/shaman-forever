// Builds data/zones.json: the level band of every zone (per faction), of every
// dungeon, and where each Shaman race starts, so the gear path can follow the
// zones you actually level in. Offline: reads only files already on disk.
//
//   node scripts/build-zones.js
//
// A zone's band is the narrowest level range holding 3/4 of its quests (a few
// stray high-level quests don't stretch it), counting the quests your faction
// can take:
//   1. QuestieDB's Forever quests (level and zone of every quest);
//   2. AllTheThings' Forever zone files (new zones QuestieDB lacks: minimum
//      level of each quest, + 2 for the quest's own level);
//   3. a new zone with no quests recorded yet: the client's AreaTable, the
//      exploration level of its subzones.
// Starter subzones (Valley of Trials...) count in their zone (Durotar).
// Dungeons: foreverchanges.pro's range, else their quests' band, else the
// ranges announced for Forever's new dungeons (cited below).
const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./lib/csv');
const { parseLua } = require('./lib/questie');
const { readJSON, writeJSON } = require('./lib/files');
const { INSTANCE, RAID } = require('./lib/item-sources');

const cacheDir = path.join(__dirname, '..', '.cache');
const { build } = readJSON('data/items.json');
const area = {};
parseCSV(fs.readFileSync(path.join(cacheDir, 'wago', build, 'AreaTable.csv'), 'utf8')).forEach(r => { area[r.ID] = r; });
// The zone an area belongs to; a dungeon inside a zone (Gnomeregan in Dun
// Morogh) stays a dungeon.
const top = id => {
  let a = area[id];
  while (a && a.ParentAreaID !== '0' && area[a.ParentAreaID] && !INSTANCE.test(a.AreaName_lang)) a = area[a.ParentAreaID];
  return a;
};
const CITIES = /^(Stormwind City|Ironforge|Darnassus|Orgrimmar|Thunder Bluff|Undercity|Blackrock Mountain)$/;
// Cities and Blackrock Mountain (the hub of its dungeons) aren't leveling zones.
// Battlegrounds and other maps that aren't on Kalimdor or the Eastern Kingdoms.
const OPEN_WORLD = id => ['0', '1'].includes(area[id].ContinentID) || area[id].AreaName_lang === 'Zephras Isle';

// Where each race that can be a Shaman starts (data/shaman.json lists the
// races). Classic's starting zones, and Skyborne's new island.
const STARTS = {
  Orc: { zone: 'Durotar', sub: 'Valley of Trials' },
  Troll: { zone: 'Durotar', sub: 'Valley of Trials' },
  Tauren: { zone: 'Mulgore', sub: 'Red Cloud Mesa' },
  'Skyborne (Windshaper)': { zone: 'Zephras Isle', ref: 'https://wowforeverbuilds.com/leveling/route/horde' },
  Dwarf: { zone: 'Dun Morogh', sub: 'Coldridge Valley' }
};
// Every race's starting zone (Shaman or not): a route only goes through yours.
const STARTER_ZONES = ['Durotar', 'Mulgore', 'Tirisfal Glades', 'Dun Morogh', 'Elwynn Forest', 'Teldrassil', 'Zephras Isle'];
// Forever's new dungeons past what foreverchanges lists, as announced.
const NEW_DUNGEONS = {
  'The Drowned City': [35, 40], "Krol'dok": [40, 55], 'Alcaz Prison': [48, 53], 'Blackmaw Hold': [55, 60], "Shaper's Terrace": [58, 60]
};
const NEW_DUNGEONS_REF = 'https://wowforeverbuilds.com/leveling/route/horde';

const SHARE = 0.75;
const band = list => {
  const a = list.slice().sort((x, y) => x - y);
  const n = Math.max(1, Math.ceil(a.length * SHARE));
  let best = [a[0], a[a.length - 1]];
  for (let i = 0; i + n - 1 < a.length; i++) if (a[i + n - 1] - a[i] < best[1] - best[0]) best = [a[i], a[i + n - 1]];
  return best;
};
const RACE = { alliance: 1 | 4 | 8 | 64, horde: 2 | 16 | 32 | 128 };
const factionOf = mask => {
  if (!mask) return 'both';
  const a = (mask & RACE.alliance) !== 0;
  const h = (mask & RACE.horde) !== 0;
  return a && !h ? 'alliance' : h && !a ? 'horde' : 'both';
};

// 1. QuestieDB: quest levels per top-level zone and faction.
const quests = {};
for (const line of fs.readFileSync(path.join(cacheDir, 'questiedb', 'foreverQuestDB.lua'), 'utf8').split('\n')) {
  const m = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
  if (!m) continue;
  const q = parseLua(m[2]);
  const z = q[16] > 0 && top(q[16]); // questKeys: questLevel = 5, requiredRaces = 6, zoneOrSort = 17
  if (!z || !q[4]) continue;
  const f = factionOf(q[5]);
  const e = quests[z.AreaName_lang] = quests[z.AreaName_lang] || { id: Number(z.ID), horde: [], alliance: [] };
  if (f !== 'alliance') e.horde.push(q[4]);
  if (f !== 'horde') e.alliance.push(q[4]);
}

// 2. AllTheThings' zone files: minimum level of each quest.
const att = {};
const tree = readJSON('.cache/att/_tree.json', { tree: [] }).tree;
tree.filter(x => /^\.contrib\/\.db\/forever\/zones\/.*\.lua$/.test(x.path)).forEach(x => {
  const file = path.join(cacheDir, 'att', x.sha + '.lua');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  // maproot(MAP.ZEPHRAS_ISLE, { ... -> "Zephras Isle" (a zone file may open
  // with its continent: maproot(MAP.EASTERN_KINGDOMS, MAP.RIVERGLADES, {)
  const key = [...text.matchAll(/\b(?:maproot|m)\((?:MAP\.\w+, )*MAP\.(\w+), \{/g)].map(m => m[1]).find(k => !/^(EASTERN_KINGDOMS|KALIMDOR)$/.test(k));
  const name = key && key.toLowerCase().split('_').map(w => (w === 'of' ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
  const lv = (text.match(/\blvl = \d+/g) || []).map(s => Number(s.slice(6)) + 2);
  if (name) att[name] = lv;
});

const MIN_QUESTS = 6;
const zones = {};
const dungeons = {};
Object.values(area).forEach(a => {
  if (a.ParentAreaID !== '0' || !OPEN_WORLD(a.ID)) return;
  const name = a.AreaName_lang;
  if (CITIES.test(name) || INSTANCE.test(name) || RAID.test(name) && name !== 'Silithus') return;
  const q = quests[name];
  const out = { id: Number(a.ID), continent: { 0: 'Eastern Kingdoms', 1: 'Kalimdor' }[a.ContinentID] || null };
  if (q && (q.horde.length >= MIN_QUESTS || q.alliance.length >= MIN_QUESTS)) {
    // A faction with only a handful of (neutral) quests there doesn't level
    // there: it needs MIN_QUESTS and at least half as many as the other one.
    const levels = (mine, other) => (mine.length >= MIN_QUESTS && mine.length >= other.length / 2 ? band(mine) : null);
    out.horde = levels(q.horde, q.alliance);
    out.alliance = levels(q.alliance, q.horde);
    out.quests = Math.max(q.horde.length, q.alliance.length);
    out.from = 'questie';
  } else if (att[name] && att[name].length) {
    out.horde = out.alliance = band(att[name]);
    out.quests = att[name].length;
    out.from = 'att';
  } else if (att[name]) {
    // A new Forever zone (AllTheThings lists it) with no quests recorded yet.
    const sub = Object.values(area).filter(s => s.ParentAreaID === a.ID && Number(s.ExplorationLevel) > 0).map(s => Number(s.ExplorationLevel));
    if (sub.length < 3) return;
    out.horde = out.alliance = [Math.min(...sub), Math.max(...sub)];
    out.from = 'area-table';
  } else return;
  if (STARTER_ZONES.includes(name)) out.start = true;
  zones[name] = out;
});

// Dungeons: foreverchanges' ranges first.
const fc = readJSON('data/item-sources-fc.json', {});
Object.entries(fc.dungeons || {}).forEach(([name, r]) => { dungeons[name] = { levels: r, from: 'foreverchanges', ref: fc.dungeonsRef }; });
Object.entries(quests).forEach(([name, q]) => {
  const all = q.horde.length >= q.alliance.length ? q.horde : q.alliance;
  if (!INSTANCE.test(name) || RAID.test(name) || dungeons[name] || all.length < MIN_QUESTS) return;
  dungeons[name] = { levels: band(all), from: 'questie' };
});
Object.entries(NEW_DUNGEONS).forEach(([name, r]) => { if (!dungeons[name]) dungeons[name] = { levels: r, from: 'announced', ref: NEW_DUNGEONS_REF }; });

const starts = {};
Object.entries(STARTS).forEach(([race, s]) => {
  if (!zones[s.zone]) throw new Error('zona de inicio sin banda: ' + s.zone);
  starts[race] = s;
});

writeJSON('data/zones.json', {
  _readme: 'Generado por scripts/build-zones.js: banda de nivel de cada zona por facción (percentiles 10-90 de los niveles de sus quests), de cada dungeon, y zona de inicio de cada raza Shaman.',
  sources: ['https://github.com/Questie/QuestieDB', 'https://github.com/ATTWoWAddon/AllTheThings (MIT)', 'wago.tools AreaTable ' + build, 'https://foreverchanges.pro/dungeon-quests'],
  zones, dungeons, starts
});
const from = {};
Object.values(zones).forEach(z => { from[z.from] = (from[z.from] || 0) + 1; });
console.log('Zonas: ' + Object.keys(zones).length + ' (' + Object.entries(from).map(([k, v]) => k + ' ' + v).join(', ') + ') · dungeons: ' + Object.keys(dungeons).length + ' · razas: ' + Object.keys(starts).length);
