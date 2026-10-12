// Builds data/weapons.json: every weapon a Shaman can use, with exact numbers
// (data/items.json, from scripts/sync.js) and where it comes from:
//   crafted        from the client's recipe tables (exact)
//   drop / quest / vendor   from QuestieDB's Forever data (Classic sources, not
//                  re-verified in Forever: confidence "classic-assumed")
//   unknown        new in Forever and nobody has recorded a source yet
//
//   node scripts/build-weapons.js
const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./lib/csv');
const questie = require('./lib/questie');

const root = path.join(__dirname, '..');
const cacheDir = path.join(root, '.cache');
const { build, items } = JSON.parse(fs.readFileSync(path.join(root, 'data/items.json'), 'utf8'));

const zones = {};
const areaFile = path.join(cacheDir, 'wago', build, 'AreaTable.csv');
if (fs.existsSync(areaFile)) parseCSV(fs.readFileSync(areaFile, 'utf8')).forEach(r => { zones[r.ID] = r.AreaName_lang; });
const Q = questie.open(cacheDir, zones);

// Dungeons and raids get their own tag so drops read as "boss in X".
const INSTANCE = /Ruins of Lordaeron|Deadmines|Wailing Caverns|Shadowfang Keep|Blackfathom|Stockade|Gnomeregan|Razorfen|Scarlet Monastery|Uldaman|Zul'Farrak|Maraudon|Sunken Temple|Temple of Atal|Blackrock Depths|Blackrock Spire|Dire Maul|Scholomance|Stratholme|Ragefire|Molten Core|Onyxia|Blackwing|Zul'Gurub|Ahn'Qiraj|Naxxramas|Barrow Deeps|Hyjal/i;
// Raids (and raid-like summons). Forever has its own raid lineup (Barrow Deeps,
// Hyjal Summit, Onyxia...), so Classic raid sources are the least certain.
const RAID = /Molten Core|Onyxia|Blackwing|Zul'Gurub|Ahn'Qiraj|Naxxramas|Barrow Deeps|Hyjal|Silithus/i;

