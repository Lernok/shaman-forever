// Weapons tab: weapon progression by level, per faction, with where each
// weapon comes from. Data: data/weapons.js (scripts/sync.js + build-weapons.js).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  let ui = null;
  let container = null;
  // Remembered per browser: your professions and whether you'd buy crafts on the AH.
  const PROFS = ['Blacksmithing', 'Leatherworking', 'Tailoring', 'Engineering', 'Enchanting', 'Alchemy'];
  const PROF_ICONS = { Blacksmithing: 'trade_blacksmithing', Leatherworking: 'trade_leatherworking', Tailoring: 'trade_tailoring', Engineering: 'trade_engineering', Enchanting: 'trade_engraving', Alchemy: 'trade_alchemy' };
  const UI = window.UI;
  const stored = UI.store.get;
  const store = UI.store.set;
  const state = { random: false, unknown: false, raids: false, pvp: false, path: 'safe', when: stored('when', 'rec'), profs: stored('profs', []), ah: stored('ah', true) };
  const openSteps = new Set();
  const Site = window.Site;
  // 'camino' (your whole gear path) is drawn by js/gear-path.js.
  const SECTIONS = ['camino', 'progresion', 'tramos', 'dungeon', 'todas'];

  // Enhancement ranks by weapon DPS. Casters can't: weapon DPS barely matters
  // to them, and stat weights for Forever aren't known. Forever computes item
  // stats from item-level budgets, so among weapons that carry caster stats we
  // rank by item level instead of inventing weights.
  const has = (w, keys) => keys.some(k => (w.stats && w.stats[k]) || (w.bonus && w.bonus[k]));
  const ONE_HAND = ['1H Mace', '1H Axe', 'Dagger', 'Fist'];
  const SPECS = {
    Enhancement: { kinds: ['2H Axe', '2H Mace'], fits: () => true, value: w => w.dps, metric: 'dps' },
    Elemental: { kinds: ['Staff'].concat(ONE_HAND), fits: w => has(w, ['intellect', 'spellPower']), value: w => w.ilvl, metric: 'ilvl' },
    Restoration: { kinds: ['Staff'].concat(ONE_HAND), fits: w => has(w, ['intellect', 'spirit', 'healing', 'spellPower']), value: w => w.ilvl, metric: 'ilvl' }
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
      if (s.type !== 'crafted' || !state.profs.length || state.profs.includes(s.profession)) return s;
      return state.ah && w.bind !== 'pickup' ? Object.assign({}, s, { viaAH: true }) : null;
    }).filter(Boolean).filter(s => {
      if (s.faction !== 'both' && s.faction !== Site.faction) return false;
      // Another race's starting zone: you never quest there.
      if (s.type === 'quest' && window.Route && window.Route.otherStart(s.zone, Site.faction, race())) return false;
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
  
  // "From 15 · recommended 16: Rath'mael is level 19 (estimate), group".
  function whyLevel(w) {
    const src = w.via;
    if (!src || src.rec == null) return '';
    const b = src.basis || {};
    let why = '';
    if (b.name && b.level) why = t('wp.why.target', { name: b.name, level: b.level }) + (b.from === 'dungeon-range' ? ' ' + t('wp.why.estimate') : '') + (b.group ? ' · ' + t('wp.why.group') : '');
    else if (b.from === 'dungeon-range') why = t('wp.why.range');
    else if (b.from === 'quest-level') why = t('wp.why.questLevel');
    else if (b.from === 'step-level') why = t('wp.why.step', { level: b.level });
    if (b.steps > 1) why += (why ? ' · ' : '') + t('wp.why.chain', { n: b.steps });
    const lead = src.asap != null && src.asap !== src.rec ? t('wp.why.fromRec', { asap: src.asap, rec: src.rec }) : t('wp.why.at', { rec: src.rec });
    return lead + (why ? ' — ' + why : '');
  }

  // Best other weapons you can have by a level (the path's pick left out).
  function alternatives(list, w, level) {
    const fmt = v => spec().metric === 'dps' ? window.I18N.num(v.toFixed(1)) : String(v);
    const alts = list.filter(o => o.id !== w.id && o.obtain <= level + 2).sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 5);
    if (!alts.length) return '<p class="note-text dim">' + t('wp.alt.none') + '</p>';
    return '<div class="alt-list"><div class="alt-title">' + t('wp.alt.title', { level: level + 2 }) + '</div>' + alts.map(o => {
      const d = valueOf(o) - valueOf(w);
      return '<div class="alt-row">' + itemLink(o) +
        '<span class="alt-val">' + fmt(valueOf(o)) + ' <span class="' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '−') + fmt(Math.abs(d)) + '</span></span>' +
        '<span class="alt-src">' + t('common.level') + ' ' + o.obtain + ' · ' + o.usable.map(sourceText).join(' / ') + '</span></div>';
    }).join('') + '</div>';
  }

  // One upgrade on the path: level, weapon, its number, where it comes from.
  function stepCard(s, prev, list) {
    const w = s.weapon;
    const open = openSteps.has(w.id);
    const gain = prev ? valueOf(w) - valueOf(prev.weapon) : null;
    const fmt = v => spec().metric === 'dps' ? window.I18N.num(v.toFixed(1)) : String(v);
    return '<div class="step-card' + (open ? ' open' : '') + '">' +
      '<div class="sc-level"><span>' + t('common.level') + '</span><b>' + s.level + '</b></div>' +
      '<a class="sc-icon" data-item="' + w.id + '" href="https://www.wowhead.com/forever/item=' + w.id + '" target="_blank" rel="noopener">' + UI.itemIcon(w, 'sc-img') + '</a>' +
      '<div class="sc-main"><a class="sc-name q' + w.quality + '" data-item="' + w.id + '" href="https://www.wowhead.com/forever/item=' + w.id + '" target="_blank" rel="noopener">' + w.name + '</a>' +
        (w.era === 'new' ? ' <span class="wp-new">' + t('wp.newInForever') + '</span>' : '') +
        '<span class="wp-sub">' + w.kind + ' · ' + reqText(w) + (w.bind === 'pickup' ? ' · BoP' : '') + (statsText(w) ? ' · ' + statsText(w) : '') + '</span>' +
        '<span class="sc-src">' + w.usable.map(x => sourceText(x) + ' ' + ui.badge(x.confidence)).join('<br>') + '</span>' +
        (whyLevel(w) ? '<span class="sc-why">' + whyLevel(w) + '</span>' : '') +
        '<button class="sc-alt-btn" type="button" data-alt="' + w.id + '">' + t(open ? 'wp.alt.hide' : 'wp.alt.show') + '</button></div>' +
      '<div class="sc-value"><b>' + fmt(valueOf(w)) + '</b><span>' + (spec().metric === 'dps' ? 'DPS' : t('wp.ilvl')) + '</span>' +
        (gain != null ? '<span class="sc-gain">+' + fmt(gain) + '</span>' : '') + '</div>' +
      (open ? '<div class="sc-alts">' + alternatives(list, w, s.level) + '</div>' : '') +
      '</div>';
  }

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

  // Dungeon quest rewards for this spec and faction, each against the best
  // other weapon you could have at the level you can first get it.
  function dungeonQuests(list) {
    const rows = [];
    const at = (w, s) => (s[state.when] != null ? s[state.when] : s.early || s.level || w.obtain);
    list.forEach(w => w.usable.forEach(s => { if (s.type === 'quest' && s.dungeon) rows.push({ w, s }); }));
    rows.sort((a, b) => at(a.w, a.s) - at(b.w, b.s) || valueOf(b.w) - valueOf(a.w));
    let html = '<div class="panel"><h3>' + t('wp.dq.title', { n: rows.length }) + '</h3>' +
      '<p class="note-text">' + t('wp.dq.intro') + '</p>';
    if (!rows.length) return { n: 0, html: html + '<p class="dim">' + t('wp.dq.none') + '</p></div>' };
    const num = v => spec().metric === 'dps' ? window.I18N.num(v.toFixed(1)) : String(v);
    html += '<div class="table-wrap"><table class="cmp wp-table"><thead><tr><th>' + t('wp.dq.colQuest') + '</th><th>' + t('wp.dq.colLevels') + '</th><th>' +
      t('wp.colWeapon') + '</th><th>' + t('wp.col.' + spec().metric) + '</th><th>' + t('wp.colStats') + '</th><th>' + t('wp.dq.colAlt') + '</th></tr></thead><tbody>' +
      rows.map(({ w, s }) => {
        const lv = at(w, s);
        // Best other weapon at the quest's level: one you get for sure, and the best drop.
        const before = list.filter(o => o.id !== w.id && o.obtain <= lv).sort((a, b) => valueOf(b) - valueOf(a));
        // Other dungeon quests left out: the point is how much they beat the usual path.
        const safeOf = o => o.usable.find(x => ['crafted', 'quest', 'vendor'].includes(x.type) && !x.dungeon);
        const alt = before.find(safeOf);
        const drop = before.find(o => o.usable.every(x => ['boss', 'drop', 'trash'].includes(x.type)));
        const diff = alt ? valueOf(w) - valueOf(alt) : null;
        const dropLine = drop && (!alt || valueOf(drop) > valueOf(alt))
          ? '<span class="wp-sub">' + t('wp.dq.drop', { name: drop.name, value: num(valueOf(drop)), source: sourceText(drop.usable[0]) }) + '</span>' : '';
        return '<tr><td>' + (s.ref ? '<a href="' + s.ref + '" target="_blank" rel="noopener">' + s.quest + '</a>' : s.quest) +
            '<span class="wp-sub">' + (s.dungeonZone || s.zone || '') + (s.faction !== 'both' ? ' · ' + t('wp.faction.' + s.faction) : '') + '</span></td>' +
          '<td class="wp-when"><b>' + t('wp.dq.getAt', { level: lv }) + '</b>' +
            '<span class="wp-sub">' + t('wp.dq.questLv', { min: s.requiredLevel || '?', level: s.level || '?' }) + '</span>' +
            (s.dungeonLevels ? '<span class="wp-sub">' + t('wp.dq.dungeonLv', { range: s.dungeonLevels.join('–') }) + '</span>' : '') +
            (s.basis && s.basis.name ? '<span class="wp-sub">' + t('wp.why.target', { name: s.basis.name, level: s.basis.level }) + (s.basis.from === 'dungeon-range' ? ' ' + t('wp.why.estimate') : '') + '</span>' : '') +
            '<span class="wp-sub">' + reqText(w) + '</span></td>' +
          '<td>' + itemLink(w) +
            (w.era === 'new' ? ' <span class="wp-new">' + t('wp.newInForever') + '</span>' : '') + '<span class="wp-sub">' + w.kind + '</span></td>' +
          '<td class="num">' + metricCell(w) + '</td>' +
          '<td>' + (statsText(w) || '—') + '</td>' +
          '<td>' + (alt ? alt.name + ' · ' + num(valueOf(alt)) +
            '<span class="wp-sub">' + (diff >= 0 ? '+' : '−') + num(Math.abs(diff)) + ' ' + t(diff >= 0 ? 'wp.dq.better' : 'wp.dq.worse') + ' · ' + sourceText(safeOf(alt)) + '</span>' : '—') + dropLine + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return { n: rows.length, html };
  }

  function renderAll() {
    // Professions are shared with the gear path and the Professions page.
    state.profs = stored('profs', []);
    const section = Site.section('Equipo', SECTIONS);
    if (section === 'camino') {
      window.GearPath.render(container, ui, Site.sectionTabs('Equipo', SECTIONS, section, k => t('wp.sec.' + k)), renderAll);
      return;
    }
    const list = candidates();
    const paths = { safe: progression(list.filter(isSafe)), all: progression(list) };
    const prog = paths[state.path];
    const chart = section === 'progresion' ? renderChart(list, paths) : null;
    const dq = dungeonQuests(list);
    const all = list.slice().sort((a, b) => a.obtain - b.obtain || valueOf(b) - valueOf(a));
    const counts = { camino: null, progresion: prog.steps.length, tramos: null, dungeon: dq.n, todas: all.length };
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Armas + '">' +
      '<div class="role">' + t('wp.role') + ' · ' + Site.spec + ' · ' + t('wp.faction.' + Site.faction) + ' · ' + (race() ? t('race.' + race()) : t('race.any')) + '</div><h2>' + t('wp.title') + '</h2><p>' + t('wp.intro') + '</p></div>';
    html += Site.sectionTabs('Equipo', SECTIONS, section, k => t('wp.sec.' + k) + (counts[k] != null ? ' <span class="n">' + counts[k] + '</span>' : ''));
    // The source toggles change every list, so they sit above all sections.
    html += '<div class="wp-controls">' +
      '<span class="ctl-label">' + t('wp.when.label') + '</span><div class="seg">' + ['rec', 'asap'].map(k =>
        '<button class="btn' + (state.when === k ? ' active' : '') + '" data-when="' + k + '" title="' + t('wp.when.' + k + 'Title') + '">' + t('wp.when.' + k) + '</button>').join('') + '</div>' +
      '</div><div class="wp-controls">' +
      '<span class="ctl-label">' + t('wp.profs.label') + '</span>' +
      PROFS.map(p => '<button class="btn prof-btn' + (state.profs.includes(p) ? ' active' : '') + '" data-prof="' + p + '" title="' + p + '">' +
        '<img class="pb-icon" src="' + UI.icon(PROF_ICONS[p]) + '" alt="">' + p + '</button>').join('') +
      '<label class="chk chip-toggle" title="' + t('wp.profs.ahTitle') + '"><input type="checkbox" id="wpAH"' + (state.ah ? ' checked' : '') + '> ' + t('wp.profs.ah') + '</label>' +
      '<span class="dim prof-hint">' + (state.profs.length ? '' : t('wp.profs.none')) + '</span>' +
      '</div><div class="wp-controls">' +
      '<span class="ctl-label">' + t('wp.addSources') + '</span>' +
      '<label class="chk chip-toggle"><input type="checkbox" id="wpRandom"' + (state.random ? ' checked' : '') + '> ' + t('wp.showRandom') + '</label>' +
      '<label class="chk chip-toggle"><input type="checkbox" id="wpUnknown"' + (state.unknown ? ' checked' : '') + '> ' + t('wp.showUnknown') + '</label>' +
      '<label class="chk chip-toggle" title="' + t('wp.showRaidsTitle') + '"><input type="checkbox" id="wpRaids"' + (state.raids ? ' checked' : '') + '> ' + t('wp.showRaids') + '</label>' +
      '<label class="chk chip-toggle"><input type="checkbox" id="wpPvp"' + (state.pvp ? ' checked' : '') + '> ' + t('wp.showPvp') + '</label>' +
      '</div>';
    if (section === 'progresion') html += progressionSection(list, paths, prog, chart);
    if (section === 'dungeon') html += dq.html;
    if (section === 'todas') html += allSection(all);
    if (section === 'tramos') html += bracketSection(list);
    const notes = [t('wp.chartHow'), spec().metric === 'ilvl' ? t('wp.casterHow') : '', t('wp.dataNote', { build: window.WEAPON_DATA.build }), t('wp.sourcesNote')];
    html += ui.renderSources([
      'https://wago.tools — ' + t('wp.srcWago'),
      'https://www.wowhead.com/forever — ' + t('wp.srcWowhead'),
      'https://github.com/Questie/QuestieDB — ' + t('wp.srcQuestie'),
      'https://foreverchanges.pro — ' + t('wp.srcFc')
    ], notes.filter(Boolean).join('</p><p class="sources-caveat">'));
    container.innerHTML = html;
    bind(list, paths, section === 'progresion' ? chart : null);
  }

  function progressionSection(list, paths, prog, chart) {
    let html = '';
    if (spec().metric === 'ilvl') html += '<div class="caveat">' + t('wp.casterNote') + '</div>';
    html += '<div class="panel wp-chart-panel">' + legend() + '<div class="wp-chart-wrap">' + chart.svg + '</div></div>';
    html += '<div class="panel" style="margin-top:16px"><h3>' + t('wp.steps', { n: prog.steps.length }) + '</h3>' +
      '<div class="wp-path">' + ['safe', 'all'].map(p => '<button class="btn' + (state.path === p ? ' active' : '') + '" data-path="' + p + '">' + t('wp.path.' + p) + '</button>').join('') + '</div>' +
      '<p class="note-text dim">' + t('wp.pathNote.' + state.path) + '</p>' +
      '<div class="step-list">' + prog.steps.map((s, i) => stepCard(s, prog.steps[i - 1], list)).join('') + '</div></div>';
    return html;
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

  function allSection(all) {
    return '<div class="panel"><h3>' + t('wp.allWeapons', { n: all.length }) + '</h3>' +
      '<div class="table-wrap"><table class="cmp wp-table"><thead><tr><th>' + t('wp.colWeapon') + '</th><th>' + t('wp.col.' + spec().metric) + '</th><th>' + t('wp.colStats') + '</th><th>' + t('wp.colSource') + '</th></tr></thead><tbody>' +
      all.map(w => weaponRow(w)).join('') + '</tbody></table></div></div>';
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
    container.querySelectorAll('[data-path]').forEach(b => b.addEventListener('click', () => { state.path = b.dataset.path; renderAll(); }));
    container.querySelectorAll('[data-when]').forEach(b => b.addEventListener('click', () => { state.when = b.dataset.when; store('when', state.when); renderAll(); }));
    container.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.prof;
      state.profs = state.profs.includes(p) ? state.profs.filter(x => x !== p) : state.profs.concat(p).slice(-2);
      store('profs', state.profs);
      renderAll();
    }));
    on('#wpAH', e => { state.ah = e.target.checked; store('ah', state.ah); renderAll(); });
    container.querySelectorAll('[data-alt]').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.alt);
      if (openSteps.has(id)) openSteps.delete(id); else openSteps.add(id);
      renderAll();
    }));
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
