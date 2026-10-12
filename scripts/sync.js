// Pulls fresh game data and reports what changed.
//
//   node scripts/sync.js                 latest Forever build on wago.tools
//   node scripts/sync.js 1.60.1.70338    a specific build
//   node scripts/sync.js --offline       reuse .cache only (no network)
//
// Sources:
//   talentsforever.com/export/shaman.json   talents, spellbook, racials (CC BY 4.0)
//   wago.tools db2 CSV                      client item and recipe tables, per build
//   nether.wowhead.com/forever/tooltip      exact item numbers (damage, stats, effects)
//
// Writes data/shaman.json, data/items.json, data/meta.json and
// reports/changes-<from>-to-<to>.md, then runs scripts/build-data.js.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseCSV } = require('./lib/csv');

const root = path.join(__dirname, '..');
const cacheDir = path.join(root, '.cache');
const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const UA = { 'User-Agent': 'shaman-forever-site (fan reference site; data sync)' };

const rel = p => path.join(root, p);
const readJSON = (p, fallback) => (fs.existsSync(rel(p)) ? JSON.parse(fs.readFileSync(rel(p), 'utf8')) : fallback);
const writeJSON = (p, v) => { fs.mkdirSync(path.dirname(rel(p)), { recursive: true }); fs.writeFileSync(rel(p), JSON.stringify(v, null, 1) + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cached(file, url) {
  const full = path.join(cacheDir, file);
  if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8');
  if (OFFLINE) throw new Error('offline and not cached: ' + file);
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  const text = await res.text();
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  return text;
}

async function latestBuilds() {
  if (OFFLINE) return null;
  const res = await fetch('https://wago.tools/api/builds', { headers: UA });
  const all = await res.json();
  const pick = (product, prefix) => (all[product] || [])
    .filter(b => b.version.startsWith(prefix))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return { forever: pick('wow_classic_beta', '1.60.'), era: pick('wow_classic_era', '1.15.') };
}

const table = async (name, build) =>
  parseCSV(await cached('wago/' + build + '/' + name + '.csv', 'https://wago.tools/db2/' + name + '/csv?build=' + build));

// ---------- items ----------

const WEAPON = { 0: '1H Axe', 1: '2H Axe', 4: '1H Mace', 5: '2H Mace', 10: 'Staff', 13: 'Fist', 15: 'Dagger' };
const ARMOR = { 1: 'Cloth', 2: 'Leather', 3: 'Mail', 6: 'Shield', 9: 'Totem' };
const PROF = { 164: 'Blacksmithing', 165: 'Leatherworking', 197: 'Tailoring', 202: 'Engineering', 333: 'Enchanting', 171: 'Alchemy' };
const SHAMAN_BIT = 64;
// Fields compared against Classic Era to flag items Forever changed.
const COMPARE = ['ItemLevel', 'RequiredLevel', 'ItemDelay', 'OverallQualityID', 'Bonding',
  ...Array.from({ length: 10 }, (_, i) => 'StatModifier_bonusStat_' + i)];

function kindOf(item) {
  if (item.ClassID === '2' && WEAPON[item.SubclassID]) return WEAPON[item.SubclassID];
  if (item.ClassID === '4' && ARMOR[item.SubclassID]) return ARMOR[item.SubclassID];
  if (item.ClassID === '4' && item.InventoryType === '23') return 'Off-hand';
  if (item.ClassID === '4' && ['2', '11', '12'].includes(item.InventoryType)) return { 2: 'Neck', 11: 'Ring', 12: 'Trinket' }[item.InventoryType];
  return null;
}

// Candidate items, from the client's Item table (complete) plus ItemSparse
// (only ~60% of items: the rest reach the client from the server). Items
// without an ItemSparse row must exist in QuestieDB at level <= 60, and get
// their name/quality/level from the Wowhead tooltip later (fillFromTooltip).
async function itemTables(build, eraBuild, questieLevels) {
  const [sparseRows, itemRows, sla, effects] = await Promise.all([
    table('ItemSparse', build), table('Item', build), table('SkillLineAbility', build), table('SpellEffect', build)
  ]);
  const era = new Map((await table('ItemSparse', eraBuild)).map(r => [r.ID, r]));
  const sparse = new Map(sparseRows.map(r => [r.ID, r]));
  const items = new Map(itemRows.map(r => [r.ID, r]));
  const out = {};

  const add = (id, kind, extra) => {
    const s = sparse.get(id);
    const eraRow = era.get(id);
    if (s) {
      const cls = Number(s.AllowableClass);
      if (cls > 0 && !(cls & SHAMAN_BIT)) return;
      if (Number(s.OverallQualityID) < 2 || Number(s.RequiredLevel) > 60) return;
    // Without an ItemSparse row: keep Classic items QuestieDB lists for Forever,
    // and items new to Forever (not in Classic Era), e.g. new dungeon quest
    // rewards QuestieDB doesn't have yet. Wowhead decides later if they exist.
    } else if (!(questieLevels.get(Number(id)) <= 60) && eraRow && !extra) return;
    out[id] = Object.assign(out[id] || {
      id: Number(id),
      name: s ? s.Display_lang : null,
      kind,
      quality: s ? Number(s.OverallQualityID) : null,
      req: s ? Number(s.RequiredLevel) : null,
      ilvl: s ? Number(s.ItemLevel) : null,
      bind: s ? ({ 1: 'pickup', 2: 'equip', 3: 'use' }[s.Bonding] || null) : null,
      raceMask: s ? Number(s.AllowableRace_0) : -1,
      // 'classic' = exists in Classic Era but Forever streams it from the server,
      // so we can't compare the client rows.
      era: !eraRow ? 'new' : !s ? 'classic' : COMPARE.some(f => eraRow[f] !== s[f]) ? 'changed' : 'same'
    }, extra || {});
  };

  // Every weapon, shield, off-hand and totem a Shaman can use.
  for (const it of itemRows) {
    const kind = kindOf(it);
    if (kind && (it.ClassID === '2' || ['Shield', 'Off-hand', 'Totem'].includes(kind))) add(it.ID, kind);
  }

  // Crafted gear a Shaman can use: recipe spell -> created item.
  const created = new Map();
  effects.forEach(e => { if (e.Effect === '24' && !created.has(e.SpellID)) created.set(e.SpellID, e.EffectItemType); });
  for (const r of sla) {
    const prof = PROF[r.SkillLine];
    const itemId = prof && created.get(r.Spell);
    const it = itemId && items.get(itemId);
    const kind = it && kindOf(it);
    if (!kind) continue;
    add(itemId, kind, { crafted: { profession: prof, spell: Number(r.Spell), yellow: Number(r.TrivialSkillLineRankLow), grey: Number(r.TrivialSkillLineRankHigh) } });
  }
  return out;
}

// Name/quality/level/binding for items the client tables don't describe, and
// the class restriction line; returns false when the item isn't for us.
function fillFromTooltip(item, json) {
  const html = json.tooltip || '';
  if (item.name == null) item.name = json.name;
  if (item.quality == null) item.quality = json.quality;
  const rl = html.match(/Requires Level <!--rlvl-->(\d+)/);
  if (item.req == null) item.req = rl ? Number(rl[1]) : 0;
  const il = html.match(/<!--ilvl-->(\d+)/);
  if (item.ilvl == null && il) item.ilvl = Number(il[1]);
  if (item.bind == null) item.bind = /Binds when picked up/.test(html) ? 'pickup' : /Binds when equipped/.test(html) ? 'equip' : null;
  const classes = html.replace(/<[^>]+>/g, '').match(/Classes: ([A-Za-z ,]+)/);
  if (classes && !/Shaman/.test(classes[1])) return false;
  // A few recipes sit in the weapon rows of the client's Item table.
  if (/^(Pattern|Plans|Schematic|Formula|Recipe): |^\[TMP\]/.test(item.name)) return false;
  return item.quality >= 2 && item.req <= 60;
}

// ---------- Wowhead tooltips (exact numbers) ----------

function parseTooltip(html) {
  const text = html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const num = re => { const m = html.match(re); return m ? Number(m[1]) : null; };
  const out = {};
  const dmg = html.match(/<!--dmg-->(\d+) - (\d+)/);
  if (dmg) { out.dmgMin = Number(dmg[1]); out.dmgMax = Number(dmg[2]); }
  out.speed = num(/<!--spd-->([\d.]+)/);
  out.dps = num(/<!--dps-->\(([\d.]+) damage per second/);
  out.armor = num(/<!--amr-->(\d+) Armor/);
  out.block = num(/(\d+) Block/);
  const stats = {};
  for (const m of html.matchAll(/<!--stat(\d+)-->\+(\d+) (\w+)/g)) stats[m[3].toLowerCase()] = Number(m[2]);
  out.stats = stats;
  out.equip = (text.match(/Equip: [^\n]+/g) || []).map(s => s.trim());
  out.use = (text.match(/Use: [^\n]+/g) || []).map(s => s.trim());
  out.chance = (text.match(/Chance on hit: [^\n]+/g) || []).map(s => s.trim());
  // Common equip lines turned into numbers.
  const bonus = {};
  const eq = out.equip.join(' ');
  const grab = (key, re) => { const m = eq.match(re); if (m) bonus[key] = Number(m[1]); };
  grab('spellPower', /damage and healing done by magical spells and effects by up to (\d+)/);
  grab('healing', /healing done by spells and effects by up to (\d+)/);
  grab('attackPower', /\+(\d+) Attack Power/);
  grab('crit', /critical strike by (\d+)%/);
  grab('hit', /chance to hit by (\d+)%/);
  grab('mp5', /Restores (\d+) mana per 5 sec/);
  out.bonus = bonus;
  Object.keys(out).forEach(k => (out[k] == null ? delete out[k] : null));
  return out;
}

// Wowhead Forever only knows items someone has seen in Forever; high-level
// Classic items the level-30 beta never streamed are missing there. For those
// we fall back to Wowhead Classic and mark numbers: 'classic'.
async function tooltips(ids) {
  const result = {};
  const rawById = {};
  let fetched = 0;
  async function get(env, id) {
    const full = path.join(cacheDir, env === 'forever' ? 'wowhead' : 'wowhead-classic', 'item-' + id + '.json');
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8');
    if (OFFLINE) return null;
    const res = await fetch('https://nether.wowhead.com/' + env + '/tooltip/item/' + id, { headers: UA });
    const raw = await res.text();
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, raw);
    fetched++;
    if (fetched % 100 === 0) console.log('  tooltips: ' + fetched + ' descargados…');
    await sleep(250); // polite: ~4 requests per second
    return raw;
  }
  const parse = raw => { try { const j = JSON.parse(raw); return j.tooltip ? j : null; } catch (e) { return null; } };
  for (const id of ids) {
    let j = parse(await get('forever', id));
    let numbers = 'forever';
    if (!j) { j = parse(await get('classic', id)); numbers = 'classic'; }
    if (!j) continue;
    result[id] = Object.assign(parseTooltip(j.tooltip), { numbers });
    rawById[id] = j;
  }
  return { result, raw: rawById, fetched };
}

// ---------- change report ----------

function diffTalents(prev, next) {
  const lines = [];
  if (!prev) return lines;
  const index = d => {
    const m = new Map();
    d.talents.trees.forEach(t => t.talents.forEach(x => m.set(t.name + ' / ' + x.name, x)));
    return m;
  };
  const a = index(prev);
  const b = index(next);
  b.forEach((x, k) => {
    const o = a.get(k);
    if (!o) { lines.push('- Talento nuevo: **' + k + '**'); return; }
    const what = [];
    if (o.row !== x.row || o.col !== x.col) what.push('posición ' + o.row + '.' + o.col + ' → ' + x.row + '.' + x.col);
    if (o.max !== x.max) what.push('rangos ' + o.max + ' → ' + x.max);
    if ((o.req || '') !== (x.req || '')) what.push('requisito ' + (o.req || '—') + ' → ' + (x.req || '—'));
    if (JSON.stringify(o.desc) !== JSON.stringify(x.desc)) what.push('texto: "' + o.desc[o.desc.length - 1] + '" → "' + x.desc[x.desc.length - 1] + '"');
    if (what.length) lines.push('- **' + k + '**: ' + what.join('; '));
  });
  a.forEach((x, k) => { if (!b.has(k)) lines.push('- Talento eliminado: **' + k + '**'); });
  const sa = prev.spell_desc || {};
  const sb = next.spell_desc || {};
  Object.keys(sb).forEach(k => {
    if (!sa[k]) lines.push('- Hechizo nuevo: **' + k.split('|').slice(1).join(' ') + '**');
    else if (sa[k].d !== sb[k].d) lines.push('- **' + k.split('|').slice(1).join(' ') + '**: "' + sa[k].d + '" → "' + sb[k].d + '"');
  });
  return lines;
}

function diffItems(prev, next) {
  const lines = [];
  if (!prev) return lines;
  const NUMS = ['req', 'ilvl', 'quality', 'dmgMin', 'dmgMax', 'speed', 'armor'];
  Object.values(next).forEach(x => {
    const o = prev[x.id];
    if (!o) { lines.push('- Ítem nuevo: **' + x.name + '** (' + x.kind + ', nivel ' + x.req + ') #' + x.id); return; }
    const what = NUMS.filter(f => o[f] !== x[f]).map(f => f + ' ' + o[f] + ' → ' + x[f]);
    if (JSON.stringify(o.stats || {}) !== JSON.stringify(x.stats || {})) what.push('stats ' + JSON.stringify(o.stats || {}) + ' → ' + JSON.stringify(x.stats || {}));
    if (JSON.stringify(o.equip || []) !== JSON.stringify(x.equip || [])) what.push('efectos cambiados');
    if (what.length) lines.push('- **' + x.name + '** #' + x.id + ': ' + what.join('; '));
  });
  Object.values(prev).forEach(o => { if (!next[o.id]) lines.push('- Ítem eliminado: **' + o.name + '** #' + o.id); });
  return lines;
}

// ---------- main ----------

(async () => {
  const meta = readJSON('data/meta.json', {});
  const latest = await latestBuilds();
  const build = args.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || (latest && latest.forever.version) || (meta.items && meta.items.build);
  const eraBuild = (latest && latest.era.version) || (meta.items && meta.items.eraBuild);
  if (!build || !eraBuild) throw new Error('no build to sync (try without --offline)');
  console.log('Forever build: ' + build + ' · Classic Era: ' + eraBuild);

  // Talents / spellbook / racials from talentsforever.com.
  const prevShaman = readJSON('data/shaman.json', null);
  const tfText = await cached('talentsforever/shaman-' + new Date().toISOString().slice(0, 10) + '.json', 'https://talentsforever.com/export/shaman.json');
  const shaman = JSON.parse(tfText);
  const talentLines = diffTalents(prevShaman, shaman);
  fs.writeFileSync(rel('data/shaman.json'), tfText); // as published, not reformatted

  // Item sources: QuestieDB's Forever files (refreshed daily) and zone names
  // from the client. Needed first: QuestieDB also tells which streamed items exist.
  const day = new Date().toISOString().slice(0, 10);
  // Classic's NPC file fills in locations the Forever one lacks yet.
  for (const f of ['foreverItemDB', 'foreverNpcDB', 'foreverQuestDB', 'classicNpcDB']) {
    const dir = f.startsWith('classic') ? 'Classic' : 'Forever';
    const text = await cached('questiedb-raw/' + day + '/' + f + '.lua', 'https://raw.githubusercontent.com/Questie/QuestieDB/master/data/' + dir + '/' + f + '.lua');
    fs.mkdirSync(path.join(cacheDir, 'questiedb'), { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'questiedb', f + '.lua'), text);
  }
  // Keep only today's raw copies.
  fs.readdirSync(path.join(cacheDir, 'questiedb-raw')).filter(d => d !== day)
    .forEach(d => fs.rmSync(path.join(cacheDir, 'questiedb-raw', d), { recursive: true, force: true }));
  await table('AreaTable', build);
  const questieLevels = new Map();
  const { parseLua } = require('./lib/questie');
  for (const line of fs.readFileSync(path.join(cacheDir, 'questiedb', 'foreverItemDB.lua'), 'utf8').split('\n')) {
    const m = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
    if (!m) continue;
    const requiredLevel = parseLua(m[2])[9]; // QuestieDB itemKeys: requiredLevel is field 10
    if (typeof requiredLevel === 'number') questieLevels.set(Number(m[1]), requiredLevel);
  }

  // Items from the client tables, then exact numbers from Wowhead.
  const prevItems = (readJSON('data/items.json', {}).items) || null;
  const items = await itemTables(build, eraBuild, questieLevels);
  let ids = Object.keys(items).map(Number).sort((a, b) => a - b);
  console.log('Candidatos: ' + ids.length + ' (trayendo números de Wowhead, con caché)');
  const { result, raw, fetched } = await tooltips(ids);
  ids.forEach(id => {
    if (!raw[id] || !fillFromTooltip(items[id], raw[id])) { delete items[id]; return; }
    Object.assign(items[id], result[id]);
  });
  ids = Object.keys(items).map(Number).sort((a, b) => a - b);
  console.log('Ítems usables por Shaman (calidad verde o mejor, nivel ≤ 60): ' + ids.length);
  const itemLines = diffItems(prevItems, items);
  writeJSON('data/items.json', { build, eraBuild, items });

  const prevMeta = JSON.parse(JSON.stringify(meta));
  meta.talents = { source: 'talentsforever.com', generated: shaman.generated, build: (shaman.talents.source.match(/build (\d+\.\d+\.\d+\.\d+)/) || [])[1] || null };
  meta.items = { build, eraBuild, count: ids.length };
  meta.syncedAt = new Date().toISOString().slice(0, 10);
  writeJSON('data/meta.json', meta);

  const from = (prevMeta.items && prevMeta.items.build) || 'inicial';
  const report = [
    '# Cambios: ' + from + ' → ' + build,
    '',
    'Sincronizado el ' + meta.syncedAt + '. Talentos de talentsforever.com (build ' + meta.talents.build + ', export ' + shaman.generated + '); ítems del cliente ' + build + '.',
    '',
    '## Talentos y hechizos (' + talentLines.length + ')',
    talentLines.length ? talentLines.join('\n') : (prevShaman ? 'Sin cambios.' : 'Primera sincronización.'),
    '',
    '## Ítems (' + itemLines.length + ')',
    itemLines.length ? itemLines.join('\n') : (prevItems ? 'Sin cambios.' : 'Primera sincronización: ' + ids.length + ' ítems.'),
    ''
  ].join('\n');
  const reportFile = 'reports/changes-' + from + '-to-' + build + '.md';
  fs.mkdirSync(rel('reports'), { recursive: true });
  fs.writeFileSync(rel(reportFile), report);
  console.log('Tooltips nuevos descargados: ' + fetched + '. Reporte: ' + reportFile);
  console.log('Talentos/hechizos con cambios: ' + talentLines.length + ' · ítems con cambios: ' + itemLines.length);

  // Weapon sources, then regenerate bundles; build-data also runs every
  // validator (rules, translations, builds). Quest sources of new weapons come
  // from foreverchanges.pro (cached per page, so only new items are fetched).
  if (!OFFLINE) execFileSync(process.execPath, [path.join(__dirname, 'fetch-item-sources.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'build-weapons.js')], { stdio: 'inherit' });
  // Recipe sources come from scripts/fetch-recipes.js (run it to refresh them).
  execFileSync(process.execPath, [path.join(__dirname, 'build-professions.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'build-data.js')], { stdio: 'inherit' });
})().catch(e => { console.error(e.message); process.exit(1); });
