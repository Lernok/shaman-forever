(function () {
  const SPEC_COLORS = {
    Elemental: '#e0742c',
    Enhancement: '#8a5a2b',
    Restoration: '#3fa9f5'
  };

  const ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/medium/';

  const app = document.getElementById('app');
  const tabs = Array.from(document.querySelectorAll('.spec-tab'));
  let currentSpec = 'Elemental';
  let openTooltipTalent = null;

  function iconUrl(icon) {
    return ICON_BASE + (icon || 'inv_misc_questionmark') + '.jpg';
  }

  function findTree(spec) {
    return window.SHAMAN_DATA.talents.trees.find(t => t.name === spec);
  }

  function renderTalentTree(tree, specColor) {
    const rows = Math.max(...tree.talents.map(t => t.row));
    const cols = 4;
    const cellMap = {};
    tree.talents.forEach(t => { cellMap[t.row + '_' + t.col] = t; });

    let html = '<div class="tree-wrap"><div class="tree-title">' + tree.name + ' tree</div>';
    html += '<div class="talent-tree">';
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const t = cellMap[r + '_' + c];
        if (!t) {
          html += '<div class="talent empty"></div>';
        } else {
          const id = tree.name + '_' + r + '_' + c;
          html += '<div class="talent" data-id="' + id + '" style="background-image:url(' + iconUrl(t.icon) + ')">' +
                   '<span class="rank-badge">' + t.max + '</span>' +
                   '</div>';
        }
      }
    }
    html += '</div></div>';
    return html;
  }

  function closeTooltip() {
    const existing = document.querySelector('.tooltip');
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
                '<div class="title">⚠ ' + c.change + '</div>' +
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

  function renderGuide(guide, spec) {
    let html = '<div class="panel">';
    html += '<h3>Stat priority</h3>';
    if (guide.statPriority.leveling) {
      html += '<div class="sub-label">Leveling / dungeons</div>' + renderStatChips(guide.statPriority.leveling);
    }
    if (guide.statPriority.raidDps) {
      html += '<div class="sub-label">Raid DPS</div>' + renderStatChips(guide.statPriority.raidDps);
    }
    if (guide.statPriority.primary) {
      html += renderStatChips(guide.statPriority.primary);
    }
    if (guide.statPriority.level30Dungeons) {
      html += '<div class="sub-label">Level 30 dungeons</div>' + renderStatChips(guide.statPriority.level30Dungeons);
    }
    if (guide.statPriority.notes) {
      html += '<p style="color:var(--text-dim);font-size:12.5px;line-height:1.5;margin-top:6px">' + guide.statPriority.notes + '</p>';
    }
    html += '</div>';

    html += '<div class="panel" style="margin-top:16px">';
    html += '<h3>Rotación</h3>';
    const rot = guide.rotation;
    Object.keys(rot).forEach(key => {
      if (key === 'totems') {
        html += '<div class="sub-label">Totems clave</div>' + renderList(rot[key], false);
      } else {
        const labels = { level20: 'Nivel 20', level30: 'Nivel 30', level60: 'Nivel 60', priority: 'Prioridad' };
        const label = labels[key] || key;
        html += '<div class="sub-label">' + label + '</div>' + renderList(rot[key], true);
      }
    });
    html += '</div>';

    if (guide.keyTalents) {
      html += '<div class="panel" style="margin-top:16px"><h3>Talentos clave</h3>' + renderList(guide.keyTalents, false) + '</div>';
    }

    if (guide.recommendedBuild) {
      html += '<div class="panel" style="margin-top:16px"><h3>Build recomendado</h3>';
      if (guide.recommendedBuild.pointsAtLevel30Example) {
        html += '<div class="sub-label">Nivel 30 (ejemplo)</div><p style="font-size:12.5px;color:var(--text-dim);line-height:1.5">' + guide.recommendedBuild.pointsAtLevel30Example + '</p>';
      }
      if (guide.recommendedBuild.level60Capstones) {
        html += '<div class="sub-label">Capstones nivel 60</div>' + renderList(guide.recommendedBuild.level60Capstones, false);
      }
      if (guide.recommendedBuild.note) {
        html += '<p style="font-size:12px;color:#8b8d97;margin-top:6px">' + guide.recommendedBuild.note + '</p>';
      }
      html += '</div>';
    }

    html += '<div class="sources"><b>Fuentes:</b><br>' +
      guide.sources.map(s => s.startsWith('http') ? '<a href="' + s + '" target="_blank" rel="noopener">' + s + '</a>' : s).join('<br>') +
      '</div>';
    html += '<div class="caveat">' + guide.caveat + '</div>';

    return html;
  }

  function render(spec) {
    closeTooltip();
    const tree = findTree(spec);
    const guide = window.GUIDE_DATA[spec];
    const color = SPEC_COLORS[spec];
    document.documentElement.style.setProperty('--spec-color', color);

    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">' + guide.role + '</div>' +
      '<h2>' + spec + '</h2>' +
      '<p>' + guide.summary + '</p>' +
      '</div>';

    html += renderChanges(guide.mechanicalChanges);

    html += '<div class="grid-2">';
    html += '<div class="panel" style="--spec-color:' + color + '">' +
              '<h3>Talentos</h3>' + renderTalentTree(tree, color) +
            '</div>';
    html += '<div style="--spec-color:' + color + '">' + renderGuide(guide, spec) + '</div>';
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

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tab.style.setProperty('--spec-color', SPEC_COLORS[tab.dataset.spec]);
      currentSpec = tab.dataset.spec;
      render(currentSpec);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.talent')) closeTooltip();
  });

  const defaultTab = tabs.find(t => t.dataset.spec === currentSpec);
  defaultTab.classList.add('active');
  defaultTab.style.setProperty('--spec-color', SPEC_COLORS[currentSpec]);
  render(currentSpec);
})();
