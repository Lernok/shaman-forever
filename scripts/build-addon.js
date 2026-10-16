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
const dlevelsAll = () => Object.assign({}, Z.dungeons, ...Object.values(INSTANCES).map(n => ({ [n]: 1 })));
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
    if (s.type === 'quest' && s.dungeon && s.zone && (Z.dungeons[s.zone] || Object.values(INSTANCES).includes(s.zone))) {
      dg(s.zone).quests.push({ q: s.questId, qn: s.quest.replace(/ \(given by [^)]*\)/, ''), i: item.id, f: s.faction === 'both' ? undefined : s.faction, l: s.level });
      used.add(item.id);
    }
  });
});
Object.values(dungeons).forEach(d => {
  d.drops.sort((a, b) => a.i - b.i);
  d.quests.sort((a, b) => (a.q || 0) - (b.q || 0) || a.i - b.i);
});
// Quest givers and every dungeon's quests, from QuestieDB's Forever files
// (cached by scripts/sync.js): only facts per quest (name, levels, who gives
// it and where), never its files. Without the cache the addon still works,
// with no "pick this up" tips.
const { parseLua } = require('./lib/questie.js');
const cache = path.join(root, '.cache');
const qdir = path.join(cache, 'questiedb');
// The QuestieDB addon installed next to the game (QUESTIEDB: its support folder).
const support = process.env.QUESTIEDB || 'D:/World of Warcraft/_classic_beta_/Interface/AddOns/QuestieDB/support';
const givers = {};
const dquests = {};
const iq = {}, qpre = {}, qalt = {}, qnames = {}, enders = {}, qr = {}, npcq = {}, qxp = {}, qrace = {}, qreq = {}, qbag = {}, cont = {}, dcont = {};
const bagNames = {};
if (fs.existsSync(path.join(qdir, 'foreverQuestDB.lua'))) {
  const index = file => {
    const m = new Map();
    fs.readFileSync(path.join(qdir, file), 'utf8').split('\n').forEach(line => {
      const r = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
      if (r) m.set(+r[1], r[2]);
    });
    return m;
  };
  const Q = index('foreverQuestDB.lua'), N = index('foreverNpcDB.lua');
  // Quests and NPCs the repo's files lack yet (Forever's new zones): from the
  // QuestieDB addon installed in the game.
  const B = require('./lib/questiedb-baked.js').load(path.dirname(support));
  if (B) console.log('QuestieDB instalado: ' + B.questIds().length + ' misiones (' + B.file + ')');
  const get = (m, id) => (m.has(id) ? parseLua(m.get(id)) : B ? (m === Q ? B.quest(id) : m === N ? B.npc(id) : null) : null);
  const wago = path.join(cache, 'wago');
  const dir = fs.readdirSync(wago).filter(d => d.startsWith('1.60')).sort().pop();
  const { parseCSV } = require('./lib/csv.js');
  const areaName = {};
  parseCSV(fs.readFileSync(path.join(wago, dir, 'AreaTable.csv'), 'utf8')).forEach(r => { areaName[r.ID] = r.AreaName_lang; });
  areaName[1585] = 'Blackrock Depths';
  // Dungeon quests: quest log heading (zoneOrSort) is a dungeon we know.
  const SHAMAN = 64;
  const HORDE = 2 | 16 | 32 | 128, ALLIANCE = 1 | 4 | 8 | 64;
  const factionOf = mask => { if (!mask) return undefined; const a = (mask & ALLIANCE) !== 0, h = (mask & HORDE) !== 0; return a && !h ? 'alliance' : h && !a ? 'horde' : undefined; };
  // Who gives a quest: the first NPC with a location (name, zone, x, y).
  const giver = qid => {
    const q = get(Q, qid);
    if (!q) return null;
    for (const nid of ((q[1] || [])[0] || [])) {
      const n = get(N, nid);
      if (!n) continue;
      const spawns = n[6] || {};
      const zid = Object.keys(spawns).find(z => areaName[z]) || n[8];
      const xy = (spawns[zid] || [])[0] || [];
      return { n: n[0], z: +zid || undefined, x: xy[0], y: xy[1] };
    }
    // A world object (a wanted poster…): only the installed QuestieDB has them.
    for (const oid of ((q[1] || [])[1] || [])) {
      const o = B && B.object(oid);
      if (!o) continue;
      const spawns = o[3] || {};
      const zid = Object.keys(spawns).find(z => areaName[z]) || o[4];
      const xy = (spawns[zid] || [])[0] || [];
      if (xy.length) return { n: o[0], z: +zid || undefined, x: xy[0], y: xy[1] };
    }
    return (((q[1] || [])[2] || []).length) ? { item: true } : null;
  };
  const known = new Set(Object.keys(Z.dungeons).concat(Object.values(INSTANCES)));
  Q.forEach((raw, qid) => {
    const q = get(Q, qid);
    const dname = q[16] > 0 ? areaName[q[16]] : null;
    if (!dname || !known.has(dname) || RAID.test(dname)) return;
    if (q[6] && !(q[6] & SHAMAN)) return;
    const pre = (q[12] || [])[0] || (q[11] || [])[0];
    const preQ = pre ? get(Q, pre) : null;
    (dquests[dname] = dquests[dname] || []).push({ q: qid, qn: q[0], r: q[3] || undefined, l: q[4] || undefined, f: factionOf(q[5]),
      p: pre || undefined, pn: preQ ? preQ[0] : undefined });
    givers[qid] = giver(qid);
  });
  // Forever's new dungeons aren't under their own heading in QuestieDB: their
  // quests come from the site's data (quests that reward something).
  Object.entries(dungeons).forEach(([dname, d]) => d.quests.forEach(x => {
    const list = dquests[dname] = dquests[dname] || [];
    if (!x.q || list.some(e => e.q === x.q)) return;
    const q = get(Q, x.q);
    list.push({ q: x.q, qn: x.qn, r: q ? q[3] || undefined : undefined, l: x.l, f: x.f });
    givers[x.q] = giver(x.q);
  }));
  // foreverchanges.pro/dungeon-quests (cached by fetch-item-sources.js): the
  // Forever list, with the place you pick each one up, who gives it and where
  // (or "inside the dungeon", or the item that starts it). It wins over
  // QuestieDB, which lacks Forever's new dungeons.
  const fcFile = path.join(cache, 'foreverchanges', 'dungeon-quests.html');
  if (fs.existsSync(fcFile)) {
    const top = {};
    parseCSV(fs.readFileSync(path.join(wago, dir, 'AreaTable.csv'), 'utf8')).forEach(r => { if (r.ParentAreaID === '0' && !top[r.AreaName_lang]) top[r.AreaName_lang] = +r.ID; });
    const areaOf = place => Z.zones[place] && Z.zones[place].id || CITIES[place] || top[place];
    const dungeonOf = f => {
      const n = f.replace(/^the /, '');
      return [n, 'The ' + n].find(x => Z.dungeons[x] || Object.values(INSTANCES).includes(x)) || Object.values(INSTANCES).find(x => x.startsWith(n));
    };
    const dec = s => s.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const html = fs.readFileSync(fcFile, 'utf8');
    const re = /<h3 class="dq-place-name">([^<]*)<\/h3>|<li data-q="(\d+)" data-min="(\d*)" data-ql="(\d*)" data-for="(\w*)"[^>]*>(.*?)<\/li>/g;
    let m, place = null, n = 0;
    while ((m = re.exec(html))) {
      if (m[1] !== undefined) { place = dec(m[1]); continue; }
      const body = dec(m[6]);
      const name = (body.match(/dq-tl-q">([^<]*)/) || [])[1];
      const dname = dungeonOf((body.match(/dq-tl-for">, for (.*?)<\/span>/) || [])[1] || '');
      const small = ((body.match(/<small>(.*?)<\/small>/) || [])[1] || '').replace(/<[^>]+>/g, '');
      if (!name || !dname) continue;
      const qid = +m[2];
      const list = dquests[dname] = dquests[dname] || [];
      let e = list.find(x => x.q === qid);
      if (!e) { e = { q: qid }; list.push(e); }
      const after = (small.match(/After [“"](.*?)[”"]/) || [])[1];
      Object.assign(e, { qn: name, r: +m[3] || e.r, l: +m[4] || e.l, f: m[5] === 'h' ? 'horde' : m[5] === 'a' ? 'alliance' : e.f, pn: after || e.pn });
      const item = (small.match(/^Starts with (.*)$/) || [])[1];
      const g = /^([^,]+), (?:inside the dungeon|(\d+(?:\.\d+)?), (\d+(?:\.\d+)?))/.exec(small);
      if (item) givers[qid] = { item };
      else if (g && !g[2]) givers[qid] = { n: g[1], inside: true };
      else if (g) givers[qid] = { n: g[1], z: areaOf(place), x: +g[2], y: +g[3] };
      n++;
    }
    console.log('foreverchanges: ' + n + ' misiones de dungeon');
  }
  // Where a chain starts: the giver of each quest before a dungeon quest.
  Object.values(dquests).forEach(l => l.forEach(e => { if (e.p && !(e.p in givers)) givers[e.p] = giver(e.p); }));
  Object.values(dquests).forEach(l => l.sort((a, b) => (a.l || 0) - (b.l || 0) || a.q - b.q));
  // Givers of the quests on the gear path too.
  Object.values(paths).forEach(r => Object.values(r).forEach(p => p.forEach(st => { if (st.q && !(st.q in givers)) givers[st.q] = giver(st.q); })));
  // Shift+click on an item: the quests that reward it (iq), each quest's step
  // before it in its chain (qpre), names (qnames) and who takes each one in
  // (enders), so the addon marks the step you're at.
  const ender = qid => {
    const q = get(Q, qid);
    for (const nid of (((q || [])[2] || [])[0] || [])) {
      const n = get(N, nid);
      if (!n) continue;
      const spawns = n[6] || {};
      const zid = Object.keys(spawns).find(z => areaName[z]) || n[8];
      const xy = (spawns[zid] || [])[0] || [];
      if (xy.length) return { n: n[0], z: +zid || undefined, x: xy[0], y: xy[1] };
    }
    return null;
  };
  // A step can have several quests before it, any of which opens it (Call of
  // Fire starts with four givers): qpre keeps the first, qalt all of them.
  const learn = id => {
    const q = get(Q, id);
    if (!q) return null;
    qnames[id] = qnames[id] || q[0];
    if (!(id in givers)) givers[id] = giver(id);
    if (!(id in enders)) enders[id] = ender(id);
    return q;
  };
  // Shaman races a quest is for, as letters (Orc, Troll, taUren, Dwarf,
  // Skyborne): Call of Fire has one for Skyborne only. No mask: anyone.
  const RACE_BITS = { O: 2, U: 32, T: 128, D: 4, S: 2 ** 33 };
  // Starting zones, by the races that start there: another race's start is a
  // last resort (Meddlesome Mages on Zephras Isle also gives Call of Fire's totem).
  const START = { Durotar: 'OT', Mulgore: 'U', 'Dun Morogh': 'D', 'Zephras Isle': 'S' };
  const racesOf = mask => {
    if (!mask) return undefined;
    const l = Object.entries(RACE_BITS).filter(([, b]) => Math.floor(mask / b) % 2 === 1).map(([k]) => k).join('');
    return l.length === 5 ? undefined : l;
  };
  const chainStep = qid => {
    const seen = new Set();
    for (let id = qid, i = 0; id && !seen.has(id) && i < 20; i++) {
      seen.add(id);
      const q = learn(id);
      if (!q) break;
      const pres = ((q[12] && q[12].length ? q[12] : q[11]) || []).filter(x => get(Q, x));
      if (pres.length) qpre[id] = pres[0];
      if (pres.length > 1) { qalt[pres[0]] = pres; pres.forEach(learn); }
      id = pres[0];
    }
  };
  full.forEach(item => {
    if (!items[item.id]) return;
    item.sources.forEach(s => {
      if (s.type !== 'quest' || !s.questId || !get(Q, s.questId)) return;
      const l = iq[item.id] = iq[item.id] || [];
      if (!l.some(x => x[0] === s.questId)) l.push([s.questId, s.faction === 'horde' ? 'h' : s.faction === 'alliance' ? 'a' : undefined, racesOf(get(Q, s.questId)[5]), START[s.zone]]);
      chainStep(s.questId);
    });
  });
  // Hovering a quest giver: the gear its quests reward (qr: quest -> items,
  // npcq: NPC id -> quests it starts).
  Object.entries(iq).forEach(([item, list]) => list.forEach(e => { (qr[e[0]] = qr[e[0]] || []).push(+item); }));
  Object.keys(qr).forEach(qid => {
    const q = get(Q, +qid);
    ((q && q[1] && q[1][0]) || []).forEach(nid => { const l = npcq[nid] = npcq[nid] || []; if (!l.includes(+qid)) l.push(+qid); });
  });
  // Quest XP (QuestieDB's table: quest level and XP at that level; the addon
  // scales it to your level like Questie) and every quest giver, so hovering
  // one tells the XP even of quests with no gear for you. Other classes'
  // quests are left out; qrace: races when the quest is for some only.
  const xpFile = path.join(support, 'Forever', 'QuestXP', 'xpDB-classic.lua');
  if (fs.existsSync(xpFile)) fs.readFileSync(xpFile, 'utf8').split('\n').forEach(line => {
    const m = /^\s*\[(\d+)\] = \{(-?\d+), (\d+)\}/.exec(line);
    if (m && +m[2] > 0 && +m[3] > 0) qxp[m[1]] = [+m[2], +m[3]];
  });
  const allQuests = new Set([...Q.keys(), ...(B ? B.questIds() : [])]);
  allQuests.forEach(qid => {
    const q = get(Q, qid);
    if (!q || (q[6] && !(q[6] & SHAMAN))) return;
    if (!qxp[qid] && !qr[qid]) return;
    const starters = (q[1] && q[1][0]) || [];
    if (!starters.length) return;
    qnames[qid] = qnames[qid] || q[0];
    const r = racesOf(q[5]);
    if (r) qrace[qid] = r;
    if (q[3]) qreq[qid] = q[3];
    starters.forEach(nid => { const l = npcq[nid] = npcq[nid] || []; if (!l.includes(qid)) l.push(qid); });
  });
  Object.keys(qxp).forEach(k => { if (!qnames[k]) delete qxp[k]; });
  // Bags a quest gives (QuestieDB items: class 1/0, their questRewards; the
  // slots from the client): Deviate Hides' 10-slot pack is worth it alone.
  const sparse = path.join(wago, dir, 'ItemSparse.csv');
  const slotsOf = {};
  if (fs.existsSync(sparse)) {
    const text = fs.readFileSync(sparse, 'utf8');
    const head = text.slice(0, text.indexOf('\n')).split(',');
    const iId = head.indexOf('ID'), iSlots = head.indexOf('ContainerSlots');
    if (iSlots >= 0) parseCSV(text).forEach(r => { if (+r.ContainerSlots > 0) slotsOf[r.ID] = +r.ContainerSlots; });
  }
  const idbFile = path.join(qdir, 'foreverItemDB.lua');
  if (fs.existsSync(idbFile)) fs.readFileSync(idbFile, 'utf8').split('\n').forEach(line => {
    const m = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
    if (!m) return;
    const it = parseLua(m[2]);
    if (!it || it[11] !== 1 || it[12] !== 0 || !it[5] || !slotsOf[m[1]]) return;
    it[5].forEach(qid => {
      if (!get(Q, qid)) return;
      (qbag[qid] = qbag[qid] || []).push([+m[1], slotsOf[m[1]]]);
      bagNames[m[1]] = it[0];
      if (!qr[qid]) qr[qid] = [];
    });
  });
  // Every tip's quest too (class quests, dungeon quests): where you are in it.
  Object.values(paths).forEach(r => Object.values(r).forEach(p => p.forEach(st => { if (st.q) chainStep(st.q); })));
  Object.values(dquests).forEach(l => l.forEach(e => chainStep(e.q)));
  Object.keys(givers).forEach(k => { if (!givers[k]) delete givers[k]; });
  Object.keys(enders).forEach(k => { if (!enders[k]) delete enders[k]; });
  // Continent of each place (AreaTable's ContinentID: 0 Eastern Kingdoms, 1
  // Kalimdor, others new isles) and of each dungeon: far tips stay quiet.
  const areaCont = {};
  parseCSV(fs.readFileSync(path.join(wago, dir, 'AreaTable.csv'), 'utf8')).forEach(r => { areaCont[r.ID] = +r.ContinentID; });
  const placeIds = new Set(Object.values(Z.zones).map(z => z.id).concat(Object.values(CITIES), Object.values(givers).concat(Object.values(enders)).map(g => g.z)).filter(Boolean).map(String));
  placeIds.forEach(id => { if (areaCont[id] != null) cont[id] = areaCont[id]; });
  const KALIMDOR = ['Ragefire Chasm', 'Wailing Caverns', 'Blackfathom Deeps', 'Razorfen Kraul', 'Razorfen Downs', "Zul'Farrak", 'Maraudon', 'Dire Maul'];
  Object.keys(dlevelsAll()).forEach(n => { dcont[n] = KALIMDOR.includes(n) ? 1 : 0; });
} else console.warn('Sin .cache/questiedb (correr scripts/sync.js): el addon va sin quién da cada misión.');
// AreaTable id -> the world map (uiMapID) TomTom places waypoints on, from
// QuestieDB's support tables when it's installed next to the game.
const uiMaps = {};
[path.join(support, 'Zones', 'areaIdToUiMapId.lua'), path.join(support, 'Forever', 'Zones', 'areaIdToUiMapId.lua')].forEach(f => {
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split('\n').forEach(line => {
    const m = /^\s*\[(\d+)\]\s*=\s*(\d+),/.exec(line);
    if (m && +m[2] > 0) uiMaps[m[1]] = +m[2];
  });
});
const wanted = new Set(Object.values(givers).concat(Object.values(enders)).map(g => g.z).filter(Boolean).map(String));
Object.keys(uiMaps).forEach(k => { if (!wanted.has(k)) delete uiMaps[k]; });

// Level range of every dungeon (foreverchanges', else its quests' band).
const dlevels = {};
Object.entries(Z.dungeons).forEach(([n, d]) => { if (d.levels) dlevels[n] = d.levels; });

// Talent at each level: the leveling order to 60 of each spec (the site's
// talentsforever.com orders, Talentos > Calculadora), one point per level.
const rules = require('../js/talent-rules.js');
const shaman = read('data/shaman.json');
const maxRank = {};
shaman.talents.trees.forEach(t => t.talents.forEach(x => { maxRank[t.name + '/' + x.name] = x.max; }));
const talents = {};
SPECS.forEach(spec => {
  const b = read('data/builds.json').builds.filter(x => x.spec === spec && x.order).sort((a, b) => b.level - a.level)[0];
  if (!b) return;
  const at = {};
  rules.orderPoints(b.order).forEach(pt => { at[pt.level] = [pt.talent, pt.rank, maxRank[pt.tree + '/' + pt.talent] || pt.rank, pt.tree]; });
  talents[spec] = { name: b.name, at };
});

const names = {};
// Names for the tooltips' rewards too (the game may not have loaded an item yet).
Object.values(qr).forEach(l => l.forEach(id => used.add(id)));
used.forEach(id => { names[id] = (full.get(id) || {}).name; });
Object.assign(names, bagNames);

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
  'SF.DATA = ' + lua({ build, talents, dlevels, givers, dquests, iq, qpre, qalt, qnames, enders, qr, npcq, qxp, qrace, qreq, qbag, cont, dcont, uiMaps, specs: SPECS, cost: GP.COST, weights: GP.WEIGHTS, upgrade: GP.UPGRADE, instances: INSTANCES, zones, items, names, paths, dungeons }) + '\n';
const dest = path.join(root, 'addon', 'ShamanForever', 'Data.lua');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
const n = Object.values(paths).reduce((s, r) => s + Object.values(r).reduce((t, p) => t + p.length, 0), 0);
console.log('Data.lua: ' + Object.keys(items).length + ' items, ' + n + ' path steps, ' + Object.keys(dungeons).length + ' dungeons, ' + Object.keys(givers).length + ' givers, ' + Object.values(dquests).reduce((s, l) => s + l.length, 0) + ' dungeon quests, ' + Object.keys(iq).length + ' items with a quest, ' + Object.keys(uiMaps).length + ' maps, ' + Math.round(out.length / 1024) + ' KB');
