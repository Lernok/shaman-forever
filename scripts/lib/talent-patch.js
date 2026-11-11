// Blizzard's notes of Nov 2, 2026 (us.forums.blizzard.com/en/wow/t/2360696,
// post 9). talentsforever's export has them since Nov 3, set from the notes
// "ahead of any game data" (its talents.source says so). While that holds,
// this sets what the live servers have where the export differs, and marks
// the changed talents so the calculator shows a blue dot and what changed.
// Once the export comes from game data again, it steps aside: delete this
// file then.
//
// Used by build-data.js, build-addon.js and test-rules.js on data/shaman.json
// (which stays as published).

const NOTES = 'https://us.forums.blizzard.com/en/wow/t/2360696';

const note = (es, en) => ({ es, en, source: NOTES });
// The Enhancement hotfix of Nov 10, 2026 (us.forums.blizzard.com/en/wow/t/2403040):
// live on the servers, not in talentsforever's export yet.
const HOTFIX = 'https://us.forums.blizzard.com/en/wow/t/2403040';
const hotfix = (es, en) => ({ es, en, source: HOTFIX });

const MARKS = {
  Elemental: {
    'Call of Thunder': note('Reemplaza a Lava Burst, que sale del juego.', 'Replaces Lava Burst, which is removed.'),
    'Lightning Mastery': note('Antes Elemental Mastery; ya no nombra a Lava Burst.', 'Formerly Elemental Mastery; no longer names Lava Burst.'),
    'Lightning Overload': note('10/20/30% de chance (era 3/7/10%).', '10/20/30% chance (was 3/7/10%).'),
    'Elemental Reach': note('Ya no baja el tiempo de reutilización de Totemic Projection.', 'No longer lowers Totemic Projection\'s cooldown.')
  },
  Enhancement: {
    'Improved Ghost Wolf': note('Baja de la fila 2 a la 4.', 'Moves from row 2 to row 4.'),
    'Improved Lightning Shield': note('Pasa a la columna 3, donde estaba Improved Ghost Wolf.', 'Moves to column 3, where Improved Ghost Wolf was.'),
    'Mental Dexterity': hotfix('33/66/100% del Intelecto: el hotfix del 10-nov deshizo el 50/100/150% de las notas del 2-nov.', '33/66/100% of Intellect: the Nov 10 hotfix undid the 50/100/150% of the Nov 2 notes.'),
    'Flurry': note('6/12/18/24/30% (era 5/10/15/20/25%).', '6/12/18/24/30% (was 5/10/15/20/25%).'),
    'Stormstrike': hotfix('100% del daño del arma cada 8 s: el hotfix del 10-nov deshizo el 150% cada 6 s de las notas del 2-nov.', '100% weapon damage every 8 sec: the Nov 10 hotfix undid the 150% every 6 sec of the Nov 2 notes.'),
    'Maelstrom Weapon': hotfix('Hotfix del 10-nov: 20% por carga con cualquier cantidad de puntos; los puntos suben la frecuencia, 6/7/8/9/10 veces por minuto (era 20 por minuto con 4/8/12/16/20% por carga).', 'Nov 10 hotfix: 20% per stack at any rank; points raise the rate, 6/7/8/9/10 times per minute (was 20 per minute with 4/8/12/16/20% per stack).')
  },
  Restoration: {
    'Riptide': note('Ya no cura de entrada, solo con el tiempo; cada 12 s (era 6 s) y con menos maná.', 'No longer heals up front, only over time; every 12 sec (was 6 sec), less mana.')
  }
};

// What the live servers' hotfixes say (Wowhead's calculator, Nov 3) where the
// export still differs: Improved Lightning Shield takes the wolf's old column,
// Lightning Mastery's icon, and the game's wording.
const LIVE = {
  Elemental: {
    'Call of Thunder': { desc: ['Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by 5%.'] },
    'Lightning Mastery': { icon: 'spell_nature_unrelentingstorm', desc: ['Gain mastery over Lightning, reducing the cast time of your Lightning Bolt spell by 0.5 sec, and removing the cooldown from your Chain Lightning spell. Lasts 15 sec.'] }
  },
  Enhancement: {
    'Improved Lightning Shield': { col: 3 },
    // Nov 10 hotfix.
    'Mental Dexterity': { desc: [33, 66, 100].map(n => 'Increases your Attack Power by an amount equal to ' + n + '% of your Intellect.') },
    'Stormstrike': { desc: ['Instantly strike for 100% weapon damage and increase the damage you deal to the target with your next Lightning Bolt, Chain Lightning, or Earth Shock spell by 20% for 12 sec.'] },
    // The rate per rank (6-10 a minute) is in its mark: the game's wording doesn't state it.
    'Maelstrom Weapon': { desc: [1, 2, 3, 4, 5].map(() => 'When you deal damage with a melee attack, you have a chance to reduce the cast time and Mana cost of your next Lightning Bolt spell by 20%. Stacks up to 5 times. Lasts 30 sec.') }
  }
};

module.exports = function patch(shaman) {
  const talents = shaman.talents;
  if (!/development notes/i.test(talents.source || '')) return shaman;
  talents.trees.forEach(tree => {
    const live = LIVE[tree.name] || {};
    tree.talents.forEach(t => {
      const fix = live[t.name];
      if (!fix) return;
      Object.keys(fix).forEach(k => { t[k] = typeof fix[k] === 'function' ? fix[k](t[k]) : fix[k]; });
    });
    tree.talents.sort((a, b) => a.row - b.row || a.col - b.col);
  });
  const sd = shaman.spell_desc;
  const lm = sd['Shaman|Lightning Mastery|'];
  if (lm) lm.d = LIVE.Elemental['Lightning Mastery'].desc[0];
  const ss = sd['Shaman|Stormstrike|'];
  if (ss) {
    ss.d = LIVE.Enhancement.Stormstrike.desc[0];
    ss.l = ss.l.map(row => row.map(x => x === '6 sec cooldown' ? '8 sec cooldown' : x));
    ss.src = (ss.src || '') + ', server hotfix 2026-11-10';
  }
  talents.trees.forEach(tree => {
    const marks = MARKS[tree.name] || {};
    tree.talents.forEach(t => { if (marks[t.name]) t.patch = marks[t.name]; });
  });
  talents.patched = NOTES;
  return shaman;
};
