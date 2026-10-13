// Weapons tab: weapon progression by level, per faction, with where each
// weapon comes from. Data: data/weapons.js (scripts/sync.js + build-weapons.js).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  let ui = null;
  let container = null;
  // Remembered per browser: whether you'd buy crafts on the AH (your
  // professions come from your Shaman, js/setup.js).
  const UI = window.UI;
  const stored = UI.store.get;
  const store = UI.store.set;
  const state = { random: false, unknown: false, raids: false, pvp: false, path: 'safe', when: stored('when', 'rec'), profs: stored('profs', []), ah: stored('ah', true) };
  const Site = window.Site;
  // 'camino' (your whole gear path) is drawn by js/gear-path.js; 'armas' is
  // the weapon chart, the best weapons per bracket and the full list folded.
  const SECTIONS = ['camino', 'armas'];
  // Older links to the weapon sections land on 'armas'.
  const OLD = ['progresion', 'tramos', 'dungeon', 'todas'];

  // Enhancement ranks by weapon DPS. Casters can't: weapon DPS barely matters
  // to them, and stat weights for Forever aren't known. Forever computes item
  // stats from item-level budgets, so among weapons that carry caster stats we
  // rank by item level instead of inventing weights.
  const has = (w, keys) => keys.some(k => (w.stats && w.stats[k]) || (w.bonus && w.bonus[k]));
  const ONE_HAND = ['1H Mace', '1H Axe', 'Dagger', 'Fist'];
  const SPECS = {
    Enhancement: { kinds: ['2H Axe', '2H Mace'], fits: () => true, value: w => w.dps, metric: 'dps' },
    Elemental: { kinds: ['Staff'].concat(ONE_HAND), fits: w => has(w, ['intellect', 'spellPower', 'spellDamage', 'natureDamage', 'fireDamage']), value: w => w.ilvl, metric: 'ilvl' },
    Restoration: { kinds: ['Staff'].concat(ONE_HAND), fits: w => has(w, ['intellect', 'spirit', 'healing', 'spellPower', 'mp5']), value: w => w.ilvl, metric: 'ilvl' }
  };
  const spec = () => SPECS[Site.spec];
  const valueOf = w => spec().value(w) || 0;
  // Source groups: three validated categorical slots + neutral gray, each
  // with its own marker shape so identity never rests on color alone.
  const GROUPS = {
    crafted: { color: '#3987e5', shape: 'square' },
    target: { color: '#d95926', shape: 'circle' },
    dquest: { color: '#199e70', shape: 'triangle' },
    questvendor: { color: '#199e70', shape: 'diamond' },
    other: { color: '#8b8d97', shape: 'circle' }
  };
  const BETA_CAP = 30;

  function weapons() { return (window.WEAPON_DATA && window.WEAPON_DATA.weapons) || []; }

  const race = () => (Site.race === 'any' ? null : Site.race);
  // Race bits of the client's AllowableRace mask (as in js/gear-plan.js).
  const RACE_BIT = { Orc: 2, Dwarf: 4, Tauren: 32, Troll: 128 };

  // Sources usable by the chosen faction and race, honoring the toggles.
  function usableSources(w) {
    return w.sources.map(s => {
      // Crafts: your professions' own; others only bought on the AH. No professions = no crafts of your own.
      if (s.type !== 'crafted' || state.profs.includes(s.profession)) return s;
      return state.ah && w.bind !== 'pickup' ? Object.assign({}, s, { viaAH: true }) : null;
    }).filter(Boolean).filter(s => {
      if (s.faction !== 'both' && s.faction !== Site.faction) return false;
      // Another race's starting zone: you never quest there. A dungeon or a
      // vendor in the other faction's land: you never go there.
      if (s.type === 'quest' && window.Route && window.Route.otherStart(s.zone, Site.faction, race())) return false;
      if (['boss', 'drop', 'vendor'].includes(s.type) && window.Route && !window.Route.reachable(s.zone, Site.faction)) return false;
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
    if (sources.some(s => s.type === 'quest' && s.dungeon)) return 'dquest';
    if (types.includes('boss') || types.includes('drop')) return 'target';
    if (types.includes('quest') || types.includes('vendor')) return 'questvendor';
    return 'other';
  }

  function candidates() {
    const s = spec();
    return weapons()
      .filter(w => s.kinds.includes(w.kind) && s.fits(w) && valueOf(w) > 0)
      .filter(w => { const bit = RACE_BIT[race()]; return !bit || !(w.raceMask > 0) || (w.raceMask & bit); })
      .map(w => Object.assign({}, w, { usable: usableSources(w) }))
      .filter(w => w.usable.length)
      .map(w => {
        const lv = src => (src[state.when] != null ? src[state.when] : w.req || 0);
        const via = w.usable.slice().sort((a, b) => lv(a) - lv(b))[0];
        return Object.assign(w, { group: groupOf(w.usable), obtain: Math.max(w.req || 0, lv(via)), via });
      });
  }

  // Guaranteed: you get it for sure (quest, craft, vendor), no drop luck.
  const SAFE = ['crafted', 'quest', 'vendor'];
  const isSafe = w => w.usable.some(s => SAFE.includes(s.type));

  // Best weapon at each level 1..60, and the levels where it changes.
  function progression(list) {
    const best = [];
    const steps = [];
    let current = null;
    for (let lv = 1; lv <= 60; lv++) {
      list.forEach(w => { if (w.obtain <= lv && (!current || valueOf(w) > valueOf(current))) current = w; });
      best[lv] = current;
      if (current && (!steps.length || steps[steps.length - 1].weapon !== current)) steps.push({ level: lv, weapon: current });
    }
    return { best, steps };
  }

  // ---------- text ----------

  function sourceText(s) {
    const I = window.I18N;
    switch (s.type) {
      case 'crafted': return t('wp.src.crafted', { prof: s.profession, yellow: s.yellow }) + (s.viaAH ? ' · ' + t('wp.viaAH') : '');
      case 'boss': return t('wp.src.boss', { npc: s.npc, zone: s.zone || '?' });
      case 'drop': return t('wp.src.drop', { npc: s.npc, zone: s.zone || '?' });
      case 'trash': return t('wp.src.trash', { zones: (s.zones || []).join(', ') || '?', n: s.count });
      case 'quest': {
        const from = s.requiredLevel && s.level && s.requiredLevel < s.level ? t('wp.src.from', { level: s.requiredLevel }) : '';
        return t(s.dungeon ? 'wp.src.dquest' : 'wp.src.quest', { quest: s.quest, level: s.level || '?', from: from }) +
          ((s.dungeonZone || s.zone) ? ' · ' + (s.dungeonZone || s.zone) : '') + (s.dungeonLevels ? ' ' + s.dungeonLevels.join('–') : '') +
          (s.faction !== 'both' ? ' · ' + t('wp.faction.' + s.faction) : '');
      }
      case 'vendor': return t('wp.src.vendor', { npc: s.npc, zone: s.zone || '?' });
      case 'unrecorded': return t('wp.src.unrecorded');
      default: return t('wp.src.unknown');
    }
  }

  const statsText = w => UI.statsText(w);

  // Main number of a weapon for the current spec, with the other one below.
  function metricCell(w) {
    const dps = window.I18N.num(w.dps.toFixed(1));
    const speed = window.I18N.num(String(w.speed)) + ' s';
    return spec().metric === 'dps'
      ? dps + '<span class="wp-sub">' + speed + '</span>'
      : w.ilvl + '<span class="wp-sub">' + dps + ' DPS</span>';
  }

  // ---------- chart ----------

  function marker(shape, x, y, r, color, extra) {
    const attrs = ' fill="' + color + '" stroke="var(--bg-panel)" stroke-width="2" ' + (extra || '');
    if (shape === 'square') return '<rect x="' + (x - r) + '" y="' + (y - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="1.5"' + attrs + '/>';
    if (shape === 'triangle') return '<path d="M' + x + ' ' + (y - r - 1.5) + 'L' + (x + r + 1.5) + ' ' + (y + r) + 'L' + (x - r - 1.5) + ' ' + (y + r) + 'Z"' + attrs + '/>';
    if (shape === 'diamond') return '<path d="M' + x + ' ' + (y - r - 1) + 'L' + (x + r + 1) + ' ' + y + 'L' + x + ' ' + (y + r + 1) + 'L' + (x - r - 1) + ' ' + y + 'Z"' + attrs + '/>';
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + attrs + '/>';
  }

  function renderChart(list, paths) {
    const W = 760, H = 350, m = { l: 46, r: 16, t: 26, b: 36 };
    const maxValue = Math.max(10, ...list.map(valueOf));
    const yMax = Math.ceil(maxValue / 10) * 10;
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
    svg += '<text x="' + 4 + '" y="' + 12 + '" class="axis-title">' + t('wp.axis.' + spec().metric) + '</text>';
    // Beta cap.
    svg += '<line x1="' + x(BETA_CAP) + '" x2="' + x(BETA_CAP) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" class="cap"/>' +
      '<text x="' + (x(BETA_CAP) + 4) + '" y="' + (m.t + 10) + '" class="cap-label">' + t('wp.betaCap') + '</text>';
    // Hover zone and crosshair sit under the markers, so dots keep their own tooltips.
    svg += '<rect class="hover-zone" x="' + m.l + '" y="' + m.t + '" width="' + (W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '"/>' +
      '<line class="crosshair" y1="' + m.t + '" y2="' + (H - m.b) + '" x1="-10" x2="-10"/>';
    // Best-available step lines: with drops (dashed, under) and guaranteed (solid).
    const stepPath = prog => {
      let d = '';
      for (let lv = 1; lv <= 60; lv++) {
        const w = prog.best[lv];
        if (!w) continue;
        const px = x(lv), py = y(valueOf(w));
        d += (d ? 'L' + px + ' ' + (prog.best[lv - 1] ? y(valueOf(prog.best[lv - 1])) : py) + 'L' : 'M') + px + ' ' + py;
      }
      return d;
    };
    const dAll = stepPath(paths.all);
    const dSafe = stepPath(paths.safe);
    if (dAll) svg += '<path d="' + dAll + '" class="best-line drops"/>';
    if (dSafe) svg += '<path d="' + dSafe + '" class="best-line"/>';
    // Every candidate as a marker; upgrades on either line a bit larger.
    const upgrades = new Set(paths.all.steps.concat(paths.safe.steps).map(s => s.weapon.id));
    list.forEach(w => {
      const g = GROUPS[w.group];
      svg += marker(g.shape, x(Math.max(1, w.obtain)), y(valueOf(w)), upgrades.has(w.id) ? 6 : 4, g.color,
        'class="wp-dot' + (upgrades.has(w.id) ? ' up' : '') + '" data-id="' + w.id + '"');
    });
    svg += '</svg>';
    return { svg, x, y, m, W, H };
  }

  function legend() {
    return '<div class="wp-legend">' + ['crafted', 'dquest', 'questvendor', 'target', 'other'].map(k =>
      '<span><svg width="14" height="14" viewBox="0 0 14 14">' + marker(GROUPS[k].shape, 7, 7, 4.5, GROUPS[k].color) + '</svg>' + t('wp.group.' + k) + '</span>'
    ).join('') + '<span><svg width="22" height="14"><line x1="1" x2="21" y1="7" y2="7" class="best-line"/></svg>' + t('wp.bestSafe') + '</span>' +
      '<span><svg width="22" height="14"><line x1="1" x2="21" y1="7" y2="7" class="best-line drops"/></svg>' + t('wp.bestAll') + '</span></div>';
  }

  // ---------- page ----------

  const itemLink = UI.itemLink;
  
  function weaponRow(w, level) {
    return '<tr>' +
      (level != null ? '<td class="num">' + level + '</td>' : '') +
      '<td>' + itemLink(w) +
        (w.era === 'new' ? ' <span class="wp-new">' + t('wp.newInForever') + '</span>' : '') +
        (w.numbers === 'classic' ? ' <span class="wp-classic-nums" title="' + t('wp.classicNumbersTitle') + '">' + t('wp.classicNumbers') + '</span>' : '') +
        '<span class="wp-sub">' + w.kind + ' · ' + reqText(w) +
          (w.obtain > w.req ? ' · ' + t('wp.obtainFrom', { level: w.obtain }) : '') + (w.bind === 'pickup' ? ' · BoP' : '') + '</span></td>' +
      '<td class="num">' + metricCell(w) + '</td>' +
      '<td>' + (statsText(w) || '—') + '</td>' +
      '<td>' + w.usable.map(s => sourceText(s) + ' ' + ui.badge(s.confidence)).join('<br>') + '</td>' +
      '</tr>';
  }

  // Level to equip it: quest rewards usually have none.
  function reqText(w) {
    return w.req > 1 ? t('common.level') + ' ' + w.req : t('wp.noReq');
  }

  function renderAll() {
    // Professions are shared with the gear path and the Professions page.
    state.profs = stored('profs', []);
    const parts = location.hash.slice(1).split('/');
    if (parts[0] === 'Equipo' && OLD.includes(parts[1])) history.replaceState(null, '', '#Equipo/armas');
    const section = Site.section('Equipo', SECTIONS);
    if (section === 'camino') {
      window.GearPath.render(container, ui, Site.sectionTabs('Equipo', SECTIONS, section, k => t('wp.sec.' + k)), renderAll);
      return;
    }
    const list = candidates();
    const paths = { safe: progression(list.filter(isSafe)), all: progression(list) };
    const chart = renderChart(list, paths);
    const all = list.slice().sort((a, b) => a.obtain - b.obtain || valueOf(b) - valueOf(a));
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Armas + '">' +
      '<div class="role">' + t('wp.role') + ' · ' + (race() ? t('race.' + race()) : t('wp.faction.' + Site.faction)) + ' · ' + Site.spec + '</div><h2>' + t('wp.title') + '</h2><p>' + t('wp.intro') + '</p></div>';
    html += Site.sectionTabs('Equipo', SECTIONS, section, k => t('wp.sec.' + k));
    // Your professions come from your Shaman (the setup); the rarer sources fold away.
    html += '<div class="wp-controls">' +
      '<span class="ctl-label">' + t('wp.when.label') + '</span><div class="seg">' + ['rec', 'asap'].map(k =>
        '<button class="btn' + (state.when === k ? ' active' : '') + '" data-when="' + k + '" title="' + t('wp.when.' + k + 'Title') + '">' + t('wp.when.' + k) + '</button>').join('') + '</div>' +
      '<label class="chk chip-toggle" title="' + t('wp.profs.ahTitle') + '"><input type="checkbox" id="wpAH"' + (state.ah ? ' checked' : '') + '> ' + t('wp.profs.ah') + '</label>' +
      '<span class="dim prof-hint">' + t('wp.profsFrom', { profs: state.profs.length ? state.profs.join(' + ') : t('setup.noProfsShort') }) + '</span>' +
      '</div><details class="wp-more"' + (state.random || state.unknown || state.raids || state.pvp ? ' open' : '') + '><summary>' + t('wp.addSources') + '</summary><div class="wp-controls">' +
      '<label class="chk chip-toggle"><input type="checkbox" id="wpRandom"' + (state.random ? ' checked' : '') + '> ' + t('wp.showRandom') + '</label>' +
      '<label class="chk chip-toggle"><input type="checkbox" id="wpUnknown"' + (state.unknown ? ' checked' : '') + '> ' + t('wp.showUnknown') + '</label>' +
      '<label class="chk chip-toggle" title="' + t('wp.showRaidsTitle') + '"><input type="checkbox" id="wpRaids"' + (state.raids ? ' checked' : '') + '> ' + t('wp.showRaids') + '</label>' +
      '<label class="chk chip-toggle"><input type="checkbox" id="wpPvp"' + (state.pvp ? ' checked' : '') + '> ' + t('wp.showPvp') + '</label>' +
      '</div></details>';
    if (spec().metric === 'ilvl') html += '<div class="caveat">' + t('wp.casterNote') + '</div>';
    html += '<div class="panel wp-chart-panel">' + legend() + '<div class="wp-chart-wrap">' + chart.svg + '</div></div>';
    html += '<h3 class="block-title" style="margin-top:22px">' + t('wp.byBracket') + '</h3>' + bracketSection(list);
    html += '<details class="panel wp-all"><summary>' + t('wp.allWeapons', { n: all.length }) + '</summary>' + allTable(all) + '</details>';
    const notes = [t('wp.chartHow'), spec().metric === 'ilvl' ? t('wp.casterHow') : '', t('wp.dataNote', { build: window.WEAPON_DATA.build }), t('wp.sourcesNote')];
    html += ui.renderSources([
      'https://wago.tools — ' + t('wp.srcWago'),
      'https://www.wowhead.com/forever — ' + t('wp.srcWowhead'),
      'https://github.com/Questie/QuestieDB — ' + t('wp.srcQuestie'),
      'https://foreverchanges.pro — ' + t('wp.srcFc')
    ], notes.filter(Boolean).join('</p><p class="sources-caveat">'));
    container.innerHTML = html;
    bind(list, paths, chart);
  }

  function bracketSection(list) {
    const fmt = v => spec().metric === 'dps' ? window.I18N.num(v.toFixed(1)) : String(v);
    let html = '<p class="note-text dim">' + t('wp.br.intro') + '</p><div class="bracket-list">';
    for (let lo = 5; lo <= 60; lo += 5) {
      const hi = Math.min(lo + 4, 60);
      const pool = list.filter(w => w.obtain <= hi).sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 4);
      if (!pool.length) continue;
      html += '<div class="bracket' + (lo > BETA_CAP ? ' post-cap' : '') + '"><div class="br-head"><b>' + lo + '–' + hi + '</b>' +
        (lo > BETA_CAP ? '<span class="dim">' + t('wp.br.postCap') + '</span>' : '') + '</div><div class="br-items">' +
        pool.map((w, i) => '<div class="br-item' + (i === 0 ? ' best' : '') + '">' + itemLink(w) +
          '<span class="br-val">' + fmt(valueOf(w)) + '</span>' +
          (w.obtain >= lo ? '<span class="br-new">' + t('wp.br.new', { level: w.obtain }) + '</span>' : '<span class="dim br-lv">' + t('common.level') + ' ' + w.obtain + '</span>') +
          '<span class="br-src">' + w.usable.map(sourceText).join(' / ') + '</span></div>').join('') +
        '</div></div>';
    }
    return html + '</div>';
  }

  function allTable(all) {
    return '<div class="table-wrap"><table class="cmp wp-table"><thead><tr><th>' + t('wp.colWeapon') + '</th><th>' + t('wp.col.' + spec().metric) + '</th><th>' + t('wp.colStats') + '</th><th>' + t('wp.colSource') + '</th></tr></thead><tbody>' +
      all.map(w => weaponRow(w)).join('') + '</tbody></table></div>';
  }

  // ---------- interaction ----------

  // Hover card: the item, its level line, where it comes from.
  function weaponTip(w, lead) {
    return UI.itemCard(w, [reqText(w) + (w.obtain > w.req ? ' · ' + t('wp.obtainFrom', { level: w.obtain }) : '')].concat(w.usable.map(sourceText)), lead);
  }

  function bind(list, paths, chart) {
    const on = (sel, fn) => { const el = container.querySelector(sel); if (el) el.addEventListener('change', fn); };
    on('#wpRandom', e => { state.random = e.target.checked; renderAll(); });
    on('#wpUnknown', e => { state.unknown = e.target.checked; renderAll(); });
    on('#wpRaids', e => { state.raids = e.target.checked; renderAll(); });
    on('#wpPvp', e => { state.pvp = e.target.checked; renderAll(); });
    container.querySelectorAll('[data-when]').forEach(b => b.addEventListener('click', () => { state.when = b.dataset.when; store('when', state.when); renderAll(); }));
    on('#wpAH', e => { state.ah = e.target.checked; store('ah', state.ah); renderAll(); });
    const byId = new Map(list.map(w => [String(w.id), w]));
    UI.tip.bind(container, '[data-item]', a => byId.has(a.dataset.item) ? weaponTip(byId.get(a.dataset.item)) : null);

    if (!chart) return;
    const svg = container.querySelector('.wp-chart');
    const cross = svg.querySelector('.crosshair');
    // Dots: their own tooltip (bigger hit area via the stroke ring).
    svg.querySelectorAll('.wp-dot').forEach(dot => {
      dot.addEventListener('mouseenter', e => UI.tip.at(weaponTip(byId.get(dot.dataset.id)), e.clientX, e.clientY));
      dot.addEventListener('mouseleave', UI.tip.hide);
    });
    // Crosshair: best weapon at the hovered level.
    const zone = svg.querySelector('.hover-zone');
    zone.addEventListener('mousemove', e => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * chart.W;
      const lv = Math.min(60, Math.max(1, Math.round(1 + (sx - chart.m.l) / (chart.W - chart.m.l - chart.m.r) * 59)));
      cross.setAttribute('x1', chart.x(lv));
      cross.setAttribute('x2', chart.x(lv));
      // Guaranteed best, plus the best drop when it's higher.
      const safe = paths.safe.best[lv];
      const any = paths.all.best[lv];
      let html = safe ? weaponTip(safe, t('wp.atLevelSafe', { level: lv })) : '';
      if (any && any !== safe) html += (html ? '<hr class="t-sep">' : '') + weaponTip(any, t('wp.atLevelAll', { level: lv }));
      if (html) UI.tip.at(html, e.clientX, e.clientY);
      else UI.tip.hide();
    });
    zone.addEventListener('mouseleave', () => { cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); UI.tip.hide(); });
  }

  window.Weapons = {
    render(target, uiHelpers) {
      container = target;
      ui = uiHelpers;
      if (!window.WEAPON_DATA) { container.innerHTML = '<div class="caveat">' + t('wp.noData') + '</div>'; return; }
      renderAll();
    },
    // Best guaranteed weapon at a level for the header's spec and faction,
    // with the default source toggles (the guide's "at a glance" card).
    bestSafe(level) {
      if (!window.WEAPON_DATA) return null;
      const w = progression(candidates().filter(isSafe)).best[level];
      if (!w) return null;
      const s = w.usable.find(x => SAFE.includes(x.type)) || w.usable[0];
      const value = spec().metric === 'dps' ? window.I18N.num(w.dps.toFixed(1)) + ' DPS' : t('wp.ilvl') + ' ' + w.ilvl;
      return { id: w.id, name: w.name, kind: w.kind, quality: w.quality, obtain: w.obtain, value, source: sourceText(s) };
    }
  };
})();
