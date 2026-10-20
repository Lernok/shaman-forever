// What skinning gives at each level and where to do it, for the "Leatherworking
// while leveling" plan (js/lw-plan.js).
//
// - Yield per skin by the beast's level: Wowhead Classic's "Skinned from" tab of
//   each leather and hide (count / skins of every beast skinned often enough),
//   averaged by level. Wowhead Forever's pages refuse scripts; skinning loot
//   goes by the beast's level, and Forever kept Classic's leathers.
// - Beasts per zone: the skinnable ones (in any of those tabs) that QuestieDB's
//   Forever data places in each zone, hostile, with their level and spawn count;
//   and how much of the zone's hostile spawns they are (a zone of humanoids
//   gives few skins while you level).
// - The Leatherworking recipes learned from the trainer or for Merchant's
//   Favor, with their reagents and skill colors (data/recipes.json).
//
// Only these facts, with the source cited on the page; fetched politely and
// cached in .cache/wowhead-classic/ (refreshed monthly).
//
//   node scripts/build-skinning.js [--offline]
//
// Writes data/skinning.json.
const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./lib/csv');
const { parseLua } = require('./lib/questie');
const RECIPES = require('./lib/recipes');
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');

// Leathers and hides, low to high.
const SKIN = [2934, 2318, 783, 2319, 4232, 4234, 4235, 4304, 8169];
// A beast's rate counts once it was skinned this often (small samples swing).
const MIN_SKINS = 500;
// Zone lists: beasts of up to this level, the most numerous first.
const TOP_BEASTS = 8;

function skinnedFrom(html) {
  const at = html.indexOf("id: 'skinned-from'");
  if (at < 0) return [];
  const start = html.indexOf('data: [', at) + 6;
  let depth = 0;
  let end = start;
  for (; end < html.length; end++) {
    if (html[end] === '[') depth++;
    else if (html[end] === ']' && !--depth) break;
  }
  try { return JSON.parse(html.slice(start, end + 1)); } catch (e) { return []; }
}

