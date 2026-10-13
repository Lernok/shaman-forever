// How each crafted item's recipe is learned (data/recipes.json, from
// scripts/fetch-recipes.js), shared by build-professions.js and the gear
// sources (lib/item-sources.js).
const { readJSON } = require('./files');

// "Pattern for 30 Merchant’s Favor: …", "Trainer, 50c, learn at 15",
// "Known from the start", "Pattern: <drop or vendor>".
function learnOf(source) {
  if (!source) return { type: 'unknown', text: null };
  const out = { type: 'drop', text: source }; // "Pattern/Plans/Schematic/Formula: <drop or vendor>"
  const favor = source.match(/(\d+) Merchant.s Favor/);
  if (favor) Object.assign(out, { type: 'favor', favor: Number(favor[1]) });
  else if (/^Trainer|Known from the start/.test(source)) out.type = 'trainer';
  else if (/, (Friendly|Honored|Revered|Exalted)|needs reputation/.test(source)) out.type = 'reputation';
  else if (/Source not found yet/.test(source)) out.type = 'unknown';
  const at = source.match(/learn at (\d+)/);
  if (at) out.learnAt = Number(at[1]);
  return out;
}

function open() {
  const recipes = readJSON('data/recipes.json', { professions: {} });
  // By the crafted item's id: names repeat between Classic and new Forever recipes.
  const recipe = (profession, id, name) => {
    const list = recipes.professions[profession.toLowerCase()] || {};
    return list['item:' + id] || (name && list[name]) || null;
  };
  return { recipes, recipe, learn: (profession, id, name) => { const r = recipe(profession, id, name); return r ? learnOf(r.source) : learnOf(null); } };
}

module.exports = { open, learnOf };
