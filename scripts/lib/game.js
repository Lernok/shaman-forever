// Where the game is: the Forever client's folder inside the World of
// Warcraft install. The beta used _classic_beta_; the stress test and the
// launch bring _forever_ (or a name like it). With several, the one played
// last (its WTF folder changed last) is the one read.
//
//   WOW_DIR=<install>   (default D:/World of Warcraft)
//   WOW_GAME=<folder>   a game folder, to skip the search
const fs = require('fs');
const path = require('path');

const ROOT = process.env.WOW_DIR || 'D:/World of Warcraft';
const NAMES = /^_(forever[a-z_]*|classic_beta)_?$/;

// Every Forever game folder there, the one played last first.
function folders() {
  if (process.env.WOW_GAME) return [process.env.WOW_GAME];
  if (!fs.existsSync(ROOT)) return [];
  // Played = when an addon last saved there (WTF/Account/*/SavedVariables), not
  // when WTF changed: opening a new client once writes WTF with nothing in it.
  const played = dir => {
    let last = 0;
    try {
      const acc = path.join(dir, 'WTF', 'Account');
      fs.readdirSync(acc).forEach(a => {
        const sv = path.join(acc, a, 'SavedVariables');
        if (fs.existsSync(sv)) fs.readdirSync(sv).forEach(f => { last = Math.max(last, fs.statSync(path.join(sv, f)).mtimeMs); });
      });
    } catch (e) { /* no WTF yet */ }
    return last;
  };
  return fs.readdirSync(ROOT).filter(n => NAMES.test(n)).map(n => path.join(ROOT, n))
    .filter(d => fs.statSync(d).isDirectory())
    .sort((a, b) => played(b) - played(a));
}

// The game folder to read: a path given on the command line, or the one played last.
function folder(given) {
  return given || folders()[0] || path.join(ROOT, '_classic_beta_');
}

// The folder of an installed addon (QuestieDB...), in the first game folder that has it.
function addon(name) {
  const dirs = folders().map(d => path.join(d, 'Interface', 'AddOns', name));
  return dirs.find(d => fs.existsSync(d)) || dirs[0] || path.join(ROOT, '_classic_beta_', 'Interface', 'AddOns', name);
}

module.exports = { ROOT, folders, folder, addon };
