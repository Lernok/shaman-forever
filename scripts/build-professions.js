// Builds data/professions.json: every crafted item a Shaman can use (from the
// client recipe tables, via data/items.json) joined with how its recipe is
// learned and its skill range (data/recipes.json, from scripts/fetch-recipes.js).
//
//   node scripts/build-professions.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { build, items } = JSON.parse(fs.readFileSync(path.join(root, 'data/items.json'), 'utf8'));
const R = require('./lib/recipes').open();
const recipes = R.recipes;

const CASTER = ['intellect', 'spirit', 'spellPower', 'healing', 'mp5'];
const MELEE = ['strength', 'agility', 'attackPower', 'crit', 'hit'];
const has = (i, keys) => keys.some(k => (i.stats && i.stats[k]) || (i.bonus && i.bonus[k]));

const out = {};
let matched = 0;
let total = 0;
Object.values(items).filter(i => i.crafted).forEach(i => {
  const prof = i.crafted.profession;
  const r = R.recipe(prof, i.id, i.name);
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
    learn: R.learn(prof, i.id, i.name, i.crafted.spell),
    isNew: r ? r.isNew : i.era === 'new'
  });
});
Object.values(out).forEach(list => list.sort((a, b) => a.req - b.req || a.name.localeCompare(b.name)));
fs.writeFileSync(path.join(root, 'data/professions.json'),
  JSON.stringify({ build, recipesSource: recipes.source || null, recipesFetched: recipes.fetched || null, professions: out }, null, 1) + '\n');
console.log('Crafteos usables por Shaman: ' + total + ' · con fuente de receta: ' + matched +
  ' · ' + Object.entries(out).map(([p, l]) => p + ' ' + l.length).join(', '));
