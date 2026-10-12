// Checks js/talent-rules.js against (1) hand-written edge cases on the real
// Shaman trees and (2) a reference port of talentsforever.com's calc.js rules
// (gate / canAdd / canRemove / pool), compared on thousands of random builds.
//
//   node scripts/test-rules.js          (RUNS=400 node ... for a longer random pass)
const assert = require('assert');
const R = require('../js/talent-rules.js');
const trees = require('../data/shaman.json').talents.trees;

const T = name => trees.find(t => t.name === name);
const talent = (treeName, name) => {
  const t = T(treeName).talents.find(x => x.name === name);
  if (!t) throw new Error('no talent ' + name);
  return t;
};
let ranks;
const set = (treeName, name, r) => { ranks = R.withRank(ranks, T(treeName), talent(treeName, name), r); };
const canAdd = (treeName, name, level = 60, talented = 0) =>
  R.canAdd(ranks, trees, T(treeName), talent(treeName, name), level, talented);
const canRemove = (treeName, name) => R.canRemove(ranks, trees, T(treeName), talent(treeName, name));
let cases = 0;
const check = (label, actual, expected) => { cases++; assert.strictEqual(actual, expected, label); };

// ---------- hand-written edge cases ----------
ranks = {};
check('row 1 open from 0 points', canAdd('Elemental', 'Convection'), true);
check('row 2 closed at 0', canAdd('Elemental', 'Call of Flame'), false);
set('Elemental', 'Convection', 4);
check('row 2 closed at 4/5', canAdd('Elemental', 'Call of Flame'), false);
set('Elemental', 'Convection', 5);
check('row 2 opens at exactly 5', canAdd('Elemental', 'Call of Flame'), true);
check('row 3 closed with 5 above', canAdd('Elemental', 'Elemental Focus'), false);
check('rank cap', canAdd('Elemental', 'Convection'), false);

set('Elemental', 'Call of Flame', 1);
check('row-1 point needed by row 2 cannot come out', canRemove('Elemental', 'Convection'), false);
check('row-2 point (nothing below it) can come out', canRemove('Elemental', 'Call of Flame'), true);
set('Elemental', 'Concussion', 1);
check('6th point in row 1 can come out (5 remain)', canRemove('Elemental', 'Convection'), true);
check('...and so can the other one', canRemove('Elemental', 'Concussion'), true);

// Points in the row itself don't open that row's own gate, and other trees never count.
ranks = {};
set('Restoration', 'Improved Healing Wave', 5);
set('Restoration', 'Totemic Focus', 5);
check('Resto points do not open Elemental row 2', canAdd('Elemental', 'Call of Flame'), false);
ranks = {};
set('Elemental', 'Convection', 5);
set('Elemental', 'Call of Flame', 3);
set('Elemental', 'Reverberation', 1);
check('9 points above row 3 (needs 10): closed', canAdd('Elemental', 'Elemental Alacrity'), false);
set('Elemental', 'Reverberation', 2);
check('10 above row 3: open', canAdd('Elemental', 'Elemental Alacrity'), true);

// Prerequisite arrows: Call of Thunder (row 4) needs Elemental Alacrity 3/3.
set('Elemental', 'Elemental Alacrity', 2);
set('Elemental', 'Elemental Focus', 1);
set('Elemental', 'Concussion', 2);
check('row 4 gate met (15) but prereq at 2/3: closed', canAdd('Elemental', 'Call of Thunder'), false);
set('Elemental', 'Elemental Alacrity', 3);
check('prereq maxed: open', canAdd('Elemental', 'Call of Thunder'), true);
set('Elemental', 'Call of Thunder', 1);
check('prereq point cannot come out while dependent has points', canRemove('Elemental', 'Elemental Alacrity'), false);

// Lava Burst: row 7 (30 points in rows 1-6) AND Lightning Overload 3/3.
ranks = {};
set('Elemental', 'Convection', 5); set('Elemental', 'Concussion', 5);
set('Elemental', 'Reverberation', 5); set('Elemental', 'Call of Flame', 3); set('Elemental', 'Elemental Warding', 2);
set('Elemental', 'Elemental Focus', 1); set('Elemental', 'Elemental Alacrity', 3);
set('Elemental', 'Eye of the Storm', 3); set('Elemental', 'Call of Thunder', 1);
set('Elemental', 'Lightning Overload', 2);
check('LO 2/3, 30 above row 7: Lava Burst closed (prereq)', canAdd('Elemental', 'Lava Burst'), false);
set('Elemental', 'Lightning Overload', 3);
check('LO 3/3 + 31 above: Lava Burst open', canAdd('Elemental', 'Lava Burst'), true);
set('Elemental', 'Lava Burst', 1);
check('LO point cannot come out under Lava Burst', canRemove('Elemental', 'Lightning Overload'), false);
check('row-1 point removable while rows above row 7 keep 30', canRemove('Elemental', 'Convection'), true);
set('Elemental', 'Elemental Warding', 1);
check('...but not once rows 1-6 are at exactly 30', canRemove('Elemental', 'Convection'), false);

// Validate: a hand-made (link) build that skips a gate is reported, not silently accepted.
check('skipped gate is an error', R.validate({ Elemental: { 'Lava Burst': 1 } }, trees, 60).length > 0, true);
check('missing prereq is an error',
  R.validate({ Enhancement: { 'Thundering Strikes': 5, 'Mental Dexterity': 2, 'Improved Ghost Wolf': 2, 'Ancestral Knowledge': 5, 'Elemental Weapons': 1, Flurry: 1 } }, trees, 60)
    .some(e => /Mental Dexterity/.test(e)), true);
