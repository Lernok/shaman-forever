// Where each profession can be learned: the zones with a trainer of it, per
// faction, from Forever's NPC data (QuestieDB: an NPC's subtitle names its
// profession, "Journeyman Leatherworker", "Skinning Trainer"...; Forever's own
// trainers are just "Alchemist", "Skinner", with the game's trainer flag, like
// the ones on Zephras Isle). The newest QuestieDB package (lib/questiedb-fresh.js)
// adds the NPCs the repo's files lack, Zephras Isle's among them. js/route.js
// turns it into the level your route first reaches one (Razor Hill has no
// Leatherworking trainer: an Orc learns it in Orgrimmar or the Barrens).
//
//   node scripts/build-trainers.js
//
// Adds `trainers` to data/zones.json: { horde: { Leatherworking: [zone...] }, alliance: {...} }.
const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./lib/csv');
const { parseLua } = require('./lib/questie');
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');

const PROFS = { Leatherwork: 'Leatherworking', Skinn: 'Skinning', Blacksmith: 'Blacksmithing', Mining: 'Mining', Miner: 'Mining', Tailor: 'Tailoring',
  Enchant: 'Enchanting', Engineer: 'Engineering', Herbal: 'Herbalism', Alchem: 'Alchemy' };
const PROF_RE = new RegExp('(' + Object.keys(PROFS).join('|') + ')');

const build = readJSON('data/meta.json').items.build;
const zoneName = {};
parseCSV(fs.readFileSync(path.join(http.cacheDir, 'wago', build, 'AreaTable.csv'), 'utf8')).forEach(r => { zoneName[r.ID] = r.AreaName_lang; });

const out = { horde: {}, alliance: {} };
// npcFlags: 16 = trains something.
const TRAINER = 16;
function addNpc(n) {
  const sub = n[13];
  // A trainer: the subtitle names the profession, and a rank or the game's
  // trainer flag (not "Supplies").
  if (typeof sub !== 'string' || !PROF_RE.test(sub) || /Supplies/.test(sub) || /World /.test(n[0])) return;
  if (!/Trainer|Journeyman|Expert|Artisan|Master/.test(sub) && !((n[14] || 0) & TRAINER)) return;
  // Special schools (Dragonscale, Gnome, Goblin...) don't teach the basics.
  if (/Dragonscale|Elemental Leather|Tribal|Gnome|Goblin|Shadoweave|Mooncloth|Spellfire|Armorsmith|Weaponsmith|Swordsmith|Hammersmith|Axesmith/.test(sub)) return;
  const spawns = n[6];
  if (!spawns || typeof spawns !== 'object') return;
  const prof = PROFS[PROF_RE.exec(sub)[1]];
  const sides = n[12] === 'AH' ? ['horde', 'alliance'] : n[12] === 'H' ? ['horde'] : n[12] === 'A' ? ['alliance'] : [];
  Object.keys(spawns).forEach(z => {
    const zone = zoneName[z];
    if (!zone) return;
    sides.forEach(f => {
      const list = out[f][prof] = out[f][prof] || [];
      if (!list.includes(zone)) list.push(zone);
    });
  });
}
const npcFile = path.join(http.cacheDir, 'questiedb', 'foreverNpcDB.lua');
for (const line of fs.readFileSync(npcFile, 'utf8').split('\n')) {
  const m = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
  if (m) addNpc(parseLua(m[2]));
}
const fresh = require('./lib/questiedb-fresh.js').load();
if (fresh) fresh.npcIds().forEach(id => { const n = fresh.npc(id); if (n) addNpc(n); });
else console.log('Sin el paquete nuevo de QuestieDB: faltan los entrenadores de Zephras Isle.');
Object.values(out).forEach(f => Object.values(f).forEach(l => l.sort()));
const zones = readJSON('data/zones.json');
zones.trainers = out;
writeJSON('data/zones.json', zones);
console.log('Entrenadores: ' + Object.entries(out).map(([f, p]) => f + ' ' + Object.entries(p).map(([k, l]) => k + ' ' + l.length).join(', ')).join(' · '));
