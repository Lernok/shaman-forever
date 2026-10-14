// Static checks on the site's code (no browser): run by CI on every push.
//   - the interface strings: Spanish and English have the same keys and the
//     same {placeholders}; every key the code names literally exists;
//   - index.html only loads files that exist;
//   - the data bundles hold no markup.
// What only shows when the pages run is scripts/smoke.js.
//
//   node scripts/check-site.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const errors = [];

// js/i18n.js only needs a window to define itself.
const sandbox = { window: {}, URLSearchParams, location: { search: '' }, navigator: { language: 'es' }, localStorage: { getItem: () => null, setItem() {} } };
vm.runInNewContext(read('js/i18n.js'), sandbox);
const { es, en } = sandbox.window.I18N.STRINGS;

const placeholders = s => (s.match(/\{\w+\}/g) || []).sort().join(' ');
Object.keys(es).forEach(k => {
  if (!(k in en)) errors.push('i18n: "' + k + '" falta en inglés');
  else if (placeholders(es[k]) !== placeholders(en[k])) errors.push('i18n: "' + k + '" tiene {variables} distintas en es (' + placeholders(es[k]) + ') y en (' + placeholders(en[k]) + ')');
});
Object.keys(en).forEach(k => { if (!(k in es)) errors.push('i18n: "' + k + '" falta en español'); });

// Literal keys: t('key') / t("key") in the scripts, data-i18n(-html)="key" in the page.
const files = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js') && f !== 'i18n.js').map(f => 'js/' + f);
files.concat('index.html').forEach(f => {
  const src = read(f);
  const used = [...src.matchAll(/\bt\(\s*['"]([\w.-]+)['"]\s*[,)]/g), ...src.matchAll(/data-i18n(?:-html)?="([\w.-]+)"/g)].map(m => m[1]);
  used.forEach(k => { if (!(k in es)) errors.push(f + ': usa "' + k + '", que no está en js/i18n.js'); });
});

// Everything index.html loads.
const html = read('index.html');
[...html.matchAll(/(?:src|href)="((?:js|data|css|img)\/[^"?]+)/g)].forEach(m => {
  if (!fs.existsSync(path.join(root, m[1]))) errors.push('index.html: carga ' + m[1] + ', que no existe');
});

// The data bundles are plain text (pages put them into HTML as they are): a
// "<" or ">" coming from a source could inject markup into the site.
fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.js')).forEach(f => {
  const box = { window: {} };
  vm.runInNewContext(read('data/' + f), box);
  let found = 0;
  const walk = (v, where) => {
    if (typeof v === 'string') { if (/[<>]/.test(v) && found++ < 3) errors.push('data/' + f + ' ' + where + ': trae "<" o ">": ' + v.slice(0, 80)); }
    else if (v && typeof v === 'object') for (const k in v) walk(v[k], where + '.' + k);
  };
  Object.keys(box.window).forEach(k => walk(box.window[k], k));
});

if (errors.length) {
  console.error('Chequeo del sitio (' + errors.length + '):\n' + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('Sitio verificado: ' + Object.keys(es).length + ' textos en es y en, scripts y estilos de index.html presentes.');
