// Blizzard's notes of Nov 2, 2026 (us.forums.blizzard.com/en/wow/t/2360696,
// post 9). talentsforever's export has them since Nov 3, set from the notes
// "ahead of any game data" (its talents.source says so): the spots of Call of
// Thunder and Improved Ghost Wolf are a guess there too. While that holds,
// this marks the changed talents so the calculator shows a blue dot and what
// changed. Once the export comes from game data again, it steps aside: delete
// this file then.
//
// Used by build-data.js, build-addon.js and test-rules.js on data/shaman.json
// (which stays as published).

const NOTES = 'https://us.forums.blizzard.com/en/wow/t/2360696';

const note = (es, en) => ({ es, en, source: NOTES });

const MARKS = {
  Elemental: {
    'Call of Thunder': note('Reemplaza a Lava Burst, que sale del juego (el lugar es estimado).', 'Replaces Lava Burst, which is removed (the spot is a guess).'),
    'Lightning Mastery': note('Antes Elemental Mastery; ya no nombra a Lava Burst. El ícono nuevo todavía no se conoce.', 'Formerly Elemental Mastery; no longer names Lava Burst. The new icon isn\'t known yet.'),
    'Lightning Overload': note('10/20/30% de chance (era 3/7/10%).', '10/20/30% chance (was 3/7/10%).'),
    'Elemental Reach': note('Ya no baja el tiempo de reutilización de Totemic Projection.', 'No longer lowers Totemic Projection\'s cooldown.')
  },
  Enhancement: {
    'Improved Ghost Wolf': note('Baja de la fila 2 a la 4 (la columna es estimada).', 'Moves from row 2 to row 4 (the column is a guess).'),
    'Mental Dexterity': note('50/100/150% del Intelecto (era 33/67/100%).', '50/100/150% of Intellect (was 33/67/100%).'),
    'Flurry': note('6/12/18/24/30% (era 5/10/15/20/25%).', '6/12/18/24/30% (was 5/10/15/20/25%).'),
    'Stormstrike': note('150% del daño del arma (era 100%), cada 6 s (era 8 s).', '150% weapon damage (was 100%), every 6 sec (was 8 sec).'),
    'Maelstrom Weapon': note('Salta el doble de seguido.', 'Procs twice as often.')
  },
  Restoration: {
    'Riptide': note('Ya no cura de entrada, solo con el tiempo; cada 12 s (era 6 s) y con menos maná.', 'No longer heals up front, only over time; every 12 sec (was 6 sec), less mana.')
  }
};

module.exports = function patch(shaman) {
  const talents = shaman.talents;
  if (!/development notes/i.test(talents.source || '')) return shaman;
  talents.trees.forEach(tree => {
    const marks = MARKS[tree.name] || {};
    tree.talents.forEach(t => { if (marks[t.name]) t.patch = marks[t.name]; });
  });
  talents.patched = NOTES;
  return shaman;
};
