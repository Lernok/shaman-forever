// Quest XP the addon saw in the game (ShamanForeverDB.qxp in the
// SavedVariables: { [quest id] = { xp, player level } }) into
// planner/quest-xp.json, the full reward per quest (a reward seen more than 5
// levels above the quest is scaled back up). The route planner reads it
// (SF_QUEST_XP) for the quests the data lacks.
//
//   LUA=<lua5.1> POLESTAR=<checkout> node scripts/import-quest-xp.js ["<WoW folder>/_classic_beta_"]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const game = require('./lib/game').folder(process.argv[2]);
const lua = process.env.LUA || path.join(root, '.cache', 'lua51', 'lua5.1.exe');
const polestar = process.env.POLESTAR || path.join(root, '.cache', 'tools', 'polestar-024');
const out = path.join(root, 'planner', 'quest-xp.json');

const files = [];
const accounts = path.join(game, 'WTF', 'Account');
for (const a of fs.existsSync(accounts) ? fs.readdirSync(accounts) : []) {
  const f = path.join(accounts, a, 'SavedVariables', 'ShamanForever.lua');
  if (fs.existsSync(f)) files.push(f);
}
if (!files.length) { console.error('no ShamanForever.lua under ' + accounts); process.exit(1); }

// Lua prints "id xp level" lines.
const dump = `local f = assert(loadfile(arg[1])); f()
for id, v in pairs((ShamanForeverDB or {}).qxp or {}) do print(id, v[1], v[2]) end`;
const tmp = path.join(require('os').tmpdir(), 'sf-qxp.lua');
fs.writeFileSync(tmp, dump);
const seen = {};
for (const f of files) {
  for (const line of execFileSync(lua, [tmp, f], { encoding: 'utf8' }).split(/\r?\n/)) {
    const [id, xp, lvl] = line.split('\t').map(Number);
    if (id > 0 && xp > 0) seen[id] = { xp, level: lvl || 0 };
  }
}

const qd = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'quests.json'), 'utf8'));
const quests = qd.quests || qd;
// The game's share of a quest's reward by player level - quest level.
const share = (d) => (d <= 5 ? 1 : d >= 10 ? 0.1 : [0.8, 0.6, 0.4, 0.2][d - 6]);
const doc = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { note: '', quests: {} };
let added = 0;
for (const [id, s] of Object.entries(seen)) {
  const q = quests[id];
  const qlvl = q && (q.level || q.minLevel);
  const sh = qlvl ? share(s.level - qlvl) : 1;
  if (sh < 0.6) continue; // too scaled down to trust
  const full = Math.round(s.xp / sh / 5) * 5 || s.xp;
  if (!doc.quests[id]) added++;
  doc.quests[id] = { xp: full, seen: s.xp, level: s.level, title: q ? q.title : undefined, dataXp: q && q.xp > 0 ? q.xp : null };
}
doc.note = 'Quest XP seen in the game by the Shaman: Forever addon (scripts/import-quest-xp.js); xp = full reward.';
fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
const missing = Object.values(doc.quests).filter((q) => q.dataXp == null).length;
console.log(`${out}: ${Object.keys(doc.quests).length} quests (${added} new; ${missing} the data lacks)`);
