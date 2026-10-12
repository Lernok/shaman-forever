// Weapons tab: weapon progression by level, per faction, with where each
// weapon comes from. Data: data/weapons.js (scripts/sync.js + build-weapons.js).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  let ui = null;
  let container = null;
  let tipEl = null;
  const state = { spec: 'Enhancement', faction: 'horde', random: false, unknown: false, raids: false, pvp: false };

  const SPEC_KINDS = {
    Enhancement: ['2H Axe', '2H Mace'],
    Elemental: ['Staff'],
    Restoration: ['Staff']
  };
  // Source groups: three validated categorical slots + neutral gray, each
  // with its own marker shape so identity never rests on color alone.
  const GROUPS = {
    crafted: { color: '#3987e5', shape: 'square' },
    target: { color: '#d95926', shape: 'circle' },
    questvendor: { color: '#199e70', shape: 'diamond' },
    other: { color: '#8b8d97', shape: 'circle' }
  };
  const BETA_CAP = 30;

  function weapons() { return (window.WEAPON_DATA && window.WEAPON_DATA.weapons) || []; }

  // Sources usable by the chosen faction, honoring the toggles.
  function usableSources(w) {
    return w.sources.filter(s => {
      if (s.faction !== 'both' && s.faction !== state.faction) return false;
      if (s.type === 'trash' && !state.random) return false;
      if ((s.type === 'unknown' || s.type === 'unrecorded') && !state.unknown) return false;
      if (s.raid && !state.raids) return false;
      if (s.pvp && !state.pvp) return false;
      return true;
    });
  }

  function groupOf(sources) {
    const types = sources.map(s => s.type);
    if (types.includes('crafted')) return 'crafted';
    if (types.includes('boss') || types.includes('drop')) return 'target';
    if (types.includes('quest') || types.includes('vendor')) return 'questvendor';
    return 'other';
  }

  function candidates() {
    const kinds = SPEC_KINDS[state.spec];
    return weapons()
      .filter(w => kinds.includes(w.kind) && w.dps)
      .map(w => Object.assign({}, w, { usable: usableSources(w) }))
      .filter(w => w.usable.length)
      .map(w => Object.assign(w, { group: groupOf(w.usable) }));
  }

  // Best weapon at each level 1..60, and the levels where it changes.
  function progression(list) {
    const best = [];
    const steps = [];
    let current = null;
    for (let lv = 1; lv <= 60; lv++) {
      list.forEach(w => { if (w.obtain <= lv && (!current || w.dps > current.dps)) current = w; });
      best[lv] = current;
      if (current && (!steps.length || steps[steps.length - 1].weapon !== current)) steps.push({ level: lv, weapon: current });
    }
    return { best, steps };
  }

  // ---------- text ----------

  function sourceText(s) {
    const I = window.I18N;
    switch (s.type) {
      case 'crafted': return t('wp.src.crafted', { prof: s.profession, yellow: s.yellow });
      case 'boss': return t('wp.src.boss', { npc: s.npc, zone: s.zone || '?' });
      case 'drop': return t('wp.src.drop', { npc: s.npc, zone: s.zone || '?' });
      case 'trash': return t('wp.src.trash', { zones: (s.zones || []).join(', ') || '?', n: s.count });
      case 'quest': return t('wp.src.quest', { quest: s.quest, level: s.level || '?' }) + (s.faction !== 'both' ? ' · ' + t('wp.faction.' + s.faction) : '');
      case 'vendor': return t('wp.src.vendor', { npc: s.npc, zone: s.zone || '?' });
      case 'unrecorded': return t('wp.src.unrecorded');
      default: return t('wp.src.unknown');
    }
  }

  function statsText(w) {
    const I = window.I18N;
    const parts = Object.entries(w.stats || {}).map(([k, v]) => '+' + v + ' ' + I.term(k.charAt(0).toUpperCase() + k.slice(1)));
    const b = w.bonus || {};
    if (b.spellPower) parts.push('+' + b.spellPower + ' ' + I.term('Spell Power'));
    if (b.attackPower) parts.push('+' + b.attackPower + ' ' + I.term('Attack Power'));
    if (b.crit) parts.push('+' + b.crit + '% ' + I.term('Critical Strike'));
    if (b.hit) parts.push('+' + b.hit + '% ' + I.term('Hit'));
    return parts.join(', ');
  }

  function qualityClass(q) { return 'q' + q; }

  // ---------- chart ----------

  function marker(shape, x, y, r, color, extra) {
    const attrs = ' fill="' + color + '" stroke="var(--bg-panel)" stroke-width="2" ' + (extra || '');
    if (shape === 'square') return '<rect x="' + (x - r) + '" y="' + (y - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="1.5"' + attrs + '/>';
    if (shape === 'diamond') return '<path d="M' + x + ' ' + (y - r - 1) + 'L' + (x + r + 1) + ' ' + y + 'L' + x + ' ' + (y + r + 1) + 'L' + (x - r - 1) + ' ' + y + 'Z"' + attrs + '/>';
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + attrs + '/>';
  }

  function renderChart(list, prog) {
    const W = 760, H = 340, m = { l: 46, r: 16, t: 16, b: 36 };
    const maxDps = Math.max(10, ...list.map(w => w.dps));
    const yMax = Math.ceil(maxDps / 10) * 10;
    const x = lv => m.l + (lv - 1) / 59 * (W - m.l - m.r);
    const y = v => H - m.b - v / yMax * (H - m.t - m.b);
    let svg = '<svg class="wp-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t('wp.chartLabel') + '">';
    // Recessive grid + axes.
    for (let v = 0; v <= yMax; v += yMax <= 40 ? 5 : 10) {
      svg += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grid"/>' +
        '<text x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" class="tick" text-anchor="end">' + v + '</text>';
    }
    [1, 10, 20, 30, 40, 50, 60].forEach(lv => {
      svg += '<text x="' + x(lv) + '" y="' + (H - m.b + 18) + '" class="tick" text-anchor="middle">' + lv + '</text>';
    });
    svg += '<text x="' + (W - m.r) + '" y="' + (H - 4) + '" class="axis-title" text-anchor="end">' + t('wp.axisLevel') + '</text>';
    svg += '<text x="' + 4 + '" y="' + 12 + '" class="axis-title">' + t('wp.axisDps') + '</text>';
    // Beta cap.
    svg += '<line x1="' + x(BETA_CAP) + '" x2="' + x(BETA_CAP) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" class="cap"/>' +
      '<text x="' + (x(BETA_CAP) + 4) + '" y="' + (m.t + 10) + '" class="cap-label">' + t('wp.betaCap') + '</text>';
    // Hover zone and crosshair sit under the markers, so dots keep their own tooltips.
    svg += '<rect class="hover-zone" x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '"/>' +
      '<line class="crosshair" y1="' + m.t + '" y2="' + (H - m.b) + '" x1="-10" x2="-10"/>';
    // Best-available step line.
    let d = '';
    for (let lv = 1; lv <= 60; lv++) {
      const w = prog.best[lv];
      if (!w) continue;
      const px = x(lv), py = y(w.dps);
      d += (d ? 'L' + px + ' ' + (prog.best[lv - 1] ? y(prog.best[lv - 1].dps) : py) + 'L' : 'M') + px + ' ' + py;
    }
    if (d) svg += '<path d="' + d + '" class="best-line"/>';
    // Every candidate as a marker; upgrades a bit larger.
    const upgrades = new Set(prog.steps.map(s => s.weapon.id));
    list.forEach(w => {
      const g = GROUPS[w.group];
      svg += marker(g.shape, x(Math.max(1, w.obtain)), y(w.dps), upgrades.has(w.id) ? 6 : 4, g.color,
        'class="wp-dot' + (upgrades.has(w.id) ? ' up' : '') + '" data-id="' + w.id + '"');
    });
    svg += '</svg>';
    return { svg, x, y, m, W, H };
  }

  function legend() {
    return '<div class="wp-legend">' + ['crafted', 'target', 'questvendor', 'other'].map(k =>
      '<span><svg width="14" height="14" viewBox="0 0 14 14">' + marker(GROUPS[k].shape, 7, 7, 4.5, GROUPS[k].color) + '</svg>' + t('wp.group.' + k) + '</span>'
    ).join('') + '<span><svg width="22" height="14"><line x1="1" x2="21" y1="7" y2="7" class="best-line"/></svg>' + t('wp.bestLine') + '</span></div>';
  }

  // ---------- page ----------

  function weaponRow(w, level) {
    return '<tr>' +
      (level != null ? '<td class="num">' + level + '</td>' : '') +
      '<td><a class="' + qualityClass(w.quality) + '" href="https://www.wowhead.com/forever/item=' + w.id + '" target="_blank" rel="noopener">' + w.name + '</a>' +
        (w.era === 'new' ? ' <span class="wp-new">' + t('wp.newInForever') + '</span>' : '') +
        (w.numbers === 'classic' ? ' <span class="wp-classic-nums" title="' + t('wp.classicNumbersTitle') + '">' + t('wp.classicNumbers') + '</span>' : '') +
        '<span class="wp-sub">' + w.kind + ' · ' + t('common.level') + ' ' + w.req +
          (w.obtain > w.req ? ' · ' + t('wp.obtainFrom', { level: w.obtain }) : '') + (w.bind === 'pickup' ? ' · BoP' : '') + '</span></td>' +
      '<td class="num">' + window.I18N.num(w.dps.toFixed(1)) + '<span class="wp-sub">' + window.I18N.num(String(w.speed)) + ' s</span></td>' +
      '<td>' + (statsText(w) || '—') + '</td>' +
      '<td>' + w.usable.map(s => sourceText(s) + ' ' + ui.badge(s.confidence)).join('<br>') + '</td>' +
      '</tr>';
  }

  function renderAll() {
    const list = candidates();
    const prog = progression(list);
    const chart = renderChart(list, prog);
    const specs = Object.keys(SPEC_KINDS);
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Armas + '">' +
      '<div class="role">' + t('wp.role') + '</div><h2>' + t('wp.title') + '</h2><p>' + t('wp.intro') + '</p>' +
      '<p class="note-text dim">' + t('wp.dataNote', { build: window.WEAPON_DATA.build }) + '</p></div>';
    html += '<div class="wp-controls">' +
      '<div class="seg">' + specs.map(s => '<button class="btn' + (state.spec === s ? ' active' : '') + '" data-spec="' + s + '">' + s + '</button>').join('') + '</div>' +
      '<div class="seg">' + ['horde', 'alliance'].map(f => '<button class="btn' + (state.faction === f ? ' active' : '') + '" data-faction="' + f + '">' + t('wp.faction.' + f) + '</button>').join('') + '</div>' +
      '<label class="chk"><input type="checkbox" id="wpRandom"' + (state.random ? ' checked' : '') + '> ' + t('wp.showRandom') + '</label>' +
      '<label class="chk"><input type="checkbox" id="wpUnknown"' + (state.unknown ? ' checked' : '') + '> ' + t('wp.showUnknown') + '</label>' +
      '<label class="chk" title="' + t('wp.showRaidsTitle') + '"><input type="checkbox" id="wpRaids"' + (state.raids ? ' checked' : '') + '> ' + t('wp.showRaids') + '</label>' +
      '<label class="chk"><input type="checkbox" id="wpPvp"' + (state.pvp ? ' checked' : '') + '> ' + t('wp.showPvp') + '</label>' +
      '</div>';
    if (state.spec !== 'Enhancement') html += '<div class="caveat">' + t('wp.casterNote') + '</div>';
    html += '<div class="panel wp-chart-panel">' + legend() + '<div class="wp-chart-wrap">' + chart.svg + '</div></div>';

    html += '<div class="panel" style="margin-top:16px"><h3>' + t('wp.steps', { n: prog.steps.length }) + '</h3>' +
      '<div class="table-wrap"><table class="cmp wp-table"><thead><tr><th>' + t('wp.colFrom') + '</th><th>' + t('wp.colWeapon') + '</th><th>DPS</th><th>' + t('wp.colStats') + '</th><th>' + t('wp.colSource') + '</th></tr></thead><tbody>' +
      prog.steps.map(s => weaponRow(s.weapon, s.level)).join('') + '</tbody></table></div></div>';

    const all = list.slice().sort((a, b) => a.obtain - b.obtain || b.dps - a.dps);
    html += '<details class="panel wp-all" style="margin-top:16px"><summary>' + t('wp.allWeapons', { n: all.length }) + '</summary>' +
      '<div class="table-wrap"><table class="cmp wp-table"><thead><tr><th>' + t('wp.colWeapon') + '</th><th>DPS</th><th>' + t('wp.colStats') + '</th><th>' + t('wp.colSource') + '</th></tr></thead><tbody>' +
      all.map(w => weaponRow(w)).join('') + '</tbody></table></div></details>';
    html += '<p class="note-text dim">' + t('wp.sourcesNote') + '</p>';
    html += ui.renderSources([
      'https://wago.tools — ' + t('wp.srcWago'),
      'https://www.wowhead.com/forever — ' + t('wp.srcWowhead'),
      'https://github.com/Questie/QuestieDB — ' + t('wp.srcQuestie')
    ]);
    container.innerHTML = html;
    bind(list, prog, chart);
  }

  // ---------- interaction ----------

  function showTip(html, clientX, clientY) {
    tipEl.innerHTML = html;
    tipEl.style.display = 'block';
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let left = clientX + 14;
    if (left + w > window.innerWidth - 8) left = clientX - w - 14;
    tipEl.style.left = Math.max(8, left) + 'px';
    tipEl.style.top = Math.max(8, Math.min(clientY - 10, window.innerHeight - h - 8)) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  function weaponTip(w, levelLine) {
    return (levelLine ? '<div class="t-cost">' + levelLine + '</div>' : '') +
      '<div class="t-name ' + qualityClass(w.quality) + '">' + w.name + '</div>' +
      '<div class="t-cost">' + w.kind + ' · ' + t('common.level') + ' ' + w.req + ' · ' + window.I18N.num(w.dps.toFixed(1)) + ' DPS · ' + window.I18N.num(String(w.speed)) + ' s</div>' +
      (statsText(w) ? '<div class="t-rank">' + statsText(w) + '</div>' : '') +
      w.usable.map(s => '<div class="t-rank">' + sourceText(s) + '</div>').join('');
  }

  function bind(list, prog, chart) {
    container.querySelectorAll('[data-spec]').forEach(b => b.addEventListener('click', () => { state.spec = b.dataset.spec; renderAll(); }));
    container.querySelectorAll('[data-faction]').forEach(b => b.addEventListener('click', () => { state.faction = b.dataset.faction; renderAll(); }));
    container.querySelector('#wpRandom').addEventListener('change', e => { state.random = e.target.checked; renderAll(); });
    container.querySelector('#wpUnknown').addEventListener('change', e => { state.unknown = e.target.checked; renderAll(); });
    container.querySelector('#wpRaids').addEventListener('change', e => { state.raids = e.target.checked; renderAll(); });
    container.querySelector('#wpPvp').addEventListener('change', e => { state.pvp = e.target.checked; renderAll(); });

    const svg = container.querySelector('.wp-chart');
    const cross = svg.querySelector('.crosshair');
    const byId = new Map(list.map(w => [String(w.id), w]));
    // Dots: their own tooltip (bigger hit area via the stroke ring).
    svg.querySelectorAll('.wp-dot').forEach(dot => {
      dot.addEventListener('mouseenter', e => showTip(weaponTip(byId.get(dot.dataset.id)), e.clientX, e.clientY));
      dot.addEventListener('mouseleave', hideTip);
    });
    // Crosshair: best weapon at the hovered level.
    const zone = svg.querySelector('.hover-zone');
    zone.addEventListener('mousemove', e => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * chart.W;
      const lv = Math.min(60, Math.max(1, Math.round(1 + (sx - chart.m.l) / (chart.W - chart.m.l - chart.m.r) * 59)));
      cross.setAttribute('x1', chart.x(lv));
      cross.setAttribute('x2', chart.x(lv));
      const w = prog.best[lv];
      if (w) showTip(weaponTip(w, t('wp.atLevel', { level: lv })), e.clientX, e.clientY);
      else hideTip();
    });
    zone.addEventListener('mouseleave', () => { cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); hideTip(); });
  }

  window.Weapons = {
    render(target, uiHelpers) {
      container = target;
      ui = uiHelpers;
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip calc-tip';
        tipEl.style.display = 'none';
        document.body.appendChild(tipEl);
      }
      if (!window.WEAPON_DATA) { container.innerHTML = '<div class="caveat">' + t('wp.noData') + '</div>'; return; }
      renderAll();
    },
    hide: hideTip
  };
})();
