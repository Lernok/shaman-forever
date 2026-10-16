// Regenerates the data/*.js bundles (window globals, so index.html works from
// file:// without fetch) from their JSON sources, and refuses to write builds
// that break the talent rules.
//
//   node scripts/build-data.js
const fs = require('fs');
const path = require('path');
const rules = require('../js/talent-rules.js');

const root = path.join(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const write = (rel, globalName, data) =>
  fs.writeFileSync(path.join(root, rel), 'window.' + globalName + ' = ' + JSON.stringify(data) + ';\n');

// Every prose field we write ourselves must be { es, en } with both filled in.
// Game names (talents, spells, races, stats) stay in English and are plain strings.
const PROSE_KEYS = new Set(['note', 'fact', 'detail', 'change', 'summary', 'role', 'caveat', 'name', 'case', 'event', 'date',
  'rationale', 'status', 'statement', 'baseline', 'recommendation', 'rank', 'classic', 'forever']);
const PROSE_LISTS = new Set(['level30', 'level60', 'priority', 'keyTalents']);
const langErrors = [];
// GLOSARIO.md: English words that must not appear in Spanish prose (game proper
// nouns are stripped first, so "Nature's Swiftness" or "Spirit Weapons" are fine).
// "caster" is allowed jargon; text inside double quotes is a literal citation.
const SPANGLISH = /\b(spell power|cast(?!er)\w*|critea\w*|melee|root|slow|parry|dodge|hit|haste|stamina|yardas|yd|regen|cooldown|pool|resete\w*|capad[oa]s?|reworke\w*)\b/i;
let properNouns = [];
function checkSpanish(text, where) {
  let stripped = text.replace(/"[^"]*"|“[^”]*”/g, ' ');
  properNouns.forEach(n => { stripped = stripped.split(n).join(' '); });
  const m = stripped.match(SPANGLISH);
  if (m) langErrors.push(where + ': "' + m[0] + '" en el texto en español (ver GLOSARIO.md)');
}
function checkLang(v, where, key) {
  if (typeof v === 'string') {
    if (PROSE_KEYS.has(key)) langErrors.push(where + ': texto sin traducir (debe ser { es, en })');
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      if (PROSE_LISTS.has(key) && typeof x === 'string') langErrors.push(where + '[' + i + ']: texto sin traducir');
      else checkLang(x, where + '[' + i + ']', key);
    });
    return;
  }
  if (!v || typeof v !== 'object') return;
  if ('es' in v || 'en' in v) {
    ['es', 'en'].forEach(l => {
      if (typeof v[l] !== 'string' || !v[l].trim()) langErrors.push(where + ': falta "' + l + '"');
    });
    if (typeof v.es === 'string') checkSpanish(v.es, where);
    return;
  }
  for (const k in v) checkLang(v[k], where + '.' + k, k);
}

const shaman = read('data/shaman.json');
// Icons talentsforever names that the icon CDN (wow.zamimg.com) doesn't have.
const ICON_FIX = { race_skyborne: 'race_skyborne_male' };
Object.values(shaman.racials).flat().forEach(r => { if (ICON_FIX[r.icon]) r.icon = ICON_FIX[r.icon]; });
write('data/shaman.js', 'SHAMAN_DATA', shaman);
// Longest first, so "Nature's Swiftness" is removed before a shorter name inside it.
properNouns = [
  ...shaman.talents.trees.flatMap(t => t.talents.map(x => x.name).concat((t.removed || []).map(x => x.name))),
  ...Object.keys(shaman.spell_desc).map(k => k.split('|')[1]),
  ...Object.values(shaman.racials).flat().flatMap(r => [r.race].concat(r.abilities.map(a => a[0])))
].filter((n, i, a) => n && a.indexOf(n) === i).sort((a, b) => b.length - a.length);

const guides = {};
['enhancement', 'elemental', 'restoration', 'overview', 'professions'].forEach(f => {
  const g = read('data/guides/' + f + '.json');
  guides[g.spec || 'Overview'] = g;
});
Object.keys(guides).forEach(k => checkLang(guides[k], 'guides/' + k, ''));
const news = read('data/news.json');
news.site.forEach((e, i) => checkLang(e, 'news/' + i, ''));
read('data/builds.json').builds.forEach(b => checkLang(b, 'builds/' + b.id, ''));
if (langErrors.length) {
  console.error(langErrors.join('\n') + '\n\nTextos sin los dos idiomas: no se generó nada.');
  process.exit(1);
}
write('data/guides.js', 'GUIDE_DATA', guides);
write('data/news.js', 'NEWS_DATA', { site: news.site, data: read('data/changelog.json').entries });

