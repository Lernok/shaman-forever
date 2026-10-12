// Talent calculator tab: all three trees side by side, example builds from
// data/builds.json, and the build kept in location.hash
// (#Calculadora/<level>/<code>/<Talented rank>)
// so it can be shared or bookmarked.
(function () {
  const R = window.TalentRules;
  const CELL = 48;
  const GAP = 14;
  const GRID_W = 4 * CELL + 3 * GAP;
  const DEFAULT_LEVEL = 30; // beta level cap as of 2026-10
  const t = (key, vars) => window.I18N.t(key, vars);

  let state = null; // { level, talented, ranks, buildId, orderBuild }
  let ui = null;
  let container = null;
  let tipEl = null;

  function trees() { return window.SHAMAN_DATA.talents.trees; }
  function builds() { return window.I18N.localize(window.BUILD_DATA || []); }

  function routeHash() {
    return '#Calculadora/' + state.level + '/' + R.encode(state.ranks, trees()) +
      (state.talented ? '/' + state.talented : '');
  }

  function parseRoute(parts) {
    const level = Number(parts[0]);
    const talented = Number(parts[2]);
    return {
      level: level >= 1 && level <= R.MAX_LEVEL ? level : DEFAULT_LEVEL,
      talented: talented >= 0 && talented <= R.MAX_TALENTED ? Math.floor(talented) : 0,
      ranks: R.decode(parts[1] || '', trees())
    };
  }

  function matchingBuild() {
    const code = R.encode(state.ranks, trees());
    return builds().find(b => b.level === state.level && R.encode(b.points, trees()) === code) || null;
  }

  // The example build whose leveling order is being followed, if any.
  function orderBuild() {
    return state.orderBuild ? builds().find(b => b.id === state.orderBuild) || null : null;
  }

  function split(ranks) {
    return trees().map(t => R.treePoints(ranks, t)).join('/');
  }

  // ---------- rendering ----------

  function renderBuildPicker() {
    const active = matchingBuild();
    const specs = ['Elemental', 'Enhancement', 'Restoration'];
    let html = '<div class="panel"><h3>' + t('calc.examples') + '</h3>' +
      '<p class="note-text">' + t('calc.examplesIntro') + '</p>' +
      '<div class="build-columns">';
    specs.forEach(spec => {
      html += '<div class="build-col" style="--spec-color:' + ui.specColors[spec] + '">' +
        '<div class="build-col-title">' + spec + '</div>';
      builds().filter(b => b.spec === spec).forEach(b => {
        html += '<button class="build-card' + (active && active.id === b.id ? ' active' : '') + '" data-build="' + b.id + '">' +
          '<span class="bc-name">' + b.name + '</span>' +
          '<span class="bc-meta">' + b.case + ' · ' + t('common.level') + ' ' + b.level + ' · ' + split(b.points) +
            (b.order ? ' · ' + t('calc.withOrder') : '') + '</span>' +
          '</button>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderToolbar() {
    const used = R.totalPoints(state.ranks, trees());
    const budget = R.pointsForLevel(state.level, state.talented);
    const errors = R.validate(state.ranks, trees(), state.level, state.talented);
    let options = '';
    for (let l = R.MIN_LEVEL - R.MAX_TALENTED; l <= R.MAX_LEVEL; l++) {
      options += '<option value="' + l + '"' + (l === state.level ? ' selected' : '') + '>' + l + '</option>';
    }
    let talentedOptions = '';
    for (let r = 0; r <= R.MAX_TALENTED; r++) {
      talentedOptions += '<option value="' + r + '"' + (r === state.talented ? ' selected' : '') + '>' + r + '/' + R.MAX_TALENTED + '</option>';
    }
    let html = '<div class="calc-toolbar">' +
      '<label class="calc-level">' + t('calc.level') + ' <select id="calcLevel">' + options + '</select></label>' +
      '<label class="calc-level" title="' + t('calc.talentedTitle') + '">' +
        'Legacy: Talented <select id="calcTalented">' + talentedOptions + '</select></label>' +
      '<div class="calc-stat"><b>' + used + '</b> / ' + budget + ' ' + t('calc.points') + '</div>' +
      '<div class="calc-stat">' + t('calc.split') + ' <b>' + split(state.ranks) + '</b></div>' +
      '<div class="calc-stat">' + t('calc.levelNeeded') + ' <b>' + (used ? R.levelForPoints(used, state.talented) : '—') + '</b></div>' +
      '<div class="calc-actions">' +
        '<button class="btn" id="calcCopy">' + t('calc.copy') + '</button>' +
        '<button class="btn" id="calcReset">' + t('calc.reset') + '</button>' +
      '</div></div>';
    if (errors.length) {
      html += '<div class="caveat calc-errors">' + errors.join('<br>') + '</div>';
    }
    const following = orderBuild();
    const active = matchingBuild() || following;
    if (active) {
      html += '<div class="build-note" style="--spec-color:' + ui.specColors[active.spec] + '">' +
        '<b>' + active.spec + ' — ' + active.name + '</b> ' + ui.badge(active.confidence) +
        ' <span class="origin">' + (active.source
          ? '<a href="' + active.source + '" target="_blank" rel="noopener">' + t('origin.' + active.origin) + '</a>'
          : t('origin.' + active.origin)) + '</span>' +
        (following && state.level !== following.level ? ' <span class="origin">' + t('calc.following', { level: state.level }) + '</span>' : '') +
        '<p>' + active.note + '</p></div>';
      if (following) html += renderOrder(following);
    } else if (state.buildId) {
      html += '<div class="build-note dim"><p>' + t('calc.modified') + '</p></div>';
    }
    return html;
  }

  // Level-by-level list of an order, with the steps already reached lit up.
  function renderOrder(b) {
    let html = '<details class="order-panel" open><summary>' + t('calc.order', { n: b.order.length }) + '</summary><ol>';
    b.order.forEach(([from, to, treeName, talent, rank]) => {
      const tree = trees().find(x => x.name === treeName);
      const tal = tree.talents.find(x => x.name === talent);
      const reached = to <= state.level ? ' reached' : from <= state.level ? ' partial' : '';
      html += '<li class="order-step' + reached + '" style="--spec-color:' + ui.specColors[treeName] + '">' +
        '<span class="os-lv">' + t('calc.lv') + ' ' + (from === to ? from : from + '–' + to) + '</span>' +
        '<img src="' + ui.iconUrl(tal.icon) + '" alt="">' +
        '<span class="os-name">' + talent + '</span>' +
        '<span class="os-rank">' + rank + '/' + tal.max + '</span></li>';
    });
    return html + '</ol></details>';
  }

  function renderTree(tree) {
    const rows = Math.max(...tree.talents.map(t => t.row));
    const pts = R.treePoints(state.ranks, tree);
    // First row whose gate isn't met yet, judged by points in the rows above it.
    let nextGate = null;
    for (let r = 2; r <= rows; r++) {
      if (R.treePoints(state.ranks, { name: tree.name, talents: tree.talents.filter(t => t.row < r) }) < R.rowGate(r)) {
        nextGate = R.rowGate(r);
        break;
      }
    }
    let html = '<div class="calc-tree" style="--spec-color:' + ui.specColors[tree.name] + ';background-image:' + ui.treeBg(tree) + '">' +
      '<div class="calc-tree-head">' +
        '<img class="tree-icon" src="' + ui.iconUrl(tree.icon) + '" alt="">' +
        '<div class="th-text"><span>' + tree.name + '</span>' +
          '<small>' + (nextGate ? t('calc.nextRow', { n: nextGate }) : t('calc.allRows')) + '</small></div>' +
        '<b>' + pts + '</b></div>' +
      '<div class="calc-grid" style="width:' + GRID_W + 'px;height:' + (rows * CELL + (rows - 1) * GAP) + 'px">';

    // Row gate markers: a dashed line above each row with the points it needs.
    for (let r = 2; r <= rows; r++) {
      const above = R.treePoints(state.ranks, { name: tree.name, talents: tree.talents.filter(t => t.row < r) });
      const top = (r - 1) * (CELL + GAP) - GAP / 2;
      html += '<div class="row-gate' + (above >= R.rowGate(r) ? ' met' : '') + '" style="top:' + top + 'px">' +
        '<span>' + R.rowGate(r) + '</span></div>';
    }

    // Prerequisite arrows sit behind the icons; every req in the data is in the same column.
    tree.talents.filter(x => x.req).forEach(tal => {
      const req = tree.talents.find(x => x.name === tal.req);
      if (!req) return;
      const met = R.rankOf(state.ranks, tree, req.name) >= req.max;
      const top = (req.row - 1) * (CELL + GAP) + CELL;
      const height = (tal.row - req.row) * (CELL + GAP) - CELL;
      const left = (tal.col - 1) * (CELL + GAP) + CELL / 2 - 2;
      html += '<div class="req-arrow' + (met ? ' met' : '') + '" style="top:' + top + 'px;left:' + left + 'px;height:' + height + 'px"></div>';
    });

    tree.talents.forEach(tal => {
      const rank = R.rankOf(state.ranks, tree, tal.name);
      const locked = rank === 0 && R.lockReason(state.ranks, tree, tal) !== null;
      const cls = rank >= tal.max ? 'maxed' : rank > 0 ? 'learning' : locked ? 'locked' : 'open';
      html += '<div class="ctal ' + cls + '" data-tree="' + tree.name + '" data-talent="' + tal.name + '" ' +
        'style="left:' + ((tal.col - 1) * (CELL + GAP)) + 'px;top:' + ((tal.row - 1) * (CELL + GAP)) + 'px;' +
        'background-image:url(' + ui.iconUrl(tal.icon) + ')">' +
        '<span class="ctal-rank">' + rank + '/' + tal.max + '</span>' +
        (rank > 0 ? '<button class="ctal-minus" aria-label="' + t('calc.removePoint', { talent: tal.name }) + '">−</button>' : '') +
        '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderAll() {
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Calculadora + '">' +
      '<div class="role">' + t('calc.role') + '</div><h2>' + t('calc.title') + '</h2>' +
      '<p>' + t('calc.intro') + '</p></div>';
    html += renderBuildPicker();
    html += '<div class="panel calc-panel">' + renderToolbar() +
      '<div class="calc-trees">' + trees().map(renderTree).join('') + '</div></div>';
    container.innerHTML = html;
    bind();
  }

  // ---------- tooltip ----------

  function showTip(el) {
    const tree = trees().find(x => x.name === el.dataset.tree);
    const tal = tree.talents.find(x => x.name === el.dataset.talent);
    const rank = R.rankOf(state.ranks, tree, tal.name);
    let html = '<div class="t-name">' + tal.name + ' <span class="t-rankno">' + rank + '/' + tal.max + '</span></div>';
    if (rank > 0) html += '<div class="t-rank"><b>' + t('calc.current') + ':</b> ' + tal.desc[rank - 1] + '</div>';
    if (rank < tal.max) html += '<div class="t-rank"><b>' + (rank === 0 ? t('tree.rank', { n: 1 }) : t('calc.next')) + ':</b> ' + tal.desc[rank] + '</div>';
    if (tal.cost) html += '<div class="t-cost">' + tal.cost + '</div>';
    const why = R.lockReason(state.ranks, tree, tal);
    if (why && rank < tal.max) html += '<div class="t-lock">' + why + '</div>';
    if (tal.classic && tal.classic.status) {
      html += '<div class="t-classic">Classic Era: <b>' + tal.classic.status + '</b></div>';
    }
    tipEl.innerHTML = html;
    tipEl.style.display = 'block';
    const r = el.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    let left = r.right + 10;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 10);
    let top = Math.min(r.top, window.innerHeight - h - 8);
    tipEl.style.left = left + 'px';
    tipEl.style.top = Math.max(8, top) + 'px';
  }

  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  // ---------- interaction ----------

  function change(tree, talent, delta) {
    const rank = R.rankOf(state.ranks, tree, talent.name);
    const ok = delta > 0
      ? R.canAdd(state.ranks, trees(), tree, talent, state.level, state.talented)
      : R.canRemove(state.ranks, trees(), tree, talent);
    if (!ok) return false;
    state.ranks = R.withRank(state.ranks, tree, talent, rank + delta);
    state.orderBuild = null;
    commit();
    return true;
  }

  function commit() {
    window.Calculator.lastHash = routeHash();
    history.replaceState(null, '', window.Calculator.lastHash);
    renderAll();
  }

  function talentFromEl(el) {
    const tree = trees().find(x => x.name === el.dataset.tree);
    return [tree, tree.talents.find(x => x.name === el.dataset.talent)];
  }

  function bind() {
    container.querySelectorAll('.build-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = builds().find(x => x.id === btn.dataset.build);
        state = { level: b.level, talented: state.talented, ranks: JSON.parse(JSON.stringify(b.points)), buildId: b.id,
          orderBuild: b.order ? b.id : null };
        commit();
      });
    });

    container.querySelector('#calcLevel').addEventListener('change', e => {
      state.level = Number(e.target.value);
      // Following a leveling order: show where that order is at the new level.
      const following = orderBuild();
      if (following) state.ranks = R.ranksAtLevel(following.order, state.level);
      commit();
    });

    container.querySelector('#calcTalented').addEventListener('change', e => {
      state.talented = Number(e.target.value);
      commit();
    });

    container.querySelector('#calcReset').addEventListener('click', () => {
      state = { level: state.level, talented: state.talented, ranks: {}, buildId: null, orderBuild: null };
      commit();
    });

    const copyBtn = container.querySelector('#calcCopy');
    copyBtn.addEventListener('click', () => {
      const done = text => { copyBtn.textContent = text; setTimeout(() => { copyBtn.textContent = t('calc.copy'); }, 1800); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(location.href).then(() => done(t('calc.copied')), () => done(t('calc.copyFallback')));
      } else {
        done(t('calc.copyFallback'));
      }
    });

    container.querySelectorAll('.ctal').forEach(el => {
      const [tree, talent] = talentFromEl(el);
      el.addEventListener('mouseenter', () => showTip(el));
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('click', e => {
        if (e.target.classList.contains('ctal-minus')) return;
        change(tree, talent, e.shiftKey ? -1 : 1);
        refreshTip(tree, talent);
      });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        change(tree, talent, -1);
        refreshTip(tree, talent);
      });
      const minus = el.querySelector('.ctal-minus');
      if (minus) {
        minus.addEventListener('click', e => {
          e.stopPropagation();
          change(tree, talent, -1);
          refreshTip(tree, talent);
        });
      }
    });
  }

  // After a re-render the hovered element is new; re-anchor the tooltip to it.
  function refreshTip(tree, talent) {
    const el = container.querySelector('.ctal[data-tree="' + tree.name + '"][data-talent="' + talent.name.replace(/"/g, '\\"') + '"]');
    if (el) showTip(el); else hideTip();
  }

  window.Calculator = {
    // parts: hash segments after "Calculadora" ([level, code])
    render(target, parts, uiHelpers) {
      container = target;
      ui = uiHelpers;
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip calc-tip';
        tipEl.style.display = 'none';
        document.body.appendChild(tipEl);
      }
      const parsed = parseRoute(parts);
      state = { level: parsed.level, talented: parsed.talented, ranks: parsed.ranks, buildId: null, orderBuild: null };
      const b = matchingBuild();
      if (b) { state.buildId = b.id; state.orderBuild = b.order ? b.id : null; }
      window.Calculator.lastHash = routeHash();
      renderAll();
    },
    hide: hideTip,
    lastHash: null,
    // Hash for opening a given example build, used by the spec pages.
    linkFor(build) {
      return '#Calculadora/' + build.level + '/' + R.encode(build.points, trees());
    }
  };
})();
