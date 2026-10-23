// Where the reagents of crafted gear come from: every reagent of the
// Leatherworking recipes that isn't skinned or Leatherworking's own (scales,
// feathers, gems, pearls, elixirs...), for the "Leatherworking while
// leveling" plan, and every reagent of the other professions' gear recipes
// (bars, cloth, gems...), for Equipo › Tu camino:
//
// - Made by another profession (data/recipes.json): which, at what skill and
//   from what (Forever's Sulfuric Acid and Cerulean Dye are alchemy).
// - Dropped: Wowhead Classic's "Dropped by" tab of each reagent (count / out
//   of, so the chance per kill), with the creature's levels and zones, and
//   whether it's elite; only creatures looted often enough.
// - Gathered: mined from, fished in, found in (clams); smelted (bars).
// - Its name, when the client tables don't have it (the Wowhead page's title).
// - Forever's scarce materials (a bonus from gathering nodes) and the Black
//   Market vendor's fixed prices: hand-kept in data/scarce.json.
//
// - Gold you earn per level, to weigh a price: quest money and what the
//   monsters you kill leave (coins, gray items), from the experience to level
//   up (Classic's table) split between quests (QUEST_SHARE) and kills; the
//   averages per quest and per kill come from data/income.json.
// - Auction prices, when data/prices.json exists (scripts/import-prices.js,
//   from Auctionator scans): realm, day and the lowest price per unit.
//
// Only these facts, with the source cited on the page; fetched politely and
// cached in .cache/wowhead-classic/ (refreshed monthly). Forever's own items
// aren't on Wowhead Classic: they stay "unknown" unless a profession makes
// them.
//
//   node scripts/build-reagents.js
//
// Writes data/reagents.json.
const { parseCSV } = require('./lib/csv');
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');

// A creature counts once looted this often; and drops it at least this often.
const MIN_LOOTS = 50;
const MIN_CHANCE = 0.02;
const MAX_DROPS = 80;
// Skill lines of the professions (Wowhead's spell lists).
const SKILL_PROF = { 164: 'blacksmithing', 165: 'leatherworking', 197: 'tailoring', 202: 'engineering', 333: 'enchanting', 171: 'alchemy', 185: 'cooking' };
// Experience to reach the next level, 1-59 (Classic).
const XP = [400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600, 8800, 10100, 11400, 12900, 14400, 16000, 17700, 19400, 21300, 23200,
  25200, 27300, 29400, 31700, 34000, 36400, 38900, 41400, 44300, 47400, 50800, 54500, 58600, 62800, 67100, 71600, 76100, 80800, 85700, 90700,
  95800, 101000, 106300, 111800, 117500, 123200, 129100, 135100, 141200, 147500, 153900, 160400, 167100, 173900, 180800, 187900, 195000, 202300, 209800];
// Of a level's experience, what quests give (the rest: kills; js/lw-plan.js KILL_SHARE).
const QUEST_SHARE = 0.6;
// QuestMoneyReward / QuestXP column of an ordinary quest.
const DIFFICULTY = 'Difficulty_5';

// A listview's rows (id: 'dropped-by', 'mined-from-object'...) of a Wowhead page.
function listview(html, id) {
  const at = html.indexOf("id: '" + id + "'");
  if (at < 0) return [];
  const start = html.indexOf('data: [', at) + 6;
  let depth = 0;
  let end = start;
  for (; end < html.length; end++) {
    if (html[end] === '[') depth++;
    else if (html[end] === ']' && !--depth) break;
  }
  try { return JSON.parse(html.slice(start, end + 1)); } catch (e) { return []; }
}

