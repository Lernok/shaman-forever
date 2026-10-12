// Talent calculator tab: all three trees side by side, example builds from
// data/builds.json, and the build kept in location.hash (#Calculadora/<level>/<code>)
// so it can be shared or bookmarked.
(function () {
  const R = window.TalentRules;
  const CELL = 56;
  const GAP = 10;
  const DEFAULT_LEVEL = 30; // beta level cap as of 2026-10
  const ORIGIN_LABEL = {
    guia: 'Basado en la guía',
    ejemplo: 'Ejemplo armado acá'
  };

  let state = null; // { level, ranks, buildId }
  let ui = null;
  let container = null;
  let tipEl = null;

  function trees() { return window.SHAMAN_DATA.talents.trees; }
  function builds() { return window.BUILD_DATA || []; }

  function routeHash() {
    return '#Calculadora/' + state.level + '/' + R.encode(state.ranks, trees());
  }

  function parseRoute(parts) {
    const level = Number(parts[0]);
    return {
      level: level >= R.MIN_LEVEL && level <= R.MAX_LEVEL ? level : DEFAULT_LEVEL,
      ranks: R.decode(parts[1] || '', trees())
    };
  }

  function matchingBuild() {
    const code = R.encode(state.ranks, trees());
    return builds().find(b => b.level === state.level && R.encode(b.points, trees()) === code) || null;
  }

  function split(ranks) {
    return trees().map(t => R.treePoints(ranks, t)).join('/');
  }

  // ---------- rendering ----------

  function renderBuildPicker() {
    const active = matchingBuild();
    const specs = ['Elemental', 'Enhancement', 'Restoration'];
    let html = '<div class="panel"><h3>Builds de ejemplo</h3>' +
      '<p class="note-text">Elegí uno para cargarlo en los árboles y modificarlo. Ninguno está probado en juego todavía; ' +
      'los de nivel 60 son proyecciones porque la beta está capada en 30.</p>' +
      '<div class="build-columns">';
    specs.forEach(spec => {
      html += '<div class="build-col" style="--spec-color:' + ui.specColors[spec] + '">' +
        '<div class="build-col-title">' + spec + '</div>';
      builds().filter(b => b.spec === spec).forEach(b => {
        html += '<button class="build-card' + (active && active.id === b.id ? ' active' : '') + '" data-build="' + b.id + '">' +
          '<span class="bc-name">' + b.name + '</span>' +
          '<span class="bc-meta">' + b.case + ' · nivel ' + b.level + ' · ' + split(b.points) + '</span>' +
          '</button>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderToolbar() {
    const used = R.totalPoints(state.ranks, trees());
    const budget = R.pointsForLevel(state.level);
    const errors = R.validate(state.ranks, trees(), state.level);
    let options = '';
    for (let l = R.MIN_LEVEL; l <= R.MAX_LEVEL; l++) {
      options += '<option value="' + l + '"' + (l === state.level ? ' selected' : '') + '>' + l + '</option>';
    }
    let html = '<div class="calc-toolbar">' +
      '<label class="calc-level">Nivel <select id="calcLevel">' + options + '</select></label>' +
      '<div class="calc-stat"><b>' + used + '</b> / ' + budget + ' puntos</div>' +
      '<div class="calc-stat">Reparto <b>' + split(state.ranks) + '</b></div>' +
      '<div class="calc-stat">Nivel necesario <b>' + R.levelForPoints(used) + '</b></div>' +
      '<div class="calc-actions">' +
        '<button class="btn" id="calcCopy">Copiar link</button>' +
        '<button class="btn" id="calcReset">Reiniciar</button>' +
      '</div></div>';
    if (errors.length) {
      html += '<div class="caveat calc-errors">' + errors.join('<br>') + '</div>';
    }
    const active = matchingBuild();
    if (active) {
      html += '<div class="build-note" style="--spec-color:' + ui.specColors[active.spec] + '">' +
        '<b>' + active.spec + ' — ' + active.name + '</b> ' + ui.badge(active.confidence) +
        ' <span class="origin">' + ORIGIN_LABEL[active.origin] + '</span>' +
        '<p>' + active.note + '</p></div>';
    } else if (state.buildId) {
      html += '<div class="build-note dim"><p>Modificado a partir de un build de ejemplo.</p></div>';
    }
    return html;
  }

  function renderTree(tree) {
    const rows = Math.max(...tree.talents.map(t => t.row));
    const pts = R.treePoints(state.ranks, tree);
    let html = '<div class="calc-tree" style="--spec-color:' + ui.specColors[tree.name] + '">' +
      '<div class="calc-tree-head"><span>' + tree.name + '</span><b>' + pts + '</b></div>' +
      '<div class="calc-grid" style="height:' + (rows * CELL + (rows - 1) * GAP) + 'px">';

    // Prerequisite arrows sit behind the icons; every req in the data is in the same column.
    tree.talents.filter(t => t.req).forEach(t => {
      const req = tree.talents.find(x => x.name === t.req);
      if (!req) return;
      const met = R.rankOf(state.ranks, tree, req.name) >= req.max;
      const top = (req.row - 1) * (CELL + GAP) + CELL;
      const height = (t.row - req.row) * (CELL + GAP) - CELL;
      const left = (t.col - 1) * (CELL + GAP) + CELL / 2 - 2;
      html += '<div class="req-arrow' + (met ? ' met' : '') + '" style="top:' + top + 'px;left:' + left + 'px;height:' + height + 'px"></div>';
    });

    tree.talents.forEach(t => {
      const rank = R.rankOf(state.ranks, tree, t.name);
      const locked = rank === 0 && R.lockReason(state.ranks, tree, t) !== null;
      const cls = rank >= t.max ? 'maxed' : rank > 0 ? 'learning' : locked ? 'locked' : 'open';
      html += '<div class="ctal ' + cls + '" data-tree="' + tree.name + '" data-talent="' + t.name + '" ' +
        'style="left:' + ((t.col - 1) * (CELL + GAP)) + 'px;top:' + ((t.row - 1) * (CELL + GAP)) + 'px;' +
        'background-image:url(' + ui.iconUrl(t.icon) + ')">' +
        '<span class="ctal-rank">' + rank + '/' + t.max + '</span>' +
        (rank > 0 ? '<button class="ctal-minus" aria-label="Quitar un punto de ' + t.name + '">−</button>' : '') +
        '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderAll() {
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Calculadora + '">' +
      '<div class="role">Talentos</div><h2>Calculadora de talentos</h2>' +
      '<p>Click en un talento para sumar un punto; click derecho, Shift+click o el botón − para sacarlo. ' +
      'Las filas se abren cada 5 puntos en el árbol, y una flecha indica que el talento de arriba tiene que estar al máximo. ' +
      'Un punto por nivel desde el 10 (21 al 30, 51 al 60). Reglas y datos: talentsforever.com, leídos del cliente beta.</p></div>';
    html += renderBuildPicker();
    html += '<div class="panel calc-panel">' + renderToolbar() +
      '<div class="calc-trees">' + trees().map(renderTree).join('') + '</div></div>';
    container.innerHTML = html;
    bind();
  }

  // ---------- tooltip ----------

  function showTip(el) {
    const tree = trees().find(t => t.name === el.dataset.tree);
    const t = tree.talents.find(x => x.name === el.dataset.talent);
    const rank = R.rankOf(state.ranks, tree, t.name);
    let html = '<div class="t-name">' + t.name + ' <span class="t-rankno">' + rank + '/' + t.max + '</span></div>';
    if (rank > 0) html += '<div class="t-rank"><b>Actual:</b> ' + t.desc[rank - 1] + '</div>';
    if (rank < t.max) html += '<div class="t-rank"><b>' + (rank === 0 ? 'Rango 1' : 'Siguiente') + ':</b> ' + t.desc[rank] + '</div>';
    if (t.cost) html += '<div class="t-cost">' + t.cost + '</div>';
    const why = R.lockReason(state.ranks, tree, t);
    if (why && rank < t.max) html += '<div class="t-lock">' + why + '</div>';
    if (t.classic && t.classic.status) {
      html += '<div class="t-classic">Classic Era: <b>' + t.classic.status + '</b></div>';
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
      ? R.canAdd(state.ranks, trees(), tree, talent, state.level)
      : R.canRemove(state.ranks, trees(), tree, talent);
    if (!ok) return false;
    state.ranks = R.withRank(state.ranks, tree, talent, rank + delta);
    commit();
    return true;
  }

  function commit() {
    window.Calculator.lastHash = routeHash();
    history.replaceState(null, '', window.Calculator.lastHash);
    renderAll();
  }

  function talentFromEl(el) {
    const tree = trees().find(t => t.name === el.dataset.tree);
    return [tree, tree.talents.find(x => x.name === el.dataset.talent)];
  }

  function bind() {
    container.querySelectorAll('.build-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = builds().find(x => x.id === btn.dataset.build);
        state = { level: b.level, ranks: JSON.parse(JSON.stringify(b.points)), buildId: b.id };
        commit();
      });
    });

    container.querySelector('#calcLevel').addEventListener('change', e => {
      state.level = Number(e.target.value);
      commit();
    });

    container.querySelector('#calcReset').addEventListener('click', () => {
      state = { level: state.level, ranks: {}, buildId: null };
      commit();
    });

    const copyBtn = container.querySelector('#calcCopy');
    copyBtn.addEventListener('click', () => {
      const done = text => { copyBtn.textContent = text; setTimeout(() => { copyBtn.textContent = 'Copiar link'; }, 1800); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(location.href).then(() => done('¡Copiado!'), () => done('Copiá la URL'));
      } else {
        done('Copiá la URL');
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
      state = { level: parsed.level, ranks: parsed.ranks, buildId: null };
      const b = matchingBuild();
      if (b) state.buildId = b.id;
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
