// Feedback inbox: turns the answers of the site's Google Form into GitHub
// issues, so every report can be labelled, discussed and closed by a commit.
//
//   node scripts/feedback.js            reads FEEDBACK_CSV, opens/updates issues
//   node scripts/feedback.js --dry      only prints what it would do
//   node scripts/feedback.js --csv f    reads a local CSV instead (for tests)
//
// FEEDBACK_CSV is the form's answer sheet published as CSV (Sheets: File >
// Share > Publish to web > CSV). It's kept as a repository secret, not here.
//
// Each answer has a fixed id (hash of its timestamp and text) written into
// the issue as <!-- fb:ID -->, so running this again never repeats one: the
// issues themselves are the record of what was already taken in.
// Reports about the same item go to one issue (one comment per extra report),
// so ten people reporting one piece make one issue with ten voices.
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseCSV } = require('./lib/csv');
const { readJSON } = require('./lib/files');

const DRY = process.argv.includes('--dry');
const csvArg = process.argv.indexOf('--csv');
const LABEL = 'feedback';
// Label colours by group (GitHub wants hex without #).
const LABELS = { feedback: 'c5a46e', 'tipo:': '1d76db', 'spec:': '0e8a16', 'página:': 'bfd4f2' };

async function readAnswers() {
  if (csvArg > 0) return fs.readFileSync(process.argv[csvArg + 1], 'utf8');
  const url = process.env.FEEDBACK_CSV;
  if (!url) { console.log('Sin FEEDBACK_CSV: nada que leer.'); process.exit(0); }
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || /^\s*</.test(text)) throw new Error('FEEDBACK_CSV no devolvió un CSV (' + res.status + ')');
  return text;
}

// The form's columns, found by what they hold (their titles may be edited):
// the timestamp comes first, "Datos de la página" is filled in by the site.
function columns(row) {
  const keys = Object.keys(row);
  const context = keys.find(k => /datos|context/i.test(k));
  const text = keys.find(k => k !== keys[0] && k !== context && /qu[eé]|what|falta|wrong/i.test(k)) || keys.find(k => k !== keys[0] && k !== context);
  return { time: keys[0], text, context };
}

// Context written by Site.feedbackLink:
//   [kind] | #Page/section | Race Spec (Faction) | profs | lvl N | [extra]
function parseContext(s) {
  const parts = (s || '').split(' | ').map(p => p.trim());
  const out = { raw: s || '' };
  if (parts[0] && !parts[0].startsWith('#')) out.kind = parts.shift();
  if (parts[0] && parts[0].startsWith('#')) out.page = parts.shift().slice(1).split('/')[0] || 'Inicio';
  const shaman = parts[0] && parts[0].match(/^(\S+) (\S+) \((\w+)\)$/);
  if (shaman) { parts.shift(); [, out.race, out.spec, out.faction] = shaman; }
  if (parts[0] && !/^lvl /.test(parts[0])) out.profs = parts.shift();
  if (parts[0] && /^lvl \d+/.test(parts[0])) out.level = +parts.shift().slice(4);
  if (parts.length) out.extra = parts.join(' | ');
  const item = out.extra && out.extra.match(/#(\d+)/);
  if (item) out.itemId = +item[1];
  return out;
}

const items = new Map();
readJSON('data/gear.json', { gear: [] }).gear.concat(readJSON('data/weapons.json', { weapons: [] }).weapons).forEach(i => items.set(i.id, i));

function toReport(row, col) {
  const text = (row[col.text] || '').trim();
  const ctx = parseContext(row[col.context]);
  const id = crypto.createHash('sha1').update(row[col.time] + '\n' + text).digest('hex').slice(0, 10);
  const item = ctx.itemId ? items.get(ctx.itemId) : null;
  // The site sends a kind code (Site.feedbackContext); older answers carried
  // a label, so the text decides when there's no code.
  const CODES = { piece: 'pieza', bug: 'error', data: 'dato', idea: 'sugerencia' };
  const kind = ctx.itemId ? 'pieza' : CODES[ctx.kind] || (/bug|error|roto|broken|no anda|no funciona/i.test(text) ? 'error' : 'sugerencia');
  return { id, time: row[col.time], text, ctx, item, kind };
}

function labelsFor(r) {
  const l = [LABEL, 'tipo: ' + r.kind];
  if (r.ctx.spec) l.push('spec: ' + r.ctx.spec);
  if (r.ctx.page) l.push('página: ' + r.ctx.page);
  return l;
}

function body(r) {
  const c = r.ctx;
  const lines = ['> ' + r.text.replace(/\n/g, '\n> '), ''];
  if (c.race) lines.push('- **Shaman:** ' + c.race + ' ' + c.spec + ' (' + c.faction + '), nivel ' + (c.level || '?') + ', profesiones: ' + (c.profs || '-'));
  if (c.page) lines.push('- **Página:** ' + c.page);
  if (c.extra) lines.push('- **Detalle:** ' + c.extra);
  if (c.itemId) lines.push('- **Ítem:** ' + (r.item ? '[' + r.item.name + '](https://www.wowhead.com/classic/item=' + c.itemId + ') — ' + r.item.slot + ', nivel ' + (r.item.req || 0) + ', ' + r.item.sources.map(s => s.type).join('/') : '#' + c.itemId + ' **no está en los datos**'));
  lines.push('- **Enviado:** ' + r.time, '', '<!-- fb:' + r.id + ' -->');
  return lines.join('\n');
}

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] });

