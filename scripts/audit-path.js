// Audit of the gear path for every race, spec and a few profession pairs,
// with the page's engine (js/gear-plan.js): what shouldn't happen.
//
//   node scripts/audit-path.js [--farm] [--drops]
//
// Errors: a piece before its required level, mail before 40, a quest of the
// other faction or of another race only, a craft whose recipe can't be
// learned (unreleased, unknown, drop), a ring or trinket twice at once.
// Warnings: slots empty for long stretches up to 30, pieces that last under
// a level, the same item chosen in two slots.
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
const gear = load('data/gear.js').GEAR_DATA.gear.concat(load('data/weapons.js').WEAPON_DATA.weapons);
const farm = process.argv.includes('--farm');
const drops = process.argv.includes('--drops');

const RACES = { horde: ['Orc', 'Troll', 'Tauren', 'Skyborne'], alliance: ['Dwarf', 'Skyborne'] };
const SPECS = ['Enhancement', 'Elemental', 'Restoration'];
const PROFS = [[], ['Leatherworking', 'Skinning'], ['Blacksmithing', 'Mining'], ['Tailoring', 'Enchanting']];
// Empty for this many levels or more, up to 30, is worth a look (rings, trinkets
// and the relic come late on purpose).
const GAP = 8;
const LATE = new Set(['Finger', 'Trinket', 'Relic', 'Neck', 'Off Hand']);

const problems = {};
const add = (kind, key, text) => { (problems[kind] = problems[kind] || new Map()).set(key, text); };
let runs = 0;
for (const [faction, races] of Object.entries(RACES)) {
  for (const race of races) {
    for (const spec of SPECS) {
      for (const profs of PROFS) {
        runs++;
        const opts = { spec, faction, race, profs, drops,
          route: (z, l) => R.onRoute(z, l, faction, race), away: z => R.otherStart(z, faction, race), reach: z => R.reachable(z, faction),
          matsAt: farm ? (item => window.LwPlan.matsAt(item.id, { faction, race, profs })) : null };
        const plan = GP.plan(gear, opts);
        const who = race + ' ' + spec.slice(0, 3) + (profs.length ? ' ' + profs.map(p => p.slice(0, 2)).join('+') : '');
        const seen = new Map();
        for (const [slot, sp] of Object.entries(plan.slots)) {
          let last = 1;
          sp.steps.forEach(st => {
            const i = st.pick.item;
            const s = st.pick.source || {};
            const tag = i.name + ' #' + i.id;
            if (i.req && st.level < i.req) add('ERROR antes de su nivel', tag + who, who + ': ' + tag + ' en ' + st.level + ', pide ' + i.req);
            if (i.kind === 'Mail' && st.level < 40) add('ERROR malla antes del 40', tag, who + ': ' + tag + ' en ' + st.level);
            if (s.faction && s.faction !== 'both' && s.faction !== faction) add('ERROR otra facción', tag + faction, who + ': ' + tag + ' (' + s.faction + ')');
            if (s.races && !s.races.includes(race)) add('ERROR otra raza', tag + race, who + ': ' + tag + ' (' + s.races.join('/') + ')');
            if (s.type === 'crafted' && !['trainer', 'favor'].includes((s.learn || {}).type)) add('ERROR receta que no se aprende', tag, tag + ': ' + (s.learn || {}).type);
            if (st.lasts < 1) add('aviso dura menos de un nivel', tag, who + ': ' + tag + ' en ' + st.level);
            if (seen.has(i.id) && seen.get(i.id) !== slot && !['Finger', 'Trinket'].includes(slot)) add('aviso mismo ítem en dos casilleros', tag, who + ': ' + tag + ' en ' + seen.get(i.id) + ' y ' + slot);
            seen.set(i.id, slot);
            if (!LATE.has(slot) && st.level <= 30 && st.level - last >= GAP && !(slot === 'Shoulder' && last === 1)) add('aviso casillero vacío mucho tiempo', slot + who, who + ': ' + slot + ' sin cambio de ' + last + ' a ' + st.level);
            last = st.level;
          });
          if (!LATE.has(slot) && sp.steps.length && sp.steps[0].level > 15) add('aviso primera pieza tarde', slot + who, who + ': ' + slot + ' recién en ' + sp.steps[0].level);
          if (!sp.steps.length && !['Off Hand', 'Relic'].includes(slot)) add('aviso casillero sin nada', slot + who, who + ': ' + slot + ' vacío');
        }
        // Rings and trinkets: never the same one twice at once.
        ['Finger', 'Trinket'].forEach(slot => {
          const st = (plan.slots[slot] || { steps: [] }).steps;
          st.forEach((a, k) => st.slice(k + 1).forEach(b => {
            if (a.pick.item.name === b.pick.item.name && b.level < a.until) add('ERROR anillo o abalorio repetido', a.pick.item.id + who, who + ': ' + a.pick.item.name);
          }));
        });
      }
    }
  }
}
console.log('Auditoría del camino de equipo: ' + runs + ' combinaciones' + (farm ? ', farmeando' : '') + (drops ? ', con drops' : ''));
Object.keys(problems).sort().forEach(kind => {
  const list = [...problems[kind].values()];
  console.log('\n' + kind + ' (' + list.length + ')');
  list.slice(0, 12).forEach(x => console.log('  ' + x));
  if (list.length > 12) console.log('  … y ' + (list.length - 12) + ' más');
});
if (!Object.keys(problems).length) console.log('Sin problemas.');
