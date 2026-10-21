// The newest QuestieDB Forever data, "baked" (scripts/lib/questiedb-baked.js).
// The QuestieDB repo's data/Forever/*.lua files stopped at 2026-09-21: Forever's
// new content (Zephras Isle, its trainers and quests) is only in the addon
// packages. In order:
//   QUESTIEDB=<dir>                       a QuestieDB addon folder;
//   .cache/questiedb-forever/QuestieDB    the daily "preview" package sync.js downloads;
//   the QuestieDB addon installed in the game (scripts/lib/game.js).
// null when none is there (the callers keep the repo files then).
//
//   const db = require('./lib/questiedb-fresh.js').load()   // or null
//   require('./lib/questiedb-fresh.js').download()          // sync.js: refresh the package
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const baked = require('./questiedb-baked.js');

const root = path.join(__dirname, '..', '..');
const CACHED = path.join(root, '.cache', 'questiedb-forever');
const URL = 'https://github.com/Questie/QuestieDB/releases/download/preview/QuestieDB-Forever.zip';

function dirs() {
  return [process.env.QUESTIEDB, path.join(CACHED, 'QuestieDB'), require('./game').addon('QuestieDB')].filter(Boolean);
}

let cached;
function load() {
  if (cached !== undefined) return cached;
  cached = null;
  for (const d of dirs()) {
    const db = fs.existsSync(d) && baked.load(d);
    if (db) { cached = Object.assign(db, { dir: d }); break; }
  }
  return cached;
}

// Refreshes the cached package twice a day (curl and unzip, as on GitHub's runners).
function download(maxAgeDays = 0.5) {
  const toc = path.join(CACHED, 'QuestieDB', 'QuestieDB_Forever.toc');
  if (fs.existsSync(toc) && Date.now() - fs.statSync(toc).mtimeMs < maxAgeDays * 86400000) return true;
  fs.mkdirSync(CACHED, { recursive: true });
  const zip = path.join(CACHED, 'QuestieDB-Forever.zip');
  try {
    execFileSync('curl', ['-sSfL', '-o', zip, URL], { stdio: 'inherit' });
    execFileSync('unzip', ['-oq', zip, '-d', CACHED], { stdio: 'inherit' });
    fs.utimesSync(toc, new Date(), new Date());
    return true;
  } catch (e) {
    console.log('QuestieDB (paquete preview) no se pudo bajar: ' + e.message.split('\n')[0]);
    return fs.existsSync(toc);
  }
}

module.exports = { load, download, URL };
