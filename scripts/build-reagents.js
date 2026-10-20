// Where the reagents of the Leatherworking recipes come from, when they are
// neither skinned, nor Leatherworking's own, nor sold by a vendor (scales,
// feathers, gems, pearls, elixirs...), for the "Leatherworking while
// leveling" plan:
//
// - Made by another profession (data/recipes.json): which, at what skill and
//   from what (Forever's Sulfuric Acid and Cerulean Dye are alchemy).
// - Dropped: Wowhead Classic's "Dropped by" tab of each reagent (count / out
//   of, so the chance per kill), with the creature's levels and zones, and
//   whether it's elite; only creatures looted often enough.
// - Gathered: mined from, fished in, found in (clams).
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

(async () => {
  const meta = readJSON('data/meta.json');
  const build = meta.items.build;
  const SK = readJSON('data/skinning.json');
  const recipes = readJSON('data/recipes.json').professions;
  const areas = await http.get('https://wago.tools/db2/AreaTable/csv?build=' + build, { cache: 'wago/' + build + '/AreaTable.csv', valid: t => /^ID,|,ID,/.test(t.slice(0, 2000)) });
  const zoneName = {};
  parseCSV(areas).forEach(r => { zoneName[r.ID] = r.AreaName_lang; });

  // Who makes what, outside Leatherworking.
  const madeBy = new Map();
  for (const [prof, list] of Object.entries(recipes)) {
    if (prof === 'leatherworking') continue;
    for (const r of Object.values(list)) if (r.itemId && !madeBy.has(r.itemId)) madeBy.set(r.itemId, { prof, skill: r.skill[0], mats: r.mats || [] });
  }

  const own = new Set(SK.recipes.map(r => r.id).concat(SK.skin));
  const wanted = new Set();
  SK.recipes.forEach(r => r.mats.forEach(([m]) => { if (!own.has(m)) wanted.add(m); }));

  const items = {};
  let fetched = 0;
  for (const id of [...wanted].sort((a, b) => a - b)) {
    const e = { name: SK.names[id] || null };
    const made = madeBy.get(id);
    if (made) e.craft = { prof: made.prof, skill: made.skill, mats: made.mats };
    const html = await http.get('https://www.wowhead.com/classic/item=' + id, { cache: 'wowhead-classic/item-' + id + '.html', maxAgeDays: 30 });
    if (html) {
      fetched++;
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
      if (Object.keys(gather).length) e.gather = gather;
    }
    items[id] = e;
  }

  writeJSON('data/reagents.json', {
    _readme: 'Written by scripts/build-reagents.js. Reagents of Leatherworking recipes that are not skinned, not Leatherworking-made: craft (another profession), drops (p: chance per kill, l: levels, z: zones), gather, vendor.',
    sources: { drops: 'https://www.wowhead.com/classic/item=5784/slimy-murloc-scale#dropped-by', recipes: 'https://classicwowforever.com/professions/' },
    items
  });
  // The page's copy, beside the skinning data it plans with (data/skinning.json).
  const page = {};
  for (const [id, e] of Object.entries(items)) {
    if (e.vendor) { page[id] = { v: 1 }; continue; }
    const o = {};
    if (e.craft) o.c = [e.craft.prof, e.craft.skill];
    if (e.drops) o.d = e.drops.map(d => [d.n, d.l[0], d.l[1], d.p, d.z, (d.elite ? 1 : 0) + (d.skin ? 2 : 0), d.friend || 0]);
    if (e.gather) o.g = e.gather;
    page[id] = o;
  }
  SK.reagents = page;
  SK.sources.reagents = 'https://www.wowhead.com/classic/item=5784/slimy-murloc-scale#dropped-by';
  writeJSON('data/skinning.json', SK);
  const n = Object.values(items);
  console.log('Reactivos: ' + n.length + ' (' + fetched + ' con página de Wowhead): ' + n.filter(e => e.drops).length + ' caen de bichos, ' +
    n.filter(e => e.craft).length + ' de otra profesión, ' + n.filter(e => e.gather).length + ' se recolectan, ' + n.filter(e => e.vendor).length + ' de vendedor, ' +
    n.filter(e => !e.drops && !e.craft && !e.gather && !e.vendor).length + ' sin fuente');
})().catch(e => { console.error(e.message); process.exit(1); });
