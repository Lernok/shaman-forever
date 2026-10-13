// Builds data/professions.json: every crafted item a Shaman can use (from the
// client recipe tables, via data/items.json) joined with how its recipe is
// learned and its skill range (data/recipes.json, from scripts/fetch-recipes.js).
//
//   node scripts/build-professions.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { build, items } = JSON.parse(fs.readFileSync(path.join(root, 'data/items.json'), 'utf8'));
const recipesFile = path.join(root, 'data/recipes.json');
const recipes = fs.existsSync(recipesFile) ? JSON.parse(fs.readFileSync(recipesFile, 'utf8')) : { professions: {} };

// How the recipe is learned, as a type plus the original text.
function learnType(source) {
  if (!source) return 'unknown';
  if (/Merchant.s Favor/.test(source)) return 'favor';
  if (/^Trainer|Known from the start/.test(source)) return 'trainer';
  if (/, (Friendly|Honored|Revered|Exalted)|needs reputation/.test(source)) return 'reputation';
  if (/Source not found yet/.test(source)) return 'unknown';
  return 'drop'; // "Pattern/Plans/Schematic/Formula: <drop or vendor>"
}

const CASTER = ['intellect', 'spirit', 'spellPower', 'healing', 'mp5'];
const MELEE = ['strength', 'agility', 'attackPower', 'crit', 'hit'];
const has = (i, keys) => keys.some(k => (i.stats && i.stats[k]) || (i.bonus && i.bonus[k]));

const out = {};
let matched = 0;
let total = 0;
Object.values(items).filter(i => i.crafted).forEach(i => {
  const prof = i.crafted.profession;
  const r = (recipes.professions[prof.toLowerCase()] || {})[i.name];
  total++;
  if (r) matched++;
  out[prof] = out[prof] || [];
  out[prof].push({
    id: i.id, name: i.name, kind: i.kind, quality: i.quality, req: i.req, ilvl: i.ilvl, bind: i.bind,
    stats: i.stats || {}, bonus: i.bonus || {}, armor: i.armor || null, dps: i.dps || null, speed: i.speed || null,
    era: i.era, numbers: i.numbers || 'forever', icon: i.icon || null, equip: i.equip || [],
    role: has(i, CASTER) && has(i, MELEE) ? 'hybrid' : has(i, CASTER) ? 'caster' : has(i, MELEE) ? 'melee' : 'other',
    // Shamans train Mail at 40.
    mailFrom40: i.kind === 'Mail' && i.req < 40,
    skill: r ? r.skill : [i.crafted.yellow, i.crafted.yellow, null, i.crafted.grey],
    learn: r ? { type: learnType(r.source), text: r.source } : { type: 'unknown', text: null },
    isNew: r ? r.isNew : i.era === 'new'
  });
});
Object.values(out).forEach(list => list.sort((a, b) => a.req - b.req || a.name.localeCompare(b.name)));
fs.writeFileSync(path.join(root, 'data/professions.json'),
  JSON.stringify({ build, recipesSource: recipes.source || null, recipesFetched: recipes.fetched || null, professions: out }, null, 1) + '\n');
console.log('Crafteos usables por Shaman: ' + total + ' · con fuente de receta: ' + matched +
  ' · ' + Object.entries(out).map(([p, l]) => p + ' ' + l.length).join(', '));