let scarceItems = {};
(async () => {
  const meta = readJSON('data/meta.json');
  const build = meta.items.build;
  const SK = readJSON('data/skinning.json');
  const recipes = readJSON('data/recipes.json').professions;
  const areas = await http.get('https://wago.tools/db2/AreaTable/csv?build=' + build, { cache: 'wago/' + build + '/AreaTable.csv', valid: t => /^ID,|,ID,/.test(t.slice(0, 2000)) });
  const zoneName = {};
  parseCSV(areas).forEach(r => { zoneName[r.ID] = r.AreaName_lang; });

  // Who makes what (Leatherworking's own count only for the other professions).
  const madeBy = new Map();
  for (const [prof, list] of Object.entries(recipes)) {
    for (const r of Object.values(list)) if (r.itemId && !madeBy.has(r.itemId)) madeBy.set(r.itemId, { prof, skill: r.skill[0], mats: r.mats || [] });
  }

  const own = new Set(SK.recipes.map(r => r.id).concat(SK.skin));
  const wanted = new Set();
  SK.recipes.forEach(r => r.mats.forEach(([m]) => { if (!own.has(m)) wanted.add(m); }));
  const forLw = new Set(wanted);
  // The other professions: the reagents of the recipes of the gear the site plans.
  const crafted = new Map();
  readJSON('data/gear.json').gear.concat(readJSON('data/weapons.json').weapons).forEach(i => (i.sources || []).forEach(s => {
    if (s.type !== 'crafted' || s.profession === 'Leatherworking') return;
    const r = Object.values(recipes[s.profession.toLowerCase()] || {}).find(x => x.itemId === i.id);
    if (r && r.mats && r.mats.length) crafted.set(i.id, r.mats);
  }));
  crafted.forEach(mats => mats.forEach(([m]) => wanted.add(m)));
  const sparse = await http.get('https://wago.tools/db2/ItemSparse/csv?build=' + build, { cache: 'wago/' + build + '/ItemSparse.csv', valid: t => /^ID,|,ID,/.test(t.slice(0, 2000)) });
  const nameOf = new Map(parseCSV(sparse).map(r => [Number(r.ID), r.Display_lang]));

  const items = {};
  let fetched = 0;
  let kept = 0;
  // What the last run found: kept for a reagent whose page can't be fetched
  // now (Wowhead refuses some requests from the sync's servers).
  const before = readJSON('data/reagents.json', { items: {} }).items;
  for (const id of [...wanted].sort((a, b) => a - b)) {
    const e = { name: SK.names[id] || nameOf.get(id) || null };
    const made = madeBy.get(id);
    if (made) e.craft = { prof: made.prof, skill: made.skill, mats: made.mats };
    const html = await http.get('https://www.wowhead.com/classic/item=' + id, { cache: 'wowhead-classic/item-' + id + '.html', maxAgeDays: 30 });
    if (html) {
      fetched++;
      if (!e.name) e.name = ((html.match(/<title>([^<]+?) - Item - /) || [])[1] || '').trim() || null;
      const icon = (html.match(/"icon":"([a-z0-9_]+)"/) || [])[1];
      if (icon) e.icon = icon;
      // Sold by a vendor: thread, dye, salt, vials... nothing to look for.
      if (listview(html, 'sold-by').length) { e.vendor = true; items[id] = e; continue; }
      // Dropped, or skinned (turtles give Turtle Scale, deviate beasts Deviate Scale).
      const drops = listview(html, 'dropped-by').concat(listview(html, 'skinned-from').map(r => Object.assign({ skinned: true }, r)))
        .filter(r => r.type == null || r.type === 1 || r.template === 'npc' || r.react)
        .filter(r => r.outof >= MIN_LOOTS && r.count / r.outof >= MIN_CHANCE && (r.maxlevel || 0) <= 62)
        .map(r => ({
          id: r.id, n: r.name, l: [r.minlevel || r.maxlevel, r.maxlevel || r.minlevel], p: Math.round(r.count / r.outof * 1000) / 1000,
          z: [...new Set((r.location || []).map(z => zoneName[z]).filter(Boolean))], elite: r.classification > 0 || undefined,
          // react: [Alliance, Horde]; 1 friendly.
          friend: r.react && (r.react[0] === 1 ? 'A' : r.react[1] === 1 ? 'H' : undefined) || undefined,
          skin: r.skinned || undefined
        }))
        .filter(d => d.z.length)
        .sort((a, b) => b.p - a.p)
        .slice(0, MAX_DROPS);
      if (drops.length) e.drops = drops;
      const gather = {};
      const mined = listview(html, 'mined-from-object').map(r => r.name);
      if (mined.length) gather.mined = [...new Set(mined)].slice(0, 4);
      const fished = listview(html, 'fished-in').map(r => zoneName[r.id] || r.name).filter(Boolean);
      if (fished.length) gather.fished = [...new Set(fished)].slice(0, 6);
      const inItem = listview(html, 'contained-in-item').filter(r => r.outof >= MIN_LOOTS).sort((a, b) => b.count / b.outof - a.count / a.outof).map(r => r.name);
      if (inItem.length) gather.inItem = [...new Set(inItem)].slice(0, 4);
      // Enchanting dust and essences: from disenchanting green gear.
      if (listview(html, 'disenchanted-from').length) gather.de = 1;
      // Made by a spell: smelted (Mining) from ore, or another profession's
      // (essences: Enchanting) when the recipe data doesn't have it.
      listview(html, 'created-by-spell').forEach(r => {
        const skill = (r.skill || [])[0];
        if (skill === 186 && !gather.smelt) gather.smelt = [r.name, r.learnedat || 1];
        else if (SKILL_PROF[skill] && !e.craft) e.craft = { prof: SKILL_PROF[skill], skill: r.learnedat || 1, mats: r.reagents || [] };
      });
      if (Object.keys(gather).length) e.gather = gather;
    } else if (before[id]) {
      kept++;
      Object.assign(e, before[id], { name: e.name || before[id].name });
    }
    items[id] = e;
  }

  // Scarce materials and the Black Market vendor (data/scarce.json).
  const scarce = readJSON('data/scarce.json', { items: {} });
  scarceItems = scarce.items;
  Object.entries(scarce.items).forEach(([id, s]) => {
    if (!items[id]) return;
    if (s.gather) items[id].scarce = s.gather;
    items[id].market = s.price || 0;
  });

  writeJSON('data/reagents.json', {
    _readme: 'Written by scripts/build-reagents.js. Reagents of Leatherworking recipes that are not skinned, not Leatherworking-made: craft (another profession), drops (p: chance per kill, l: levels, z: zones), gather, vendor.',
    sources: { drops: 'https://www.wowhead.com/classic/item=5784/slimy-murloc-scale#dropped-by', recipes: 'https://classicwowforever.com/professions/' },
    items
  });
  // The page's copy: { v: vendor, c: [profession, skill], d: drops, g: gather, n: name, i: icon }.
  const compact = (e, named) => {
    if (e.vendor) return named ? { v: 1, n: e.name } : { v: 1 };
    const o = {};
    // Made by another profession; with the scarce material it takes, if any (Cerulean Dye: Frilled Lichen).
    if (e.craft) {
      o.c = [e.craft.prof, e.craft.skill];
      const sc = (e.craft.mats || []).find(([m]) => scarceItems[m]);
      if (sc) o.c.push(scarceItems[sc[0]].name);
    }
    if (e.drops) o.d = e.drops.map(d => [d.n, d.l[0], d.l[1], d.p, d.z, (d.elite ? 1 : 0) + (d.skin ? 2 : 0), d.friend || 0]);
    if (e.gather) o.g = e.gather;
    // s: scarce, from this gathering profession; b: the Black Market sells it (price, 0 unknown).
    if (e.scarce) o.s = e.scarce;
    if (e.market != null) o.b = e.market;
    if (named) { o.n = e.name; if (e.icon) o.i = e.icon; }
    return o;
  };
  const page = {};
  forLw.forEach(id => { if (items[id]) page[id] = compact(items[id]); });
  SK.reagents = page;
  // Gold you earn per level (copper), gold[level - 1].
  const table = async name => {
    const csv = await http.get('https://wago.tools/db2/' + name + '/csv?build=' + build, { cache: 'wago/' + build + '/' + name + '.csv', valid: t => /^ID,/.test(t) });
    return new Map(parseCSV(csv).map(r => [Number(r.ID), Number(r[DIFFICULTY])]));
  };
  // Quests: how many a level's quest experience is (the client's QuestXP per
  // quest) times the money a quest of that level pays; kills: the rest of
  // the experience at Classic's 45 + 5 x level a kill of your level, times
  // the coins and gray items a monster leaves (data/income.json,
  // scripts/build-income.js). Without that file, QuestMoneyReward alone.
  const qxp = await table('QuestXP');
  const income = readJSON('data/income.json', null);
  const money = income ? null : await table('QuestMoneyReward');
  SK.gold = XP.map((xp, i) => {
    const l = i + 1;
    const quests = xp * QUEST_SHARE / (qxp.get(l) || 1);
    if (!income) return Math.round(quests * (money.get(l) || 0));
    const e = income.levels[i];
    return Math.round(quests * e.quest + xp * (1 - QUEST_SHARE) / (45 + 5 * l) * (e.coin + e.gray));
  });
  SK.sources.gold = income ? income.source : 'https://wago.tools/db2/QuestMoneyReward';
  // Class training per level (copper), train[level - 1]: the spell ranks
  // learned at that level (data/shaman.json) times what a rank of that level
  // costs. Costs read at the class trainer by the addon (stress test, 10-21:
  // ShamanForeverGuideDB.scan.spells, data/ingame-scan.json) and the purchases
  // logged at 2, 4, 6 and 8; levels in between, interpolated.
  const scan = readJSON('data/ingame-scan.json', {}).spells || {};
  const per = { 2: 10, 4: 100, 6: 100, 8: 100 };
  Object.values(scan).forEach(t => Object.values(t.list || {}).forEach(x => { if (x.level > 0 && x.cost > 0) per[x.level] = Math.max(per[x.level] || 0, x.cost); }));
  const known = Object.keys(per).map(Number).sort((a, b) => a - b);
  const rankCost = l => {
    if (per[l]) return per[l];
    const lo = known.filter(k => k < l).pop();
    const hi = known.find(k => k > l);
    if (lo == null || hi == null) return per[lo != null ? lo : hi] || 0;
    return Math.round(per[lo] + (per[hi] - per[lo]) * (l - lo) / (hi - lo));
  };
  const ranks = {};
  Object.entries(readJSON('data/shaman.json').spell_desc || {}).forEach(([k, v]) => {
    const m = /level (\d+)/.exec(v.lv || '');
    if (m && /\|Rank \d+$/.test(k)) ranks[m[1]] = (ranks[m[1]] || 0) + 1;
  });
  SK.train = XP.map((x, i) => (ranks[i + 1] || 0) * rankCost(i + 1));
  SK.sources.train = 'ShamanForeverGuide addon: class trainer costs read in game (stress test, 2026-10-21)';
  const prices = readJSON('data/prices.json', null);
  if (prices) SK.prices = { realm: prices.realm, date: prices.date, p: prices.prices };
  SK.sources.reagents = 'https://www.wowhead.com/classic/item=5784/slimy-murloc-scale#dropped-by';
  writeJSON('data/skinning.json', SK);
  // Every crafting profession's gear (data/crafts.js on the page): each
  // piece's reagents, where each comes from, prices and quest gold.
  const all = {};
  // The ten drops most likely per reagent: enough to say where.
  Object.entries(items).forEach(([id, e]) => { all[id] = compact(Object.assign({}, e, e.drops ? { drops: e.drops.slice(0, 10) } : {}), true); });
  writeJSON('data/crafts.json', {
    _readme: 'Written by scripts/build-reagents.js: reagents of crafted gear (mats[item] = [[reagent, n]]), where each comes from, auction prices and the gold you earn per level (quests, coins and gray items).',
    sources: { drops: SK.sources.reagents, gold: SK.sources.gold, scarce: scarce.sources, market: scarce.vendor },
    mats: Object.fromEntries(crafted), items: all, gold: SK.gold, prices: SK.prices || null,
    // What Merchant's Favor costs: crates and what fills them (data/favor.json).
    favor: readJSON('data/favor.json')
  });
  const n = Object.values(items);
  console.log('Reactivos: ' + n.length + ' (' + fetched + ' con página de Wowhead' + (kept ? ', ' + kept + ' como estaban' : '') + '): ' + n.filter(e => e.drops).length + ' caen de bichos, ' +
    n.filter(e => e.craft).length + ' de otra profesión, ' + n.filter(e => e.gather).length + ' se recolectan, ' + n.filter(e => e.vendor).length + ' de vendedor, ' +
    n.filter(e => !e.drops && !e.craft && !e.gather && !e.vendor).length + ' sin fuente');
})().catch(e => { console.error(e.message); process.exit(1); });
