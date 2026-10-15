// Builds the in-game addon's data (addon/ShamanForever/Data.lua) from the
// site's: the gear path of every race and spec (js/gear-plan.js, the same
// engine as Equipo › Tu camino, no professions, no drops), each piece's worth
// to each spec (to compare with what you wear), and per dungeon its boss drops
// and its quests. The addon only warns: it never walks you through a route.
//
//   node scripts/build-addon.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const load = rel => { const w = {}; new Function('window', fs.readFileSync(path.join(root, rel), 'utf8'))(w); return w; };
global.window = { ZONE_DATA: read('data/zones.json') };
require('../js/route.js');
require('../js/gear-plan.js');
const R = window.Route, GP = window.GearPlan;
const Z = window.ZONE_DATA;

// What the page plans with (only plannable sources), and the full data for
// quest ids.
const gear = load('data/gear.js').GEAR_DATA.gear.concat(load('data/weapons.js').WEAPON_DATA.weapons);
const full = new Map(read('data/gear.json').gear.concat(read('data/weapons.json').weapons).map(i => [i.id, i]));
const build = read('data/weapons.json').build;

const SPECS = ['Enhancement', 'Elemental', 'Restoration'];
const RACES = { Orc: 'horde', Troll: 'horde', Tauren: 'horde', 'Skyborne (Windshaper)': 'horde', Dwarf: 'alliance' };
// Ways of getting a piece the addon warns about: no crafts (it doesn't know
// your professions yet), no drops (those show when you enter the dungeon).
const WARN = new Set(['route', 'quest', 'dquest', 'class', 'vendor']);
// Dungeons by the instance id the game gives (GetInstanceInfo's 8th value);
// the Forever ones as ForeverDungeonJournal maps them. Unknown ids fall back
// to the dungeon's English name.
const INSTANCES = {
  389: 'Ragefire Chasm', 36: 'The Deadmines', 43: 'Wailing Caverns', 33: 'Shadowfang Keep', 34: 'The Stockade',
  48: 'Blackfathom Deeps', 90: 'Gnomeregan', 47: 'Razorfen Kraul', 189: 'Scarlet Monastery', 129: 'Razorfen Downs',
  70: 'Uldaman', 209: "Zul'Farrak", 349: 'Maraudon', 109: "The Temple of Atal'Hakkar", 230: 'Blackrock Depths',
  229: 'Blackrock Spire', 429: 'Dire Maul', 289: 'Scholomance', 329: 'Stratholme',
  2999: 'Ruins of Lordaeron', 2959: 'City of Dalaran', 2998: 'Excavation Site: Wetlands', 3065: 'Hall of Thanes'
};
// Cities (their quests' zone), by AreaTable id: the addon turns ids into the
// game's own (localized) zone names.
const CITIES = { Orgrimmar: 1637, 'Thunder Bluff': 1638, Undercity: 1497, Stormwind: 1519, 'Stormwind City': 1519, Ironforge: 1537, Darnassus: 1657 };
const RAID = /^(Naxxramas|Molten Core|Blackwing Lair|Zul'Gurub|Onyxia's Lair|Ruins of Ahn'Qiraj)$/;

const slotOf = i => (i.dps != null && i.speed != null ? 'Weapon' : ['Shield', 'Held In Off-hand'].includes(i.slot) ? 'Off Hand' : i.slot);
const items = {};
const used = new Set();
gear.forEach(i => {
  const v = SPECS.map(s => GP.value(i, s));
  if (!v.some(Boolean)) return;
  items[i.id] = { s: slotOf(i), r: i.req || 0, v, m: i.kind === 'Mail' ? 1 : undefined, d: i.dps || undefined };
});

// The full source of a plan step: quest id and level, vendor npc.
function detail(item, s) {
  const f = full.get(item.id);
  const fs_ = f && f.sources.find(x => x.type === s.type && (x.quest || '') === (s.quest || '') && (x.npc || '') === (s.npc || ''));
  return Object.assign({}, s, fs_ ? { questId: fs_.questId, level: fs_.level, npc: fs_.npc || s.npc } : {});
}

const paths = {};
Object.entries(RACES).forEach(([race, faction]) => {
  paths[race] = {};
  SPECS.forEach(spec => {
    const opts = { spec, faction, race, profs: [], drops: false,
      route: (z, l) => R.onRoute(z, l, faction, race), away: z => R.otherStart(z, faction, race), reach: z => R.reachable(z, faction) };
    const plan = GP.plan(gear, opts);
    paths[race][spec] = Object.values(plan.slots).flatMap(x => x.steps)
      .filter(st => WARN.has(st.pick.access))
      .sort((a, b) => a.level - b.level)
      .map(st => {
        const s = detail(st.pick.item, st.pick.source);
        used.add(st.pick.item.id);
        return { l: st.level, u: st.until, i: st.pick.item.id, a: st.pick.access, q: s.questId, qn: (s.quest || '').replace(/ \(given by [^)]*\)/, '') || undefined,
          z: s.dungeonZone || s.zone, k: s.type === 'vendor' ? s.npc : undefined };
      });
  });
});

