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

const shaman = read('data/shaman.json');
write('data/shaman.js', 'SHAMAN_DATA', shaman);

const guides = {};
['enhancement', 'elemental', 'restoration', 'overview'].forEach(f => {
  const g = read('data/guides/' + f + '.json');
  guides[g.spec || 'Overview'] = g;
});
write('data/guides.js', 'GUIDE_DATA', guides);

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
console.log('OK: data/shaman.js, data/guides.js, data/builds.js');
