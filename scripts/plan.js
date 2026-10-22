// The gear path from the command line, to audit picks and answer reports
// ("why this piece?", "why not that one?") with the same engine the page uses.
//
//   node scripts/plan.js path [options]           every step of the path, with stats
//   node scripts/plan.js slot <Slot> [options]    candidates of a slot and the path's picks
//   node scripts/plan.js item <id> [options]      one item: sources, value, where the path uses it
//   node scripts/plan.js leather [options]        Leatherworking while leveling (js/lw-plan.js), up to --hi
//        --skin few|normal|all (default normal), --buy (with auction house help)
//
// Options (the Shaman of a report: its issue body says race, spec, faction, professions):
//   --spec Enhancement|Elemental|Restoration   (default Enhancement)
//   --race Orc   --faction horde|alliance      (default Orc, horde; race "any" = no race)
//   --profs Leatherworking,Skinning            (default none)
//   --drops                                    count boss drops (the page's checkbox)
//   --farm                                     "Farmeo todo" (no auction house): crafts wait for their reagents
//   --skill-buy worth|always|never             with the auction house: buy leather to raise the skill (default worth)
//   --lo 1 --hi 60                             level range (path, slot)
//   node scripts/plan.js worth [options]          each piece: is buying leather to raise the skill worth it
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const load = f => { const w = {}; new Function('window', fs.readFileSync(path.join(root, f), 'utf8'))(w); return w; };
global.window = { ZONE_DATA: JSON.parse(fs.readFileSync(path.join(root, 'data/zones.json'), 'utf8')) };
require('../js/route.js');
require('../js/gear-plan.js');
window.SKINNING_DATA = JSON.parse(fs.readFileSync(path.join(root, 'data/skinning.json'), 'utf8'));
require('../js/lw-plan.js');
const R = window.Route, GP = window.GearPlan;
// What the page plans with (data/*.js: only plannable sources), not the full sync output.
window.CRAFT_DATA = load('data/crafts.js').CRAFT_DATA;
const gear = load('data/gear.js').GEAR_DATA.gear.concat(load('data/weapons.js').WEAPON_DATA.weapons);

const args = process.argv.slice(2);
const cmd = args[0] || 'path';
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i > 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const spec = opt('spec', 'Enhancement');
const faction = opt('faction', 'horde').toLowerCase();
const race = opt('race', 'Orc');
const profs = opt('profs', '').split(/[,+]/).filter(p => p && p !== '-');
const lo = +opt('lo', 1), hi = +opt('hi', 60);
const farm = args.includes('--farm');
// As Equipo plans it (js/gear-path.js compute): crafts wait for your trainer,
// farming for their reagents, Leatherworking pieces for the level the
// Leatherworking plan makes them (LwPlan.settle). Merchant's Favor recipes as
// many as the quest gold buys (data/crafts.js).
const opts = { spec, faction, race, profs, drops: args.includes('--drops'),
  route: (z, l) => R.onRoute(z, l, faction, race), away: z => R.otherStart(z, faction, race), reach: z => R.reachable(z, faction),
  profAt: p => R.profFrom(p, faction, race).level, favorCost: GP.favorCost, favorFirst: GP.favorFirst, goldAt: GP.goldAt,
  matsAt: farm ? (item => window.LwPlan.matsAt(item.id, { faction, race, profs })) : null };

const short = o => Object.entries(o || {}).map(([k, v]) => v + k.replace(/^(\w{3})\w*/, '$1')).join(' ');
const where = s => [s.quest || s.npc || s.profession, (typeof s.dungeon === 'string' && s.dungeon) || s.dungeonZone || s.zone].filter(Boolean).join(' @ ');
const steps = p => Object.values(p.slots).flatMap(x => x.steps).sort((a, b) => a.level - b.level);

console.log('# ' + race + ' ' + spec + ' (' + faction + '), ' + (profs.join(' + ') || 'sin profesiones') + (opts.drops ? ', con drops' : '') + (farm ? ', farmeo todo' : ''));
const plan = window.LwPlan.settle(gear, opts, { picked: profs, farm, intensity: opt('skin', 'normal'), skillBuy: opt('skill-buy', 'worth') });

