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

const coin = c => ((c >= 10000 ? Math.floor(c / 10000) + 'g ' : '') + (c % 10000 >= 100 ? Math.floor(c % 10000 / 100) + 's ' : '') + (c % 100 ? c % 100 + 'c' : '')).trim() || '0c';

function open() {
  const recipes = readJSON('data/recipes.json', { professions: {} });
  // New recipes whose pattern isn't handed out yet (scripts/recipe-patterns.js).
  const unreleased = readJSON('data/recipe-patterns.json', { unreleased: {} }).unreleased;
  // What profession trainers teach in the game (the addon's scan,
  // scripts/import-scan.js): it beats the web data, which gives some of
  // Forever's trainer recipes as a vendor pattern of the other faction.
  const taught = new Map();
  for (const t of Object.values(readJSON('data/ingame-scan.json', { trainers: {} }).trainers)) {
    for (const e of Object.values(t.list || {})) {
      if (e.item && e.prof) taught.set(e.prof.toLowerCase() + ':' + e.item, { cost: e.cost || 0, skill: e.skill || 0 });
    }
  }
  // By the crafted item's id: names repeat between Classic and new Forever recipes.
  const recipe = (profession, id, name) => {
    const list = recipes.professions[profession.toLowerCase()] || {};
    return list['item:' + id] || (name && list[name]) || null;
  };
  const learn = (profession, id, name, spell) => {
    const r = recipe(profession, id, name);
    const seen = taught.get(profession.toLowerCase() + ':' + id);
    if (seen) return { type: 'trainer', text: 'Trainer, ' + coin(seen.cost) + ', learn at ' + seen.skill + ' (seen in game)', learnAt: seen.skill };
    const out = r ? learnOf(r.source) : learnOf(null);
    // The skill it's learned at (orange), when the source text doesn't say it.
    if (r && r.skill && r.skill[0] != null && out.learnAt == null) out.learnAt = r.skill[0];
    if (spell && unreleased[spell] && (out.type === 'unknown' || out.type === 'trainer')) return { type: 'unreleased', text: null, pattern: unreleased[spell] };
    return out;
  };
  return { recipes, recipe, learn };
}

module.exports = { open, learnOf };