(async () => {
  const meta = readJSON('data/meta.json');
  const build = meta.items.build;
  const pages = {};
  for (const id of SKIN) {
    pages[id] = await http.get('https://www.wowhead.com/classic/item=' + id, {
      cache: 'wowhead-classic/skinned-' + id + '.html', maxAgeDays: 30, valid: t => t.includes("id: 'skinned-from'")
    });
    // Wowhead may refuse the sync's servers: the last data/skinning.json stays.
    if (pages[id] == null) {
      console.log('Despellejar: sin la página de Wowhead del ítem ' + id + '; queda data/skinning.json como estaba.');
      return;
    }
  }

  // Beasts: id -> { level, skins, got: { item: count } }.
  const beasts = new Map();
  SKIN.forEach(id => skinnedFrom(pages[id]).forEach(r => {
    if (r.type !== 1 || !r.minlevel) return; // NPCs only (not chests)
    const b = beasts.get(r.id) || { level: r.minlevel, skins: 0, got: {} };
    b.skins = Math.max(b.skins, r.outof);
    b.got[id] = (b.got[id] || 0) + r.count;
    beasts.set(r.id, b);
  }));

  // Yield per skin at each beast level 1-60 (levels without enough data take the nearest).
  const sums = {};
  beasts.forEach(b => {
    if (b.skins < MIN_SKINS || b.level > 60) return;
    const s = sums[b.level] = sums[b.level] || { skins: 0, got: {} };
    s.skins += b.skins;
    Object.entries(b.got).forEach(([id, n]) => { s.got[id] = (s.got[id] || 0) + n; });
  });
  const known = Object.keys(sums).map(Number);
  const yields = [];
  for (let l = 1; l <= 60; l++) {
    const near = known.sort((a, b) => Math.abs(a - l) - Math.abs(b - l) || a - b)[0];
    const s = sums[near];
    const y = {};
    Object.entries(s.got).forEach(([id, n]) => { const r = Math.round(n / s.skins * 1000) / 1000; if (r >= 0.005) y[id] = r; });
    yields.push(y);
  }

  // Forever's NPCs (QuestieDB): name, levels, spawns per zone, friendly to whom.
  const zoneName = {};
  const areas = await http.get('https://wago.tools/db2/AreaTable/csv?build=' + build, { cache: 'wago/' + build + '/AreaTable.csv', valid: t => /^ID,|,ID,/.test(t.slice(0, 2000)) });
  parseCSV(areas).forEach(r => { zoneName[r.ID] = r.AreaName_lang; });
  const zones = {};
  const npcFile = path.join(http.cacheDir, 'questiedb', 'foreverNpcDB.lua');
  for (const line of fs.readFileSync(npcFile, 'utf8').split('\n')) {
    const m = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
    if (!m) continue;
    const n = parseLua(m[2]);
    const [name, , , lo, hi, rank, spawns] = n;
    if (n[12] || !spawns || typeof spawns !== 'object' || !hi || hi > 62 || rank === 3) continue; // hostile, placed, not a boss
    const id = Number(m[1]);
    const b = beasts.get(id);
    Object.entries(spawns).forEach(([zid, list]) => {
      const zone = zoneName[zid];
      const count = Array.isArray(list) ? list.length : 0;
      if (!zone || !count) return;
      const z = zones[zone] = zones[zone] || { hostile: 0, skinnable: 0, beasts: [] };
      z.hostile += count;
      if (!b) return;
      z.skinnable += count;
      z.beasts.push({ id, name, level: [lo || hi, hi], spawns: count, rare: rank === 2 || rank === 4 || undefined });
    });
  }
  const outZones = {};
  Object.entries(zones).sort((a, b) => a[0].localeCompare(b[0])).forEach(([zone, z]) => {
    if (z.skinnable < 10) return;
    outZones[zone] = {
      share: Math.round(z.skinnable / z.hostile * 100) / 100,
      beasts: z.beasts.sort((a, b) => b.spawns - a.spawns).slice(0, TOP_BEASTS * 3)
    };
  });

  // Leatherworking recipes: trainer ('t'), known at the start ('t'), Merchant's Favor ('f').
  const recipes = readJSON('data/recipes.json').professions.leatherworking;
  // The same classifier as the gear pages (it reads the addon's in-game scan too).
  const R = RECIPES.open();
  const outRecipes = [];
  Object.values(recipes).forEach(r => {
    const L = r.itemId ? R.learn('Leatherworking', r.itemId, r.name) : RECIPES.learnOf(r.source);
    const how = L.type === 'trainer' ? 't' : L.type === 'favor' ? 'f' : null;
    if (!how || !r.itemId || !r.mats || !r.mats.length || r.skill.some(s => s == null) || r.skill[0] > 300) return;
    outRecipes.push({ id: r.itemId, name: r.name, skill: r.skill, mats: r.mats, how, favor: L.favor });
  });
  outRecipes.sort((a, b) => a.skill[0] - b.skill[0] || a.name.localeCompare(b.name));

  // Names of what the recipes and skins use (raw materials aren't items we list elsewhere).
  const names = {};
  const icons = {};
  const sparse = await http.get('https://wago.tools/db2/ItemSparse/csv?build=' + build, { cache: 'wago/' + build + '/ItemSparse.csv', valid: t => /^ID,|,ID,/.test(t.slice(0, 2000)) });
  const nameOf = new Map(parseCSV(sparse).map(r => [Number(r.ID), r.Display_lang]));
  const wanted = new Set(SKIN.concat(...outRecipes.map(r => r.mats.map(m => m[0])), outRecipes.map(r => r.id)));
  for (const id of wanted) {
    const made = Object.values(recipes).find(r => r.itemId === id) || {};
    let name = nameOf.get(id) || made.name;
    let icon = made.icon || null;
    if (!name || !icon) {
      const tip = await require('./lib/wowhead').item('forever', id);
      try { const j = JSON.parse(tip); name = name || j.name; icon = icon || j.icon || null; } catch (e) { /* stays as is */ }
    }
    if (name) names[id] = name;
    if (icon) icons[id] = icon;
  }

  writeJSON('data/skinning.json', {
    _readme: 'Written by scripts/build-skinning.js. yields[level-1]: items per skin of a beast of that level. zones: skinnable beasts (share of the hostile spawns). recipes: Leatherworking, trainer (t) or Merchant\'s Favor (f).',
    sources: { yields: 'https://www.wowhead.com/classic/item=783/light-hide#skinned-from', beasts: 'https://github.com/Questie/QuestieDB', recipes: 'https://classicwowforever.com/professions/leatherworking/recipes/' },
    skin: SKIN, yields, zones: outZones, recipes: outRecipes, names, icons
  });
  console.log('Despellejar: ' + beasts.size + ' bestias con datos, ' + Object.keys(outZones).length + ' zonas, ' + outRecipes.length + ' recetas de Peletería');
})().catch(e => { console.error(e.message); process.exit(1); });