// Per dungeon: boss drops and dungeon quests (with the reward that's best for
// each spec decided in the addon).
const dungeons = {};
const dg = name => (dungeons[name] = dungeons[name] || { lv: (Z.dungeons[name] || {}).levels, drops: [], quests: [] });
full.forEach(item => {
  if (!items[item.id]) return;
  item.sources.forEach(s => {
    if ((s.type === 'boss' || s.type === 'drop') && s.zone && !RAID.test(s.zone) && (Z.dungeons[s.zone] || Object.values(INSTANCES).includes(s.zone))) {
      dg(s.zone).drops.push({ i: item.id, b: s.npc });
      used.add(item.id);
    }
    if (s.type === 'quest' && s.dungeon && s.zone) {
      dg(s.zone).quests.push({ q: s.questId, qn: s.quest.replace(/ \(given by [^)]*\)/, ''), i: item.id, f: s.faction === 'both' ? undefined : s.faction, l: s.level });
      used.add(item.id);
    }
  });
});
Object.values(dungeons).forEach(d => {
  d.drops.sort((a, b) => a.i - b.i);
  d.quests.sort((a, b) => (a.q || 0) - (b.q || 0) || a.i - b.i);
});
const names = {};
used.forEach(id => { names[id] = (full.get(id) || {}).name; });

const zones = {};
Object.entries(Z.zones).forEach(([name, z]) => { if (z.id) zones[name] = z.id; });
Object.assign(zones, CITIES);

// Lua literal of a JSON-like value.
function lua(v, ind) {
  ind = ind || '';
  if (v === undefined || v === null) return 'nil';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v).replace(/\\u([0-9a-f]{4})/g, (m, h) => '\\' + parseInt(h, 16));
  const key = k => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : /^\d+$/.test(k) ? '[' + k + ']' : '[' + lua(k) + ']');
  if (Array.isArray(v)) {
    const flat = v.every(x => typeof x !== 'object' || x === null);
    if (flat) return '{' + v.map(x => lua(x)).join(',') + '}';
    return '{\n' + v.map(x => ind + ' ' + lua(x, ind + ' ')).join(',\n') + '\n' + ind + '}';
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  const small = entries.every(([, x]) => typeof x !== 'object' || x === null || (Array.isArray(x) && x.every(y => typeof y !== 'object')));
  if (small) return '{' + entries.map(([k, x]) => key(k) + '=' + lua(x)).join(',') + '}';
  return '{\n' + entries.map(([k, x]) => ind + ' ' + key(k) + '=' + lua(x, ind + ' ')).join(',\n') + '\n' + ind + '}';
}

const out = '-- Generated by scripts/build-addon.js from the site\'s data (build ' + build + '). Do not edit.\n' +
  'local _, SF = ...\n' +
  'SF.DATA = ' + lua({ build, specs: SPECS, cost: GP.COST, weights: GP.WEIGHTS, upgrade: GP.UPGRADE, instances: INSTANCES, zones, items, names, paths, dungeons }) + '\n';
const dest = path.join(root, 'addon', 'ShamanForever', 'Data.lua');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
const n = Object.values(paths).reduce((s, r) => s + Object.values(r).reduce((t, p) => t + p.length, 0), 0);
console.log('Data.lua: ' + Object.keys(items).length + ' items, ' + n + ' path steps, ' + Object.keys(dungeons).length + ' dungeons, ' + Math.round(out.length / 1024) + ' KB');
