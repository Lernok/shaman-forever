(function () {
  const SPEC_COLORS = {
    Overview: '#c8aa6e',
    Elemental: '#e0742c',
    Enhancement: '#8a5a2b',
    Restoration: '#3fa9f5',
    Calculadora: '#c8aa6e',
    Spellbook: '#9b7fd1'
  };

  const CONFIDENCE = {
    'tested': { label: 'Probado en juego', cls: 'conf-tested' },
    'client-data': { label: 'Dato del cliente beta', cls: 'conf-client' },
    'classic-assumed': { label: 'Asumido de Classic Era', cls: 'conf-classic' },
    'community-untested': { label: 'Comunidad, sin confirmar', cls: 'conf-untested' },
    'official': { label: 'Anuncio de Blizzard', cls: 'conf-official' }
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

    let html = '<div class="tree-wrap"><div class="tree-title">Árbol de ' + tree.name + '</div>' +
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
      // Host plus path, so several pages of one site stay distinguishable.
      let label = m[1].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      if (label.length > 60) label = label.slice(0, 57) + '…';
      return '<li><a href="' + m[1] + '" target="_blank" rel="noopener" title="' + m[1] + '">' + label + '</a>' + m[2] + '</li>';
    }).join('') + '</ul></div>';
  }

  function renderGuide(guide) {
    let html = '<div class="panel">';
    html += '<h3>Prioridad de stats ' + badge(guide.statPriority.confidence) + '</h3>';
    html += renderStatChips(guide.statPriority.list);
    if (guide.statPriority.rationale) {
      html += '<p class="note-text">' + guide.statPriority.rationale + '</p>';
    }
    if (guide.statPriority.forever) {
      html += '<div class="forever-note">' + guide.statPriority.forever.note + ' ' + badge(guide.statPriority.forever.confidence) + '</div>';
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
      html += '<div class="panel" style="margin-top:16px"><h3>Equipo</h3>' + renderNoteList(guide.gearingNotes) + '</div>';
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

  function renderNotes(notes) {
    return '<ul class="plain">' + notes.map(n => '<li>' + n.fact + ' ' + badge(n.confidence) + '</li>').join('') + '</ul>';
  }

  function pctLabel(p) {
    return '<span class="pct ' + (p < 0 ? 'down' : p > 0 ? 'up' : '') + '">' + (p > 0 ? '+' : '') + p + '%</span>';
  }

  function renderTotems(t) {
    let html = '<div class="panel" style="margin-top:16px"><h3>Totems e imbues</h3>' + renderNotes(t.notes) +
      '<div class="sub-label">Totems con números nuevos (rango máximo) ' + badge(t.confidence) + '</div>' +
      '<div class="table-wrap"><table class="cmp"><thead><tr><th>Totem</th><th>Classic</th><th>Forever</th><th></th></tr></thead><tbody>';
    t.changed.forEach(c => {
      html += '<tr><td>' + c.totem + ' <span class="dim">' + c.rank + '</span></td><td class="dim">' + c.classic + '</td>' +
        '<td>' + c.forever + '</td><td>' + pctLabel(c.pct) + '</td></tr>';
    });
    return html + '</tbody></table></div>' +
      '<p class="note-text dim">Además duran 5 min y llegan a 30 yd. Mana Spring, Stoneskin, Windwall, los de resistencia, Tremor y los de limpieza solo ganaron duración y alcance.</p></div>';
  }

  // Top-rank tooltip numbers, worked out live from the spellbook data.
  function renderDamage(dm) {
    let html = '<div class="panel" style="margin-top:16px"><h3>Daño y curación vs Classic ' + badge('client-data') + '</h3>' +
      '<p class="note-text">Número del tooltip en el rango máximo, sin spell power ni talentos. La barra es cuánto queda del valor de Classic.</p>' +
      '<div class="dmg-list">';
    dm.spells.forEach(([name, rank]) => {
      const c = window.Spellbook.compare(name, rank);
      if (!c || c.pct == null) return;
      const left = Math.max(0, Math.min(100, 100 + c.pct));
      html += '<div class="dmg-row"><div class="dmg-name">' + name + ' <span class="dim">' + rank.replace('Rank ', 'R') + '</span></div>' +
        '<div class="dmg-bar"><span style="width:' + left + '%"></span></div>' +
        '<div class="dmg-nums"><span class="dim">' + c.then + '</span> → ' + c.now + ' ' + pctLabel(c.pct) + '</div></div>';
    });
    return html + '</div>' + renderNotes(dm.notes) + '</div>';
  }

  function renderRaces(r) {
    const racials = window.SHAMAN_DATA.racials;
    let html = '<div class="panel" style="margin-top:16px"><h3>Razas ' + badge(r.confidence) + '</h3>' +
      '<p class="note-text">' + r.note + '</p><div class="race-grid">';
    ['Horde', 'Alliance'].forEach(faction => {
      (racials[faction] || []).filter(x => x.classes.includes('Shaman')).forEach(race => {
        const isNew = r.newToShaman.includes(race.race);
        html += '<div class="race-card ' + faction.toLowerCase() + '">' +
          '<div class="rc-head"><img src="' + iconUrl(race.icon) + '" alt=""><b>' + race.race + '</b>' +
          '<span class="rc-faction">' + faction + (isNew ? ' · nueva para Shaman' : '') + '</span></div><ul>' +
          race.abilities.map(([name, text, icon]) =>
            '<li><img src="' + iconUrl(icon) + '" alt=""><div><b>' + name + '</b><span>' + text + '</span></div></li>').join('') +
          '</ul></div>';
      });
    });
    return html + '</div></div>';
  }

  function renderOverview(guide) {
    const color = SPEC_COLORS.Overview;
    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">Resumen de la clase</div>' +
      '<h2>Shaman — notas generales</h2>' +
      '<p>Lo que aplica a los 3 specs: estado de la beta, totems, daño frente a Classic, razas y profesiones.</p>' +
      '</div>';

    html += '<div class="grid-2">';
    html += '<div class="panel"><h3>Notas de la clase</h3>' + renderNotes(guide.classNotes) + '</div>';

    html += '<div>';
    html += '<div class="panel"><h3>Calendario</h3><ul class="plain timeline">' + guide.timeline.map(t =>
      '<li><span class="tl-date">' + t.date + '</span><span>' + t.event + ' ' + badge(t.confidence) + '</span></li>'
    ).join('') + '</ul></div>';
    html += '<div class="panel" style="margin-top:16px;--spec-color:' + color + '"><h3>Profesiones ' + badge(guide.professions.confidence) + '</h3>' +
      '<p class="note-text"><b>Estado:</b> ' + guide.professions.status + '</p>' +
      '<p class="note-text">' + guide.professions.statement + '</p>' +
      '<div class="sub-label">Baseline</div>' +
      '<p class="note-text">' + guide.professions.baseline + '</p>' +
      '<div class="caveat" style="margin-top:10px">' + guide.professions.recommendation + '</div>' +
      '</div>';
    html += '</div>';
    html += '</div>';

    html += renderTotems(guide.totems);
    html += renderDamage(guide.damage);
    html += renderRaces(guide.races);

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

    if (spec === 'Spellbook') {
      window.Spellbook.render(app, { iconUrl, renderSources, specColors: SPEC_COLORS });
      app.style.setProperty('--spec-color', color);
      return;
    }

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
