// Quest sources for weapons that are new in Forever, which QuestieDB doesn't
// list yet (e.g. new dungeon quest rewards like The Wrath of Rath'mael in Ruins
// of Lordaeron). Read from foreverchanges.pro: the item page links the quest
// that rewards it, the quest page gives its level, minimum level, zone, faction,
// colour thresholds and whether it is a dungeon quest; /dungeon-quests gives
// each dungeon's level range.
//
// Its terms allow links and short quotes but not republishing the compiled data
// wholesale, so we keep only these facts for the weapons we show, cite every
// one (ref), and fetch politely (1 request/s, cached in .cache/foreverchanges/).
//
//   node scripts/fetch-item-sources.js     (then node scripts/build-weapons.js)
//
// Writes data/item-sources-fc.json: { items: { id: { name, sources: [...] } } }
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cacheDir = path.join(root, '.cache', 'foreverchanges');
const BASE = 'https://foreverchanges.pro';
const UA = { 'User-Agent': 'shaman-forever-site (fan reference site; item sources, cited)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Pages are refetched after a week: a weapon with no known quest yet, or a quest
// the site later corrects, gets picked up. The fetch date of each page lives in
// _fetched.json (file dates don't survive the GitHub Actions cache).
const MAX_AGE_DAYS = 7;
const fetchedFile = path.join(cacheDir, '_fetched.json');
const fetchedOn = fs.existsSync(fetchedFile) ? JSON.parse(fs.readFileSync(fetchedFile, 'utf8')) : {};
const today = new Date().toISOString().slice(0, 10);
const ageDays = d => (Date.parse(today) - Date.parse(d)) / 864e5;

async function page(kind, id) {
  const name = kind + (id ? '-' + id : '') + '.html';
  const file = path.join(cacheDir, name);
  if (fs.existsSync(file) && fetchedOn[name] && ageDays(fetchedOn[name]) < MAX_AGE_DAYS) return fs.readFileSync(file, 'utf8');
  const res = await fetch(BASE + '/' + kind + (id ? '/' + id : ''), { headers: UA });
  // Keep the cached copy if the site is down.
  if (!res.ok && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const html = res.ok ? await res.text() : '';
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, html);
  fetchedOn[name] = today;
  fs.writeFileSync(fetchedFile, JSON.stringify(fetchedOn));
  await sleep(1000);
  return html;
}

const decode = s => s.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const meta = html => decode((html.match(/<meta name="description" content="([^"]*)/) || [])[1] || '');
const title = html => decode((html.match(/<title>([^<]*)/) || [])[1] || '');

// "The Wrath of Rath'mael: level 22 quest in Ruins of Lordaeron · …" +
// "… A level 22 dungeon quest for the Horde, from level 15."
function parseQuest(id, html) {
  const t = title(html).match(/^(.*?): level (\d+) quest in (.*?) · /);
  if (!t) return null;
  const d = meta(html);
  const f = d.match(/ quest for (the Horde|the Alliance|both factions)/);
  const from = d.match(/, from level (\d+)\./);
  const cls = html.match(/<dt>Class(?:es)?<\/dt><dd>([^<]+)/);
  return {
    type: 'quest', quest: t[1], questId: id, level: Number(t[2]),
    requiredLevel: from ? Number(from[1]) : null,
    zone: t[3],
    dungeon: /level \d+ dungeon quest/.test(d) || undefined,
    classes: cls ? cls[1].split(/,\s*/).map(x => x.trim()) : undefined,
    bands: bands(html),
    faction: !f ? 'both' : f[1] === 'the Horde' ? 'horde' : f[1] === 'the Alliance' ? 'alliance' : 'both',
    confidence: 'community-untested',
    ref: BASE + '/quest/' + id
  };
}

// Quest colour thresholds: the level it turns red (available), orange, yellow,
// green and grey for you. <span class="qp-band-red" …>15</span>…
function bands(html) {
  const out = {};
  for (const m of html.matchAll(/class="qp-band-(red|orange|yellow|green|grey)"[^>]*>(\d+)</g)) out[m[1]] = Number(m[2]);
  return Object.keys(out).length ? out : undefined;
}