// ---------- client text templates (GLOSARIO.md, section 4) ----------
// Every text that comes from the game client must have a Spanish template; a
// template must use each number of the English text exactly once ({0}, {1}…)
// and must not contain digits of its own, so no number can be lost or invented.
const NUM = /\d+(?:[.,]\d+)*/g;
const clientTemplates = read('data/i18n/client-es.json').templates;
const clientErrors = [];
const clientTexts = new Map();
const addClient = (text, where) => { if (text && !clientTexts.has(text)) clientTexts.set(text, where); };
shaman.talents.trees.forEach(tree => tree.talents.forEach(t => {
  t.desc.forEach(d => addClient(d, 'talent ' + t.name));
  if (t.classic && t.classic.text) addClient(t.classic.text, 'talent ' + t.name + ' (Classic)');
  if (t.cost) t.cost.split(' | ').forEach(c => addClient(c, 'talent ' + t.name + ' (costo)'));
}));
Object.entries(shaman.spell_desc).forEach(([key, v]) => {
  addClient(v.d, key);
  addClient(v.cd, key + ' (Classic)');
  [...(v.l || []), ...(v.cl || [])].flat().forEach(c => addClient(c, key + ' (costo)'));
});
Object.values(shaman.racials).flat().filter(r => r.classes.includes('Shaman'))
  .forEach(r => r.abilities.forEach(a => addClient(a[1], 'racial ' + a[0])));
const usedTemplates = new Set();
clientTexts.forEach((where, text) => {
  const skeleton = text.replace(NUM, '#');
  const tpl = clientTemplates[skeleton];
  if (tpl == null) { clientErrors.push(where + ': falta plantilla para "' + skeleton + '"'); return; }
  usedTemplates.add(skeleton);
  const n = (text.match(NUM) || []).length;
  const idx = (tpl.match(/\{(\d+)\}/g) || []).map(m => Number(m.slice(1, -1)));
  const ok = idx.length === n && new Set(idx).size === n && idx.every(i => i < n);
  if (!ok) clientErrors.push(where + ': la plantilla usa {' + idx.join(',') + '} pero el texto tiene ' + n + ' números');
  if (/\d/.test(tpl.replace(/\{\d+\}/g, ''))) clientErrors.push(where + ': la plantilla tiene dígitos propios');
});
Object.keys(clientTemplates).filter(k => !usedTemplates.has(k))
  .forEach(k => clientErrors.push('plantilla sin uso (¿cambió el texto del cliente?): "' + k + '"'));
if (clientErrors.length) {
  console.error(clientErrors.join('\n') + '\n\nTextos del cliente sin plantilla válida: no se generó nada.');
  process.exit(1);
}
write('data/client-es.js', 'CLIENT_ES', clientTemplates);

const trees = shaman.talents.trees;
const { builds } = read('data/builds.json');
let failed = false;
const seen = new Set();
builds.forEach(b => {
  const errors = [];
  // talentsforever.com build codes use the same digit layout as ours.
  if (b.code) {
    if (/[^0-9-]/.test(b.code)) errors.push('code con caracteres inválidos: ' + b.code);
    const decoded = rules.decode(b.code, trees);
    if (b.points && rules.encode(b.points, trees) !== rules.encode(decoded, trees)) errors.push('points y code no coinciden');
    b.points = decoded;
  }
  if (!b.points) errors.push('sin points ni code');
  // Replay the leveling order one point at a time: each point must be legal at
  // the level it is placed, and the order must land exactly on the build.
  if (b.order) {
    let ranks = {};
    let level = null;
    rules.orderPoints(b.order).forEach(p => {
      const tree = trees.find(t => t.name === p.tree);
      const talent = tree && tree.talents.find(t => t.name === p.talent);
      if (!talent) { errors.push('order: talento desconocido ' + p.tree + '/' + p.talent); return; }
      if (level !== null && p.level !== level + 1) errors.push('order: salto de nivel ' + level + ' → ' + p.level);
      level = p.level;
      if (rules.rankOf(ranks, tree, talent.name) !== p.rank - 1) {
        errors.push('order: ' + talent.name + ' pasa a ' + p.rank + ' pero estaba en ' + rules.rankOf(ranks, tree, talent.name));
      } else if (!rules.canAdd(ranks, trees, tree, talent, p.level, 0)) {
        errors.push('order: nivel ' + p.level + ', ' + talent.name + ' ' + p.rank + '/' + talent.max + ' no se puede poner: ' +
          (rules.lockReason(ranks, tree, talent) || 'sin puntos disponibles'));
      }
      ranks = rules.withRank(ranks, tree, talent, p.rank);
    });
    const atLevel = rules.ranksAtLevel(b.order, b.level);
    if (b.points && rules.encode(atLevel, trees) !== rules.encode(b.points, trees)) {
      errors.push('order al nivel ' + b.level + ' no coincide con points');
    }
  }
  errors.push(...rules.validate(b.points || {}, trees, b.level));
  if (seen.has(b.id)) errors.push('id repetido');
  seen.add(b.id);
  const total = rules.totalPoints(b.points, trees);
  if (errors.length) {
    failed = true;
    console.error('✗ ' + b.id + ' (' + total + ' pts)\n    ' + errors.join('\n    '));
  } else {
    const split = trees.map(t => rules.treePoints(b.points, t)).join('/');
    console.log('✓ ' + b.id + ' — ' + split + ' (' + total + '/' + rules.pointsForLevel(b.level) + ' pts)' +
      (b.order ? ', orden reproducido punto por punto' : ''));
  }
});
if (failed) {
  console.error('\nBuilds inválidos: data/builds.js no se actualizó.');
  process.exit(1);
}
write('data/builds.js', 'BUILD_DATA', builds);

