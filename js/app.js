(function () {
  const SPEC_COLORS = {
    Overview: '#c8aa6e',
    Elemental: '#e0742c',
    Enhancement: '#8a5a2b',
    Restoration: '#3fa9f5',
    Calculadora: '#c8aa6e',
    Spellbook: '#9b7fd1',
    Armas: '#c8aa6e'
  };

  const I18N = window.I18N;
  const t = (key, vars) => I18N.t(key, vars);

  const CONFIDENCE = {
    'tested': 'conf-tested',
    'client-data': 'conf-client',
    'classic-assumed': 'conf-classic',
    'community-untested': 'conf-untested',
    'official': 'conf-official'
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
    const cls = CONFIDENCE[confidence] || 'conf-untested';
    return '<span class="badge ' + cls + '">' + t('conf.' + confidence) + '</span>';
  }

  function renderTalentTree(tree) {
    const rows = Math.max(...tree.talents.map(t => t.row));
    const cols = 4;
    const cellMap = {};
    tree.talents.forEach(t => { cellMap[t.row + '_' + t.col] = t; });

    let html = '<div class="tree-wrap"><div class="tree-title">' + t('tree.title', { tree: tree.name }) + '</div>' +
      '<div class="tree-hint">' + t('tree.hint') + '</div>';
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

  // The tooltip floats on <body> (position: fixed): inside the sticky talent
  // panel it was trapped in the panel's stacking context and the guide column
  // painted over it.
  function closeTooltip() {
    const existing = document.querySelector('.talent-tip');
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
    const tal = tree.talents.find(x => x.row === Number(r) && x.col === Number(c));
    if (!tal) return;

    let html = '<div class="t-name">' + tal.name + (tal.max > 1 ? ' (' + t('tree.ranks', { n: tal.max }) + ')' : '') + '</div>';
    tal.desc.forEach((d, i) => {
      html += '<div class="t-rank"><b>' + t('tree.rank', { n: i + 1 }) + ':</b> ' + I18N.client(d) + '</div>';
    });
    if (tal.classic && tal.classic.status) {
      html += '<div class="t-classic">' + t('classic.label') + ': <b>' + t('classic.' + tal.classic.status) + '</b>' +
              (tal.classic.text ? ' — "' + I18N.client(tal.classic.text) + '"' : '') + '</div>';
    }
    html += I18N.original(tal.desc.concat(tal.classic && tal.classic.text ? ['Classic: ' + tal.classic.text] : []));

    const tip = document.createElement('div');
    tip.className = 'tooltip talent-tip';
    tip.innerHTML = html;
    document.body.appendChild(tip);
    placeBeside(tip, talentEl);
    talentEl.classList.add('open');
    openTooltipTalent = id;
  }

  // Right of the anchor if it fits, otherwise left, otherwise below; always on screen.
  function placeBeside(tip, anchor) {
    const r = anchor.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const margin = 8;
    let left = r.right + 10;
    let top = r.top;
    if (left + w > window.innerWidth - margin) left = r.left - w - 10;
    if (left < margin) {
      left = Math.min(Math.max(margin, r.left), window.innerWidth - w - margin);
      top = r.bottom + 8;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function renderChanges(changes) {
    if (!changes || !changes.length) return '';
    let html = '<div class="changes">';
    changes.forEach(c => {
      html += '<div class="change-card">' +
                '<div class="title">⚠ ' + c.change + ' ' + badge(c.confidence) + '</div>' +
                '<div class="detail">' + c.detail + '</div>' +
                (c.source ? '<a class="src" href="' + c.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a>' : '') +
              '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderStatChips(list) {
    if (!list) return '';
    return '<div class="stat-row">' + list.map((s, i) =>
      '<span class="stat-chip"><span class="n">' + (i + 1) + '</span>' + I18N.term(s) + '</span>'
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
    return '<div class="sources"><b>' + t('common.sources') + '</b><ul>' + sources.map(s => {
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
    html += '<h3>' + t('guide.stats') + ' ' + badge(guide.statPriority.confidence) + '</h3>';
    html += renderStatChips(guide.statPriority.list);
    if (guide.statPriority.rationale) {
      html += '<p class="note-text">' + guide.statPriority.rationale + '</p>';
    }
    if (guide.statPriority.forever) {
      html += '<div class="forever-note">' + guide.statPriority.forever.note + ' ' + badge(guide.statPriority.forever.confidence) + '</div>';
    }
    if (guide.statPriority.alsoReported) {
      html += '<div class="sub-label">' + t('guide.alsoReported') + ' ' + badge(guide.statPriority.alsoReported.confidence) + '</div>';
      html += renderStatChips(guide.statPriority.alsoReported.list);
      if (guide.statPriority.alsoReported.note) {
        html += '<p class="note-text">' + guide.statPriority.alsoReported.note + '</p>';
      }
    }
    html += '</div>';

    html += '<div class="panel" style="margin-top:16px">';
    html += '<h3>' + t('guide.rotation') + ' ' + badge(guide.rotation.confidence) + '</h3>';
    const rot = guide.rotation;
    const labels = { level20: t('guide.level20'), level30: t('guide.level30'), level60: t('guide.level60'), priority: t('guide.priority') };
    Object.keys(rot).forEach(key => {
      if (key === 'confidence' || key === 'source' || key === 'level60Confidence') return;
      if (key === 'totems') {
        html += '<div class="sub-label">' + t('guide.keyTotems') + '</div>' + renderList(rot[key], false);
      } else if (labels[key]) {
        const extraBadge = key === 'level60' && rot.level60Confidence ? ' ' + badge(rot.level60Confidence) : '';
        html += '<div class="sub-label">' + labels[key] + extraBadge + '</div>' + renderList(rot[key], true);
      }
    });
    html += '</div>';

    if (guide.gearingNotes) {
      html += '<div class="panel" style="margin-top:16px"><h3>' + t('guide.gear') + '</h3>' + renderNoteList(guide.gearingNotes) + '</div>';
    }

    if (guide.keyTalents) {
      html += '<div class="panel" style="margin-top:16px"><h3>' + t('guide.keyTalents') + '</h3>' + renderList(guide.keyTalents, false) + '</div>';
    }

    const specBuilds = window.I18N.localize(window.BUILD_DATA || []).filter(b => b.spec === guide.spec);
    if (specBuilds.length) {
      html += '<div class="panel" style="margin-top:16px"><h3>' + t('guide.builds') + '</h3><ul class="plain build-links">';
      specBuilds.forEach(b => {
        const split = window.SHAMAN_DATA.talents.trees.map(t => window.TalentRules.treePoints(b.points, t)).join('/');
        html += '<li><a href="' + window.Calculator.linkFor(b) + '">' + b.name + '</a> ' + badge(b.confidence) +
          '<span class="bl-meta">' + b.case + ' · ' + t('common.level') + ' ' + b.level + ' · ' + split + '</span>' +
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

  function renderTotems(tot) {
    let html = '<div class="panel" style="margin-top:16px"><h3>' + t('ov.totems') + '</h3>' + renderNotes(tot.notes) +
      '<div class="sub-label">' + t('ov.totemsChanged') + ' ' + badge(tot.confidence) + '</div>' +
      '<div class="table-wrap"><table class="cmp"><thead><tr><th>' + t('ov.colTotem') + '</th><th>Classic</th><th>Forever</th><th></th></tr></thead><tbody>';
    tot.changed.forEach(c => {
      html += '<tr><td>' + c.totem + ' <span class="dim">' + c.rank + '</span></td><td class="dim">' + c.classic + '</td>' +
        '<td>' + c.forever + '</td><td>' + pctLabel(c.pct) + '</td></tr>';
    });
    return html + '</tbody></table></div>' +
      '<p class="note-text dim">' + t('ov.totemsMore') + '</p></div>';
  }

  // Top-rank tooltip numbers, worked out live from the spellbook data.
  function renderDamage(dm) {
    let html = '<div class="panel" style="margin-top:16px"><h3>' + t('ov.damage') + ' ' + badge('client-data') + '</h3>' +
      '<p class="note-text">' + t('ov.damageIntro') + '</p>' +
      '<div class="dmg-list">';
    dm.spells.forEach(([name, rank]) => {
      const c = window.Spellbook.compare(name, rank);
      if (!c || c.pct == null) return;
      const left = Math.max(0, Math.min(100, 100 + c.pct));
      html += '<div class="dmg-row"><div class="dmg-name">' + name + ' <span class="dim">' + rank.replace('Rank ', 'R') + '</span></div>' +
        '<div class="dmg-bar"><span style="width:' + left + '%"></span></div>' +
        '<div class="dmg-nums"><span class="dim">' + I18N.range(c.then) + '</span> → ' + I18N.range(c.now) + ' ' + pctLabel(c.pct) + '</div></div>';
    });
    return html + '</div>' + renderNotes(dm.notes) + '</div>';
  }

  function renderRaces(r) {
    const racials = window.SHAMAN_DATA.racials;
    let html = '<div class="panel" style="margin-top:16px"><h3>' + t('ov.races') + ' ' + badge(r.confidence) + '</h3>' +
      '<p class="note-text">' + r.note + '</p><div class="race-grid">';
    ['Horde', 'Alliance'].forEach(faction => {
      (racials[faction] || []).filter(x => x.classes.includes('Shaman')).forEach(race => {
        const isNew = r.newToShaman.includes(race.race);
        html += '<div class="race-card ' + faction.toLowerCase() + '">' +
          '<div class="rc-head"><img src="' + iconUrl(race.icon) + '" alt=""><b>' + race.race + '</b>' +
          '<span class="rc-faction">' + faction + (isNew ? ' · ' + t('ov.newToShaman') : '') + '</span></div><ul>' +
          race.abilities.map(([name, text, icon]) =>
            '<li><img src="' + iconUrl(icon) + '" alt=""><div><b>' + name + '</b><span>' + I18N.client(text) + '</span></div></li>').join('') +
          '</ul>' + I18N.original(race.abilities.map(([name, text]) => '<b>' + name + ':</b> ' + text)) + '</div>';
      });
    });
    return html + '</div></div>';
  }

  function renderOverview(guide) {
    const color = SPEC_COLORS.Overview;
    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">' + t('ov.role') + '</div>' +
      '<h2>' + t('ov.title') + '</h2>' +
      '<p>' + t('ov.intro') + '</p>' +
      '</div>';

    html += '<div class="grid-2">';
    html += '<div class="panel"><h3>' + t('ov.classNotes') + '</h3>' + renderNotes(guide.classNotes) + '</div>';

    html += '<div>';
    html += '<div class="panel"><h3>' + t('ov.calendar') + '</h3><ul class="plain timeline">' + guide.timeline.map(t =>
      '<li><span class="tl-date">' + t.date + '</span><span>' + t.event + ' ' + badge(t.confidence) + '</span></li>'
    ).join('') + '</ul></div>';
    html += '<div class="panel" style="margin-top:16px;--spec-color:' + color + '"><h3>' + t('ov.professions') + ' ' + badge(guide.professions.confidence) + '</h3>' +
      '<p class="note-text"><b>' + t('ov.status') + '</b> ' + guide.professions.status + '</p>' +
      '<p class="note-text">' + guide.professions.statement + '</p>' +
      '<div class="sub-label">' + t('ov.baseline') + '</div>' +
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
    if (window.Weapons) window.Weapons.hide();
    const guide = window.I18N.localize(window.GUIDE_DATA[spec]);
    const color = SPEC_COLORS[spec];
    document.documentElement.style.setProperty('--spec-color', color);

    if (spec === 'Armas') {
      window.Weapons.render(app, { badge, renderSources, specColors: SPEC_COLORS });
      app.style.setProperty('--spec-color', color);
      return;
    }

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
              '<h3>' + t('tree.talents') + '</h3>' + renderTalentTree(tree) +
              '<a class="calc-link" href="#Calculadora">' + t('tree.openCalc') + '</a>' +
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
    if (!e.target.closest('.talent') && !e.target.closest('.talent-tip')) closeTooltip();
  });
  // The tooltip is fixed-position: follow its talent on scroll/resize, and
  // close it once the talent leaves the screen.
  function followTooltip() {
    const tip = document.querySelector('.talent-tip');
    const anchor = document.querySelector('.talent.open');
    if (!tip || !anchor) return;
    const r = anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { closeTooltip(); return; }
    placeBeside(tip, anchor);
  }
  window.addEventListener('scroll', followTooltip, { passive: true });
  window.addEventListener('resize', followTooltip);

  // Language switch: re-render the current tab in place (hash and scroll stay).
  document.getElementById('langToggle').addEventListener('click', () => window.I18N.toggle());
  window.I18N.onChange(() => {
    const y = window.scrollY;
    render(currentSpec);
    window.scrollTo(0, y);
  });

  window.I18N.apply();
  selectSpec(currentSpec);
})();
