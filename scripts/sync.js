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
const { root, rel, readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');
const wowhead = require('./lib/wowhead');

const cacheDir = http.cacheDir;
const args = process.argv.slice(2);
const OFFLINE = http.OFFLINE;

// The newest builds on wago.tools (re-read hourly); when it doesn't answer,
// the last list it gave, else the builds already in data/meta.json.
async function latestBuilds() {
  const all = await http.get('https://wago.tools/api/builds', { cache: 'wago/_builds.json', maxAgeDays: 1 / 24, json: true });
  if (!all) { console.log('wago.tools no respondió: sigo con los builds de data/meta.json.'); return null; }
  const pick = (product, prefix) => (all[product] || [])
    .filter(b => b.version.startsWith(prefix))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return { forever: pick('wow_classic_beta', '1.60.'), era: pick('wow_classic_era', '1.15.') };
}

// A client table of one build (never changes, so it's kept for good). When
// wago.tools is down, AllTheThings keeps copies of some Forever tables.
const isCSV = t => /^[\w"]+,/.test(t) && !/<html/i.test(t.slice(0, 500));
async function table(name, build) {
  const cache = 'wago/' + build + '/' + name + '.csv';
  let text = await http.get('https://wago.tools/db2/' + name + '/csv?build=' + build, { cache, valid: isCSV });
  if (text == null) {
    text = await http.get('https://raw.githubusercontent.com/ATTWoWAddon/AllTheThings/master/.contrib/.db/forever/.config/.wago/' + name + '.' + build + '.csv', { cache, valid: isCSV });
    if (text != null) console.log('  ' + name + ': copia de AllTheThings (wago.tools no respondió)');
  }
  if (text == null) throw new Error('sin la tabla ' + name + ' del build ' + build + ' (wago.tools caído y sin copia)');
  return parseCSV(text);
}

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
  const parse = raw => { try { const j = JSON.parse(raw); return j.tooltip ? j : null; } catch (e) { return null; } };
  let done = 0;
  for (const id of ids) {
    let j = parse(await wowhead.item('forever', id));
    let numbers = 'forever';
    if (!j) { j = parse(await wowhead.item('classic', id)); numbers = 'classic'; }
    if (++done % 500 === 0) console.log('  tooltips: ' + done + '/' + ids.length);
    if (!j) continue;
    result[id] = Object.assign(parseTooltip(j.tooltip), { numbers, icon: j.icon || null });
    rawById[id] = j;
  }
  return { result, raw: rawById };
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
  const tfText = await http.get('https://talentsforever.com/export/shaman.json', { cache: 'talentsforever/shaman.json', maxAgeDays: 0.5, valid: wowhead.isJSON });
  if (tfText == null) throw new Error('sin datos de talentsforever.com');
  const shaman = JSON.parse(tfText);
  const talentLines = diffTalents(prevShaman, shaman);
  require('./lib/files').writeText('data/shaman.json', tfText); // as published, not reformatted

  // Item sources: QuestieDB's Forever files (refreshed daily) and zone names
  // from the client. Needed first: QuestieDB also tells which streamed items exist.
  // Classic's NPC file fills in locations the Forever one lacks yet. Re-read
  // twice a day; scripts/lib/questie.js reads them from .cache/questiedb/.
  for (const f of ['foreverItemDB', 'foreverNpcDB', 'foreverQuestDB', 'classicNpcDB']) {
    const dir = f.startsWith('classic') ? 'Classic' : 'Forever';
    const text = await http.get('https://raw.githubusercontent.com/Questie/QuestieDB/master/data/' + dir + '/' + f + '.lua',
      { cache: 'questiedb/' + f + '.lua', maxAgeDays: 0.5, valid: t => t.includes('QuestieDB') });
    if (text == null) throw new Error('sin QuestieDB ' + f);
  }
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
  const { result, raw } = await tooltips(ids);
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
  if (talentLines.length || itemLines.length) {
    const log = readJSON('data/changelog.json', { entries: [] });
    const today = log.entries[0] && log.entries[0].date === meta.syncedAt ? log.entries.shift() : { date: meta.syncedAt, talents: [], items: [] };
    today.build = build;
    today.talents = today.talents.concat(talentLines.filter(l => !today.talents.includes(l)));
    today.items = today.items.concat(itemLines.filter(l => !today.items.includes(l)));
    log.entries = [today].concat(log.entries).slice(0, 90);
    writeJSON('data/changelog.json', log);
  }
  fs.mkdirSync(rel('reports'), { recursive: true });
  fs.writeFileSync(rel(reportFile), report);
  console.log('Reporte: ' + reportFile);
  console.log('Talentos/hechizos con cambios: ' + talentLines.length + ' · ítems con cambios: ' + itemLines.length);

  // Then: weapon quest sources (foreverchanges.pro), how hard each weapon quest
  // really is (fetch-levels), and every build step once, offline from here on.
  // build-data also runs every validator (rules, translations, builds).
  const env = Object.assign({}, process.env, OFFLINE ? { SYNC_OFFLINE: '1' } : {});
  const step = name => execFileSync(process.execPath, [path.join(__dirname, name)], { stdio: 'inherit', env });
  step('fetch-item-sources.js');
  step('fetch-levels.js');
  step('build-weapons.js');
  // Recipe sources come from scripts/fetch-recipes.js (run it to refresh them).
  step('build-professions.js');
  step('build-data.js');
  console.log('Descargas del sync: ' + (http.summary() || 'ninguna'));
})().catch(e => { console.error(e.message); process.exit(1); });
