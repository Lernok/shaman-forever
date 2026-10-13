// Reading and writing the repo's data files. writeJSON only touches the file
// when its content changes, so a sync with nothing new leaves no diff.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const rel = p => path.join(root, p);

function readJSON(p, fallback) {
  return fs.existsSync(rel(p)) ? JSON.parse(fs.readFileSync(rel(p), 'utf8')) : fallback;
}

// indent: 1 for generated data (compact diffs), 2 for hand-edited files.
function writeText(p, text) {
  const full = rel(p);
  if (fs.existsSync(full) && fs.readFileSync(full, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  return true;
}
const writeJSON = (p, value, indent) => writeText(p, JSON.stringify(value, null, indent == null ? 1 : indent) + '\n');

module.exports = { root, rel, readJSON, writeJSON, writeText };