// Level range foreverchanges gives each dungeon on /dungeon-quests:
// <a href="#dg-ruins-of-lordaeron">Ruins of Lordaeron</a>… aria-label="Levels 15 to 20"
function dungeonLevels(html) {
  const out = {};
  for (const m of html.matchAll(/<a href="#dg-[^"]*">([^<]*)<\/a>.{0,400}?aria-label="Levels (\d+) to (\d+)"/g)) out[decode(m[1])] = [Number(m[2]), Number(m[3])];
  return out;
}

(async () => {
  const { items } = JSON.parse(fs.readFileSync(path.join(root, 'data/items.json'), 'utf8'));
  const WEAPON_KINDS = ['2H Axe', '2H Mace', 'Staff', '1H Axe', '1H Mace', 'Dagger', 'Fist'];
  const targets = Object.values(items).filter(w => w.era === 'new' && WEAPON_KINDS.includes(w.kind));
  const out = {};
  let found = 0;
  for (const w of targets) {
    const html = await page('item', w.id);
    const questIds = [...new Set([...html.matchAll(/href="\/quest\/(\d+)"/g)].map(m => Number(m[1])))];
    const sources = [];
    for (const q of questIds) {
      const s = parseQuest(q, await page('quest', q));
      if (s) sources.push(s);
    }
    if (sources.length) { out[w.id] = { name: w.name, sources }; found++; }
  }
  // Classic quests that reward a weapon (from QuestieDB): their Forever level,
  // zone and whether they're dungeon quests (QuestieDB files Hidden Enemies
  // under Orgrimmar, where it's handed in, not Ragefire Chasm).
  const questie = require('./lib/questie');
  const Q = questie.open(path.join(root, '.cache'), {});
  const quests = {};
  const classicQuestIds = new Set();
  Object.values(items).filter(w => w.era !== 'new' && WEAPON_KINDS.includes(w.kind)).forEach(w =>
    (Q.sources(w.id) || []).forEach(s => { if (s.type === 'quest') classicQuestIds.add(s.id); }));
  for (const q of classicQuestIds) {
    const s = parseQuest(q, await page('quest', q));
    if (s) quests[q] = { quest: s.quest, level: s.level, requiredLevel: s.requiredLevel, zone: s.zone, dungeon: s.dungeon, classes: s.classes, bands: s.bands, ref: s.ref };
  }
  const dungeons = dungeonLevels(await page('dungeon-quests'));
  // The date only moves when the data does, so a daily sync with nothing new
  // leaves the file untouched.
  const outFile = path.join(root, 'data/item-sources-fc.json');
  const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  const same = JSON.stringify([prev.items, prev.quests, prev.dungeons]) === JSON.stringify([out, quests, dungeons]);
  fs.writeFileSync(outFile, JSON.stringify({
    _readme: 'Fuentes de misión de armas nuevas de Forever (items) y datos de Forever de las misiones de Classic que dan armas (quests), leídos de foreverchanges.pro, un dato por ítem o misión, citado en ref. Generado por scripts/fetch-item-sources.js; no editar a mano: las correcciones van en data/item-sources.json, que tiene prioridad.',
    source: BASE, fetched: same && prev.fetched ? prev.fetched : today, items: out, quests,
    dungeons, dungeonsRef: BASE + '/dungeon-quests'
  }, null, 1) + '\n');
  console.log('Armas nuevas: ' + targets.length + ' · con misión encontrada: ' + found +
    ' · misiones de Classic: ' + Object.keys(quests).length + '/' + classicQuestIds.size + ' (de dungeon: ' + Object.values(quests).filter(q => q.dungeon).length + ') · dungeons con rango de nivel: ' + Object.keys(dungeons).length);
})().catch(e => { console.error(e.message); process.exit(1); });