// Sync outputs (scripts/sync.js); the site works without them. data/items.json
// is only an input of the build steps (the pages read what they build).
const outputs = ['data/shaman.js', 'data/guides.js', 'data/news.js', 'data/builds.js', 'data/client-es.js'];
// Camp object of each profession (hand-curated, cited).
const camp = read('data/camp.json');
Object.keys(camp.objects).forEach(k => checkLang(camp.objects[k], 'camp/' + k, ''));
write('data/camp.js', 'CAMP_DATA', camp);
outputs.push('data/camp.js');
if (fs.existsSync(path.join(root, 'data/consumables.json'))) {
  write('data/consumables.js', 'CONSUMABLE_DATA', read('data/consumables.json'));
  outputs.push('data/consumables.js');
}
if (fs.existsSync(path.join(root, 'data/professions.json'))) {
  write('data/professions.js', 'PROFESSION_DATA', read('data/professions.json'));
  outputs.push('data/professions.js');
}
// Quests only some races can take (scripts/quest-races.js): on each source.
const questRaces = fs.existsSync(path.join(root, 'data/quest-races.json')) ? read('data/quest-races.json').quests : {};
const withRaces = items => items.forEach(i => i.sources.forEach(s => { if (s.type === 'quest' && questRaces[s.questId]) s.races = questRaces[s.questId]; }));
if (fs.existsSync(path.join(root, 'data/weapons.json'))) {
  const w = read('data/weapons.json');
  withRaces(w.weapons);
  write('data/weapons.js', 'WEAPON_DATA', w);
  outputs.push('data/weapons.js');
}
// The gear path (js/gear-plan.js) only recommends what you can plan for: a
// quest, a craft, a vendor or a dungeon/NPC drop, never raids, PvP ranks or
// unknown sources; the page gets just those pieces, only the ones some spec
// can use (GearPlan.value), and the fields it reads. Totems with an effect
// stay whatever their source: the page lists every one before 60.
if (fs.existsSync(path.join(root, 'data/gear.json'))) {
  const g = read('data/gear.json');
  withRaces(g.gear);
  require('../js/gear-plan.js');
  const GP = globalThis.GearPlan;
  const SPECS = Object.keys(GP.WEIGHTS);
  const SRC = ['type', 'quest', 'zone', 'dungeon', 'dungeonZone', 'faction', 'races', 'rec', 'profession', 'yellow', 'npc'];
  const plannable = s => ['quest', 'crafted', 'vendor', 'boss', 'drop'].includes(s.type) && !s.raid && !s.pvp;
  const pick = (o, keys) => { const out = {}; keys.forEach(k => { if (o[k] != null) out[k] = o[k]; }); return out; };
  const source = s => {
    const out = pick(s, SRC);
    if (out.faction === 'both') delete out.faction; // no faction = both
    if (s.learn) out.learn = pick(s.learn, ['type', 'favor']);
    return out;
  };
  const totem = i => i.slot === 'Relic' && (i.equip || []).length && (i.req || 0) < 60;
  const gear = g.gear.filter(i => i.slot && (totem(i) || SPECS.some(spec => GP.value(i, spec) > 0))).map(i => {
    const out = pick(i, ['id', 'name', 'kind', 'slot', 'quality', 'req', 'ilvl', 'bind', 'armor', 'stats', 'bonus', 'equip', 'use', 'icon']);
    if (i.raceMask > 0) out.raceMask = i.raceMask;
    ['stats', 'bonus'].forEach(k => { if (out[k] && !Object.keys(out[k]).length) delete out[k]; });
    ['equip', 'use'].forEach(k => { if (out[k] && !out[k].length) delete out[k]; });
    out.sources = (totem(i) ? i.sources : i.sources.filter(plannable)).map(source);
    return out;
  }).filter(i => i.sources.length);
  write('data/gear.js', 'GEAR_DATA', { build: g.build, gear });
  outputs.push('data/gear.js');
}
if (fs.existsSync(path.join(root, 'data/zones.json'))) {
  write('data/zones.js', 'ZONE_DATA', read('data/zones.json'));
  outputs.push('data/zones.js');
}
if (fs.existsSync(path.join(root, 'data/meta.json'))) {
  write('data/meta.js', 'SITE_META', read('data/meta.json'));
  outputs.push('data/meta.js');
}
// index.html asks for each script and stylesheet with a version made from its
// contents: after a deploy, browsers (and GitHub Pages' 10-minute cache)
// never mix a new page with an old script.
{
  const crypto = require('crypto');
  const file = path.join(root, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const versioned = html.replace(/((?:src|href)="((?:js|data|css)\/[^"?]+))(\?v=[0-9a-f]+)?"/g, (m, attr, rel) => {
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) return m;
    return attr + '?v=' + crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8) + '"';
  });
  if (versioned !== html) fs.writeFileSync(file, versioned);
}
console.log('OK: ' + outputs.join(', '));

// Generated data must pass its checks (exits with an error otherwise).
require('./check-data');
