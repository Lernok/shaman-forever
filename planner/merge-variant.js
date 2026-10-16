// Adds a variant route (a pack made by make-pack.js from another simulated
// route, e.g. the same race without Wailing Caverns) to a race's pack: its
// guides get ids "<pack id>/<tag>-NN-zone", files "<tag>-NN-zone.guide" and
// their own menu folder ("<folder> · <label>"). Our addon finds the variants
// by those ids to offer "skip this dungeon".
//
//   node planner/merge-variant.js <variant pack dir> <race pack dir> <pack id> <tag> "<label>"
const fs = require('fs');
const path = require('path');

const [src, dst, packId, tag, label] = process.argv.slice(2);
if (!src || !dst || !packId || !tag || !label) {
  console.error('usage: node planner/merge-variant.js <variant pack dir> <race pack dir> <pack id> <tag> "<label>"');
  process.exit(1);
}
const from = path.join(src, 'guides');
const to = path.join(dst, 'guides');
for (const f of fs.readdirSync(to)) if (f.startsWith(tag + '-')) fs.rmSync(path.join(to, f));
let n = 0;
for (const f of fs.readdirSync(from).filter((x) => x.endsWith('.guide')).sort()) {
  const text = fs.readFileSync(path.join(from, f), 'utf8')
    .split(packId + '/').join(packId + '/' + tag + '-')
    .replace(/^(folder .+)$/m, `$1 · ${label}`);
  fs.writeFileSync(path.join(to, tag + '-' + f), text.replace(/\r\n/g, '\n'));
  n++;
}
console.log(`${n} guides of ${tag} -> ${to}`);
