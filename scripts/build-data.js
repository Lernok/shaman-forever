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
  const errors = rules.validate(b.points, trees, b.level);
  if (seen.has(b.id)) errors.push('id repetido');
  seen.add(b.id);
  const total = rules.totalPoints(b.points, trees);
  if (errors.length) {
    failed = true;
    console.error('✗ ' + b.id + ' (' + total + ' pts)\n    ' + errors.join('\n    '));
  } else {
    const split = trees.map(t => rules.treePoints(b.points, t)).join('/');
    console.log('✓ ' + b.id + ' — ' + split + ' (' + total + '/' + rules.pointsForLevel(b.level) + ' pts)');
  }
});
if (failed) {
  console.error('\nBuilds inválidos: data/builds.js no se actualizó.');
  process.exit(1);
}
write('data/builds.js', 'BUILD_DATA', builds);
console.log('OK: data/shaman.js, data/guides.js, data/builds.js');
