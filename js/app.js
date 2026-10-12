(function () {
  const SPEC_COLORS = {
    Elemental: '#e0742c',
    Enhancement: '#b07a42',
    Restoration: '#3fa9f5',
    Clase: '#c8aa6e'
  };
  // Talent tree icons stand for each spec in the header.
  const SPEC_ICONS = { Enhancement: 'spell_nature_lightningshield', Elemental: 'spell_nature_lightning', Restoration: 'spell_nature_magicimmunity' };

  const I18N = window.I18N;
  const Site = window.Site;
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
  const PAGES = tabs.map(t => t.dataset.spec);
  // Hash is "#<Page>", "#<Page>/<section>" or, for the calculator,
  // "#Talentos/<level>/<build code>".
  function hashParts() { return location.hash.slice(1).split('/'); }
  // Links from before the pages were regrouped (one tab per spec, etc.).
  const LEGACY = { Overview: 'Clase', Calculadora: 'Talentos', Armas: 'Equipo', Spellbook: 'Hechizos' };
  function upgradeHash() {
    const parts = hashParts();
    if (Site.SPECS.includes(parts[0])) { Site.set('spec', parts[0]); parts.splice(0, 1, 'Guia'); }
    else if (LEGACY[parts[0]]) parts[0] = LEGACY[parts[0]];
    else return;
    history.replaceState(null, '', '#' + parts.join('/'));
  }
  upgradeHash();
  let currentPage = PAGES.includes(hashParts()[0]) ? hashParts()[0] : 'Guia';
  let currentHash = location.hash;
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

  // Collapsed by default: the titles say what changed, the cards say how.
  function renderChanges(changes, spec) {
    if (!changes || !changes.length) return '';
    let html = '<details class="changes-box"><summary><b>' + t('guide.changes', { spec: spec, n: changes.length }) + '</b>' +
      '<span class="changes-titles">' + changes.map(c => c.change).join(' · ') + '</span></summary><div class="changes">';
    changes.forEach(c => {
      html += '<div class="change-card">' +
                '<div class="title">⚠ ' + c.change + ' ' + badge(c.confidence) + '</div>' +
                '<div class="detail">' + c.detail + '</div>' +
                (c.source ? '<a class="src" href="' + c.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a>' : '') +
              '</div>';
    });
    html += '</div></details>';
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
    [Site.faction === 'horde' ? 'Horde' : 'Alliance'].forEach(faction => {
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

  // Class page: what applies to every spec, one section at a time.
  const CLASS_SECTIONS = ['notas', 'totems', 'dano', 'razas'];
  function renderClass(guide) {
    const color = SPEC_COLORS.Clase;
    const section = Site.section('Clase', CLASS_SECTIONS);
    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">' + t('ov.role') + '</div>' +
      '<h2>' + t('ov.title') + '</h2>' +
      '<p>' + t('ov.intro') + '</p>' +
      '</div>';
    html += Site.sectionTabs('Clase', CLASS_SECTIONS, section, k => t('cl.sec.' + k));
    if (section === 'totems') return html + renderTotems(guide.totems) + renderSources(guide.sources);
    if (section === 'dano') return html + renderDamage(guide.damage) + renderSources(guide.sources);
    if (section === 'razas') return html + renderRaces(guide.races) + renderSources(guide.sources);

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

    html += renderSources(guide.sources);
    html += '<div class="caveat">' + guide.caveat + '</div>';

    return html;
  }

  function render(page) {
    closeTooltip();
    window.Calculator.hide();
    if (window.Weapons) window.Weapons.hide();
    const spec = Site.spec;
    // Every page but the class one is about the chosen spec, and wears its color.
    const color = page === 'Clase' ? SPEC_COLORS.Clase : SPEC_COLORS[spec];
    const specColors = Object.assign({}, SPEC_COLORS, { Calculadora: color, Armas: color, Profesiones: color, Spellbook: color });
    document.documentElement.style.setProperty('--spec-color', color);
    app.style.setProperty('--spec-color', color);
    const helpers = { badge, iconUrl, treeBg, renderSources, specColors };

    if (page === 'Profesiones') return window.Professions.render(app, helpers);
    if (page === 'Equipo') return window.Weapons.render(app, helpers);
    if (page === 'Hechizos') return window.Spellbook.render(app, helpers);
    if (page === 'Talentos') return window.Calculator.render(app, hashParts().slice(1), helpers);
    if (page === 'Clase') { app.innerHTML = renderClass(window.I18N.localize(window.GUIDE_DATA.Overview)); return; }

    const guide = window.I18N.localize(window.GUIDE_DATA[spec]);

    const tree = findTree(spec);

    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">' + guide.role + '</div>' +
      '<h2>' + spec + '</h2>' +
      '<p>' + guide.summary + '</p>' +
      '</div>';

    html += renderChanges(guide.mechanicalChanges, spec);

    html += '<div class="grid-2 spec-layout">';
    html += '<div class="panel sticky" style="--spec-color:' + color + '">' +
              '<h3>' + t('tree.talents') + '</h3>' + renderTalentTree(tree) +
              '<a class="calc-link" href="#Talentos">' + t('tree.openCalc') + '</a>' +
            '</div>';
    html += '<div style="--spec-color:' + color + '">' + renderGuide(guide) + '</div>';
    html += '</div>';

    app.innerHTML = html;

    document.querySelectorAll('.talent').forEach(el => {
      if (el.classList.contains('empty')) return;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTooltip(el, tree);
      });
    });
  }

  function selectPage(page) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.spec === page));
    currentPage = page;
    currentHash = location.hash;
    render(page);
  }

  // Header: spec and faction pickers.
  function renderPickers() {
    document.getElementById('specPick').innerHTML = Site.SPECS.map(s =>
      '<button class="btn' + (Site.spec === s ? ' active' : '') + '" data-pick-spec="' + s + '" style="--spec-color:' + SPEC_COLORS[s] + '">' +
      '<img src="' + iconUrl(SPEC_ICONS[s]) + '" alt="">' + s + '</button>').join('');
    document.getElementById('factionPick').innerHTML = Site.FACTIONS.map(f =>
      '<button class="btn' + (Site.faction === f ? ' active' : '') + '" data-pick-faction="' + f + '">' + t('wp.faction.' + f) + '</button>').join('');
  }
  document.querySelector('.picker').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pickSpec) Site.set('spec', b.dataset.pickSpec);
    if (b.dataset.pickFaction) Site.set('faction', b.dataset.pickFaction);
  });
  Site.onChange(() => {
    renderPickers();
    const y = window.scrollY;
    render(currentPage);
    window.scrollTo(0, y);
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.spec;
      // Coming back to the calculator restores the build you left there.
      location.hash = page === 'Talentos' && window.Calculator.lastHash ? window.Calculator.lastHash : page;
    });
  });

  window.addEventListener('hashchange', () => {
    upgradeHash();
    const page = hashParts()[0];
    if (!PAGES.includes(page)) return;
    if (page !== currentPage || page === 'Talentos') { selectPage(page); return; }
    // Same page, another section: keep the section strip where it was.
    if (location.hash !== currentHash) {
      const strip = app.querySelector('.subtabs');
      const before = strip ? strip.getBoundingClientRect().top : null;
      currentHash = location.hash;
      render(page);
      const after = app.querySelector('.subtabs');
      if (before != null && after) window.scrollBy(0, after.getBoundingClientRect().top - before);
    }
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
    renderPickers();
    render(currentPage);
    window.scrollTo(0, y);
  });

  window.I18N.apply();
  renderPickers();
  selectPage(currentPage);
})();
