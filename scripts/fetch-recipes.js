// Recipe acquisition (trainer / Merchant's Favor pattern / reputation / drop)
// and skill ranges for every crafting profession, from classicwowforever.com's
// recipe lists (which cite Wowhead Forever and the Daybreak Forever datamine).
// The client tables don't say how a recipe is learned, so this fills that gap.
//
//   node scripts/fetch-recipes.js          (pages cached in .cache/cwf/, 1 req/s)
//
// Writes data/recipes.json: { profession: { recipeName: { slot, ilvl, skill:[orange,yellow,green,grey], source, isNew } } }
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');
const PROFESSIONS = ['leatherworking', 'blacksmithing', 'tailoring', 'enchanting', 'engineering', 'alchemy'];

function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .split('\n').map(s => s.trim()).filter(Boolean);
}

// A recipe block: Name / "Slot, ilvl N" / 4 skill numbers / mats (n × name)… / source / flags.
function parsePage(lines) {
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const m = /^(.*?),?\s*ilvl (\d+)$/.exec(lines[i]);
    if (!m) continue;
    const name = lines[i - 1];
    const skill = lines.slice(i + 1, i + 5).map(s => Number(s.replace('≈', '')));
    if (skill.some(isNaN)) continue;
    let j = i + 5;
    // Materials: "<count>", "×", "<name>" triples.
    while (/^\d+$/.test(lines[j]) && lines[j + 1] === '×') j += 3;
    const source = lines[j] || '';
    const flags = [];
    for (let k = j + 1; k < j + 3 && k < lines.length; k++) {
      if (/^New recipe$|Skill-ups|^Changed/.test(lines[k])) flags.push(lines[k]);
    }
    out.push({ name, slot: m[1] || null, ilvl: Number(m[2]), skill, source, isNew: flags.includes('New recipe') });
  }
  return out;
}

// Kept for a month: recipe lists change slowly (pass --offline to rebuild from cache).
const page = (prof, n) => http.get('https://classicwowforever.com/professions/' + prof + '/recipes/' + (n > 1 ? '?page=' + n : ''),
  { cache: 'cwf/' + prof + '-' + n + '.html', maxAgeDays: 30, valid: t => /<html/i.test(t) }).then(t => {
  if (t == null) throw new Error('sin la página ' + n + ' de ' + prof);
  return t;
});

(async () => {
  const result = {};
  for (const prof of PROFESSIONS) {
    result[prof] = {};
    const first = toText(await page(prof, 1));
    const pagesLine = first.findIndex(l => l === 'Page');
    const total = pagesLine >= 0 ? Number(first[pagesLine + 3]) || 1 : 1;
    for (let n = 1; n <= total; n++) {
      const lines = n === 1 ? first : toText(await page(prof, n));
      parsePage(lines).forEach(r => { result[prof][r.name] = r; });
    }
    console.log(prof + ': ' + Object.keys(result[prof]).length + ' recetas (' + total + ' páginas)');
  }
  // The date only moves when the recipes do.
  const prev = readJSON('data/recipes.json', {});
  const same = JSON.stringify(prev.professions) === JSON.stringify(result);
  writeJSON('data/recipes.json', { source: 'https://classicwowforever.com/professions/', fetched: same && prev.fetched ? prev.fetched : new Date().toISOString().slice(0, 10), professions: result });
})().catch(e => { console.error(e.message); process.exit(1); });
