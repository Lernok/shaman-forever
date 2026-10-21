// Quests only some Shaman races can take (Call of Fire has a Skyborne-only
// version): data/quest-races.json, { questId: [race, …] }, for the quests
// that reward gear on the site. build-data.js adds it to each quest source,
// and js/gear-plan.js skips the ones that aren't for your race.
//
// The race mask comes from QuestieDB: the repo's Lua files (cached by
// scripts/sync.js) and, for Forever's new quests they lack yet, the QuestieDB
// addon installed in the game (QUESTIEDB: its folder).
//
//   node scripts/quest-races.js
const fs = require('fs');
const path = require('path');
const { parseLua } = require('./lib/questie.js');

const root = path.join(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const qfile = path.join(root, '.cache', 'questiedb', 'foreverQuestDB.lua');
const lua = new Map();
if (fs.existsSync(qfile)) fs.readFileSync(qfile, 'utf8').split('\n').forEach(line => {
  const m = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
  if (m) lua.set(+m[1], m[2]);
});
const baked = require('./lib/questiedb-baked.js').load(process.env.QUESTIEDB || require('./lib/game').addon('QuestieDB'));
const mask = id => {
  if (lua.has(id)) return parseLua(lua.get(id))[5];
  const q = baked && baked.quest(id);
  return q ? q[5] : undefined;
};

// Requirement bits of the races that can be Shaman.
const RACES = { Orc: 2, Tauren: 32, Troll: 128, Dwarf: 4, 'Skyborne (Windshaper)': 2 ** 33 };
const has = (m, bit) => Math.floor(m / bit) % 2 === 1;

const ids = new Set();
['data/gear.json', 'data/weapons.json'].forEach(f => {
  const d = read(f);
  (d.gear || d.weapons).forEach(i => i.sources.forEach(s => { if (s.type === 'quest' && s.questId) ids.add(s.questId); }));
});
const out = {};
let unknown = 0;
[...ids].sort((a, b) => a - b).forEach(id => {
  const m = mask(id);
  if (m == null) { unknown++; return; }
  if (!m) return; // anyone
  const ok = Object.keys(RACES).filter(r => has(m, RACES[r]));
  // Only a restriction beyond the faction is worth keeping.
  const horde = ['Orc', 'Tauren', 'Troll', 'Skyborne (Windshaper)'];
  if (ok.length === 5 || (ok.length === 4 && horde.every(r => ok.includes(r))) || (ok.length === 1 && ok[0] === 'Dwarf')) return;
  // Classic's Horde mask without the Skyborne bit: an old quest whose mask
  // wasn't updated for the new race, not a real limit.
  if (ok.length === 3 && ['Orc', 'Tauren', 'Troll'].every(r => ok.includes(r))) return;
  if (ok.length) out[id] = ok;
});
fs.writeFileSync(path.join(root, 'data/quest-races.json'), JSON.stringify({
  _readme: 'Misiones que solo pueden hacer algunas razas de Shaman (scripts/quest-races.js, de QuestieDB). build-data.js lo suma a las fuentes de quest y js/gear-plan.js descarta las que no son para tu raza.',
  quests: out
}, null, 1) + '\n');
console.log('data/quest-races.json: ' + Object.keys(out).length + ' misiones con raza (' + ids.size + ' revisadas, ' + unknown + ' sin dato)');