function classify(item) {
  if (item.crafted) {
    return [{ type: 'crafted', profession: item.crafted.profession, yellow: item.crafted.yellow, grey: item.crafted.grey, faction: 'both', confidence: 'client-data' }];
  }
  const src = Q.sources(item.id) || [];
  const out = [];
  const drops = src.filter(s => s.type === 'drop' && s.name);
  if (drops.length && drops.length <= 3) {
    drops.forEach(d => out.push({ type: INSTANCE.test(d.zone || '') ? 'boss' : 'drop', npc: d.name, level: d.level, rank: d.rank, zone: d.zone, zoneId: d.zoneId,
      raid: RAID.test(d.zone || ''), faction: 'both', confidence: 'classic-assumed' }));
  } else if (drops.length > 3) {
    const zonesSeen = [...new Set(drops.map(d => d.zone).filter(Boolean))];
    out.push({ type: 'trash', count: drops.length, zones: zonesSeen.slice(0, 3), faction: 'both', confidence: 'classic-assumed' });
  }
  src.filter(s => s.type === 'quest').forEach(q => out.push({ type: 'quest', quest: q.name || ('#' + q.id), questId: q.id, level: q.level, requiredLevel: q.requiredLevel, zone: q.zone, faction: q.faction || 'both', confidence: 'classic-assumed' }));
  // PvP rank rewards: sold in the rank halls, or named after a PvP rank.
  const pvp = /^(Premier )?(High Warlord|Grand Marshal|Premier|Warlord|Marshal|General|Champion|Blood Guard|Knight-Lieutenant|Legionnaire|Stone Guard|Lieutenant Commander)'s /.test(item.name);
  src.filter(s => s.type === 'vendor').forEach(v => out.push({ type: 'vendor', npc: v.name, zone: v.zone, faction: v.faction,
    pvp: pvp || /Champions' Hall|Hall of Legends/.test(v.zone || ''), confidence: 'classic-assumed' }));
  // No recorded source: a Classic item is usually a world or rare-mob drop
  // (QuestieDB tracks quest-related drops, not every loot table); a new Forever
  // item is simply unknown until someone reports it.
  if (!out.length) {
    out.push(item.era === 'new'
      ? { type: 'unknown', faction: 'both', pvp: pvp || undefined, confidence: 'community-untested' }
      : { type: 'unrecorded', faction: 'both', confidence: 'classic-assumed' });
  }
  return out;
}

// Recorded sources replace an "unknown" and add to the automatic ones: by hand
// (data/item-sources.json) first, else from foreverchanges.pro
// (data/item-sources-fc.json, scripts/fetch-item-sources.js).
const readItems = f => (fs.existsSync(path.join(root, f)) ? JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')).items : {});
const manual = readItems('data/item-sources.json');
const fetched = readItems('data/item-sources-fc.json');
const fcQuests = (fs.existsSync(path.join(root, 'data/item-sources-fc.json')) && JSON.parse(fs.readFileSync(path.join(root, 'data/item-sources-fc.json'), 'utf8')).quests) || {};
function sourcesOf(item) {
  const auto = classify(item);
  const rec = manual[item.id] || fetched[item.id];
  const extra = (rec && rec.sources) || [];
  // Classic quests: Forever's level and zone when foreverchanges.pro has them.
  auto.forEach(s => {
    const fq = s.type === 'quest' && fcQuests[s.questId];
    if (!fq) return;
    Object.assign(s, { level: fq.level, requiredLevel: fq.requiredLevel || s.requiredLevel, zone: fq.zone, dungeon: fq.dungeon, ref: fq.ref });
  });
  // Dungeon quests: worth calling out, their rewards are often the best of their level.
  // Also chains with a step in a dungeon (Hidden Enemies: handed in at Orgrimmar,
  // Bazzalan and Jergosh are in Ragefire Chasm).
  auto.concat(extra).forEach(s => {
    if (s.type !== 'quest') return;
    if (s.dungeon || INSTANCE.test(s.zone || '')) { s.dungeon = true; return; }
    const inside = s.questId && Q.chainZones(s.questId).find(z => INSTANCE.test(z) && !RAID.test(z));
    if (inside) { s.dungeon = true; s.dungeonZone = inside; }
  });
  if (!extra.length) return auto;
  return extra.concat(auto.filter(s => s.type !== 'unknown'));
}

// The level you can realistically get it: a quest reward is placed at the
// quest's own level (not the minimum to accept it), e.g. an item that requires
// level 1 but comes from a level-30 quest.
function obtainLevel(item, sources) {
  const fromQuest = sources.filter(s => s.type === 'quest' && (s.level || s.requiredLevel)).map(s => s.level || s.requiredLevel);
  return Math.max(item.req || 0, fromQuest.length ? Math.min(...fromQuest) : 0);
}

const WEAPON_KINDS = ['2H Axe', '2H Mace', 'Staff', '1H Axe', '1H Mace', 'Dagger', 'Fist'];
const weapons = Object.values(items)
  .filter(i => WEAPON_KINDS.includes(i.kind) && i.dps)
  .map(i => {
    const sources = sourcesOf(i);
    return {
      id: i.id, name: i.name, kind: i.kind, quality: i.quality, req: i.req, obtain: obtainLevel(i, sources), ilvl: i.ilvl, bind: i.bind,
      dps: i.dps, speed: i.speed, dmgMin: i.dmgMin, dmgMax: i.dmgMax,
      stats: i.stats || {}, bonus: i.bonus || {}, equip: i.equip || [], chance: i.chance || [],
      era: i.era, numbers: i.numbers || 'forever', raceMask: i.raceMask, sources
    };
  })
  .sort((a, b) => a.obtain - b.obtain || b.dps - a.dps);

fs.writeFileSync(path.join(root, 'data/weapons.json'), JSON.stringify({ build, weapons }, null, 1) + '\n');
const count = t => weapons.filter(w => w.sources.some(s => s.type === t)).length;
console.log('Armas: ' + weapons.length + ' · crafteo ' + count('crafted') + ' · jefe ' + count('boss') + ' · drop ' + count('drop') +
  ' · trash ' + count('trash') + ' · quest ' + count('quest') + ' · vendedor ' + count('vendor') +
  ' · sin registrar (Classic) ' + count('unrecorded') + ' · desconocida (nuevas) ' + count('unknown') +
  ' · con números de Classic ' + weapons.filter(w => w.numbers === 'classic').length);
