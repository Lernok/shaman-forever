// Blizzard's notes of Nov 2, 2026 (us.forums.blizzard.com/en/wow/t/2360696,
// post 9) applied by hand to talentsforever's export until it has them:
// Lava Burst becomes Call of Thunder, Elemental Mastery becomes Lightning
// Mastery, Improved Ghost Wolf moves to row 4, and the new numbers. Every
// step checks the export still has the old state, so the patch steps aside
// on its own when the new tree arrives (the templates it used then go
// unused and build-data says so: time to delete this file).
//
// Used by build-data.js, build-addon.js and test-rules.js on data/shaman.json
// (which stays as published). Patched talents carry `patch` {es, en}: the
// calculator marks them and says what changed.

const NOTES = 'https://us.forums.blizzard.com/en/wow/t/2360696';

const note = (es, en) => ({ es, en, source: NOTES });
const sub = (list, from, to) => list.map(d => d.replace(from, to));
const ranks = (list, values) => list.map((d, i) => d.replace(/\d+(?=%)/, values[i]));

module.exports = function patch(shaman) {
  const trees = shaman.talents.trees;
  const tree = name => trees.find(t => t.name === name);
  const talent = (t, name) => tree(t).talents.find(x => x.name === name);
  const ele = tree('Elemental');
  if (!ele || !talent('Elemental', 'Lava Burst')) return shaman;

  // Elemental: lightning only.
  const lb = talent('Elemental', 'Lava Burst');
  Object.keys(lb).forEach(k => delete lb[k]);
  Object.assign(lb, {
    name: 'Call of Thunder', max: 1, row: 5, col: 2, passive: true, icon: 'spell_nature_callstorm',
    desc: ['Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional 5%.'],
    complete: true, confirmed: [], src: 'notes', classic: { status: 'changed' },
    patch: note('Reemplaza a Lava Burst, que sale del juego.', 'Replaces Lava Burst, which is removed.')
  });
  const em = talent('Elemental', 'Elemental Mastery');
  Object.assign(em, {
    name: 'Lightning Mastery', req: 'Call of Thunder',
    desc: ['Gain mastery over Lightning, reducing the cast time of Lightning Bolt by 0.5 sec, and removing the cooldown from Chain Lightning. Lasts 15 sec.'],
    patch: note('Antes Elemental Mastery; ya no nombra a Lava Burst. El ícono nuevo todavía no se conoce.', 'Formerly Elemental Mastery; no longer names Lava Burst. The new icon isn\'t known yet.')
  });
  const lo = talent('Elemental', 'Lightning Overload');
  lo.desc = ranks(lo.desc, [10, 20, 30]);
  lo.patch = note('10/20/30% de chance (era 3/7/10%).', '10/20/30% chance (was 3/7/10%).');
  const reach = talent('Elemental', 'Elemental Reach');
  reach.desc = reach.desc.map(d => d.replace(/Lightning Bolt, Chain Lightning, Fire Nova, and Lava Burst spells by (\d+) yards and reduces the cooldown of Totemic Projection by \d+ sec\./,
    'Lightning Bolt, Chain Lightning and Fire Nova spells by $1 yards.'));
  reach.patch = note('Ya no baja el tiempo de reutilización de Totemic Projection.', 'No longer lowers Totemic Projection\'s cooldown.');
  ele.talents.forEach(t => {
    t.desc = sub(sub(sub(t.desc, 'Shock, Lightning Bolt, Lava Burst, and Chain Lightning', 'Shock, Lightning Bolt and Chain Lightning'),
      'Lightning Bolt, Chain Lightning, and Lava Burst spells', 'Lightning Bolt and Chain Lightning spells'),
      'Flame Shock, Fire Nova, and Lava Burst spells', 'Flame Shock and Fire Nova spells');
  });

  // Enhancement.
  const wolf = talent('Enhancement', 'Improved Ghost Wolf');
  if (wolf.row === 2) {
    // The notes give the row only; column 4 is row 4's free spot.
    Object.assign(wolf, { row: 4, col: 4, patch: note('Baja de la fila 2 a la 4 (la columna es estimada).', 'Moves from row 2 to row 4 (the column is a guess).') });
    tree('Enhancement').talents.sort((a, b) => a.row - b.row || a.col - b.col);
  }
  const md = talent('Enhancement', 'Mental Dexterity');
  md.desc = ranks(md.desc, [50, 100, 150]);
  md.patch = note('50/100/150% del Intelecto (era 33/67/100%).', '50/100/150% of Intellect (was 33/67/100%).');
  const flurry = talent('Enhancement', 'Flurry');
  flurry.desc = ranks(flurry.desc, [6, 12, 18, 24, 30]);
  flurry.patch = note('6/12/18/24/30% (era 5/10/15/20/25%).', '6/12/18/24/30% (was 5/10/15/20/25%).');
  const ss = talent('Enhancement', 'Stormstrike');
  ss.desc = sub(ss.desc, 'strike for normal weapon damage', 'strike for 150% normalized weapon damage');
  ss.cost = ss.cost.replace(/\d+ sec cooldown/, '6 sec cooldown');
  ss.patch = note('150% del daño del arma (era 100%), cada 6 s (era 8 s).', '150% weapon damage (was 100%), every 6 sec (was 8 sec).');
  talent('Enhancement', 'Maelstrom Weapon').patch = note('Salta el doble de seguido.', 'Procs twice as often.');

  // Restoration.
  const rt = talent('Restoration', 'Riptide');
  rt.desc = rt.desc.map(d => d.replace(/Heals a friendly target for \d+ to \d+, an additional (\d+) over/, 'Heals a friendly target for $1 over'));
  rt.cost = rt.cost.replace(/^\d+ Mana/, m => Math.round(parseInt(m, 10) * 0.6) + ' Mana').replace(/\d+ sec cooldown/, '12 sec cooldown');
  rt.patch = note('Ya no cura de entrada, solo con el tiempo; cada 12 s (era 6 s) y un 40% menos de maná.', 'No longer heals up front, only over time; every 12 sec (was 6 sec), 40% less mana.');

  // Spellbook and spell texts.
  const sb = shaman.spellbook;
  sb.tabs.forEach(t => {
    t.spells = t.spells.filter(([n]) => n !== 'Lava Burst')
      .map(([n, r]) => [n === 'Elemental Mastery' ? 'Lightning Mastery' : n === 'Totemic Projection' ? 'Totemic Call' : n, r]);
  });
  sb.talents = sb.talents.filter(n => n !== 'Lava Burst').map(n => n === 'Elemental Mastery' ? 'Lightning Mastery' : n);
  sb.talents.push('Call of Thunder');
  sb.talents.sort();
  const sd = shaman.spell_desc;
  Object.keys(sd).filter(k => k.startsWith('Shaman|Lava Burst|')).forEach(k => delete sd[k]);
  const rename = (from, to, fix) => {
    const k = 'Shaman|' + from + '|';
    if (!sd[k]) return;
    sd['Shaman|' + to + '|'] = Object.assign(sd[k], fix);
    delete sd[k];
  };
  rename('Elemental Mastery', 'Lightning Mastery', { d: em.desc[0] });
  rename('Totemic Projection', 'Totemic Call', {
    d: 'Teleports your active totems to your location.',
    l: [['25% of base mana', ''], ['Instant', '30 sec cooldown']]
  });
  const sss = sd['Shaman|Stormstrike|'];
  if (sss) { sss.d = ss.desc[0]; sss.l = sss.l.map(p => p.map(c => c.replace(/\d+ sec cooldown/, '6 sec cooldown'))); }
  Object.keys(sd).filter(k => k.startsWith('Shaman|Riptide|')).forEach(k => {
    const v = sd[k];
    v.d = v.d.replace(/Heals a friendly target for \d+ to \d+, an additional (\d+) over/, 'Heals a friendly target for $1 over');
    v.l = v.l.map(p => p.map(c => c.replace(/^\d+ Mana$/, m => Math.round(parseInt(m, 10) * 0.6) + ' Mana').replace(/\d+ sec cooldown/, '12 sec cooldown')));
  });
  shaman.class_abilities = shaman.class_abilities.map(a => a[0] === 'Totemic Projection'
    ? ['Totemic Call', 'Notes of Nov 2: Totemic Projection becomes Totemic Call, which brings your active totems to where you stand, on a 30 sec cooldown. Totemic Recall is in too.', a[2]] : a);
  shaman.talents.patched = NOTES;
  return shaman;
};
