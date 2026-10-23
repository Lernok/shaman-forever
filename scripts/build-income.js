// What you earn while leveling, besides quest experience: the money quests
// pay and what the monsters you kill leave (coins and gray items sold to a
// vendor), by level. For data/skinning.json gold[] (scripts/build-reagents.js):
// the gold a price is weighed against.
//
// From CMaNGOS classic-db (Classic 1.12's world database, GPL), only these
// averages:
// - Money per quest of each quest level (RewOrReqMoney, the quests with no
//   money count as 0).
// - Per kill of a normal monster of each level (no elites, no vendors or
//   civilians, weighted by its spawns): its coins (MinLootGold/MaxLootGold)
//   and the vendor price of the gray items it drops (loot chances, groups and
//   references, quest items aside). White items (cloth, meat) aren't counted:
//   you use or keep many of them.
// Both smoothed over 5 levels (a level with few quests swings).
//
// Checked against the addon's measures on the 10-21 stress test
// (ShamanForeverGuideCharDB.income), with build-reagents.js's quests and kills
// per level: to level 9, quests paid 12s (these say 14s) and kills 8-22s
// (these say 16s); the old estimate (QuestMoneyReward alone) said 48s in all.
//
//   node scripts/build-income.js
//
// The database dump (13 MB) is cached in .cache/cmangos/ (refreshed
// every 90 days). Writes data/income.json.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');
const { readJSON, writeJSON } = require('./lib/files');

const REPO = 'https://github.com/cmangos/classic-db';
const DUMP = REPO + '/raw/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz';
const CACHE = path.join(__dirname, '..', '.cache', 'cmangos', 'classicdb.sql.gz');
const MAX_AGE_DAYS = 90;
const SMOOTH = 2;

function download(url, file) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'shaman-forever-site (fan reference site; data sync, cached and cited)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(new URL(res.headers.location, url).href, file).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('CMaNGOS: HTTP ' + res.statusCode)); }
      const parts = [];
      res.on('data', d => parts.push(d));
      res.on('end', () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.concat(parts));
        resolve();
      });
    }).on('error', reject);
  });
}

// A table's columns and rows, from the dump's CREATE TABLE and INSERT INTO lines.
function reader(sql) {
  const columns = table => {
    const at = sql.indexOf('CREATE TABLE `' + table + '` (');
    return [...sql.slice(at, sql.indexOf('\n)', at)).matchAll(/^\s+`(\w+)`/gm)].map(m => m[1]);
  };
  function* rows(table) {
    const head = 'INSERT INTO `' + table + '` VALUES ';
    let at = 0;
    while ((at = sql.indexOf(head, at)) >= 0) {
      let i = at += head.length;
      while (sql[i] === '(') {
        const row = [];
        i++;
        for (;;) {
          if (sql[i] === "'") {
            let s = '';
            for (i++; sql[i] !== "'"; ) { if (sql[i] === '\\') { s += sql[i + 1]; i += 2; } else s += sql[i++]; }
            i++;
            row.push(s);
          } else {
            let j = i;
            while (sql[j] !== ',' && sql[j] !== ')') j++;
            const v = sql.slice(i, j);
            row.push(v === 'NULL' ? null : Number(v));
            i = j;
          }
          if (sql[i++] === ',') continue;
          break;
        }
        yield row;
        if (sql[i] === ',') i++;
      }
    }
  }
  return {
    rows,
    table: name => { const c = columns(name); return [...rows(name)].map(r => Object.fromEntries(c.map((k, i) => [k, r[i]]))); }
  };
}

