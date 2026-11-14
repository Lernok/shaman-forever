// Builds addon/WritPlanner/Data.lua: every Craftsman's Writ (the Azeroth
// Commerce Authority dailies) with the writ item, the item it asks for and how
// many, the reputation it gives, and where it's turned in (NPC, zone, world map
// and continent for the route).
//
// Flight masters and their routes (TaxiNodes, TaxiPath) and world positions
// (UiMapAssignment, in the same yards as the flight masters) come from the
// same build's tables, so the addon can time a route on foot or by air.
//
// Source: scripts/writs.json (writ quests from QuestieDB, turn-in NPCs and
// their spawns; quantities checked on Wowhead's tooltips). Zone names and
// continents from .cache/wago/<build>/AreaTable.csv, world maps (uiMapID) from
// the QuestieDB addon installed next to the game.
//
//   node scripts/build-writs-addon.js
const fs = require('fs');
const path = require('path');
const game = require('./lib/game');

const root = path.join(__dirname, '..');
const writs = JSON.parse(fs.readFileSync(path.join(__dirname, 'writs.json'), 'utf8'));

const wago = path.join(root, '.cache', 'wago');
const build = fs.readdirSync(wago).filter(d => d.startsWith('1.60')).sort().pop();
const area = {};
fs.readFileSync(path.join(wago, build, 'AreaTable.csv'), 'utf8').split('\n').slice(1).forEach(line => {
  const m = /^(\d+),[^,]*,("(?:[^"]|"")*"|[^,]*),(\d+),/.exec(line);
  if (m) area[m[1]] = { name: m[2].replace(/^"|"$/g, '').replace(/""/g, '"'), cont: +m[3] };
});

function csv(name) {
  const [head, ...rows] = fs.readFileSync(path.join(wago, build, name + '.csv'), 'utf8').trim().split('\n');
  const keys = head.split(',');
  return rows.map(line => {
    const vals = line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g).map(v => v.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  });
}
// Map % -> world yards: the map's top edge is the region's max X (north), its
// left edge the max Y (west).
const assign = {};
csv('UiMapAssignment').forEach(a => { if (+a.OrderIndex === 0 && !assign[a.UiMapID]) assign[a.UiMapID] = a; });
function world(map, x, y) {
  const a = assign[map];
  if (!a) return null;
  const u = (x / 100 - a.UiMin_0) / (a.UiMax_0 - a.UiMin_0), v = (y / 100 - a.UiMin_1) / (a.UiMax_1 - a.UiMin_1);
  return [Math.round(+a.Region_3 - v * (a.Region_3 - a.Region_0)), Math.round(+a.Region_4 - u * (a.Region_4 - a.Region_1)), +a.MapID];
}

const support = process.env.QUESTIEDB || path.join(game.addon('QuestieDB'), 'support');
const uiMaps = {};
[path.join(support, 'Zones', 'areaIdToUiMapId.lua'), path.join(support, 'Forever', 'Zones', 'areaIdToUiMapId.lua')].forEach(f => {
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split('\n').forEach(line => {
    const m = /^\s*\[(\d+)\]\s*=\s*(\d+),/.exec(line);
    if (m && +m[2] > 0) uiMaps[m[1]] = +m[2];
  });
});
if (!Object.keys(uiMaps).length) { console.error('No encontré QuestieDB (QUESTIEDB=<carpeta support>).'); process.exit(1); }

