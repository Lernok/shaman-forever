// Copies the addon (addon/ShamanForeverGuide) into every Forever game folder's
// Interface/AddOns (scripts/lib/game.js finds them: _forever_, the beta's
// _classic_beta_), replacing the copy there. Saved data lives in WTF and
// stays as it is.
//
// The addon was "ShamanForever" up to 0.32 (another addon has that name): the
// old folder goes, and its saved data (WTF/.../SavedVariables/ShamanForever.lua)
// is copied once to the new name, with the new variable names. The old file stays.
//
//   node scripts/install-addon.js
const fs = require('fs');
const path = require('path');
const game = require('./lib/game');

const NAME = 'ShamanForeverGuide';
const OLD = 'ShamanForever';
const src = path.join(__dirname, '..', 'addon', NAME);
const version = (fs.readFileSync(path.join(src, NAME + '.toc'), 'utf8').match(/## Version:\s*(\S+)/) || [])[1];
const dirs = game.folders();
if (!dirs.length) { console.error('No encontré carpetas del juego en ' + game.ROOT + ' (WOW_DIR=<carpeta> para otra).'); process.exit(1); }

// Every SavedVariables folder under WTF/Account (account-wide and per character).
function savedDirs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.name === 'SavedVariables') out.push(p);
    else savedDirs(p, out);
  }
  return out;
}

dirs.forEach(dir => {
  const addons = path.join(dir, 'Interface', 'AddOns');
  fs.mkdirSync(addons, { recursive: true });
  // Only our old copy (the other "ShamanForever" addon stays).
  const oldToc = path.join(addons, OLD, OLD + '.toc');
  if (fs.existsSync(oldToc) && fs.readFileSync(oldToc, 'utf8').includes('## Author: Lernok')) {
    fs.rmSync(path.join(addons, OLD), { recursive: true, force: true });
    console.log('Carpeta vieja ' + OLD + ' borrada de ' + addons);
  }
  const dest = path.join(addons, NAME);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('Addon ' + version + ' instalado en ' + dest);

  savedDirs(path.join(dir, 'WTF', 'Account')).forEach(sv => {
    const from = path.join(sv, OLD + '.lua');
    const to = path.join(sv, NAME + '.lua');
    if (!fs.existsSync(from) || fs.existsSync(to)) return;
    fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(/^ShamanForever(DB|CharDB) = /gm, NAME + '$1 = '));
    console.log('Datos pasados al nombre nuevo: ' + to);
  });
});
