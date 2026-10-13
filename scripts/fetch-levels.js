// How hard each weapon quest (and boss drop) really is, from who you have to
// kill, so a reward is placed at the level you can actually get it.
//
//   node scripts/fetch-levels.js [--offline]
//
// Sources, all refreshed by the daily sync:
//   QuestieDB (Forever)  quest objectives (creatures, items and who drops them),
//                        quest chains, NPC levels for Classic NPCs
//   AllTheThings         Forever-new quests: objectives and chains (MIT,
//                        github.com/ATTWoWAddon/AllTheThings, .contrib/.db/forever)
//   Wowhead tooltips     NPC level and elite/boss rank as Forever has them
//                        (nether.wowhead.com/forever/tooltip/npc/<id>); new
//                        Forever bosses show no level until Wowhead records it
//
// Reads data/weapons.json (the quests and bosses to look up) and writes
// data/levels.json; scripts/build-weapons.js turns it into a recommended level:
//   group content (dungeon, elite):  hardest target's level - 3
//   solo quest:                      hardest target's level - 1
//   never below the quest's minimum level, never above the quest's level.
// A new boss with no recorded level counts as one below its dungeon's top level.
const fs = require('fs');
const path = require('path');
const questie = require('./lib/questie');

const root = path.join(__dirname, '..');
const cacheDir = path.join(root, '.cache');
const OFFLINE = process.argv.includes('--offline');
const UA = { 'User-Agent': 'shaman-forever-site (fan reference site; data sync)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const DAY = 86400000;

// ---------- AllTheThings (Forever) ----------

const ATT_REPO = 'ATTWoWAddon/AllTheThings';
const ATT_DIR = '.contrib/.db/forever/';

async function attFiles() {
  const dir = path.join(cacheDir, 'att');
  fs.mkdirSync(dir, { recursive: true });
  const listFile = path.join(dir, '_tree.json');
  let tree = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : null;
  if (!OFFLINE && (!tree || Date.now() - tree.at > DAY / 2)) {
    try {
      const headers = Object.assign({ Accept: 'application/vnd.github+json' }, UA);
      if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
      const res = await fetch('https://api.github.com/repos/' + ATT_REPO + '/git/trees/master?recursive=1', { headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const files = j.tree.filter(x => x.type === 'blob' && x.path.startsWith(ATT_DIR) && x.path.endsWith('.lua') &&
        !/\/(\.config|zzOLD)\//.test(x.path)).map(x => ({ path: x.path, sha: x.sha }));
      tree = { at: Date.now(), files };
      fs.writeFileSync(listFile, JSON.stringify(tree));
    } catch (e) {
      console.log('AllTheThings: no pude listar los archivos (' + e.message + '), uso los de caché.');
    }
  }
  if (!tree) return [];
  const out = [];
  let fetched = 0;
  for (const f of tree.files) {
    const file = path.join(dir, f.sha + '.lua');
    if (!fs.existsSync(file)) {
      if (OFFLINE) continue;
      const res = await fetch('https://raw.githubusercontent.com/' + ATT_REPO + '/master/' + f.path.split('/').map(encodeURIComponent).join('/'), { headers: UA });
      if (!res.ok) { console.log('AllTheThings: ' + res.status + ' ' + f.path); continue; }
      fs.writeFileSync(file, await res.text());
      fetched++;
    }
    out.push({ path: f.path, text: fs.readFileSync(file, 'utf8') });
  }
  // Drop cached files that are no longer in the tree.
  const keep = new Set(tree.files.map(f => f.sha + '.lua').concat('_tree.json'));
  fs.readdirSync(dir).filter(n => !keep.has(n)).forEach(n => fs.rmSync(path.join(dir, n)));
  if (fetched) console.log('AllTheThings: ' + fetched + ' archivos nuevos o cambiados.');
  return out;
}

// The body of the "{...}" that starts at text[i].
function block(text, i) {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(i, j + 1);
    else if (c === '-' && text[j + 1] === '-') { const nl = text.indexOf('\n', j); if (nl < 0) break; j = nl; }
    else if (c === '"') { const end = text.indexOf('"', j + 1); if (end < 0) break; j = end; }
  }
  return text.slice(i);
}

// Quests: minimum level, creatures to kill, earlier quests in the chain, and
// the instance they belong to.
function parseAtt(files) {
  const quests = {};
  // Encounters: which boss drops which item (quest starters like Titan Relic).
  const droppedBy = {};
  for (const f of files) {
    const er = /\be\(\d+, \{/g;
    let em;
    while ((em = er.exec(f.text))) {
      const body = block(f.text, em.index + em[0].length - 1);
      const who = [];
      (body.match(/\bcreatureID = (\d+)/g) || []).forEach(x => who.push(Number(x.match(/\d+/)[0])));
      (body.match(/\bcrs = \{[^}]*\}/g) || []).forEach(x => who.push(...(x.match(/\d+/g) || []).map(Number)));
      if (!who.length) continue;
      (body.match(/\bi\((\d+)/g) || []).forEach(x => { droppedBy[x.slice(2)] = who; });
    }
  }
  for (const f of files) {
    const instance = /dungeons & raids/.test(f.path) ? (f.text.match(/inst\(\d+, \{\s*--\s*(.+)/) || [])[1] || null : null;
    const re = /\bq\((\d+), \{/g;
    let m;
    while ((m = re.exec(f.text))) {
      const id = Number(m[1]);
      let body = block(f.text, m.index + m[0].length - 1);
      // Leave out nested quests' own fields.
      body = body.replace(/\bq\(\d+, \{[\s\S]*$/, '');
      const nums = s => (s.match(/\d+/g) || []).map(Number);
      const creatures = [];
      (body.match(/\bcr = (\d+)/g) || []).forEach(x => creatures.push(Number(x.match(/\d+/)[0])));
      (body.match(/\bcrs = \{[^}]*\}/g) || []).forEach(x => creatures.push(...nums(x)));
      (body.match(/provider = \{ "n", (\d+) \}/g) || []).forEach(x => creatures.push(Number(x.match(/(\d+) \}/)[1])));
      // Items to bring (or that start it): whoever drops them.
      const itemIds = [];
      (body.match(/\bqi = (\d+)/g) || []).forEach(x => itemIds.push(x.match(/\d+/)[0]));
      (body.match(/provider = \{ "i", (\d+) \}/g) || []).forEach(x => itemIds.push(x.match(/(\d+) \}/)[1]));
      itemIds.forEach(it => (droppedBy[it] || []).forEach(c => creatures.push(c)));
      const pre = [];
      (body.match(/\bsourceQuest = (\d+)/g) || []).forEach(x => pre.push(Number(x.match(/\d+/)[0])));
      (body.match(/\bsourceQuests = \{[^}]*\}/g) || []).forEach(x => pre.push(...nums(x)));
      const lvl = (body.match(/\blvl = (\d+)/) || [])[1];
      quests[id] = { minLevel: lvl ? Number(lvl) : null, creatures: [...new Set(creatures)], pre, instance };
    }
  }
  return quests;
}

// ---------- NPC levels (Wowhead Forever tooltips) ----------

const npcDir = path.join(cacheDir, 'wowhead-npc');
function parseNpcTooltip(j) {
  const text = (j.tooltip || '').replace(/<[^>]+>/g, ' ');
  const lv = text.match(/Level (\d+)(?:\s*-\s*(\d+))?/);
  const rank = /\(Boss\)/.test(text) || /Level \?\?/.test(text) ? 'boss' : /\(Rare Elite\)/.test(text) ? 'rare-elite' : /\(Elite\)/.test(text) ? 'elite' : /\(Rare\)/.test(text) ? 'rare' : 'normal';
  return { name: j.name, level: lv ? Number(lv[2] || lv[1]) : null, rank };
}
async function npcInfo(id) {
  fs.mkdirSync(npcDir, { recursive: true });
  const file = path.join(npcDir, id + '.json');
  let rec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  // Ask again every 3 days while Wowhead has no level for it.
  const stale = rec && rec.info && rec.info.level == null && Date.now() - rec.at > 3 * DAY;
  if (!OFFLINE && (!rec || stale)) {
    try {
      const res = await fetch('https://nether.wowhead.com/forever/tooltip/npc/' + id, { headers: UA });
      const j = res.ok ? await res.json() : null;
      rec = { at: Date.now(), info: j && j.name ? parseNpcTooltip(j) : null };
      fs.writeFileSync(file, JSON.stringify(rec));
      await sleep(250);
    } catch (e) { /* keep what we had */ }
  }
  return rec && rec.info;
}

// Names under "Requirements:" in Wowhead's quest tooltip, found as NPCs by
// Wowhead's search. For new quests nobody else has recorded yet.
const qtDir = path.join(cacheDir, 'wowhead-quest');
async function wowheadTargets(questId) {
  fs.mkdirSync(qtDir, { recursive: true });
  const file = path.join(qtDir, questId + '.json');
  let rec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (!OFFLINE && (!rec || Date.now() - rec.at > 7 * DAY)) {
    try {
      const res = await fetch('https://nether.wowhead.com/forever/tooltip/quest/' + questId, { headers: UA });
      const j = res.ok ? await res.json() : null;
      const html = (j && j.tooltip) || '';
      const req = html.split('Requirements:')[1] || '';
      const names = (req.match(/- ([^<]+)/g) || []).map(x => x.slice(2).replace(/ x\d+$/, '').trim()).filter(Boolean);
      const ids = [];
      for (const name of names.slice(0, 4)) {
        await sleep(250);
        const sr = await fetch('https://www.wowhead.com/forever/search/suggestions-template?q=' + encodeURIComponent(name), { headers: UA });
        const sj = sr.ok ? await sr.json() : { results: [] };
        const hit = (sj.results || []).find(r => r.type === 1 && r.name === name);
        if (hit) ids.push(hit.id);
      }
      rec = { at: Date.now(), names, ids };
      fs.writeFileSync(file, JSON.stringify(rec));
      await sleep(250);
    } catch (e) { /* keep what we had */ }
  }
  return (rec && rec.ids) || [];
}

// ---------- main ----------

(async () => {
  const fc = fs.existsSync(path.join(root, 'data/item-sources-fc.json')) ? read('data/item-sources-fc.json') : {};
  const dungeonTop = {};
  Object.entries(fc.dungeons || {}).forEach(([z, r]) => { dungeonTop[z.replace(/^The /, '').toLowerCase()] = r[1]; });
  const Q = questie.open(cacheDir, {});
  const att = parseAtt(await attFiles());
  console.log('AllTheThings: ' + Object.keys(att).length + ' quests de Forever leídas.');

  const weapons = read('data/weapons.json').weapons;
  const questIds = new Set();
  const bossIds = new Set();
  weapons.forEach(w => w.sources.forEach(s => {
    if (s.type === 'quest' && s.questId) questIds.add(s.questId);
    if ((s.type === 'boss' || s.type === 'drop') && s.npcId) bossIds.add(s.npcId);
  }));

  // Every step of a quest's chain (up to 6 back), with its targets.
  function steps(id) {
    const out = [];
    const seen = new Set();
    const walk = (qid, depth) => {
      if (seen.has(qid) || depth > 6) return;
      seen.add(qid);
      const q = Q.quest(qid);
      const a = att[qid];
      const creatures = (q && q.creatures.length ? q.creatures : (a ? a.creatures : []));
      out.push({ id: qid, creatures, instance: (a && a.instance) || null });
      const pre = (q && q.pre.length ? q.pre : []).concat(a ? a.pre : []);
      [...new Set(pre)].forEach(p => walk(p, depth + 1));
    };
    walk(id, 0);
    return out;
  }

  const npcs = {};
  async function level(id) {
    if (npcs[id]) return npcs[id];
    const wh = await npcInfo(id);
    const qn = Q.npcLevel(id);
    const info = {
      name: (wh && wh.name) || (qn && qn.name) || null,
      level: (wh && wh.level) || (qn && qn.maxLevel) || null,
      rank: (wh && wh.rank !== 'normal' ? wh.rank : qn && qn.rank) || 'normal',
      from: wh && wh.level ? 'wowhead' : qn && qn.maxLevel ? 'questie' : null
    };
    npcs[id] = info;
    return info;
  }

  const quests = {};
  let withTargets = 0;
  for (const id of questIds) {
    const chain = steps(id);
    if (!chain.some(st => st.creatures.length)) chain[0].creatures = await wowheadTargets(id);
    const targets = [];
    for (const st of chain) for (const c of st.creatures.slice(0, 8)) {
      const n = await level(c);
      targets.push(Object.assign({ id: c, step: st.id }, n));
    }
    // New bosses with no level yet: one below the top of their dungeon.
    const inst = chain.map(s => s.instance).find(Boolean);
    targets.forEach(tg => {
      if (tg.level == null && inst && dungeonTop[inst.replace(/^The /, '').toLowerCase()]) {
        tg.level = dungeonTop[inst.replace(/^The /, '').toLowerCase()] - 1;
        tg.from = 'dungeon-range';
      }
    });
    const known = targets.filter(tg => tg.level != null);
    if (known.length) withTargets++;
    const hardest = known.sort((a, b) => b.level - a.level)[0] || null;
    quests[id] = {
      minLevel: (att[id] && att[id].minLevel) || null,
      instance: inst || null,
      hardest: hardest && { id: hardest.id, name: hardest.name, level: hardest.level, rank: hardest.rank, from: hardest.from }
    };
  }
  for (const id of bossIds) await level(id);

  const out = {
    _readme: 'Written by scripts/fetch-levels.js: hardest target of each weapon quest (its chain included) and NPC levels. Used by build-weapons.js for the recommended level.',
    sources: ['https://github.com/Questie/QuestieDB', 'https://github.com/ATTWoWAddon/AllTheThings (MIT)', 'https://www.wowhead.com/forever'],
    quests, npcs
  };
  fs.writeFileSync(path.join(root, 'data/levels.json'), JSON.stringify(out, null, 1) + '\n');
  const est = Object.values(quests).filter(q => q.hardest && q.hardest.from === 'dungeon-range').length;
  console.log('Niveles: ' + questIds.size + ' quests de armas, ' + withTargets + ' con objetivo de nivel conocido (' + est + ' estimados por el rango del dungeon) · ' + Object.keys(npcs).length + ' NPCs.');
})().catch(e => { console.error(e.message); process.exit(1); });
