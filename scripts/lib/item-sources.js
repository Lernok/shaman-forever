// Where each item (weapon or armor) comes from, gathered from every source in
// one place, so fetch-levels.js (what to look up), build-weapons.js and
// build-gear.js (the site data) see the same thing:
//   crafted              client recipe tables (exact); how the recipe is
//                        learned from data/recipes.json (lib/recipes.js)
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
const recipes = require('./recipes');

const WEAPON_KINDS = ['2H Axe', '2H Mace', 'Staff', '1H Axe', '1H Mace', 'Dagger', 'Fist'];
const isWeapon = i => WEAPON_KINDS.includes(i.kind) && i.dps;
// Everything else a Shaman wears: armor, shields, off-hands, totems, jewelry.
const isGear = i => !WEAPON_KINDS.includes(i.kind);
const SHAMAN_CLASS = 64;
const QUEST_FACTS = ['level', 'requiredLevel', 'faction', 'zone', 'dungeon'];

// Dungeons and raids get their own tag so drops read as "boss in X".
const INSTANCE = /Ruins of Lordaeron|Deadmines|Wailing Caverns|Shadowfang Keep|Blackfathom|Stockade|Gnomeregan|Razorfen|Scarlet Monastery|Uldaman|Zul'Farrak|Maraudon|Sunken Temple|Temple of Atal|Blackrock Depths|Blackrock Spire|Dire Maul|Scholomance|Stratholme|Ragefire|Molten Core|Onyxia|Blackwing|Zul'Gurub|Ahn'Qiraj|Naxxramas|Barrow Deeps|Hyjal|Hall of Thanes|City of Dalaran|Excavation Site/i;
// Raids (and raid-like summons). Forever has its own raid lineup (Barrow Deeps,
// Hyjal Summit, Onyxia...), so Classic raid sources are the least certain.
const RAID = /Molten Core|Onyxia|Blackwing|Zul'Gurub|Ahn'Qiraj|Naxxramas|Barrow Deeps|Hyjal|Silithus/i;
// Battleground reputation quartermasters (Arathi Basin, Warsong Gulch, Alterac
// Valley) and honor-rank officers: their wares cost PvP reputation or rank.
const PVP_VENDOR = /^(Samuel Hawke|Rutherford Twing|Illiyana Moonblaze|Kelm Hargunth|Grunnda Wolfheart|Jekyll Flandring|Gaelden Hammersmith|Thanthaldis Snowgleam|Sergeant Ba'sha|Officer Areyn)$/;
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
  const R = recipes.open();

  function classify(item) {
    if (item.crafted) {
      // How the recipe is learned: trainer, Merchant's Favor (with its cost), drop...
      const learn = R.learn(item.crafted.profession, item.name);
      delete learn.text;
      return [{ type: 'crafted', profession: item.crafted.profession, yellow: item.crafted.yellow, grey: item.crafted.grey, learn, faction: 'both', confidence: 'client-data' }];
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
      pvp: pvp || PVP_VENDOR.test(v.name || '') || /Champions' Hall|Hall of Legends/.test(v.zone || ''), confidence: 'classic-assumed' }));
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

// Places each source at the level you can really get it (data/levels.json,
// from fetch-levels.js). Shared by build-weapons.js and build-gear.js.
const GROUP_RANKS = ['elite', 'rare-elite', 'boss'];
function placer(levels) {
  const factionNotes = [];

  // A quest only other classes can do (foreverchanges' class line, AllTheThings' classes).
  function otherClassQuest(s) {
    if (s.type !== 'quest') return false;
    if (s.classes && !s.classes.includes('Shaman')) return true;
    const L = levels.quests[s.questId];
    return !!(L && L.classes && !L.classes.includes('SHAMAN'));
  }

  // First level you can take part: the quest's minimum, or a dungeon's floor.
  function firstLevel(s) {
    if (s.dungeon && s.dungeonLevels) return Math.max(s.requiredLevel || 0, s.dungeonLevels[0]);
    return s.requiredLevel || s.level || 0;
  }

  // Each source gets `asap` (earliest) and `rec` (recommended). What you have to
  // kill decides it (the hardest target in the quest's whole chain), not the
  // number on the quest: group content (dungeon or elite) recommended 3 below
  // that target and earliest 5 below; solo 1 and 3 below. Never below the quest's
  // minimum or above the quest's own level. With no known target: a dungeon quest
  // uses one below the dungeon's top level, a solo quest its own level - 1.
  function place(item, s) {
    const req = item.req || 0;
    if (s.type === 'quest') {
      const L = levels.quests[s.questId];
      // One faction anywhere in the chain: only that faction gets the reward.
      if (L && (L.faction === 'horde' || L.faction === 'alliance') && s.faction !== L.faction) {
        if (s.faction === 'both') s.faction = L.faction;
        else factionNotes.push(item.name + ' · ' + s.quest + ': facción ' + s.faction + ' en la fuente, ' + L.faction + ' en la cadena (se deja ' + s.faction + ')');
      }
      const first = Math.max(req, firstLevel(s));
      let rec;
      let early = first;
      if (L && L.hardest && L.hardest.level) {
        const group = s.dungeon || GROUP_RANKS.includes(L.hardest.rank);
        rec = L.hardest.level - (group ? 3 : 1);
        early = Math.max(first, L.hardest.level - (group ? 5 : 3));
        s.basis = { name: L.hardest.name, level: L.hardest.level, rank: L.hardest.rank, from: L.hardest.from, group, step: L.hardest.step, steps: L.steps };
      } else if (s.dungeon && s.dungeonLevels) {
        rec = s.dungeonLevels[1] - 1 - 3;
        s.basis = { from: 'dungeon-range', group: true };
      } else {
        rec = (s.level || s.requiredLevel || 0) - 1;
        s.basis = { from: 'quest-level', group: false };
      }
      rec = Math.max(rec, s.requiredLevel || 0, req);
      if (s.level) {
        rec = Math.min(rec, Math.max(s.level, req));
        early = Math.min(early, Math.max(s.level, req));
      }
      s.asap = early;
      s.rec = Math.max(rec, early);
    } else if (s.type === 'boss' || s.type === 'drop') {
      const n = s.npcId && levels.npcs[s.npcId];
      const lv = (n && n.level) || Number(String(s.level || '').split('-').pop()) || null;
      const group = s.type === 'boss' || GROUP_RANKS.includes((n && n.rank) || s.rank);
      s.asap = lv ? Math.max(req, lv - (group ? 5 : 3)) : req;
      s.rec = lv ? Math.max(req, lv - (group ? 3 : 1)) : req;
      if (lv) s.basis = { name: s.npc, level: lv, rank: (n && n.rank) || s.rank, from: n && n.from ? n.from : 'questie', group };
    } else {
      s.asap = req;
      s.rec = req;
    }
  }

  // An item's sources, other classes' quests left out, each one placed.
  function placedSources(S, item) {
    const sources = S.sourcesOf(item).filter(s => !otherClassQuest(s));
    if (!sources.length) sources.push(S.noSource(item));
    sources.forEach(s => place(item, s));
    return sources;
  }

  return { place, placedSources, otherClassQuest, factionNotes };
}

module.exports = { open, placer, isWeapon, isGear, WEAPON_KINDS, SHAMAN_CLASS, INSTANCE, RAID };
