// Smoke test: opens the site in a headless browser and walks every page and
// sub-section for several Shamans (each spec, both factions, a race,
// professions, a level) in both languages. A view fails when it throws, logs
// an error, renders (almost) nothing, or shows "undefined", "NaN",
// "[object Object]" or an untranslated key. Run by CI on every push.
//
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/smoke.js           (CHROME=1 uses the installed Chrome instead)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const PAGES = ['Inicio', 'Guia', 'Talentos', 'Equipo', 'Profesiones', 'Hechizos', 'Clase', 'Novedades'];
// Prefixes of the interface keys (js/i18n.js): text like "gp.slot.Head" on a
// page means a key without a translation.
const KEY_PREFIXES = ['site', 'tab', 'home', 'gp', 'wp', 'pr', 'cl', 'sb', 'fb', 'setup', 'race', 'conf', 'origin', 'classic', 'orig', 'calc', 'guide', 'news', 'mc'];
const MISSING_KEY = new RegExp('(^|[\\s(>])(' + KEY_PREFIXES.join('|') + ')\\.[a-z][\\w.]*[a-zA-Z]($|[\\s),.:<])', 'm');
const BAD_TEXT = /\bundefined\b|\bNaN\b|\[object Object\]/;

// Shamans to try. Races are the first of each faction in data/shaman.json.
const racials = JSON.parse(fs.readFileSync(path.join(root, 'data/shaman.json'), 'utf8')).racials;
const firstRace = f => racials[f].find(r => r.classes.includes('Shaman')).race;
const PROFILES = [
  { spec: 'Enhancement', faction: 'horde', race: firstRace('Horde'), profs: ['Blacksmithing', 'Mining'], level: 24, lang: 'es' },
  { spec: 'Elemental', faction: 'alliance', race: firstRace('Alliance'), profs: ['Tailoring', 'Enchanting'], level: 45, lang: 'es' },
  { spec: 'Restoration', faction: 'horde', race: 'any', profs: [], level: 1, lang: 'es' },
  { spec: 'Enhancement', faction: 'alliance', race: firstRace('Alliance'), profs: ['Leatherworking', 'Skinning'], level: 60, lang: 'en' },
  { spec: 'Restoration', faction: 'horde', race: firstRace('Horde'), profs: ['Herbalism', 'Alchemy'], level: 33, lang: 'en' }
];

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

async function main() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch(process.env.CHROME ? { channel: 'chrome' } : {});
  const failures = [];
  let views = 0;

  for (const p of PROFILES) {
    const who = p.race + ' ' + p.spec + ' (' + p.faction + ') lvl ' + p.level + ' [' + p.lang + ']';
    const context = await browser.newContext();
    // Only the site itself: icons, counter and fonts come from other hosts.
    await context.route(url => !url.href.startsWith(base), r => r.abort());
    await context.addInitScript(s => {
      Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' && k === 'shamanForeverLang' ? v : JSON.stringify(v)));
    }, { 'shaman.spec': p.spec, 'shaman.faction': p.faction, 'shaman.race': p.race, 'shaman.profs': p.profs, 'shaman.level': p.level, 'shaman.setupDone': true, shamanForeverLang: p.lang });
    const page = await context.newPage();
    let errs = [];
    page.on('pageerror', e => errs.push('error: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push('console: ' + m.text()); });

    const check = async hash => {
      views++;
      await page.waitForTimeout(60);
      const text = await page.$eval('#app', el => el.innerText);
      const problems = errs.slice();
      errs = [];
      if (text.trim().length < 150) problems.push('página casi vacía (' + text.trim().length + ' caracteres)');
      const bad = text.match(BAD_TEXT);
      if (bad) problems.push('muestra "' + bad[0] + '": …' + text.slice(Math.max(0, bad.index - 60), bad.index + 40).replace(/\s+/g, ' ') + '…');
      const key = text.match(MISSING_KEY);
      if (key) problems.push('texto sin traducir: "' + key[0].trim() + '"');
      problems.forEach(x => failures.push(who + ' ' + hash + ': ' + x));
    };

    // A page that needs the big data bundles loads them on its own.
    await page.goto(base + 'index.html#Profesiones');
    await page.waitForSelector('#app .subtab', { timeout: 15000 }).catch(() => {});
    await check('#Profesiones (primera carga)');
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
    // Your path, bracket by bracket.
    await page.evaluate(() => { location.hash = '#Equipo'; });
    await page.waitForTimeout(60);
    const brackets = await page.$$('#app [data-bracket]');
    for (let i = 0; i < brackets.length; i++) {
      await (await page.$$('#app [data-bracket]'))[i].click();
      await check('#Equipo tramo ' + (i + 1));
    }
    // The report window opens, shows its fields and closes (nothing is sent).
    await page.click('#feedbackLink [data-feedback]');
    const modal = await page.$eval('.fb-modal', el => ({ text: el.innerText, box: !!el.querySelector('.fb-text') })).catch(() => null);
    if (!modal || !modal.box || BAD_TEXT.test(modal.text) || MISSING_KEY.test(modal.text)) failures.push(who + ' ventana de reporte: ' + (modal ? modal.text.slice(0, 120) : 'no se abrió'));
    await page.keyboard.press('Escape');
    errs.forEach(x => failures.push(who + ' ventana de reporte: ' + x));
    errs = [];
    await context.close();
  }

  await browser.close();
  server.close();
  if (failures.length) {
    console.error('Prueba del sitio: ' + failures.length + ' problemas en ' + views + ' vistas:\n' + failures.map(f => '  - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('Prueba del sitio: ' + views + ' vistas sin problemas (' + PROFILES.length + ' Shamans, es y en).');
}

main().catch(e => { console.error(e); process.exit(1); });
