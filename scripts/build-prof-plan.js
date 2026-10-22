// How to level each crafting profession other than Leatherworking (that one
// has its own plan, js/lw-plan.js), simply: from skill 1 to 300, the trainer
// recipe that takes the fewest materials per skill point, how many times to
// make it, what it uses, and from about what character level you can.
//
// The model, on purpose simple and shown on the page:
// - A craft's skill-up chance: 1 up to yellow, then falling to 0 at grey
//   (data/recipes.json colors; the same as Leatherworking's).
// - Recipes: the trainer's, up to your rank (Journeyman at 10, Expert at 20,
//   Artisan at 35). A recipe is kept while it stays within KEEP of the best
//   one (and at least MIN_SPAN points), so the list doesn't hop back and
//   forth. Where the best one takes more than MAX_PER_POINT a point, the
//   trainer's recipes don't level it any more: the plan stops (patterns).
// - Materials per craft, down to what you gather: what the same profession
//   makes (bolts of cloth, blasting powder, tubes) and bars (smelting) are
//   opened up. Weight of a unit: gathered 1 (ore, stone, cloth, herbs,
//   dust), rare ores 4, essences 3, shards 8, elementals 6, gems and other drops 5;
//   vendor items by their price (VENDOR_COPPER a unit).
// - Character level of a step: the rank it needs, and when its materials
//   show up (their item level, ITEM_LEVEL_LEAD before; the client's tables).
//
//   node scripts/build-prof-plan.js
//
// Writes data/prof-plan.json.
const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./lib/csv');
const { readJSON, writeJSON } = require('./lib/files');
const RECIPES = require('./lib/recipes');

const PROFS = ['blacksmithing', 'tailoring', 'engineering', 'alchemy', 'enchanting'];
const KEEP = 1.25;
// A recipe stays at least this many points (no 2-point steps).
const MIN_SPAN = 5;
// Past this weight per point (a few rare drops for every point), the
// trainer's recipes don't level it: the plan stops there.
const MAX_PER_POINT = 25;
// Ores of rare veins (silver, gold, truesilver): a unit weighs this.
const RARE = { 2775: 4, 2776: 4, 7911: 4 };
const VENDOR_COPPER = 200;
const ITEM_LEVEL_LEAD = 5;
// Skill caps of the ranks and the character level each needs.
const RANKS = [[75, 1], [150, 10], [225, 20], [300, 35]];
// Smelting (Mining): a bar from its ore; Bronze from copper and tin, Steel from iron and coal.
const SMELT = {
  2840: [[2770, 1]], 3576: [[2771, 1]], 2842: [[2775, 1]], 3575: [[2772, 1]], 3577: [[2776, 1]],
  3860: [[3858, 1]], 6037: [[7911, 1]], 12359: [[10620, 1]],
  2841: [[2840, 0.5], [3576, 0.5]], 3859: [[3575, 1], [3857, 1]]
};
// Sold by vendors besides what the addon saw at them (fluxes, vials, coal, rods, threads, dyes).
const VENDOR_EXTRA = { 2880: 100, 3466: 2000, 3371: 20, 3372: 200, 8925: 1000, 18256: 2000, 3857: 500, 6217: 124, 2320: 10, 2321: 100, 4291: 500, 8343: 2000, 14341: 5000, 2324: 25, 2604: 50, 2605: 100, 6260: 50, 6261: 100, 2325: 1000, 4340: 350, 4342: 2500, 4341: 500, 10290: 2500, 4470: 38, 4399: 200, 4400: 2000, 2678: 10, 3713: 160, 4289: 50 };

