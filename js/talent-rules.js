// Talent point rules shared by the in-page calculator and scripts/build-data.js.
// Rules per talentsforever.com (read from the beta client, mirrored from its
// calc.js): one point per level from 10, never more than 51; the account-wide
// Legacy perk "Talented" (0-5) starts the points up to 5 levels earlier. A row
// opens once the rows above it hold (row - 1) * 5 points, and a talent with
// `req` needs that talent maxed first.
(function (root) {
  const POINTS_PER_ROW = 5;
  const MIN_LEVEL = 10;
  const MAX_LEVEL = 60;
  const MAX_POINTS = 51;
  const MAX_TALENTED = 5;

  // talented = rank of the Legacy perk "Talented" (each rank = points one level earlier)
  function pointsForLevel(level, talented) {
    return Math.min(MAX_POINTS, Math.max(0, level - (MIN_LEVEL - 1) + (talented || 0)));
  }

  function levelForPoints(points, talented) {
    return Math.max(1, points + (MIN_LEVEL - 1) - (talented || 0));
  }

  // ranks: { [treeName]: { [talentName]: rank } }
  function rankOf(ranks, tree, name) {
    return (ranks[tree.name] && ranks[tree.name][name]) || 0;
  }

  function treePoints(ranks, tree) {
    return tree.talents.reduce((sum, t) => sum + rankOf(ranks, tree, t.name), 0);
  }

  function totalPoints(ranks, trees) {
    return trees.reduce((sum, tree) => sum + treePoints(ranks, tree), 0);
  }

  function pointsAboveRow(ranks, tree, row) {
    return tree.talents
      .filter(t => t.row < row)
      .reduce((sum, t) => sum + rankOf(ranks, tree, t.name), 0);
  }

  function rowGate(row) {
    return (row - 1) * POINTS_PER_ROW;
  }

  // Why a talent can't take (more) points right now, ignoring the level budget.
  // Returns null when its row and prerequisite are satisfied.
  function lockReason(ranks, tree, talent) {
    const above = pointsAboveRow(ranks, tree, talent.row);
    if (above < rowGate(talent.row)) {
      return 'Requiere ' + rowGate(talent.row) + ' puntos en ' + tree.name + ' (llevás ' + above + ')';
    }
    if (talent.req) {
      const req = tree.talents.find(t => t.name === talent.req);
      if (req && rankOf(ranks, tree, req.name) < req.max) {
        return 'Requiere ' + req.name + ' al máximo (' + req.max + '/' + req.max + ')';
      }
    }
    return null;
  }

  // Every rule violation in a build, as readable strings. Empty array = valid.
  function validate(ranks, trees, level, talented) {
    const errors = [];
    Object.keys(ranks).forEach(treeName => {
      const tree = trees.find(t => t.name === treeName);
      if (!tree) { errors.push('Árbol desconocido: ' + treeName); return; }
      Object.keys(ranks[treeName]).forEach(name => {
        const talent = tree.talents.find(t => t.name === name);
        const rank = ranks[treeName][name];
        if (!talent) { errors.push('Talento desconocido en ' + treeName + ': ' + name); return; }
        if (!Number.isInteger(rank) || rank < 0 || rank > talent.max) {
          errors.push(name + ': rango ' + rank + ' fuera de 0-' + talent.max);
          return;
        }
        if (rank > 0) {
          const why = lockReason(ranks, tree, talent);
          if (why) errors.push(name + ': ' + why);
        }
      });
    });
    const total = totalPoints(ranks, trees);
    if (level != null && total > pointsForLevel(level, talented)) {
      errors.push(total + ' puntos gastados, pero al nivel ' + level +
        (talented ? ' con Talented ' + talented + '/5' : '') + ' hay ' + pointsForLevel(level, talented));
    }
    return errors;
  }

  function withRank(ranks, tree, talent, rank) {
    const next = JSON.parse(JSON.stringify(ranks));
    next[tree.name] = next[tree.name] || {};
    if (rank > 0) next[tree.name][talent.name] = rank;
    else delete next[tree.name][talent.name];
    return next;
  }

  function canAdd(ranks, trees, tree, talent, level, talented) {
    if (rankOf(ranks, tree, talent.name) >= talent.max) return false;
    if (totalPoints(ranks, trees) >= pointsForLevel(level, talented)) return false;
    return lockReason(ranks, tree, talent) === null;
  }

  // A point can come out only if every remaining talent still meets its row
  // gate and prerequisite afterwards.
  function canRemove(ranks, trees, tree, talent) {
    const rank = rankOf(ranks, tree, talent.name);
    if (rank === 0) return false;
    return validate(withRank(ranks, tree, talent, rank - 1), trees, null).length === 0;
  }

  // Compact share code: one digit per talent in data order, trees joined by '-'.
  function encode(ranks, trees) {
    return trees.map(tree =>
      tree.talents.map(t => rankOf(ranks, tree, t.name)).join('').replace(/0+$/, '')
    ).join('-');
  }

  function decode(code, trees) {
    const parts = String(code || '').split('-');
    const ranks = {};
    trees.forEach((tree, i) => {
      const digits = parts[i] || '';
      tree.talents.forEach((t, j) => {
        const r = Math.min(Number(digits[j]) || 0, t.max);
        if (r > 0) {
          ranks[tree.name] = ranks[tree.name] || {};
          ranks[tree.name][t.name] = r;
        }
      });
    });
    return ranks;
  }

  const api = {
    POINTS_PER_ROW, MIN_LEVEL, MAX_LEVEL, MAX_POINTS, MAX_TALENTED,
    pointsForLevel, levelForPoints, rankOf, treePoints, totalPoints, rowGate,
    lockReason, validate, withRank, canAdd, canRemove, encode, decode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TalentRules = api;
})(this);
