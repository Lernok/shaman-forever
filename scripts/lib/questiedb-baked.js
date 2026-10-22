// Reads the QuestieDB addon as installed in the game (its "baked" Forever
// build): every quest and NPC is stored in the .toc's metadata lines as
// base64 CBOR, "## X-Quest-<id>-<field>: …" plus "-S" for the row of plain
// fields. It has Forever's new zones (Zephras Isle…) that the QuestieDB repo's
// Lua files lack yet. Only facts are read (names, who gives a quest and where).
//
//   const db = require('./lib/questiedb-baked.js').load(dir)
//   db.quest(id) / db.npc(id) / db.object(id): arrays like scripts/lib/questie.js's rows
//   (index = field - 1: quest[0] name, [1] startedBy, [2] finishedBy, [11]
//   preQuestGroup, [12] preQuestSingle; npc[0] name, [6] spawns, [8] zone;
//   object[0] name, [3] spawns, [4] zone).
const fs = require('fs');
const path = require('path');

// Minimal CBOR: integers, floats, byte/text strings, arrays, maps.
function cbor(buf) {
  let i = 0;
  const len = info => {
    if (info < 24) return info;
    if (info === 24) return buf[i++];
    if (info === 25) { const v = buf.readUInt16BE(i); i += 2; return v; }
    if (info === 26) { const v = buf.readUInt32BE(i); i += 4; return v; }
    if (info === 27) { const v = Number(buf.readBigUInt64BE(i)); i += 8; return v; }
    throw new Error('CBOR: largo ' + info);
  };
  const half = h => {
    const e = (h >> 10) & 0x1f, f = h & 0x3ff, s = h >> 15 ? -1 : 1;
    return s * (e === 0 ? f * 2 ** -24 : e === 31 ? (f ? NaN : Infinity) : (1 + f / 1024) * 2 ** (e - 15));
  };
  const item = () => {
    const b = buf[i++], major = b >> 5, info = b & 31;
    if (major === 0) return len(info);
    if (major === 1) return -1 - len(info);
    if (major === 2 || major === 3) { const n = len(info); const s = buf.toString('utf8', i, i + n); i += n; return s; }
    if (major === 4) { const n = len(info), a = []; for (let k = 0; k < n; k++) a.push(item()); return a; }
    if (major === 5) { const n = len(info), m = {}; for (let k = 0; k < n; k++) { const key = item(); m[key] = item(); } return m; }
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22 || info === 23) return null;
      if (info === 25) { const v = half(buf.readUInt16BE(i)); i += 2; return v; }
      if (info === 26) { const v = buf.readFloatBE(i); i += 4; return v; }
      if (info === 27) { const v = buf.readDoubleBE(i); i += 8; return v; }
    }
    throw new Error('CBOR: tipo ' + b.toString(16));
  };
  return item();
}

// A CBOR map with integer keys -> an array (Lua tables come out as maps when
// they have holes); nested too.
function lua(v) {
  if (Array.isArray(v)) return v.map(lua);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length && keys.every(k => /^\d+$/.test(k)) && keys.every((k, n) => +k === n + 1)) return keys.map(k => lua(v[k]));
    const o = {};
    keys.forEach(k => { o[k] = lua(v[k]); });
    return o;
  }
  return v;
}

function load(dir) {
  const toc = ['QuestieDB_Forever.toc', 'QuestieDB_Camelot.toc'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
  if (!toc) return null;
  const rows = { Quest: new Map(), Npc: new Map(), Object: new Map() };
  fs.readFileSync(toc, 'utf8').split('\n').forEach(line => {
    const m = /^## X-(Quest|Npc|Object)-(\d+)-(\w+): (.+?)\s*$/.exec(line);
    if (!m) return;
    const map = rows[m[1]];
    if (!map.has(+m[2])) map.set(+m[2], {});
    map.get(+m[2])[m[3]] = m[4];
  });
  const decoded = { Quest: new Map(), Npc: new Map(), Object: new Map() };
  const get = (kind, id) => {
    if (decoded[kind].has(id)) return decoded[kind].get(id);
    const raw = rows[kind].get(id);
    let out = null;
    if (raw) {
      out = [];
      Object.entries(raw).forEach(([field, b64]) => {
        let v;
        try { v = lua(cbor(Buffer.from(b64, 'base64'))); } catch (e) { return; }
        // "S": the row of plain fields, { field: value }; "<n>": one table field.
        if (field === 'S') Object.entries(v || {}).forEach(([f, x]) => { out[+f - 1] = x; });
        else out[+field - 1] = v;
      });
    }
    decoded[kind].set(id, out);
    return out;
  };
  return { quest: id => get('Quest', id), npc: id => get('Npc', id), object: id => get('Object', id), questIds: () => [...rows.Quest.keys()], npcIds: () => [...rows.Npc.keys()], objectIds: () => [...rows.Object.keys()], file: toc };
}

module.exports = { load, cbor };