if (cmd === 'worth') {
  const SK = window.SKINNING_DATA;
  const coin = c => (c / 10000).toFixed(2) + 'g';
  [...(plan.lwWorth || new Map()).values()].forEach(v => console.log((SK.names[v.id] || '#' + v.id).padEnd(32), 'quiere ' + v.want, 'sin comprar ' + v.late, 'comprando ' + (v.made || '-'),
    '| ' + Object.entries(v.extra).map(([m, n]) => n + ' ' + (SK.names[m] || m)).join(', '), v.cost ? coin(v.cost) : '',
    v.gain != null ? 'mejora ' + Math.round(v.gain * 100) + '%' : v.free != null ? 'slot vacío' : '', v.lasts != null ? 'dura ' + v.lasts : '',
    v.free != null ? 'libre ' + coin(v.free) + ' (' + Math.round(v.share * 100) + '%)' : '', '=>', v.worth ? 'VALE' : 'no', v.why));
  if (!plan.lwWorth) console.log('(sin veredictos: farmeo todo, --skill-buy always, o sin Peletería)');
} else if (cmd === 'path') {
  steps(plan).filter(st => st.level >= lo && st.level <= hi).forEach(st => {
    const i = st.pick.item;
    console.log(String(st.level).padStart(2), st.pick.slot.padEnd(9), (i.name + ' #' + i.id).padEnd(42), ('v' + st.pick.value.toFixed(1)).padStart(6), st.pick.access.padEnd(8), '+' + st.lasts + ' niv |', short(i.stats), short(i.bonus), '|', where(st.pick.source || {}));
  });
} else if (cmd === 'slot') {
  const slot = args[1];
  GP.candidates(gear, opts).filter(c => c.slot === slot && c.at >= lo && c.at <= hi).sort((a, b) => a.at - b.at).forEach(c =>
    console.log(String(c.at).padStart(2), ('v' + c.value.toFixed(1)).padStart(6), c.access.padEnd(8), 'q' + c.item.quality, (c.item.name + ' #' + c.item.id).padEnd(42), short(c.item.stats), short(c.item.bonus), '|', where(c.source)));
  console.log('CAMINO:', (plan.slots[slot] ? plan.slots[slot].steps : []).map(st => st.level + ': ' + st.pick.item.name + ' (v' + st.pick.value.toFixed(1) + ')').join(' | ') || '(nada)');
} else if (cmd === 'item') {
  const id = +args[1];
  const item = gear.find(i => i.id === id);
  if (!item) {
    console.log('#' + id + ' no está en lo que planifica la página (data/gear.js, data/weapons.js): raid, PvP, fuente desconocida, o ningún spec lo usa.');
    process.exit(0);
  }
  console.log(item.name + ' — ' + item.slot + ', nivel ' + (item.req || 0) + ', ilvl ' + item.ilvl + ', calidad ' + item.quality + ' | ' + short(item.stats) + ' ' + short(item.bonus));
  console.log('Valor por spec:', Object.keys(GP.WEIGHTS).map(s => s + ' ' + GP.value(item, s).toFixed(1)).join(', '));
  item.sources.forEach(s => console.log('  fuente:', s.type, where(s), 'nivel rec ' + s.rec, s.faction ? '(' + s.faction + ')' : ''));
  const c = GP.candidates(gear, opts).filter(x => x.item.id === id);
  console.log(c.length ? 'Candidato para este Shaman: ' + c.map(x => 'nivel ' + x.at + ', ' + x.access + ', v' + x.value.toFixed(1)).join('; ') : 'No es candidato para este Shaman (otra facción/raza, profesión que no tiene, drop sin --drops, o no le sirve a su spec).');
  const used = steps(plan).filter(st => st.pick.item.id === id);
  console.log(used.length ? 'En el camino: ' + used.map(st => 'nivel ' + st.level + ' (' + st.pick.slot + '), dura ' + st.lasts + ' niveles').join('; ') : 'No está en el camino.');
  const slot = plan.slots[item.slot] || plan.slots[c[0] && c[0].slot];
  if (slot) console.log('Camino de ese slot: ' + slot.steps.map(st => st.level + ': ' + st.pick.item.name + ' (v' + st.pick.value.toFixed(1) + ')').join(' | '));
} else if (cmd === 'leather') {
  const SK = window.SKINNING_DATA;
  const name = id => SK.names[id] || (gear.find(i => i.id === Number(id)) || {}).name || '#' + id;
  const targets = steps(plan).filter(st => (st.pick.source || {}).profession === 'Leatherworking').map(st => ({ id: st.pick.item.id, level: st.level }));
  const out = window.LwPlan.run({ faction, race, targets, intensity: opt('skin', 'normal'), skinning: profs.includes('Skinning'), buy: args.includes('--buy'), to: hi });
  const list = o => Object.entries(o).map(([id, n]) => Math.round(n) + 'x ' + name(id)).join(', ');
  out.rows.forEach(r => console.log(String(r.level).padStart(2), (r.zone || '-').padEnd(20), String(r.skins).padStart(3) + ' pieles', 'LW ' + String(r.skill).padStart(3), '|',
    r.made.map(id => 'HACE ' + name(id)).concat(list(r.crafts) || []).filter(Boolean).join('; '), Object.keys(r.bought).length ? '| COMPRA ' + list(r.bought) : ''));
  targets.forEach(t => console.log('  ' + name(t.id) + ': meta ' + t.level + ' -> ' + (out.made[t.id] || 'no llega')));
  console.log('Total comprado: ' + (list(out.bought) || 'nada'));
} else {
  console.log('Comandos: path, slot <Slot>, item <id>, leather. Ver el encabezado de scripts/plan.js.');
}
