(function () {
  const SPEC_COLORS = {
    Overview: '#c8aa6e',
    Elemental: '#e0742c',
    Enhancement: '#8a5a2b',
    Restoration: '#3fa9f5',
    Calculadora: '#c8aa6e'
  };

  const CONFIDENCE = {
    'tested': { label: 'Probado en juego', cls: 'conf-tested' },
    'client-data': { label: 'Dato del cliente beta', cls: 'conf-client' },
    'classic-assumed': { label: 'Asumido de Classic Era', cls: 'conf-classic' },
    'community-untested': { label: 'Comunidad, sin confirmar', cls: 'conf-untested' }
  };

  // 'large' is 56x56: shown at 48px it's downscaled (sharp) instead of the
  // 36x36 'medium' being blown up (blurry). Tree art is Classic's, same CDN.
  const ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/large/';
  const TREE_BG_BASE = 'https://wow.zamimg.com/images/wow/talents/backgrounds/classic/';

  const app = document.getElementById('app');
  const tabs = Array.from(document.querySelectorAll('.spec-tab'));
  const SPECS = tabs.map(t => t.dataset.spec);
  // Hash is "#<Tab>" or, for the calculator, "#Calculadora/<level>/<build code>".
  function hashParts() { return location.hash.slice(1).split('/'); }
  let currentSpec = SPECS.includes(hashParts()[0]) ? hashParts()[0] : 'Overview';
  let openTooltipTalent = null;

  function iconUrl(icon) {
    return ICON_BASE + (icon || 'inv_misc_questionmark') + '.jpg';
  }

  function treeBg(tree) {
    return 'linear-gradient(rgba(12,13,16,.55), rgba(12,13,16,.82)), url(' + TREE_BG_BASE + tree.bg + '.jpg)';
  }

  function findTree(spec) {
    return window.SHAMAN_DATA.talents.trees.find(t => t.name === spec);
  }

  function badge(confidence) {
    if (!confidence) return '';
    const c = CONFIDENCE[confidence] || { label: confidence, cls: 'conf-untested' };
    return '<span class="badge ' + c.cls + '">' + c.label + '</span>';
  }

  function renderTalentTree(tree) {
    const rows = Math.max(...tree.talents.map(t => t.row));
    const cols = 4;
    const cellMap = {};
    tree.talents.forEach(t => { cellMap[t.row + '_' + t.col] = t; });

    let html = '<div class="tree-wrap"><div class="tree-title">' + tree.name + ' tree</div>' +
      '<div class="tree-hint">Click en un talento para ver rangos y cambios vs. Classic Era.</div>';
    html += '<div class="talent-tree" style="background-image:' + treeBg(tree) + '">';
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const t = cellMap[r + '_' + c];
        if (!t) {
          html += '<div class="talent empty"></div>';
        } else {
          const id = tree.name + '_' + r + '_' + c;
          const edge = (c >= 3 ? ' edge-right' : '') + (r >= rows - 1 ? ' edge-bottom' : '');
          html += '<div class="talent' + edge + '" data-id="' + id + '" title="' + t.name + '" style="background-image:url(' + iconUrl(t.icon) + ')">' +
                   '<span class="rank-badge">' + t.max + '</span>' +
                   '</div>';
        }
      }
    }
    html += '</div></div>';
    return html;
  }

  function closeTooltip() {
    const existing = document.querySelector('.talent .tooltip');
    if (existing) existing.remove();
    const openEl = document.querySelector('.talent.open');
    if (openEl) openEl.classList.remove('open');
    openTooltipTalent = null;
  }

  function toggleTooltip(talentEl, tree) {
    const id = talentEl.dataset.id;
    if (openTooltipTalent === id) { closeTooltip(); return; }
    closeTooltip();

    const [, r, c] = id.split('_');
    const t = tree.talents.find(x => x.row === Number(r) && x.col === Number(c));
    if (!t) return;

    let html = '<div class="t-name">' + t.name + (t.max > 1 ? ' (' + t.max + ' rangos)' : '') + '</div>';
    t.desc.forEach((d, i) => {
      html += '<div class="t-rank"><b>Rango ' + (i + 1) + ':</b> ' + d + '</div>';
    });
    if (t.classic && t.classic.status) {
      html += '<div class="t-classic">Classic Era: <b>' + t.classic.status + '</b>' +
              (t.classic.text ? ' — "' + t.classic.text + '"' : '') + '</div>';
    }

    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.innerHTML = html;
    talentEl.appendChild(tip);
    talentEl.classList.add('open');
    openTooltipTalent = id;
  }

  function renderChanges(changes) {
    if (!changes || !changes.length) return '';
    let html = '<div class="changes">';
    changes.forEach(c => {
      html += '<div class="change-card">' +
                '<div class="title">⚠ ' + c.change + ' ' + badge(c.confidence) + '</div>' +
                '<div class="detail">' + c.detail + '</div>' +
                (c.source ? '<a class="src" href="' + c.source + '" target="_blank" rel="noopener">fuente</a>' : '') +
              '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderStatChips(list) {
    if (!list) return '';
    return '<div class="stat-row">' + list.map((s, i) =>
      '<span class="stat-chip"><span class="n">' + (i + 1) + '</span>' + s + '</span>'
    ).join('') + '</div>';
  }

  function renderList(items, ordered) {
    if (!items) return '';
    return '<ul class="plain' + (ordered ? ' ordered' : '') + '">' +
      items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
  }

  function renderNoteList(items) {
    if (!items) return '';
    return '<ul class="plain">' + items.map(i =>
      '<li>' + i.note + ' ' + badge(i.confidence) + '</li>'
    ).join('') + '</ul>';
  }

  function renderSources(sources) {
    return '<div class="sources"><b>Fuentes:</b><ul>' + sources.map(s => {
      const m = s.match(/^(https?:\/\/[^\s]+)(.*)$/);
      if (!m) return '<li>' + s + '</li>';
      const host = m[1].replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      return '<li><a href="' + m[1] + '" target="_blank" rel="noopener" title="' + m[1] + '">' + host + '</a>' + m[2] + '</li>';
    }).join('') + '</ul></div>';
  }

  function renderGuide(guide) {
    let html = '<div class="panel">';
    html += '<h3>Stat priority ' + badge(guide.statPriority.confidence) + '</h3>';
    html += renderStatChips(guide.statPriority.list);
    if (guide.statPriority.rationale) {
      html += '<p class="note-text">' + guide.statPriority.rationale + '</p>';
    }
    if (guide.statPriority.alsoReported) {
      html += '<div class="sub-label">También reportado ' + badge(guide.statPriority.alsoReported.confidence) + '</div>';
      html += renderStatChips(guide.statPriority.alsoReported.list);
      if (guide.statPriority.alsoReported.note) {
        html += '<p class="note-text">' + guide.statPriority.alsoReported.note + '</p>';
      }
    }
    html += '</div>';

    html += '<div class="panel" style="margin-top:16px">';
    html += '<h3>Rotación ' + badge(guide.rotation.confidence) + '</h3>';
    const rot = guide.rotation;
    const labels = { level20: 'Nivel 20', level30: 'Nivel 30', level60: 'Nivel 60', priority: 'Prioridad' };
    Object.keys(rot).forEach(key => {
      if (key === 'confidence' || key === 'source' || key === 'level60Confidence') return;
      if (key === 'totems') {
        html += '<div class="sub-label">Totems clave</div>' + renderList(rot[key], false);
      } else if (labels[key]) {
        const extraBadge = key === 'level60' && rot.level60Confidence ? ' ' + badge(rot.level60Confidence) : '';
        html += '<div class="sub-label">' + labels[key] + extraBadge + '</div>' + renderList(rot[key], true);
      }
    });
    html += '</div>';

    if (guide.gearingNotes) {
      html += '<div class="panel" style="margin-top:16px"><h3>Gearing</h3>' + renderNoteList(guide.gearingNotes) + '</div>';
    }

    if (guide.keyTalents) {
      html += '<div class="panel" style="margin-top:16px"><h3>Talentos clave</h3>' + renderList(guide.keyTalents, false) + '</div>';
    }

    const specBuilds = (window.BUILD_DATA || []).filter(b => b.spec === guide.spec);
    if (specBuilds.length) {
      html += '<div class="panel" style="margin-top:16px"><h3>Builds de ejemplo</h3><ul class="plain build-links">';
      specBuilds.forEach(b => {
        const split = window.SHAMAN_DATA.talents.trees.map(t => window.TalentRules.treePoints(b.points, t)).join('/');
        html += '<li><a href="' + window.Calculator.linkFor(b) + '">' + b.name + '</a> ' + badge(b.confidence) +
          '<span class="bl-meta">' + b.case + ' · nivel ' + b.level + ' · ' + split + '</span>' +
          '<span class="bl-note">' + b.note + '</span></li>';
      });
      html += '</ul>';
      const rb = guide.recommendedBuild;
      if (rb && rb.note) html += '<p class="note-text dim">' + rb.note + '</p>';
      html += '</div>';
    }

    html += renderSources(guide.sources);
    html += '<div class="caveat">' + guide.caveat + '</div>';

    return html;
  }

  function renderOverview(guide) {
    const color = SPEC_COLORS.Overview;
    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">Class overview</div>' +
      '<h2>Shaman — notas generales</h2>' +
      '<p>Lo que aplica a los 3 specs: estado de la beta, profesiones y razas.</p>' +
      '</div>';

    html += '<div class="grid-2">';

    html += '<div>';
    html += '<div class="panel"><h3>Class notes</h3>' +
      '<ul class="plain">' + guide.classNotes.map(n =>
        '<li>' + n.fact + ' ' + badge(n.confidence) + '</li>'
      ).join('') + '</ul></div>';

    html += '<div class="panel" style="margin-top:16px"><h3>Razas ' + badge(guide.races.confidence) + '</h3>' +
      '<p class="note-text">' + guide.races.note + '</p>';
    if (guide.races.highlight) {
      html += '<div class="sub-label">' + guide.races.highlight.race + '</div>' +
        renderList(guide.races.highlight.traits, false);
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="panel" style="--spec-color:' + color + '"><h3>Profesiones ' + badge(guide.professions.confidence) + '</h3>' +
      '<p class="note-text"><b>Estado:</b> ' + guide.professions.status + '</p>' +
      '<p class="note-text">' + guide.professions.statement + '</p>' +
      '<div class="sub-label">Baseline</div>' +
      '<p class="note-text">' + guide.professions.baseline + '</p>' +
      '<div class="caveat" style="margin-top:10px">' + guide.professions.recommendation + '</div>' +
      '</div>';

    html += '</div>';

    html += renderSources(guide.sources);
    html += '<div class="caveat">' + guide.caveat + '</div>';

    return html;
  }

  function render(spec) {
    closeTooltip();
    window.Calculator.hide();
    const guide = window.GUIDE_DATA[spec];
    const color = SPEC_COLORS[spec];
    document.documentElement.style.setProperty('--spec-color', color);

    if (spec === 'Calculadora') {
      window.Calculator.render(app, hashParts().slice(1), { badge, iconUrl, treeBg, specColors: SPEC_COLORS });
      app.style.setProperty('--spec-color', color);
      return;
    }

    if (spec === 'Overview') {
      app.innerHTML = renderOverview(guide);
      app.style.setProperty('--spec-color', color);
      return;
    }

    const tree = findTree(spec);

    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">' + guide.role + '</div>' +
      '<h2>' + spec + '</h2>' +
      '<p>' + guide.summary + '</p>' +
      '</div>';

    html += renderChanges(guide.mechanicalChanges);

    html += '<div class="grid-2 spec-layout">';
    html += '<div class="panel sticky" style="--spec-color:' + color + '">' +
              '<h3>Talentos</h3>' + renderTalentTree(tree) +
              '<a class="calc-link" href="#Calculadora">Abrir la calculadora →</a>' +
            '</div>';
    html += '<div style="--spec-color:' + color + '">' + renderGuide(guide) + '</div>';
    html += '</div>';

    app.innerHTML = html;
    app.style.setProperty('--spec-color', color);

    document.querySelectorAll('.talent').forEach(el => {
      if (el.classList.contains('empty')) return;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTooltip(el, tree);
      });
    });
  }

  function selectSpec(spec) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.spec === spec));
    const tab = tabs.find(t => t.dataset.spec === spec);
    tab.style.setProperty('--spec-color', SPEC_COLORS[spec]);
    currentSpec = spec;
    render(spec);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const spec = tab.dataset.spec;
      // Coming back to the calculator restores the build you left there.
      location.hash = spec === 'Calculadora' && window.Calculator.lastHash ? window.Calculator.lastHash : spec;
    });
  });

  window.addEventListener('hashchange', () => {
    const spec = hashParts()[0];
    if (SPECS.includes(spec) && (spec !== currentSpec || spec === 'Calculadora')) selectSpec(spec);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.talent')) closeTooltip();
  });

  selectSpec(currentSpec);
})();