(async () => {
  const meta = readJSON('data/meta.json');
  const build = meta.items.build;
  const dir = path.join(__dirname, '..', '.cache', 'wago', build);
  // The client tables other scripts fetched (build-skinning.js, build-items.js): without them, the last file stays.
  if (!['ItemSparse', 'Item'].every(n => fs.existsSync(path.join(dir, n + '.csv')))) {
    console.log('Subir profesiones: sin las tablas del cliente ' + build + '; queda data/prof-plan.json como estaba.');
    return;
  }
  const csv = name => parseCSV(fs.readFileSync(path.join(dir, name + '.csv'), 'utf8'));
  const sparse = new Map(csv('ItemSparse').map(r => [Number(r.ID), r]));
  const kind = new Map(csv('Item').map(r => [Number(r.ID), [Number(r.ClassID), Number(r.SubclassID)]]));
  const recipes = readJSON('data/recipes.json').professions;
  const R = RECIPES.open();

  // Vendor prices: what the addon saw at vendors (data/ingame-scan.json), and the rest.
  const vendor = new Map(Object.entries(VENDOR_EXTRA).map(([id, p]) => [Number(id), p]));
  const scan = readJSON('data/ingame-scan.json', {});
  [scan.vendors, scan.goods].forEach(list => Object.values(list || {}).forEach(v => Object.entries(v.list || {}).forEach(([id, e]) => {
    if (e.price) vendor.set(Number(id), Math.min(e.price, vendor.get(Number(id)) || Infinity));
  })));

  const weight = id => {
    if (vendor.has(id)) return vendor.get(id) / VENDOR_COPPER;
    if (RARE[id]) return RARE[id];
    const [c, s] = kind.get(id) || [];
    const name = (sparse.get(id) || {}).Display_lang || '';
    if (c === 7 && s === 12) return /Essence/.test(name) ? 3 : /Shard/.test(name) ? 8 : 1;
    if (c === 7 && [5, 7, 9].includes(s)) return 1;
    if (c === 7 && s === 6) return 1.5;
    if (c === 7 && s === 10) return 6;
    return 5;
  };
  const ilvl = id => Number((sparse.get(id) || {}).ItemLevel) || 1;
  const nameOf = id => (sparse.get(id) || {}).Display_lang || String(id);
  // Where a raw material comes from: m mining, h herbalism, s skinning, c cloth (humanoids), d disenchanting, v vendor, o other.
  const whence = id => {
    if (vendor.has(id)) return 'v';
    const [c, s] = kind.get(id) || [];
    if (c !== 7) return 'o';
    return { 7: 'm', 9: 'h', 6: 's', 5: 'c', 12: 'd' }[s] || 'o';
  };

  const out = {};
  const used = new Set();
  for (const prof of PROFS) {
    const Prof = prof[0].toUpperCase() + prof.slice(1);
    const list = Object.values(recipes[prof]).filter(r => r.mats && r.mats.length && r.skill && r.skill.every(x => x != null) && r.skill[0] <= 300)
      .filter(r => (r.itemId ? R.learn(Prof, r.itemId, r.name) : RECIPES.learnOf(r.source)).type === 'trainer');
    const makes = new Map(list.filter(r => r.itemId).map(r => [r.itemId, r]));
    // A craft's materials down to raw ones: { id: n }.
    const rawMemo = new Map();
    const raw = (r, depth = 0) => {
      const key = r.itemId || r.name;
      if (rawMemo.has(key)) return rawMemo.get(key);
      const acc = {};
      const add = (id, n, d) => {
        const sub = makes.get(id);
        if (sub && d < 4 && sub !== r) {
          const k = (sub.made || 1);
          Object.entries(raw(sub, d + 1)).forEach(([m, x]) => add(Number(m), x * n / k, 99));
        } else if (SMELT[id] && d < 6) SMELT[id].forEach(([m, x]) => add(m, x * n, d + 1));
        else acc[id] = (acc[id] || 0) + n;
      };
      r.mats.forEach(([id, n]) => add(id, n, depth));
      rawMemo.set(key, acc);
      return acc;
    };
    const cost = r => Object.entries(raw(r)).reduce((s, [id, n]) => s + weight(Number(id)) * n, 0);
    const chance = (r, s) => (s < r.skill[0] ? 0 : s < r.skill[1] ? 1 : s >= r.skill[3] ? 0 : (r.skill[3] - s) / (r.skill[3] - r.skill[1]));
    const perPoint = (r, s) => { const c = chance(r, s); return c > 0 ? cost(r) / c : Infinity; };

    // Skill 1 to 300, one point at a time.
    const steps = [];
    let cur = null;
    for (let s = 1; s < 300; s++) {
      let best = null;
      list.forEach(r => { const v = perPoint(r, s); if (v < Infinity && (!best || v < best.v)) best = { r, v }; });
      if (!best || best.v > MAX_PER_POINT) break;
      const keep = cur && chance(cur.r, s) > 0 && (s - cur.from < MIN_SPAN || perPoint(cur.r, s) <= best.v * KEEP);
      const r = keep ? cur.r : best.r;
      // At a rank's cap you go back to the trainer: a new step, even with the same recipe.
      if (!keep || RANKS.some(([cap]) => cap === s)) steps.push(cur = { r, from: s, to: s, crafts: 0 });
      cur.crafts += 1 / chance(r, s);
      cur.to = s + 1;
    }
    let atLeast = 1;
    out[prof] = steps.map(st => {
      const per = raw(st.r);
      const mats = Object.entries(per).map(([id, n]) => [Number(id), Math.round(n * st.crafts * 10) / 10]).sort((a, b) => weight(b[0]) * b[1] - weight(a[0]) * a[1]);
      mats.forEach(([id]) => used.add(id));
      if (st.r.itemId) used.add(st.r.itemId);
      // Intermediates of the same profession it takes (bolts, powders, tubes).
      const also = st.r.mats.filter(([id]) => makes.has(id)).map(([id, n]) => { used.add(id); return [id, Math.round(n * st.crafts)]; });
      const rank = RANKS.find(([cap]) => st.from < cap);
      const matLevel = Math.max(1, ...mats.filter(([id]) => whence(id) !== 'v').map(([id]) => ilvl(id) - ITEM_LEVEL_LEAD));
      return {
        id: st.r.itemId || null, name: st.r.name, icon: st.r.icon || null, skill: st.r.skill, from: st.from, to: st.to,
        crafts: Math.ceil(st.crafts), mats, also: also.length ? also : undefined,
        // Never earlier than the step before it (you level the skill in order).
        level: atLeast = Math.max(atLeast, rank[1], matLevel)
      };
    });
  }
  const items = {};
  [...used].sort((a, b) => a - b).forEach(id => { items[id] = { n: nameOf(id), w: whence(id) }; });
  writeJSON('data/prof-plan.json', {
    _readme: 'Written by scripts/build-prof-plan.js. For each crafting profession but Leatherworking: steps from skill 1 to 300 (trainer recipe, skill range, crafts, raw materials in all, character level from). items: name and where it comes from (m mining, h herbalism, s skinning, c cloth, d disenchanting, v vendor, o other).',
    sources: { recipes: 'https://classicwowforever.com/professions/', items: 'https://wago.tools/db2/ItemSparse' },
    professions: out, items
  });
  Object.entries(out).forEach(([p, st]) => console.log(p + ': ' + st.length + ' pasos, ' + st.reduce((s, x) => s + x.crafts, 0) + ' crafteos'));
})().catch(e => { console.error(e.stack); process.exit(1); });
