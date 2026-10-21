// Visits from GoatCounter (lernok.goatcounter.com): totals per day, pages,
// where visitors came from, countries, screen sizes, languages, and the
// "error/…" events js/app.js sends when a page breaks on someone's browser,
// and the "setup/…" ones from the first-visit setup (js/setup.js).
//
//   node scripts/visits.js [days]      (default 7)
//
// Needs a GoatCounter API key with "read statistics" permission (GoatCounter:
// your user in the top menu > API): in GOATCOUNTER_TOKEN, or in the file
// .goatcounter-token at the repo root (ignored by git: never commit it).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SITE = 'lernok';
const tokenFile = path.join(root, '.goatcounter-token');
const token = process.env.GOATCOUNTER_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) {
  console.log('Falta la clave de GoatCounter: GOATCOUNTER_TOKEN o el archivo .goatcounter-token (ver el encabezado de este script).');
  process.exit(0);
}

const days = +(process.argv[2] || 7);
const hour = d => d.toISOString().slice(0, 13) + ':00:00Z';
const end = new Date(Date.now() + 36e5);
const start = new Date(end - days * 864e5);
const range = 'start=' + hour(start) + '&end=' + hour(end);

async function api(p, retried) {
  const res = await fetch('https://' + SITE + '.goatcounter.com/api/v0' + p, { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  // 429: too fast; a first 404 has been seen right after creating a key.
  if ((res.status === 429 || res.status === 404) && !retried) { await new Promise(r => setTimeout(r, 2000)); return api(p, true); }
  if (!res.ok) throw new Error('GoatCounter ' + p + ': ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.json();
}

const SIZES = { phone: 'celular', tablet: 'tablet', desktop: 'compu', desktophd: 'compu (pantalla grande)', unknown: 'sin dato' };
const list = (title, rows, n) => {
  console.log('\n## ' + title);
  if (!rows.length) return console.log('  (nada)');
  rows.filter(r => r.count).slice(0, n || 15).forEach(r => console.log('  ' + String(r.count).padStart(5) + '  ' + (r.name || SIZES[r.id] || r.id || '(directo / sin dato)')));
};

async function main() {
  const total = await api('/stats/total?' + range);
  console.log('# Visitas de los últimos ' + days + ' días: ' + total.total + ' vistas de página' + (total.total_events ? ', ' + total.total_events + ' eventos' : ''));
  (total.stats || []).filter(s => s.daily).forEach(s => console.log('  ' + s.day + '  ' + String(s.daily).padStart(5)));

  const hits = (await api('/stats/hits?' + range + '&limit=200')).hits || [];
  list('Páginas', hits.filter(h => !h.event).map(h => ({ name: h.path, count: h.count })));
  const errors = hits.filter(h => h.event && /^\/?error\//.test(h.path));
  list('Errores de visitantes (eventos error/…)', errors.map(h => ({ name: h.path.replace(/^\/?error\//, ''), count: h.count })), 50);
  // First visit: how many finish "Armá tu Shaman" (listo: spec), skip it or close it.
  const setup = hits.filter(h => h.event && /^\/?setup\//.test(h.path)).map(h => ({ name: h.path.replace(/^\/?setup\//, ''), count: h.count }));
  const kind = k => setup.filter(r => r.name.startsWith(k + ': ')).map(r => ({ name: r.name.slice(k.length + 2), count: r.count }));
  list('Armá tu Shaman, primera visita (eventos setup/…)', setup.filter(r => !/^(raza|raza y spec|profesiones): /.test(r.name)));
  // What they pick (since 2026-10-21): race, race + spec, professions.
  list('Raza elegida', kind('raza'));
  list('Raza y spec', kind('raza y spec'), 20);
  const pairs = kind('profesiones');
  list('Profesiones (el par elegido)', pairs, 20);
  const each = {};
  pairs.forEach(r => r.name.split(' + ').forEach(p => { each[p] = (each[p] || 0) + r.count; }));
  list('Profesiones (cada una)', Object.entries(each).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })), 20);

  for (const [page, title] of [['toprefs', 'De dónde llegan'], ['locations', 'Países'], ['sizes', 'Pantallas'], ['languages', 'Idiomas'], ['browsers', 'Navegadores']]) {
    try {
      list(title, (await api('/stats/' + page + '?' + range + '&limit=15')).stats || []);
    } catch (e) {
      console.log('\n## ' + title + '\n  (no disponible: ' + e.message.slice(0, 80) + ')');
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
