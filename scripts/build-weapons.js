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
    drops.forEach(d => out.push({ type: INSTANCE.test(d.zone || '') ? 'boss' : 'drop', npc: d.name, npcId: d.id, level: d.level, rank: d.rank, zone: d.zone, zoneId: d.zoneId,
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
const fc = fs.existsSync(path.join(root, 'data/item-sources-fc.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/item-sources-fc.json'), 'utf8')) : {};
const fcQuests = fc.quests || {};
// Dungeon level ranges ("Ruins of Lordaeron": [15, 20]), matched without "The ".
const bare = z => (z || '').replace(/^The /, '').toLowerCase();
const dungeonRange = {};
Object.entries(fc.dungeons || {}).forEach(([z, r]) => { dungeonRange[bare(z)] = r; });
function sourcesOf(item) {
  const auto = classify(item);
  const rec = manual[item.id] || fetched[item.id];
  const extra = (rec && rec.sources) || [];
  // Classic quests: Forever's level and zone when foreverchanges.pro has them.
  auto.forEach(s => {
    const fq = s.type === 'quest' && fcQuests[s.questId];
    if (!fq) return;
    Object.assign(s, { level: fq.level, requiredLevel: fq.requiredLevel || s.requiredLevel, zone: fq.zone, dungeon: fq.dungeon, bands: fq.bands, ref: fq.ref });
  });
  // Dungeon quests: worth calling out, their rewards are often the best of their level.
  // Also chains with a step in a dungeon (Hidden Enemies: handed in at Orgrimmar,
  // Bazzalan and Jergosh are in Ragefire Chasm).
  auto.concat(extra).forEach(s => {
    if (s.type !== 'quest') return;
    // Raid quests (Ahn'Qiraj, Naxxramas…) follow the raids toggle, not dungeons.
    const zonesOf = [s.zone || ''].concat(s.questId ? Q.chainZones(s.questId) : []);
    const raid = zonesOf.find(z => RAID.test(z));
    if (raid) { s.raid = true; s.dungeon = undefined; if (raid !== s.zone) s.dungeonZone = raid; return; }
    if (s.dungeon || INSTANCE.test(s.zone || '')) s.dungeon = true;
    else {
      const inside = zonesOf.slice(1).find(z => INSTANCE.test(z));
      if (inside) { s.dungeon = true; s.dungeonZone = inside; }
    }
    if (s.dungeon) {
      const r = dungeonRange[bare(s.dungeonZone || s.zone)];
      if (r) { s.dungeonLevels = r; s.dungeonRef = fc.dungeonsRef; }
    }
  });
  if (!extra.length) return auto;
  return extra.concat(auto.filter(s => s.type !== 'unknown'));
}

// The level you can realistically get it: a quest reward is placed at the
// quest's own level (not the minimum to accept it), e.g. an item that requires
// level 1 but comes from a level-30 quest. A dungeon quest is done in a group
// as soon as the dungeon is doable: the higher of the quest's minimum level and
// the bottom of the dungeon's range (Forsaken Greataxe: quest 22, from 15,
// Ruins of Lordaeron 15-20, no level to equip it, so 15). Quest rewards often
// have no level requirement, so they're equipped right away.
function questLevel(s) {
  if (s.dungeon && s.dungeonLevels) return Math.max(s.requiredLevel || 0, s.dungeonLevels[0]);
  return s.level || s.requiredLevel;
}
function obtainLevel(item, sources) {
  const fromQuest = sources.filter(s => s.type === 'quest' && (s.level || s.requiredLevel)).map(questLevel);
  return Math.max(item.req || 0, fromQuest.length ? Math.min(...fromQuest) : 0);
}

// Recommended level for each source (scripts/fetch-levels.js, data/levels.json):
// what you have to kill decides it, not the number on the quest. Group content
// (dungeon or elite target): its level - 3; solo: its level - 1. Never below
// the quest's minimum or above the quest's own level. Without a known target,
// a dungeon quest uses one below the dungeon's top level, and a solo quest its
// own level - 1. Each source gets `asap` (first level you could) and `rec`.
const levels = fs.existsSync(path.join(root, 'data/levels.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/levels.json'), 'utf8')) : { quests: {}, npcs: {} };
const GROUP_RANKS = ['elite', 'rare-elite', 'boss'];
function placeSource(item, s) {
  const req = item.req || 0;
  if (s.type === 'quest') {
    const asap = Math.max(req, s.dungeon && s.dungeonLevels ? questLevel(s) : (s.requiredLevel || s.level || 0));
    const L = levels.quests[s.questId];
    let rec;
    if (L && L.hardest && L.hardest.level) {
      const group = s.dungeon || GROUP_RANKS.includes(L.hardest.rank);
      rec = L.hardest.level - (group ? 3 : 1);
      s.basis = { name: L.hardest.name, level: L.hardest.level, rank: L.hardest.rank, from: L.hardest.from, group };
    } else if (s.dungeon && s.dungeonLevels) {
      rec = s.dungeonLevels[1] - 1 - 3;
      s.basis = { from: 'dungeon-range', group: true };
    } else {
      rec = (s.level || s.requiredLevel || 0) - 1;
      s.basis = { from: 'quest-level', group: false };
    }
    rec = Math.max(rec, s.requiredLevel || 0, req);
    if (s.level) rec = Math.min(rec, Math.max(s.level, req));
    s.asap = asap;
    s.rec = Math.max(rec, asap);
  } else if (s.type === 'boss' || s.type === 'drop') {
    const n = s.npcId && levels.npcs[s.npcId];
    const lv = (n && n.level) || Number(String(s.level || '').split('-').pop()) || null;
    const group = s.type === 'boss' || GROUP_RANKS.includes((n && n.rank) || s.rank);
    s.asap = req;
    s.rec = lv ? Math.max(req, lv - (group ? 3 : 1)) : req;
    if (lv) s.basis = { name: s.npc, level: lv, rank: (n && n.rank) || s.rank, from: n && n.from ? n.from : 'questie', group };
  } else {
    s.asap = req;
    s.rec = req;
  }
}

const WEAPON_KINDS = ['2H Axe', '2H Mace', 'Staff', '1H Axe', '1H Mace', 'Dagger', 'Fist'];
const weapons = Object.values(items)
  .filter(i => WEAPON_KINDS.includes(i.kind) && i.dps)
  .map(i => {
    const sources = sourcesOf(i);
    sources.forEach(s => { if (s.type === 'quest' && s.dungeon && s.dungeonLevels) s.early = Math.max(i.req || 0, questLevel(s)); });
    sources.forEach(s => placeSource(i, s));
    return {
      id: i.id, name: i.name, kind: i.kind, quality: i.quality, req: i.req, obtain: obtainLevel(i, sources), ilvl: i.ilvl, bind: i.bind,
      dps: i.dps, speed: i.speed, dmgMin: i.dmgMin, dmgMax: i.dmgMax,
      stats: i.stats || {}, bonus: i.bonus || {}, equip: i.equip || [], chance: i.chance || [],
      era: i.era, numbers: i.numbers || 'forever', icon: i.icon || null, raceMask: i.raceMask, sources
    };
  })
  .sort((a, b) => a.obtain - b.obtain || b.dps - a.dps);

fs.writeFileSync(path.join(root, 'data/weapons.json'), JSON.stringify({ build, weapons }, null, 1) + '\n');
const count = t => weapons.filter(w => w.sources.some(s => s.type === t)).length;
console.log('Armas: ' + weapons.length + ' · crafteo ' + count('crafted') + ' · jefe ' + count('boss') + ' · drop ' + count('drop') +
  ' · trash ' + count('trash') + ' · quest ' + count('quest') + ' · vendedor ' + count('vendor') +
  ' · sin registrar (Classic) ' + count('unrecorded') + ' · desconocida (nuevas) ' + count('unknown') +
  ' · con números de Classic ' + weapons.filter(w => w.numbers === 'classic').length);