check('rank over max is an error', R.validate({ Elemental: { Convection: 6 } }, trees, 60).length > 0, true);

// Point budget, incl. Legacy "Talented" and the 51 cap.
check('lvl 9 -> 0', R.pointsForLevel(9), 0);
check('lvl 10 -> 1', R.pointsForLevel(10), 1);
check('lvl 30 -> 21', R.pointsForLevel(30), 21);
check('lvl 60 -> 51', R.pointsForLevel(60), 51);
check('lvl 30 + Talented 5 -> 26', R.pointsForLevel(30, 5), 26);
check('lvl 5 + Talented 5 -> 1', R.pointsForLevel(5, 5), 1);
check('lvl 60 + Talented 5 capped at 51', R.pointsForLevel(60, 5), 51);
check('lvl 57 + Talented 5 capped at 51', R.pointsForLevel(57, 5), 51);
check('21 points need lvl 30', R.levelForPoints(21), 30);
check('26 points with Talented 5 need lvl 30', R.levelForPoints(26, 5), 30);
check('over-budget build is an error', R.validate({ Elemental: { Convection: 5 } }, trees, 13).length > 0, true);
check('same build fits at 13 with Talented 1', R.validate({ Elemental: { Convection: 5 } }, trees, 13, 1).length, 0);

// ---------- reference port of talentsforever.com calc.js (class trees) ----------
// above / gate / canAdd / canRemove / pool, over index arrays like the original.
function ref(rk, level, talented) {
  const above = (ti, tier) => trees[ti].talents.reduce((a, t, i) => a + (t.row < tier ? rk[ti][i] : 0), 0);
  const idx = (tree, name) => tree.talents.findIndex(t => t.name === name);
  const treePts = ti => rk[ti].reduce((a, b) => a + b, 0);
  const totalPts = () => trees.reduce((a, _, i) => a + treePts(i), 0);
  const pool = () => Math.min(51, Math.max(0, level - 9 + talented));
  function gate(ti, i) {
    const tree = trees[ti], t = tree.talents[i], r = rk[ti];
    const need = (t.row - 1) * 5;
    if (above(ti, t.row) < need) return 'row';
    if (t.req) { const p = idx(tree, t.req); if (p >= 0 && r[p] < tree.talents[p].max) return 'req'; }
    return null;
  }
  return {
    canAdd(ti, i) {
      const t = trees[ti].talents[i];
      if (rk[ti][i] >= t.max) return false;
      if (gate(ti, i)) return false;
      if (totalPts() >= pool()) return false;
      return true;
    },
    canRemove(ti, i) {
      const r = rk[ti];
      if (r[i] <= 0) return false;
      r[i]--; let ok = true;
      for (let j = 0; j < trees[ti].talents.length && ok; j++) { if (r[j] > 0 && gate(ti, j)) ok = false; }
      r[i]++; return ok;
    }
  };
}

const toIdx = rs => trees.map(tree => tree.talents.map(t => R.rankOf(rs, tree, t.name)));
let seed = 12345;
const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let comparisons = 0;
let steps = 0;
const RUNS = Number(process.env.RUNS) || 150;
for (let run = 0; run < RUNS; run++) {
  const level = 1 + rand(60);
  const talented = rand(6);
  ranks = {};
  for (let step = 0; step < 120; step++) {
    const rk = toIdx(ranks);
    const reference = ref(rk, level, talented);
    const options = [];
    trees.forEach((tree, ti) => tree.talents.forEach((t, i) => {
      const mineAdd = R.canAdd(ranks, trees, tree, t, level, talented);
      const mineRem = R.canRemove(ranks, trees, tree, t);
      assert.strictEqual(mineAdd, reference.canAdd(ti, i),
        'canAdd mismatch: ' + t.name + ' lvl ' + level + ' T' + talented + ' ' + R.encode(ranks, trees));
      assert.strictEqual(mineRem, reference.canRemove(ti, i),
        'canRemove mismatch: ' + t.name + ' ' + R.encode(ranks, trees));
      comparisons += 2;
      if (mineAdd) options.push([tree, t, 1]);
      if (mineRem) options.push([tree, t, -1]);
    }));
    // Every state reachable through allowed clicks must pass validate().
    assert.deepStrictEqual(R.validate(ranks, trees, level, talented), [], 'reachable state invalid: ' + R.encode(ranks, trees));
    // Share code round-trips.
    assert.strictEqual(R.encode(R.decode(R.encode(ranks, trees), trees), trees), R.encode(ranks, trees));
    if (!options.length) break;
    // Bias toward adding so builds get deep into the trees.
    const adds = options.filter(o => o[2] > 0);
    const pick = adds.length && rand(4) ? adds[rand(adds.length)] : options[rand(options.length)];
    const [tree, t, delta] = pick;
    ranks = R.withRank(ranks, tree, t, R.rankOf(ranks, tree, t.name) + delta);
    steps++;
  }
}

console.log('OK: ' + cases + ' casos puntuales, ' + steps + ' clicks al azar, ' +
  comparisons + ' comparaciones contra la lógica de talentsforever.com, todas coinciden.');
