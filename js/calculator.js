// Talent calculator tab: all three trees side by side, example builds from
// data/builds.json, and the build kept in location.hash
// (#Talentos/<level>/<code>/<Talented rank>)
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

  function trees() { return window.SHAMAN_DATA.talents.trees; }
  function builds() { return window.I18N.localize(window.BUILD_DATA || []); }

  function routeHash() {
    return '#Talentos/' + state.level + '/' + R.encode(state.ranks, trees()) +
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

  // Icon of the build's deepest talent (lowest row with points).
  function deepest(ranks) {
    let best = null;
    trees().forEach(tr => tr.talents.forEach(x => {
      if ((ranks[tr.name] || {})[x.name] && (!best || x.row > best.row)) best = x;
    }));
    return best ? best.icon : null;
  }

  function split(ranks) {
    return trees().map(t => R.treePoints(ranks, t)).join('/');
  }

  // ---------- rendering ----------

  function renderBuildPicker() {
    const active = matchingBuild();
    // The chosen spec's builds; the trees stay all three (hybrids exist).
    let html = '<details class="panel calc-examples"><summary><h3>' + t('calc.examples') + '</h3></summary>' +
      '<p class="note-text">' + t('calc.examplesIntro') + '</p>' +
      '<div class="build-grid" style="--spec-color:' + ui.specColors[window.Site.spec] + '">';
    const COLORS = { Elemental: ui.specColors.Elemental, Enhancement: ui.specColors.Enhancement, Restoration: ui.specColors.Restoration };
    // Our level-60 pick first, then the rest as they come.
    builds().filter(b => b.spec === window.Site.spec).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0)).forEach(b => {
      const pts = trees().map(tr => R.treePoints(b.points, tr));
      const total = pts.reduce((a, c) => a + c, 0) || 1;
      html += '<button class="build-card' + (active && active.id === b.id ? ' active' : '') + '" data-build="' + b.id + '">' +
        '<img class="bc-icon" src="' + ui.iconUrl(deepest(b.points)) + '" alt="" loading="lazy">' +
        '<span class="bc-body"><span class="bc-name">' + b.name + '</span>' +
        '<span class="bc-tags"><span class="bc-tag' + (b.recommended ? ' rec' : '') + '">' + b.case + '</span><span class="bc-tag">' + t('common.level') + ' ' + b.level + '</span>' +
          (b.order ? '<span class="bc-tag order">' + t('calc.withOrder') + '</span>' : '') + '</span>' +
        '<span class="bc-split">' + trees().map((tr, i) => pts[i] ? '<span style="flex:' + pts[i] + ';background:' + COLORS[tr.name] + '" title="' + tr.name + ' ' + pts[i] + '"></span>' : '').join('') + '</span>' +
        '<span class="bc-meta">' + pts.join(' / ') + '</span></span>' +
        '</button>';
    });
    html += '</div>';
    // Alternatives and caveats for this spec's builds (from its guide).
    const guide = window.I18N.localize(window.GUIDE_DATA[window.Site.spec] || {});
    if (guide.recommendedBuild && guide.recommendedBuild.note) html += '<p class="note-text dim">' + guide.recommendedBuild.note + '</p>';
    html += '</details>';
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

  // Your leveling build (the spec's with an order), at a level.
  function levelingBuild() {
    return builds().filter(b => b.spec === window.Site.spec && b.order).sort((a, b) => b.level - a.level)[0] || null;
  }
  function linkAt(b, level) {
    return '#Talentos/' + level + '/' + R.encode(R.ranksAtLevel(b.order, level), trees());
  }

  // Now, at your level: the point that's due and the next one, and your build there.
  function renderNow() {
    const lvl = Math.min(R.MAX_LEVEL, window.UI.levelNow());
    const tal = window.Home.talentNow(lvl);
    const b = levelingBuild();
    if (!tal || !b) return '';
    const row = (k, x) => '<div class="pn-row"><span class="pn-k">' + k + '</span><div class="pn-v"><img class="cn-ic" src="' + ui.iconUrl(x.icon) + '" alt=""><b>' + x.talent + '</b> <span class="dim">' +
      t('calc.now.rank', { rank: x.rank, max: x.max, n: x.from === x.to ? x.from : x.from + '–' + x.to }) + '</span></div></div>';
    let html = '<section class="pr-now calc-now"><span class="hn-kicker">' + t('guide.now.kicker', { n: lvl }) + '</span>' +
      '<h2>' + (tal.now ? t('calc.now.title', { talent: tal.now.talent }) : t('calc.now.first', { n: tal.next ? tal.next.from : 10 })) + '</h2>';
    if (tal.now) html += row(t('calc.now.now'), tal.now);
    if (tal.next) html += row(t('calc.now.next'), tal.next);
    // Before your first point, the build where it starts.
    const see = Math.max(lvl, b.order[0][0]);
    html += '<div class="pn-row"><span class="pn-k">' + t('calc.now.build') + '</span><div class="pn-v">' + b.name +
      ' <a class="btn" href="' + linkAt(b, see) + '">' + t('calc.now.open', { n: see }) + '</a></div></div>';
    return html + '</section>';
  }

  function renderAll() {
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Calculadora + '">' +
      '<div class="role">' + t('calc.role') + '</div><h2>' + t('calc.title') + '</h2>' +
      '<p><span class="mouse-only">' + t('calc.intro') + '</span><span class="touch-only">' + t('calc.introTouch') + '</span></p></div>';
    html += '<div class="gp-head"><h2>' + t('calc.mine') + '</h2>' + window.UI.levelStepper() + '</div>';
    html += renderNow();
    html += '<div class="panel calc-panel">' + renderToolbar() +
      '<div class="calc-trees">' + trees().map(renderTree).join('') + '</div></div>';
    html += renderBuildPicker();
    html += ui.renderSources(['https://talentsforever.com (CC BY 4.0) — ' + t('calc.srcTf')], t('calc.rules'));
    container.innerHTML = html;
    bind();
  }

  // ---------- tooltip ----------

  function showTip(el) {
    const tree = trees().find(x => x.name === el.dataset.tree);
    const tal = tree.talents.find(x => x.name === el.dataset.talent);
    const rank = R.rankOf(state.ranks, tree, tal.name);
    let html = '<div class="t-name">' + tal.name + ' <span class="t-rankno">' + rank + '/' + tal.max + '</span></div>';
    const I = window.I18N;
    if (rank > 0) html += '<div class="t-rank"><b>' + t('calc.current') + ':</b> ' + I.client(tal.desc[rank - 1]) + '</div>';
    if (rank < tal.max) html += '<div class="t-rank"><b>' + (rank === 0 ? t('tree.rank', { n: 1 }) : t('calc.next')) + ':</b> ' + I.client(tal.desc[rank]) + '</div>';
    if (tal.cost) html += '<div class="t-cost">' + tal.cost.split(' | ').map(I.client).join(' · ') + '</div>';
    const why = R.lockReason(state.ranks, tree, tal);
    if (why && rank < tal.max) html += '<div class="t-lock">' + why + '</div>';
    if (tal.classic && tal.classic.status) {
      html += '<div class="t-classic">' + t('classic.label') + ': <b>' + t('classic.' + tal.classic.status) + '</b></div>';
    }
    html += I.original([rank > 0 ? tal.desc[rank - 1] : '', rank < tal.max ? tal.desc[rank] : '', tal.cost]);
    window.UI.tip.beside(html, el);
  }

  const hideTip = () => window.UI.tip.hide();

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
    // Your level: the build you follow, at the new level.
    window.UI.bindLevel(container, () => {
      const b = levelingBuild();
      if (!b) return renderAll();
      location.hash = linkAt(b, Math.min(R.MAX_LEVEL, window.UI.levelNow()));
    });
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
      // Mouse: hover shows the card. Touch: a tap adds a point, a long press shows it.
      el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(el); });
      el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip(); });
      window.UI.tip.longPress(el, () => showTip(el));
      el.addEventListener('click', e => {
        if (e.target.classList.contains('ctal-minus')) return;
        change(tree, talent, e.shiftKey ? -1 : 1);
        refreshTip(tree, talent);
      });
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (window.UI.tip.isTouch()) return;
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

  // After a re-render the hovered element is new; re-anchor the tooltip to it
  // (with a mouse; on a phone a tap leaves the tree in view).
  function refreshTip(tree, talent) {
    if (window.UI.tip.isTouch()) { hideTip(); return; }
    const el = container.querySelector('.ctal[data-tree="' + tree.name + '"][data-talent="' + talent.name.replace(/"/g, '\\"') + '"]');
    if (el) showTip(el); else hideTip();
  }

  window.Calculator = {
    // parts: hash segments after "Talentos" ([level, code])
    render(target, parts, uiHelpers) {
      container = target;
      ui = uiHelpers;
      const parsed = parseRoute(parts);
      state = { level: parsed.level, talented: parsed.talented, ranks: parsed.ranks, buildId: null, orderBuild: null };
      // No build in the link: your leveling build, at your level.
      const lb = !parts[0] && levelingBuild();
      if (lb) {
        state.level = Math.max(R.MIN_LEVEL - R.MAX_TALENTED, Math.min(R.MAX_LEVEL, window.UI.levelNow()));
        state.ranks = R.ranksAtLevel(lb.order, state.level);
        state.buildId = lb.id;
        state.orderBuild = lb.id;
      }
      const b = matchingBuild();
      if (b) { state.buildId = b.id; state.orderBuild = b.order ? b.id : null; }
      window.Calculator.lastHash = routeHash();
      renderAll();
    },
    lastHash: null,
    // Hash for opening a given example build, used by the spec pages.
    linkFor(build) {
      return '#Talentos/' + build.level + '/' + R.encode(build.points, trees());
    }
  };
})();
