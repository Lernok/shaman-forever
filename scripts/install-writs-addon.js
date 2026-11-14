// Copies the Writ Planner (addon/WritPlanner) into every Forever game folder's
// Interface/AddOns, and packs dist/WritPlanner-<version>.zip to hand out
// (unzip into Interface/AddOns). Saved data lives in WTF and stays.
//
//   node scripts/install-writs-addon.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const game = require('./lib/game');

const NAME = 'WritPlanner';
const root = path.join(__dirname, '..');
const src = path.join(root, 'addon', NAME);
const version = (fs.readFileSync(path.join(src, NAME + '.toc'), 'utf8').match(/## Version:\s*(\S+)/) || [])[1];

game.folders().forEach(dir => {
  const dest = path.join(dir, 'Interface', 'AddOns', NAME);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(NAME + ' ' + version + ' -> ' + dest);
});

const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const zip = path.join(dist, NAME + '-' + version + '.zip');
fs.rmSync(zip, { force: true });
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${src}' -DestinationPath '${zip}'`]);
console.log('zip: ' + zip);
