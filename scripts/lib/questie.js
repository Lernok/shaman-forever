// Read-only lookups into QuestieDB's Forever data files (item/npc/quest), used
// to look up where an item comes from: who drops it, which quest rewards it,
// who sells it. QuestieDB declares no license, so we only derive individual
// facts for the items we show and cite it; we never redistribute its files.
//
// Files are cached under .cache/questiedb/ by scripts/sync.js.
const fs = require('fs');
const path = require('path');

// Parser for the Lua table literals QuestieDB uses: 'strings', numbers, nil,
// {list}, and {[key] = value} maps.
function parseLua(src) {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  function value() {
    ws();
    const c = src[i];
    if (c === "'" || c === '"') {
      const q = c; i++;
      let s = '';
      while (src[i] !== q) {
        if (src[i] === '\\') { i++; s += src[i] === 'n' ? '\n' : src[i]; } else s += src[i];
        i++;
      }
      i++;
      return s;
    }
    if (c === '{') {
      i++;
      const list = [];
      const map = {};
      let isMap = false;
      ws();
      while (src[i] !== '}') {
        ws();
        if (src[i] === '[') {
          i++;
          const k = value();
          ws(); i++; // ]
          ws(); i++; // =
          map[k] = value();
          isMap = true;
        } else list.push(value());
        ws();
        if (src[i] === ',') i++;
        ws();
      }
      i++;
      return isMap ? map : list;
    }
    if (src.startsWith('nil', i)) { i += 3; return null; }
    if (src.startsWith('true', i)) { i += 4; return true; }
    if (src.startsWith('false', i)) { i += 5; return false; }
    const m = /^-?[\d.]+(e-?\d+)?/.exec(src.slice(i, i + 40));
    if (!m) throw new Error('lua parse error near: ' + src.slice(i, i + 40));
    i += m[0].length;
    return Number(m[0]);
  }
  return value();
}

// Index "[id] = {...}," lines of one DB file without parsing everything.
function indexFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const index = new Map();
  for (const line of text.split('\n')) {
    const m = /^\[(\d+)\] = (\{.*\}),?\s*$/.exec(line);
    if (m) index.set(Number(m[1]), m[2]);
  }
  return index;
}

const RACE = { alliance: 1 | 4 | 8 | 64, horde: 2 | 16 | 32 | 128 };
function factionOfRaces(mask) {
  if (!mask) return 'both';
  const a = (mask & RACE.alliance) !== 0;
  const h = (mask & RACE.horde) !== 0;
  return a && !h ? 'alliance' : h && !a ? 'horde' : 'both';
}

function open(cacheDir, zoneNames) {
  const dir = path.join(cacheDir, 'questiedb');
  const items = indexFile(path.join(dir, 'foreverItemDB.lua'));
  const npcs = indexFile(path.join(dir, 'foreverNpcDB.lua'));
  const quests = indexFile(path.join(dir, 'foreverQuestDB.lua'));
  const classicNpcFile = path.join(dir, 'classicNpcDB.lua');
  const classicNpcs = fs.existsSync(classicNpcFile) ? indexFile(classicNpcFile) : new Map();
  const get = (idx, id) => (idx.has(id) ? parseLua(idx.get(id)) : null);
  // QuestieDB uses its own id for Blackrock Depths; everything else is AreaTable.
  const QUESTIE_ZONES = { 1585: 'Blackrock Depths' };
  // Instance bosses with no location in QuestieDB (Forever or Classic): their
  // instance in Classic, filled in by hand. Unsure ones are left out on purpose.
  const NPC_ZONES = {
    'Sneed': 'The Deadmines', 'Scorn': 'Scarlet Monastery', 'Ironaya': 'Uldaman', "Gahz'rilla": "Zul'Farrak",
    'Hedrum the Creeper': 'Blackrock Depths', 'Grizzle': 'Blackrock Depths', 'Watchman Doomgrip': 'Blackrock Depths',
    'Hurley Blackbreath': 'Blackrock Depths', 'Gorosh the Dervish': 'Blackrock Depths',
    'Ramstein the Gorger': 'Stratholme', 'Postmaster Malown': 'Stratholme', 'Timmy the Cruel': 'Stratholme', 'Balnazzar': 'Stratholme',
    'Kirtonos the Herald': 'Scholomance', 'Darkmaster Gandling': 'Scholomance', 'Kormok': 'Scholomance', 'Death Knight Darkreaver': 'Scholomance',
    'Mor Grayhoof': 'Blackrock Spire', 'Lord Valthalak': 'Blackrock Spire', 'Warchief Rend Blackhand': 'Blackrock Spire',
    'Isalien': 'Dire Maul',
    'Azure Templar': 'Silithus', 'Crimson Templar': 'Silithus', 'The Duke of Zephyrs': 'Silithus', 'The Duke of Cynders': 'Silithus',
    'Ragnaros': 'Molten Core', 'Flamewaker Healer': 'Molten Core', 'Flamewaker Elite': 'Molten Core',
    'Sapphiron': 'Naxxramas',
    "Gahz'ranka": "Zul'Gurub", "Gri'lek": "Zul'Gurub", 'High Priestess Arlokk': "Zul'Gurub", 'Wushoolay': "Zul'Gurub"
  };
  const zone = id => (id && (zoneNames[id] || QUESTIE_ZONES[id])) || null;

  function npc(id) {
    const n = get(npcs, id);
    if (!n) return { id, name: null };
    // Some NPCs have no location in the Forever data yet: take Classic's.
    let zoneId = n[8];
    if (!zone(zoneId)) {
      const c = get(classicNpcs, id);
      if (c && zone(c[8])) zoneId = c[8];
    }
    return {
      id,
      name: n[0],
      level: n[3] === n[4] ? n[3] : n[3] + '-' + n[4],
      rank: { 1: 'elite', 2: 'rare-elite', 3: 'boss', 4: 'rare' }[n[5]] || 'normal',
      zone: zone(zoneId) || NPC_ZONES[n[0]] || null,
      zoneId,
      friendly: n[12] || null
    };
  }

  // Sources of one item, as plain facts.
  function sources(itemId) {
    const it = get(items, itemId);
    if (!it) return null;
    const out = [];
    (it[1] || []).forEach(id => out.push(Object.assign({ type: 'drop' }, npc(id))));
    (it[5] || []).forEach(id => {
      const q = get(quests, id);
      if (!q) { out.push({ type: 'quest', id }); return; }
      const z = q[16] > 0 ? zone(q[16]) : null;
      out.push({ type: 'quest', id, name: q[0], level: q[4], requiredLevel: q[3], faction: factionOfRaces(q[5]), zone: z });
    });
    (it[13] || []).forEach(id => {
      const n = npc(id);
      const fr = n.friendly || '';
      out.push(Object.assign({ type: 'vendor' }, n, { faction: fr === 'A' ? 'alliance' : fr === 'H' ? 'horde' : 'both' }));
    });
    return out;
  }

  return { sources };
}

module.exports = { open, parseLua };
