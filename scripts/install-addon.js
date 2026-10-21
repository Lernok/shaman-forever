// Copies the addon (addon/ShamanForever) into every Forever game folder's
// Interface/AddOns (scripts/lib/game.js finds them: _forever_, the beta's
// _classic_beta_), replacing the copy there. Saved data lives in WTF and
// stays as it is.
//
//   node scripts/install-addon.js
const fs = require('fs');
const path = require('path');
const game = require('./lib/game');

const src = path.join(__dirname, '..', 'addon', 'ShamanForever');
const version = (fs.readFileSync(path.join(src, 'ShamanForever.toc'), 'utf8').match(/## Version:\s*(\S+)/) || [])[1];
const dirs = game.folders();
if (!dirs.length) { console.error('No encontré carpetas del juego en ' + game.ROOT + ' (WOW_DIR=<carpeta> para otra).'); process.exit(1); }
dirs.forEach(dir => {
  const addons = path.join(dir, 'Interface', 'AddOns');
  fs.mkdirSync(addons, { recursive: true });
  const dest = path.join(addons, 'ShamanForever');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('Addon ' + version + ' instalado en ' + dest);
});
