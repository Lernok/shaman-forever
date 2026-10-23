// The addon's log of each character, as a timeline: what you did (zones,
// levels, quests) and what the addon did (what popped up, what it said in
// the chat, the trainer's advice, your clicks, errors). The game writes it
// to the SavedVariables on logout or /reload.
//   node scripts/read-log.js [--hours N] [--char Name] [--all] [WTF folder]
// --hours: only the last N hours (default 48); --all: everything;
// --char: characters whose name starts with it.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : args.splice(i, 2)[1]; };
const all = args.includes('--all') && args.splice(args.indexOf('--all'), 1);
const hours = Number(opt('hours', 48));
const who = (opt('char', '') || '').toLowerCase();
const WTF = args[0] || path.join(require('./lib/game').folder(), 'WTF');

// Every ShamanForeverGuide.lua under WTF/Account/<account>/<realm>/<character>/SavedVariables.
function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (e.name === 'ShamanForeverGuide.lua' && path.basename(dir) === 'SavedVariables' && path.basename(path.dirname(path.dirname(dir))) !== 'Account') out.push(p);
  }
  return out;
}

// The ["log"] = { "..", ".." } list of a SavedVariables file.
function logOf(text) {
  const block = (text.match(/\["log"\] = \{([\s\S]*?)\n\},?/) || [])[1] || '';
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\(.)/g, '$1'));
}

const WORDS = { load: 'carga', zone: 'zona', level: 'nivel', quest: 'entrega', accept: 'acepta', in: 'entra a', out: 'sale de',
  pop: 'AVISO', chat: 'chat', click: 'clic', done: 'listo', restore: 'restaura', trainer: 'entrenador', buy: 'compra', spend: 'gasto', learn: 'aprende', error: 'ERROR' };
const since = all ? 0 : Date.now() / 1000 - hours * 3600;
const totals = {};
for (const f of files(path.join(WTF, 'Account'))) {
  const name = path.basename(path.dirname(path.dirname(f)));
  if (who && !name.toLowerCase().startsWith(who)) continue;
  const lines = logOf(fs.readFileSync(f, 'utf8')).map(l => l.split('|')).filter(p => Number(p[0]) >= since);
  if (!lines.length) continue;
  console.log('\n=== ' + name + '  (' + lines.length + ' líneas)');
  for (const [t, ev, lvl, zone, ...rest] of lines) {
    const d = new Date(Number(t) * 1000);
    const when = d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    totals[ev] = (totals[ev] || 0) + 1;
    console.log(when + '  nv ' + String(lvl).padStart(2) + '  ' + (zone || '-').padEnd(16).slice(0, 16) + '  ' + (WORDS[ev] || ev) + ' ' + rest.join('|'));
  }
}
console.log('\nTotal: ' + (Object.entries(totals).map(([k, n]) => (WORDS[k] || k) + ' ' + n).join(', ') || 'nada en ese período'));
