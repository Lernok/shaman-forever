// Spell names for the macros (js/macros.js) in each game language: /cast needs
// the name as the client calls it. Reads the SpellName table of the Forever
// build from wago.tools in English and Spanish and keeps, for each English
// name, the translation most of its spell IDs use.
//
//   node scripts/macro-names.js            writes data/macro-names.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const BUILD = JSON.parse(fs.readFileSync(path.join(root, 'data/meta.json'), 'utf8')).items.build;
const LOCALES = ['esMX', 'esES'];

// Every spell a macro casts (MACROS in js/macros.js).
const src = fs.readFileSync(path.join(root, 'js/macros.js'), 'utf8');
const NAMES = [...new Set([...src.matchAll(/(?:spells|extra): \[([^\]]+)\]/g)].flatMap(m => [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map(x => x[1] || x[2])))].sort();

async function table(locale) {
  const url = 'https://wago.tools/db2/SpellName/csv?build=' + BUILD + '&locale=' + locale;
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': ' + res.status);
  const map = new Map();
  (await res.text()).split(/\r?\n/).slice(1).forEach(line => {
    const i = line.indexOf(',');
    if (i < 0) return;
    let v = line.slice(i + 1);
    if (v.startsWith('"')) v = v.slice(1, -1).replace(/""/g, '"');
    map.set(line.slice(0, i), v);
  });
  return map;
}

(async () => {
  const en = await table('enUS');
  const out = {};
  for (const loc of LOCALES) {
    const tr = await table(loc);
    out[loc] = {};
    NAMES.forEach(name => {
      const votes = {};
      en.forEach((v, id) => { if (v === name && tr.has(id)) votes[tr.get(id)] = (votes[tr.get(id)] || 0) + 1; });
      const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      if (best) out[loc][name] = best[0];
      else console.warn(loc + ': sin traducción para ' + name + ' (queda en inglés)');
    });
  }
  const body = '// Generado por scripts/macro-names.js (wago.tools, build ' + BUILD + '). No editar a mano.\n' +
    'window.MACRO_NAMES = ' + JSON.stringify(out, null, 1) + ';\n';
  fs.writeFileSync(path.join(root, 'data/macro-names.js'), body);
  console.log('data/macro-names.js: ' + NAMES.length + ' hechizos en ' + LOCALES.join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