// How dangerous each turn-in spot is: the level of the mobs that attack you,
// spawned within DANGER_R yards (QuestieDB: level, rank, spawns, faction
// template; FactionTemplate says whom a template attacks: EnemyGroup 1 = every
// player, 2 = Alliance, 4 = Horde). The 75th percentile of their levels, +3
// for elites; per side, since Alliance guards attack a Horde player.
const DANGER_R = 150;
const qdb = require('./lib/questiedb-baked.js').load(path.dirname(support));
// Holiday and invasion mobs (Winter Veil's Pat's Snowcloud Guy, the Scourge
// invasion's Shadow of Doom) come and go: their templates don't count.
const EVENT_TEMPLATES = new Set(['114', '1630']);
// Thorium Point is a guarded camp on a cliff over the Dark Iron dig: on the
// flat map the dig's mobs look close, but they don't reach the camp.
const SAFE_CAMP = new Set(['Master Smith Burninate', 'Evonice Sootsmoker', 'Lookout Captain Lolo Longstriker']);
const enemies = {};
csv('FactionTemplate').forEach(t => { enemies[t.ID] = +t.EnemyGroup; });
const mobs = [];
if (qdb) {
  qdb.npcIds().forEach(id => {
    const r = qdb.npc(id);
    // Service NPCs (flight masters, vendors: npcFlags) stand still and don't pull.
    if (!r || !r[6] || !r[4] || r[4] <= 1 || r[4] > 63 || enemies[r[11]] == null || r[14] || EVENT_TEMPLATES.has(String(r[11]))) return;
    const e = enemies[r[11]];
    const H = (e & 5) !== 0, A = (e & 3) !== 0;
    if (!H && !A) return;
    const level = r[4] + (r[5] === 1 ? 3 : 0);
    Object.entries(r[6]).forEach(([z, spots]) => {
      const map = uiMaps[z];
      if (!map || !Array.isArray(spots)) return;
      spots.forEach(sp => {
        if (!Array.isArray(sp)) return;
        const wp = world(map, sp[0], sp[1]);
        if (wp) mobs.push({ x: wp[0], y: wp[1], cont: wp[2], level, H, A });
      });
    });
  });
} else console.warn('Sin QuestieDB horneado: los writs van sin nivel de peligro.');
function danger(wp, side) {
  const levels = mobs.filter(m => m[side] && m.cont === wp[2] && Math.hypot(m.x - wp[0], m.y - wp[1]) <= DANGER_R).map(m => m.level).sort((a, b) => a - b);
  // One lone mob (a holiday NPC, a wandering rare) doesn't make a place dangerous.
  if (levels.length < 2) return 0;
  return levels[Math.min(levels.length - 1, Math.floor(levels.length * 0.75))];
}

// NEAR="<NPC name>": list the mobs that make that spot dangerous, and stop.
if (process.env.NEAR) {
  const w = writs.find(x => x.npcName === process.env.NEAR);
  const z = w.npcZone, sp = w.spawns[z][0], wp = world(uiMaps[z], sp[0], sp[1]);
  const seen = new Set();
  qdb.npcIds().forEach(id => {
    const r = qdb.npc(id);
    if (!r || !r[6] || seen.has(id) || !(enemies[r[11]] & 5) || r[14]) return;
    Object.entries(r[6]).forEach(([zz, spots]) => (Array.isArray(spots) ? spots : []).forEach(p => {
      const m = uiMaps[zz], q = m && Array.isArray(p) && world(m, p[0], p[1]);
      if (q && q[2] === wp[2] && Math.hypot(q[0] - wp[0], q[1] - wp[1]) <= DANGER_R && !seen.has(id)) {
        seen.add(id);
        console.log(Math.round(Math.hypot(q[0] - wp[0], q[1] - wp[1])) + ' yd | ' + r[0] + ' | nivel ' + r[4] + (r[5] === 1 ? ' élite' : '') + ' | plantilla ' + r[11]);
      }
    }));
  });
  process.exit(0);
}

