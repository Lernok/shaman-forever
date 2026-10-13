// Where each weapon comes from, gathered from every source in one place, so
// fetch-levels.js (what to look up) and build-weapons.js (the site data) see
// the same thing:
//   crafted              client recipe tables (exact)
//   drop / boss / quest / vendor   QuestieDB (Classic sources, "classic-assumed")
//   quest (new items)    foreverchanges.pro (data/item-sources-fc.json)
//   hand-reported        data/item-sources.json
//
// Facts about a quest (level, minimum level, faction, zone, dungeon) come from
// the automatic sources when they have them. A hand-reported value that
// disagrees is not used: it's listed in conflicts() for the sync report,
// unless the entry says override: { field: "why" }.
const path = require('path');
const fs = require('fs');
const { parseCSV } = require('./csv');
const questie = require('./questie');
const { readJSON } = require('./files');

const WEAPON_KINDS = ['2H Axe', '2H Mace', 'Staff', '1H Axe', '1H Mace', 'Dagger', 'Fist'];
const isWeapon = i => WEAPON_KINDS.includes(i.kind) && i.dps;
const SHAMAN_CLASS = 64;
const QUEST_FACTS = ['level', 'requiredLevel', 'faction', 'zone', 'dungeon'];

// Dungeons and raids get their own tag so drops read as "boss in X".
const INSTANCE = /Ruins of Lordaeron|Deadmines|Wailing Caverns|Shadowfang Keep|Blackfathom|Stockade|Gnomeregan|Razorfen|Scarlet Monastery|Uldaman|Zul'Farrak|Maraudon|Sunken Temple|Temple of Atal|Blackrock Depths|Blackrock Spire|Dire Maul|Scholomance|Stratholme|Ragefire|Molten Core|Onyxia|Blackwing|Zul'Gurub|Ahn'Qiraj|Naxxramas|Barrow Deeps|Hyjal|Hall of Thanes|City of Dalaran|Excavation Site/i;
// Raids (and raid-like summons). Forever has its own raid lineup (Barrow Deeps,
// Hyjal Summit, Onyxia...), so Classic raid sources are the least certain.
const RAID = /Molten Core|Onyxia|Blackwing|Zul'Gurub|Ahn'Qiraj|Naxxramas|Barrow Deeps|Hyjal|Silithus/i;
const PVP_NAME = /^(Premier )?(High Warlord|Grand Marshal|Premier|Warlord|Marshal|General|Champion|Blood Guard|Knight-Lieutenant|Legionnaire|Stone Guard|Lieutenant Commander)'s /;

function open(cacheDir, build) {
  const zones = {};
  const areaFile = path.join(cacheDir, 'wago', build, 'AreaTable.csv');
  if (fs.existsSync(areaFile)) parseCSV(fs.readFileSync(areaFile, 'utf8')).forEach(r => { zones[r.ID] = r.AreaName_lang; });
  const Q = questie.open(cacheDir, zones);
  const manual = readJSON('data/item-sources.json', { items: {} }).items;
  const fc = readJSON('data/item-sources-fc.json', {});
  const fcItems = fc.items || {};
  const fcQuests = fc.quests || {};
  const bare = z => (z || '').replace(/^The /, '').toLowerCase();
  const dungeonRange = {};
  Object.entries(fc.dungeons || {}).forEach(([z, r]) => { dungeonRange[bare(z)] = r; });
  const conflictList = [];

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
    // Quests other classes can't share (QuestieDB class mask) never count.
    src.filter(s => s.type === 'quest' && !(s.classMask && !(s.classMask & SHAMAN_CLASS))).forEach(q => out.push({
      type: 'quest', quest: q.name || ('#' + q.id), questId: q.id, level: q.level, requiredLevel: q.requiredLevel, zone: q.zone, faction: q.faction || 'both', confidence: 'classic-assumed' }));
    // PvP rank rewards: sold in the rank halls, or named after a PvP rank.
    const pvp = PVP_NAME.test(item.name);
    src.filter(s => s.type === 'vendor').forEach(v => out.push({ type: 'vendor', npc: v.name, zone: v.zone, faction: v.faction,
      pvp: pvp || /Champions' Hall|Hall of Legends/.test(v.zone || ''), confidence: 'classic-assumed' }));
    return out;
  }

  // Forever's facts for a quest, when foreverchanges.pro has its page.
  function fcFacts(s) {
    const fq = s.type === 'quest' && fcQuests[s.questId];
    if (fq) Object.assign(s, { level: fq.level, requiredLevel: fq.requiredLevel || s.requiredLevel, zone: fq.zone, dungeon: fq.dungeon, classes: fq.classes, bands: fq.bands, ref: fq.ref });
    return s;
  }

  // A hand-reported source on top of the automatic one for the same quest.
  function mergeManual(item, man, auto) {
    if (!auto) return Object.assign({}, man);
    const out = Object.assign({}, auto);
    const override = man.override || {};
    QUEST_FACTS.forEach(f => {
      if (man[f] == null || man[f] === auto[f]) return;
      if (override[f]) { out[f] = man[f]; return; }
      if (auto[f] != null) conflictList.push(item.name + ' · ' + (auto.quest || man.quest) + ': ' + f + ' a mano ' + JSON.stringify(man[f]) + ', automático ' + JSON.stringify(auto[f]) + ' (se usa el automático)');
      else out[f] = man[f];
    });
    // What only a person knows: the chain before it, the source of the report.
    ['chain', 'note'].forEach(f => { if (man[f] != null) out[f] = man[f]; });
    if (!out.ref) out.ref = man.ref;
    return out;
  }

  function sourcesOf(item) {
    const auto = classify(item).map(fcFacts);
    const recorded = ((fcItems[item.id] || {}).sources || []).map(s => fcFacts(Object.assign({}, s)));
    const all = recorded.concat(auto.filter(a => !(a.questId && recorded.some(r => r.questId === a.questId))));
    ((manual[item.id] || {}).sources || []).forEach(man => {
      const i = man.questId ? all.findIndex(s => s.questId === man.questId) : -1;
      const fq = man.questId && fcQuests[man.questId] ? fcFacts({ type: 'quest', questId: man.questId, quest: man.quest }) : null;
      if (i >= 0) all[i] = mergeManual(item, man, all[i]);
      else all.unshift(mergeManual(item, man, fq ? Object.assign({}, man, fq) : null));
    });
    // Dungeon quests (also chains with a step in a dungeon: Hidden Enemies is
    // handed in at Orgrimmar, Bazzalan and Jergosh are in Ragefire Chasm).
    all.forEach(s => {
      if (s.type !== 'quest') return;
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
    return all;
  }

  // No recorded source: a Classic item is usually a world or rare-mob drop
  // (QuestieDB tracks quest-related drops, not every loot table); a new Forever
  // item is simply unknown until someone reports it.
  const noSource = item => (item.era === 'new'
    ? { type: 'unknown', faction: 'both', pvp: PVP_NAME.test(item.name) || undefined, confidence: 'community-untested' }
    : { type: 'unrecorded', faction: 'both', confidence: 'classic-assumed' });

  return { sourcesOf, noSource, conflicts: () => conflictList.slice(), questie: Q, dungeonRange, bare };
}

module.exports = { open, isWeapon, WEAPON_KINDS, SHAMAN_CLASS };
