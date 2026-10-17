// Phone check: every page and sub-section at phone size (390 and 360 px wide, touch),
// in both languages. A view fails when the page scrolls sideways or a
// visible element sticks out of the screen. Also reports (without failing)
// tap targets under 28 px and text under 11 px. Most visitors come on a
// phone (Resumen de feedback, #7).
//
//   node scripts/mobile-check.js            (CHROME=1 uses the installed Chrome)
//   SHOTS=<folder> node scripts/mobile-check.js   also saves a screenshot per view
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const PAGES = ['Inicio', 'Guia', 'Talentos', 'Equipo', 'Profesiones', 'Hechizos', 'Clase', 'Novedades'];
const PROFILES = [
  { spec: 'Enhancement', faction: 'horde', race: 'Orc', profs: ['Blacksmithing', 'Mining'], level: 24, lang: 'es' },
  { spec: 'Restoration', faction: 'alliance', race: 'Dwarf', profs: ['Herbalism', 'Alchemy'], level: 33, lang: 'en' },
  { spec: 'Elemental', faction: 'horde', race: 'Tauren', profs: ['Tailoring', 'Enchanting'], level: 12, lang: 'es', width: 360 },
];
const SHOTS = process.env.SHOTS;

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// What sticks out, what's too small to tap or to read, in the page as shown.
function inspect() {
  const W = document.documentElement.clientWidth;
  const out = { scroll: document.documentElement.scrollWidth - W, wide: [], taps: [], tiny: [] };
  const name = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''))
    + ' "' + (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"';
  // An element inside a sideways-scrolling box (a wide table in its own
  // scroller) is fine: only the page itself must not scroll.
  const inScroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; if (/(auto|scroll|hidden)/.test(s.overflowX)) return true; } return false; };
  for (const el of document.querySelectorAll('#app *, header *, nav *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    if ((r.right > W + 1 || r.left < -1) && !inScroller(el) && s.position !== 'fixed') out.wide.push(name(el) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    if (el.matches('a[href], button, select, input, [role=button], [data-feedback]') && (r.height < 28 || r.width < 28) && !el.closest('p, li, td, label')) out.taps.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(s.fontSize) < 11) out.tiny.push(name(el) + ' ' + s.fontSize);
  }
  return out;
}

async function main() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch(process.env.CHROME ? { channel: 'chrome' } : {});
  const failures = [], notes = new Map();
  let views = 0;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  for (const p of PROFILES) {
    const who = p.spec + ' ' + p.race + ' [' + p.lang + '] ' + (p.width || 390) + 'px';
    const context = await browser.newContext({ viewport: { width: p.width || 390, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.route(url => !url.href.startsWith(base), r => r.abort());
    await context.addInitScript(s => {
      Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' && k === 'shamanForeverLang' ? v : JSON.stringify(v)));
    }, { 'shaman.spec': p.spec, 'shaman.faction': p.faction, 'shaman.race': p.race, 'shaman.profs': p.profs, 'shaman.level': p.level, 'shaman.setupDone': true, shamanForeverLang: p.lang });
    const page = await context.newPage();
    const check = async hash => {
      views++;
      await page.waitForTimeout(80);
      const r = await page.evaluate(inspect);
      if (r.scroll > 1) failures.push(who + ' ' + hash + ': la página se desplaza ' + r.scroll + ' px de costado');
      r.wide.slice(0, 5).forEach(w => failures.push(who + ' ' + hash + ': se sale de la pantalla: ' + w));
      for (const [kind, list] of [['toque chico', r.taps], ['letra chica', r.tiny]]) {
        for (const x of list) { const k = kind + ': ' + x.replace(/"[^"]*"/, '').trim(); if (!notes.has(k)) notes.set(k, hash + ' ' + x); }
      }
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, (p.lang + '-' + hash.replace(/[^\w-]+/g, '_')).slice(0, 80) + '.png'), fullPage: true });
    };
    await page.goto(base + 'index.html#Inicio');
    await page.waitForSelector('#app *');
    await page.evaluate(() => window.Site.need(window.Site.LAZY));
    for (const name of PAGES) {
      await page.evaluate(h => { location.hash = h; }, '#' + name);
      await check('#' + name);
      const subs = await page.$$eval('#app .subtab', as => as.map(a => a.getAttribute('href')));
      for (const h of subs.slice(1)) {
        await page.evaluate(x => { location.hash = x; }, h);
        await check(h);
      }
    }
    await context.close();
  }
  await browser.close();
  server.close();
  if (notes.size) console.log('Para revisar (' + notes.size + '):\n' + [...notes.entries()].map(([k, v]) => '  · ' + k + '   (' + v + ')').join('\n'));
  if (failures.length) {
    console.error('Celular: ' + failures.length + ' problemas en ' + views + ' vistas:\n' + failures.map(f => '  - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('Celular: ' + views + ' vistas sin desplazarse de costado.');
}

main().catch(e => { console.error(e); process.exit(1); });