(async () => {
  const age = fs.existsSync(CACHE) ? (Date.now() - fs.statSync(CACHE).mtimeMs) / 864e5 : Infinity;
  if (age > MAX_AGE_DAYS) {
    try { await download(DUMP, CACHE); } catch (e) {
      if (!fs.existsSync(CACHE)) { console.log('Ingresos: sin la base de CMaNGOS (' + e.message + '); queda data/income.json como estaba.'); return; }
    }
  }
  const db = reader(zlib.gunzipSync(fs.readFileSync(CACHE)).toString('utf8'));

  // Gray items' vendor price per kill of a loot template.
  const items = new Map(db.table('item_template').map(r => [r.entry, r]));
  const byEntry = name => {
    const m = new Map();
    db.table(name).forEach(r => { if (!m.has(r.entry)) m.set(r.entry, []); m.get(r.entry).push(r); });
    return m;
  };
  const creatureLoot = byEntry('creature_loot_template');
  const refLoot = byEntry('reference_loot_template');
  const refs = new Map();
  const one = r => {
    if (r.mincountOrRef < 0) {
      const id = -r.mincountOrRef;
      if (!refs.has(id)) refs.set(id, gray(refLoot.get(id)));
      return refs.get(id) * (r.maxcount || 1);
    }
    const it = items.get(r.item);
    return it && it.Quality === 0 && it.class !== 12 ? (it.SellPrice || 0) * (r.mincountOrRef + r.maxcount) / 2 : 0;
  };
  function gray(list) {
    let v = 0;
    const groups = new Map();
    (list || []).forEach(r => {
      if (r.ChanceOrQuestChance < 0 || r.condition_id) return; // quest-only, conditional
      if (!r.groupid) { v += one(r) * r.ChanceOrQuestChance / 100; return; }
      if (!groups.has(r.groupid)) groups.set(r.groupid, []);
      groups.get(r.groupid).push(r);
    });
    // One item of a group drops: the ones with no chance share what's left.
    groups.forEach(g => {
      const free = g.filter(r => !r.ChanceOrQuestChance);
      const left = Math.max(0, 100 - g.reduce((s, r) => s + r.ChanceOrQuestChance, 0));
      g.forEach(r => { v += one(r) * (r.ChanceOrQuestChance || left / free.length) / 100; });
    });
    return v;
  }

  const spawns = new Map();
  for (const r of db.rows('creature')) spawns.set(r[1], (spawns.get(r[1]) || 0) + 1);
  const kill = [];
  for (const c of db.table('creature_template')) {
    const n = spawns.get(c.Entry);
    if (!n || c.Rank !== 0 || c.MaxLevel > 63 || c.NpcFlags || c.Civilian || c.UnitFlags & 2) continue;
    if (!c.LootId && !c.MaxLootGold || [8, 11, 12].includes(c.CreatureType)) continue; // critters, totems, pets
    const coin = (c.MinLootGold + c.MaxLootGold) / 2;
    const g = gray(creatureLoot.get(c.LootId));
    for (let l = c.MinLevel; l <= Math.min(60, c.MaxLevel); l++) {
      const w = n / (c.MaxLevel - c.MinLevel + 1);
      const s = kill[l - 1] = kill[l - 1] || { w: 0, coin: 0, gray: 0 };
      s.w += w; s.coin += coin * w; s.gray += g * w;
    }
  }
  const quest = [];
  for (const q of db.table('quest_template')) {
    if (q.QuestLevel < 1 || q.QuestLevel > 60 || q.RequiredSkill || !q.RewMoneyMaxLevel) continue; // profession quests, no experience
    const s = quest[q.QuestLevel - 1] = quest[q.QuestLevel - 1] || { n: 0, money: 0 };
    s.n++; s.money += Math.max(0, q.RewOrReqMoney);
  }

  const near = i => { const out = []; for (let j = Math.max(0, i - SMOOTH); j <= Math.min(59, i + SMOOTH); j++) out.push(j); return out; };
  const round = v => Math.round(v * 10) / 10;
  const levels = Array.from({ length: 60 }, (_, i) => {
    const q = near(i).reduce((s, j) => ({ n: s.n + quest[j].n, money: s.money + quest[j].money }), { n: 0, money: 0 });
    const k = near(i).map(j => kill[j]);
    const avg = f => k.reduce((s, e) => s + e[f] / e.w, 0) / k.length;
    return { quest: round(q.money / q.n), coin: round(avg('coin')), gray: round(avg('gray')) };
  });
  const before = readJSON('data/income.json', null);
  writeJSON('data/income.json', {
    _readme: 'Written by scripts/build-income.js. Copper, by level (index level-1): quest = money per quest of that level; coin and gray = per kill of a normal monster of that level (coins, and gray items at the vendor). Classic 1.12, smoothed over 5 levels.',
    source: REPO,
    levels
  });
  const changed = !before || JSON.stringify(before.levels) !== JSON.stringify(levels);
  console.log('Ingresos: misiones y bichos de ' + levels.length + ' niveles (CMaNGOS classic-db)' + (changed ? '' : ', sin cambios'));
})().catch(e => { console.error(e.message); process.exit(1); });