const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const zones = {};
const rows = writs.map(w => {
  // One quest lists the writ among the items it asks for (writ items are 264xxx).
  const writ = w.writ || w.items.find(i => i >= 264000), item = w.items.find(i => i !== writ);
  if (!writ || !item) throw new Error('Writ sin objeto: ' + w.id);
  const f = [`q=${w.id}`, `w=${writ}`, `i=${item}`, `rep=${w.rep}`, `name=${q(w.name)}`];
  if (w.qty && w.qty !== 1) f.push(`n=${w.qty}`);
  const z = w.npcZone, spot = z && w.spawns && w.spawns[z] && w.spawns[z][0];
  if (spot) {
    if (!area[z] || !uiMaps[z]) throw new Error('Zona sin mapa: ' + z + ' (' + w.name + ')');
    zones[z] = { name: area[z].name, map: uiMaps[z], cont: area[z].cont };
    f.push(`npc=${q(w.npcName)}`, `z=${z}`, `x=${spot[0]}`, `y=${spot[1]}`);
    const wp = world(uiMaps[z], spot[0], spot[1]);
    if (!wp) throw new Error('Mapa sin posición en el mundo: ' + uiMaps[z]);
    f.push(`wx=${wp[0]}`, `wy=${wp[1]}`);
    if (mobs.length) f.push(SAFE_CAMP.has(w.npcName) ? 'dH=0, dA=0' : `dH=${danger(wp, 'H')}`, ...(SAFE_CAMP.has(w.npcName) ? [] : [`dA=${danger(wp, 'A')}`]));
  }
  return '  {' + f.join(', ') + '},';
});
const zl = Object.entries(zones).map(([id, z]) => `  [${id}]={name=${q(z.name)}, map=${z.map}, cont=${z.cont}},`);
// Flight masters (no boats or zeppelins): side H (Horde), A (Alliance) or both.
const nodes = csv('TaxiNodes').filter(n => +n.MountCreatureID_0 || +n.MountCreatureID_1);
const nodeIds = new Set(nodes.map(n => n.ID));
const nl = nodes.map(n => `  [${n.ID}]={name=${q(n.Name_lang)}, cont=${n.ContinentID}, x=${Math.round(+n.Pos_0)}, y=${Math.round(+n.Pos_1)}, side="${(+n.MountCreatureID_0 ? 'H' : '') + (+n.MountCreatureID_1 ? 'A' : '')}"},`);
const el = csv('TaxiPath').filter(p => nodeIds.has(p.FromTaxiNode) && nodeIds.has(p.ToTaxiNode)).map(p => `{${p.FromTaxiNode},${p.ToTaxiNode},${p.Cost}}`);
// Innkeepers (where a hearthstone can be set), per side, from QuestieDB.
const inns = [];
if (qdb) {
  qdb.npcIds().forEach(id => {
    const r = qdb.npc(id);
    if (!r || r[13] !== 'Innkeeper' || !r[6] || !r[12]) return;
    Object.entries(r[6]).forEach(([z, spots]) => {
      const map = uiMaps[z], sp = Array.isArray(spots) && spots[0];
      const wp = map && Array.isArray(sp) && world(map, sp[0], sp[1]);
      if (wp && area[z]) inns.push(`  {npc=${q(r[0])}, zone=${q(area[z].name)}, cont=${wp[2]}, x=${wp[0]}, y=${wp[1]}, side="${r[12]}"},`);
    });
  });
}
const out = '-- Generated by scripts/build-writs-addon.js. Do not edit by hand.\n' +
  'WritPlanner_DATA = {\n writs = {\n' + rows.join('\n') + '\n },\n zones = {\n' + zl.join('\n') + '\n },\n nodes = {\n' + nl.join('\n') + '\n },\n paths = {' + el.join(',') + '},\n inns = {\n' + inns.join('\n') + '\n },\n}\n';
fs.writeFileSync(path.join(root, 'addon', 'WritPlanner', 'Data.lua'), out);
console.log('Data.lua: ' + writs.length + ' writs, ' + rows.filter(r => r.includes('npc=')).length + ' con lugar, ' + zl.length + ' zonas, ' + nl.length + ' vuelos, ' + el.length + ' rutas de vuelo, ' + inns.length + ' posadas');
