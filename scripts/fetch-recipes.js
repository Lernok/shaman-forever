// Recipe acquisition (trainer / Merchant's Favor pattern / reputation / drop)
// and skill ranges for every crafting profession, from classicwowforever.com's
// recipe lists (which cite Wowhead Forever and the Daybreak Forever datamine).
// The client tables don't say how a recipe is learned, so this fills that gap.
//
//   node scripts/fetch-recipes.js          (pages cached in .cache/cwf/, 1 req/s)
//
// Writes data/recipes.json: { profession: { 'item:<id>' (or the recipe's name): { name, itemId, icon, slot, ilvl, skill:[orange,yellow,green,grey], source, isNew, mats } } }
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');
const PROFESSIONS = ['leatherworking', 'blacksmithing', 'tailoring', 'enchanting', 'engineering', 'alchemy'];

// Each page embeds its recipes as objects ({"spell":…,"name":…,"learn":35,
// "yellow":40,…,"how":"Trainer, …","itemId":…}); they carry the crafted
// item's id, which tells apart a new Forever recipe from a Classic one with
// the same name (two "Dark Leather Boots": a new rare from an Ironforge
// vendor, and the old trainer one).
const RECIPE = /\{"spell":\d+,"name":"(?:[^"\\]|\\.)*"(?:[^{}\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\}/g;
function parsePage(html) {
  const text = html.replace(/\\"/g, '"');
  const out = [];
  for (const m of text.matchAll(RECIPE)) {
    let r;
    try { r = JSON.parse(m[0]); } catch (e) { continue; }
    const ilvl = /ilvl (\d+)/.exec(r.item || '');
    out.push({ name: r.name, itemId: r.itemId || null, icon: r.icon || null, slot: r.slot || null, ilvl: ilvl ? Number(ilvl[1]) : null,
      skill: [r.learn, r.yellow, r.green, r.grey].map(n => (n == null ? null : Number(n))), source: r.how || '', isNew: !!r.isNew,
      // Reagents as [item, count] (for the leveling plan: what a skill-up costs).
      mats: Array.isArray(r.mats) ? r.mats.map(([id, n]) => [Number(id), Number(n)]) : [] });
  }
  return out;
}

// Kept for a month: recipe lists change slowly (pass --offline to rebuild from cache).
const page = (prof, n) => http.get('https://classicwowforever.com/professions/' + prof + '/recipes/' + (n > 1 ? '?page=' + n : ''),
  { cache: 'cwf/' + prof + '-' + n + '.html', maxAgeDays: 30, valid: t => /<html/i.test(t) }).then(t => {
  if (t == null && n === 1) throw new Error('sin la página 1 de ' + prof);
  return t;
});

(async () => {
  const result = {};
  for (const prof of PROFESSIONS) {
    result[prof] = {};
    // Pages until one brings no recipe we didn't have.
    const seen = new Set();
    for (let n = 1; n <= 30; n++) {
      const html = await page(prof, n);
      if (html == null) break; // past the last page
      const list = parsePage(html);
      const fresh = list.filter(r => !seen.has(r.name + '|' + r.itemId));
      if (!fresh.length) break;
      fresh.forEach(r => {
        seen.add(r.name + '|' + r.itemId);
        // By item id when it has one (recipes that make an item), else by name.
        result[prof][r.itemId ? 'item:' + r.itemId : r.name] = r;
      });
    }
    console.log(prof + ': ' + Object.keys(result[prof]).length + ' recetas');
  }
  // The date only moves when the recipes do.
  const prev = readJSON('data/recipes.json', {});
  const same = JSON.stringify(prev.professions) === JSON.stringify(result);
  writeJSON('data/recipes.json', { source: 'https://classicwowforever.com/professions/', fetched: same && prev.fetched ? prev.fetched : new Date().toISOString().slice(0, 10), professions: result });
})().catch(e => { console.error(e.message); process.exit(1); });
