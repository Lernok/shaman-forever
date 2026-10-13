// Builds data/weapons.json: every weapon a Shaman can use, with exact numbers
// (data/items.json) and where it comes from (scripts/lib/weapon-sources.js),
// each source placed at the level you can really get it (data/levels.json,
// from scripts/fetch-levels.js). Offline: reads only files already on disk.
//
//   node scripts/build-weapons.js
//
// Also writes reports/conflicts.md when hand-reported facts disagree with the
// automatic sources (the sync adds it to its pull request).
const path = require('path');
const { readJSON, writeJSON, writeText } = require('./lib/files');
const weaponSources = require('./lib/weapon-sources');

const cacheDir = path.join(__dirname, '..', '.cache');
const { build, items } = readJSON('data/items.json');
const S = weaponSources.open(cacheDir, build);
const levels = readJSON('data/levels.json', { quests: {}, npcs: {} });
const GROUP_RANKS = ['elite', 'rare-elite', 'boss'];
const conflicts = S.conflicts.bind(S);
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
function placeSource(item, s) {
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

const weapons = Object.values(items).filter(weaponSources.isWeapon).map(i => {
  const sources = S.sourcesOf(i).filter(s => !otherClassQuest(s));
  if (!sources.length) sources.push(S.noSource(i));
  sources.forEach(s => placeSource(i, s));
  // Default placement (recommended, any faction); the page recomputes it for
  // the chosen faction, toggles and level mode.
  const obtain = Math.min(...sources.map(s => s.rec));
  return {
    id: i.id, name: i.name, kind: i.kind, quality: i.quality, req: i.req, obtain, ilvl: i.ilvl, bind: i.bind,
    dps: i.dps, speed: i.speed, dmgMin: i.dmgMin, dmgMax: i.dmgMax,
    stats: i.stats || {}, bonus: i.bonus || {}, equip: i.equip || [], chance: i.chance || [],
    era: i.era, numbers: i.numbers || 'forever', icon: i.icon || null, raceMask: i.raceMask, sources
  };
}).sort((a, b) => a.obtain - b.obtain || b.dps - a.dps || a.id - b.id);

writeJSON('data/weapons.json', { build, weapons });

const notes = conflicts().concat(factionNotes);
writeText('reports/conflicts.md', '# Datos en conflicto\n\n' + (notes.length
  ? 'Valores cargados a mano que no coinciden con las fuentes automáticas. Si el dato manual es el correcto, agregale `override: { campo: "motivo" }` en data/item-sources.json.\n\n' + notes.map(n => '- ' + n).join('\n') + '\n'
  : 'Ninguno.\n'));
if (notes.length) console.log('Conflictos de datos: ' + notes.length + ' (reports/conflicts.md)');

const count = t => weapons.filter(w => w.sources.some(s => s.type === t)).length;
console.log('Armas: ' + weapons.length + ' · crafteo ' + count('crafted') + ' · jefe ' + count('boss') + ' · drop ' + count('drop') +
  ' · trash ' + count('trash') + ' · quest ' + count('quest') + ' · vendedor ' + count('vendor') +
  ' · sin registrar (Classic) ' + count('unrecorded') + ' · desconocida (nuevas) ' + count('unknown') +
  ' · con números de Classic ' + weapons.filter(w => w.numbers === 'classic').length);
