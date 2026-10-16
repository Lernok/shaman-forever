// Polestar talent plan for Shamans (its talents/forever/<class>.json format:
// one pick per level, tree, talent, rank) from the site's leveling orders
// (data/builds.json, talentsforever.com community orders, CC BY 4.0).
//
//   node planner/talents-for-polestar.js <polestar checkout>
// writes <checkout>/talents/forever/shaman.json; then, in the checkout,
// `node tools/polestar.js talents build` (with SHAMAN in tools/lib/talents/
// build.js CLASSES: skill line 373).
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) { console.error('usage: node planner/talents-for-polestar.js <polestar checkout>'); process.exit(1); }
const root = path.join(__dirname, '..');
const rules = require(path.join(root, 'js', 'talent-rules.js'));
const { builds } = JSON.parse(fs.readFileSync(path.join(root, 'data', 'builds.json'), 'utf8'));
const shaman = JSON.parse(fs.readFileSync(path.join(root, 'data', 'shaman.json'), 'utf8'));

const NOTES = {
  Enhancement: 'Enhancement levels fastest: a two-hander, Stormstrike and self-healing between pulls.',
  Elemental: 'Elemental levels at range; since the October 15 patch Lava Burst comes at 21 points.',
  Restoration: 'Restoration levels slower but heals any dungeon on the way.',
};
const plan = {
  class: 'SHAMAN',
  source: 'Shaman: Forever',
  sourceUrl: 'https://lernok.github.io/shaman-forever/#Talentos',
  credit: 'Leveling orders from talentsforever.com community builds (CC BY 4.0), via Shaman: Forever (https://lernok.github.io/shaman-forever/).',
  checkedOn: 'WoW: Forever beta ' + ((shaman.talents.source.match(/build (\S+)/) || [])[1] || '?'),
  summary: 'Level as Enhancement (two-hander, Stormstrike, self-healing) or Elemental (ranged nukes); Restoration levels slower but heals dungeons.',
  order: ['Elemental', 'Enhancement', 'Restoration'],
  builds: [],
};
for (const spec of ['Elemental', 'Enhancement', 'Restoration']) {
  const b = builds.filter((x) => x.spec === spec && x.order).sort((a, c) => c.level - a.level)[0];
  if (!b) continue;
  const picks = rules.orderPoints(b.order).map((p, i) => Object.assign({ level: p.level, tree: p.tree, talent: p.talent, rank: p.rank }, i === 0 ? { note: NOTES[spec] } : {}));
  const spent = { Elemental: 0, Enhancement: 0, Restoration: 0 };
  picks.forEach((p) => { spent[p.tree]++; });
  plan.builds.push({ key: spec.toLowerCase(), spec, split: `${spent.Elemental}/${spent.Enhancement}/${spent.Restoration}`, picks });
}
const file = path.join(out, 'talents', 'forever', 'shaman.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(plan, null, '\t') + '\n');
console.log(`${file}: ${plan.builds.map((b) => `${b.spec} ${b.split} (${b.picks.length} picks)`).join(', ')}`);
