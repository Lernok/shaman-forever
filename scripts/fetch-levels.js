// How hard each weapon quest (and boss drop) really is, from who you have to
// kill along its whole chain, so a reward is placed at the level you can
// actually get it (scripts/build-weapons.js applies it).
//
//   node scripts/fetch-levels.js [--offline]
//
// Sources: QuestieDB (Classic quests: objectives, chains, NPC levels),
// AllTheThings (Forever quests; lib/att.js) and Wowhead's Forever tooltips
// (NPC level and rank; quest level and targets for steps nobody else records;
// lib/wowhead.js). A new boss with no recorded level counts as one below the
// top of its dungeon's range. Writes data/levels.json.
const path = require('path');
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');
const att = require('./lib/att');
const wowhead = require('./lib/wowhead');
const weaponSources = require('./lib/weapon-sources');

(async () => {
  const { build, items } = readJSON('data/items.json');
  const S = weaponSources.open(http.cacheDir, build);
  const Q = S.questie;
  const A = att.parse(await att.files()).quests;
  console.log('AllTheThings: ' + Object.keys(A).length + ' quests de Forever leídas.');

  // What to look up: every weapon quest and boss, straight from the sources.
  const questIds = new Set();
  const bossIds = new Set();
  const chainHint = {};
  Object.values(items).filter(weaponSources.isWeapon).forEach(i => S.sourcesOf(i).forEach(s => {
    if (s.type === 'quest' && s.questId) { questIds.add(s.questId); if (s.chain) chainHint[s.questId] = s.chain; }
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
      const a = A[qid];
      out.push({
        id: qid,
        creatures: q && q.creatures.length ? q.creatures : a ? a.creatures : [],
        instance: (a && a.instance) || null,
        level: q ? q.level : null,
        faction: (a && a.faction) || (q && q.faction !== 'both' ? q.faction : null)
      });
      const pre = (q ? q.pre : []).concat(a ? a.pre : []).concat(depth === 0 && chainHint[qid] ? chainHint[qid] : []);
      [...new Set(pre)].forEach(p => walk(p, depth + 1));
    };
    walk(id, 0);
    return out;
  }

  // A level Wowhead gave before isn't lost if Wowhead doesn't answer this time.
  const previous = readJSON('data/levels.json', { npcs: {} }).npcs || {};
  const npcs = {};
  async function npc(id) {
    if (!npcs[id]) {
      const wh = await wowhead.npc(id);
      const qn = Q.npcLevel(id);
      const before = previous[id] && previous[id].from === 'wowhead' ? previous[id] : null;
      npcs[id] = wh || !before ? {
        name: (wh && wh.name) || (qn && qn.name) || null,
        level: (wh && wh.level) || (qn && qn.maxLevel) || null,
        rank: (wh && wh.rank !== 'normal' ? wh.rank : qn && qn.rank) || 'normal',
        from: wh && wh.level ? 'wowhead' : qn && qn.maxLevel ? 'questie' : null
      } : before;
    }
    return npcs[id];
  }

  const quests = {};
  for (const id of [...questIds].sort((a, b) => a - b)) {
    const chain = steps(id);
    for (const st of chain) {
      if (st.creatures.length) continue;
      const wh = await wowhead.questTargets(st.id);
      st.creatures = wh.ids;
      st.level = st.level || wh.level;
    }
    const targets = [];
    for (const st of chain) for (const c of st.creatures.slice(0, 8)) targets.push(Object.assign({ id: c, step: st.id }, await npc(c)));
    // New bosses with no level yet: one below the top of their dungeon.
    const inst = chain.map(s => s.instance).find(Boolean);
    const top = inst && S.dungeonRange[S.bare(inst)];
    targets.forEach(tg => { if (tg.level == null && top) Object.assign(tg, { level: top[1] - 1, from: 'dungeon-range' }); });
    // A step with nothing on record still says how hard it is: its own level.
    chain.forEach(st => { if (st.id !== id && !st.creatures.length && st.level) targets.push({ id: null, step: st.id, name: null, level: st.level, rank: 'normal', from: 'step-level' }); });
    // Hardest: highest level; on a tie, the elite or boss one (it decides group or solo).
    const weight = tg => (['elite', 'rare-elite', 'boss'].includes(tg.rank) ? 1 : 0);
    const hardest = targets.filter(tg => tg.level != null).sort((a, b) => b.level - a.level || weight(b) - weight(a) || (a.id || 0) - (b.id || 0))[0] || null;
    // One faction anywhere in the chain: only that faction gets the reward.
    const factions = [...new Set(chain.map(st => st.faction).filter(Boolean))];
    quests[id] = {
      classes: (A[id] && A[id].classes) || null,
      minLevel: (A[id] && A[id].minLevel) || null,
      faction: factions.length === 1 ? factions[0] : factions.length > 1 ? 'conflict' : null,
      instance: inst || null,
      hardest: hardest && { id: hardest.id, name: hardest.name, level: hardest.level, rank: hardest.rank, from: hardest.from, step: hardest.step !== id ? hardest.step : undefined },
      steps: chain.length
    };
  }
  for (const id of [...bossIds].sort((a, b) => a - b)) await npc(id);

  writeJSON('data/levels.json', {
    _readme: 'Written by scripts/fetch-levels.js: hardest target of each weapon quest (its chain included) and NPC levels. Used by build-weapons.js for the recommended level.',
    sources: ['https://github.com/Questie/QuestieDB', 'https://github.com/ATTWoWAddon/AllTheThings (MIT)', 'https://www.wowhead.com/forever'],
    quests, npcs
  });
  const known = Object.values(quests).filter(q => q.hardest).length;
  const est = Object.values(quests).filter(q => q.hardest && q.hardest.from === 'dungeon-range').length;
  console.log('Niveles: ' + questIds.size + ' quests de armas, ' + known + ' con objetivo de nivel conocido (' + est + ' estimados por el rango del dungeon) · ' + Object.keys(npcs).length + ' NPCs.');
  console.log('Descargas: ' + http.summary());
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