async function main() {
  const rows = parseCSV(await readAnswers());
  if (!rows.length) { console.log('El formulario no tiene respuestas.'); return; }
  const col = columns(rows[0]);
  const reports = rows.map(r => toReport(r, col)).filter(r => r.text.length >= 3);

  const issues = DRY && !process.env.GH_TOKEN && csvArg > 0 ? [] : JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'all', '--limit', '1000', '--json', 'number,title,state,body,comments']));
  const seen = new Set();
  issues.forEach(i => [i.body].concat(i.comments.map(c => c.body)).forEach(b => (b.match(/<!-- fb:(\w+) -->/g) || []).forEach(m => seen.add(m.slice(8, -4)))));
  const itemIssue = new Map();
  issues.filter(i => i.state === 'OPEN').forEach(i => { const m = i.body.match(/<!-- fb-item:(\d+) -->/); if (m) itemIssue.set(+m[1], i.number); });

  const fresh = reports.filter(r => !seen.has(r.id));
  console.log(reports.length + ' respuestas, ' + fresh.length + ' nuevas.');
  if (!fresh.length) return;

  if (!DRY) {
    const wanted = new Set(fresh.flatMap(labelsFor));
    wanted.forEach(name => {
      const color = LABELS[name] || LABELS[Object.keys(LABELS).find(k => name.startsWith(k))] || 'ededed';
      gh(['label', 'create', name, '--color', color, '--force']);
    });
  }

  for (const r of fresh) {
    const existing = r.ctx.itemId && itemIssue.get(r.ctx.itemId);
    if (existing) {
      console.log('#' + existing + ' + reporte ' + r.id);
      if (!DRY) {
        gh(['issue', 'comment', String(existing), '--body-file', '-'], body(r));
        gh(['issue', 'edit', String(existing), ...labelsFor(r).flatMap(l => ['--add-label', l])]);
      }
      continue;
    }
    const title = r.item ? '[Pieza] ' + r.item.name + ' (#' + r.item.id + ')'
      : '[' + r.kind[0].toUpperCase() + r.kind.slice(1) + '] ' + r.text.replace(/\s+/g, ' ').slice(0, 70) + (r.text.length > 70 ? '…' : '');
    const text = body(r) + (r.ctx.itemId ? '\n<!-- fb-item:' + r.ctx.itemId + ' -->' : '');
    console.log('nuevo: ' + title + '  [' + labelsFor(r).join(', ') + ']');
    if (DRY) { console.log(text.replace(/^/gm, '    ')); continue; }
    const url = gh(['issue', 'create', '--title', title, '--body-file', '-', ...labelsFor(r).flatMap(l => ['--label', l])], text).trim();
    if (r.ctx.itemId) itemIssue.set(r.ctx.itemId, +url.split('/').pop());
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
