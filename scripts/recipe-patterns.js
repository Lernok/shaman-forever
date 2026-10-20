// New Forever recipes whose pattern is in the client but blank: the pattern
// item exists (Item table, class 9) and teaches the recipe (ItemEffect), but
// has no name or text (no ItemSparse row) and Wowhead Forever doesn't know it,
// while its siblings (the Brawler's belt, gloves, tunic...) are named and sold.
// Blizzard ships them ahead of the content that hands them out, so no one can
// learn them yet; recipe sites guess "trainer" or "source not found". On
// 1.60.1.70450: the Leather Armor / Pants / Helm sets at 15, 20 and 25.
// Classic recipes are left alone: ItemSparse lacks ~40% of all items (the
// server sends them), old patterns included.
//
//   node scripts/recipe-patterns.js [build]     (default: data/meta.json's)
//
// Writes data/recipe-patterns.json: { build, unreleased: { <recipe spell>: <pattern item> } },
// read by lib/recipes.js: such a recipe's learn type is "unreleased".
const { parseCSV } = require('./lib/csv');
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');
const wowhead = require('./lib/wowhead');

const RECIPE_CLASS = '9';
// Every pattern also casts this generic "learning" spell; the recipe is the other one.
const LEARNING = '402265';

(async () => {
  const build = process.argv[2] || readJSON('data/meta.json').items.build;
  const table = async name => {
    const text = await http.get('https://wago.tools/db2/' + name + '/csv?build=' + build,
      { cache: 'wago/' + build + '/' + name + '.csv', valid: t => /^ID,|,ID,/.test(t.slice(0, 2000)) });
    if (text == null) throw new Error('sin la tabla ' + name + ' del build ' + build);
    return parseCSV(text);
  };
  const [items, sparse, effects, links] = await Promise.all(['Item', 'ItemSparse', 'ItemEffect', 'ItemXItemEffect'].map(table));
  const named = new Set(sparse.map(r => r.ID));
  const spellOf = new Map(effects.filter(r => r.SpellID !== LEARNING && r.SpellID !== '0').map(r => [r.ID, r.SpellID]));
  const blank = new Set(items.filter(r => r.ClassID === RECIPE_CLASS && !named.has(r.ID)).map(r => r.ID));
  // New Forever recipes a Shaman could craft (data/items.json).
  const crafted = new Set(Object.values(readJSON('data/items.json').items).filter(i => i.crafted && i.era === 'new').map(i => String(i.crafted.spell)));
  const unreleased = {};
  for (const r of links) {
    const spell = spellOf.get(r.ItemEffectID);
    if (!blank.has(r.ItemID) || !spell || !crafted.has(spell)) continue;
    const tip = await wowhead.item('forever', r.ItemID);
    if (tip == null || /"error"/.test(tip)) unreleased[spell] = Number(r.ItemID);
  }
  const sorted = Object.fromEntries(Object.entries(unreleased).sort((a, b) => a[0] - b[0]));
  writeJSON('data/recipe-patterns.json', { build, unreleased: sorted });
  console.log('Patrones en blanco (todavía no se consiguen): ' + Object.keys(sorted).length);
})().catch(e => { console.error(e.message); process.exit(1); });
