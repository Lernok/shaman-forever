// Equipo › Tu camino: the gear path for your spec, faction, race and
// professions (js/gear-plan.js), as "don't miss" quests per zone of your route
// and the pieces to get in each 10-level bracket, each with why.
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const UI = window.UI;
  const Site = window.Site;
  const PROFS = ['Blacksmithing', 'Leatherworking', 'Tailoring', 'Engineering', 'Enchanting', 'Alchemy'];
  const PROF_ICONS = { Blacksmithing: 'trade_blacksmithing', Leatherworking: 'trade_leatherworking', Tailoring: 'trade_tailoring', Engineering: 'trade_engineering', Enchanting: 'trade_engraving', Alchemy: 'trade_alchemy' };
  const state = { drops: UI.store.get('gpDrops', false) };

  // Armor and weapons: the weapon is one more slot of the plan.
  const gear = () => ((window.GEAR_DATA && window.GEAR_DATA.gear) || []).concat((window.WEAPON_DATA && window.WEAPON_DATA.weapons) || []);
  const race = () => (Site.race === 'any' ? null : Site.race);

  function compute() {
    // Your professions (shared with the Professions page, gathering ones too):
    // crafts count only from your crafting ones; none picked = no crafts.
    const picked = UI.store.get('profs', []);
    const profs = picked.filter(p => PROFS.includes(p));
    const opts = {
      spec: Site.spec, faction: Site.faction, race: race(), profs, drops: state.drops,
      route: (zone, lvl) => window.Route.onRoute(zone, lvl, Site.faction, race()),
      away: zone => window.Route.otherStart(zone, Site.faction, race()),
      reach: zone => window.Route.reachable(zone, Site.faction)
    };
    return { plan: window.GearPlan.plan(gear(), opts), profs, picked };
  }

  // Where it comes from, in one line.
  function sourceText(c) {
    // "Call of Fire (given by Olariaan Swiftburn)" -> "Call of Fire".
    const s = Object.assign({}, c.source, { quest: (c.source.quest || '').replace(/ \(given by [^)]*\)/, '') });
    switch (c.access) {
      case 'class': return t('gp.src.class', { quest: s.quest });
      case 'route': return t('gp.src.route', { quest: s.quest, zone: s.zone || '?' });
      case 'quest': return t('gp.src.quest', { quest: s.quest, zone: s.zone || '?' });
      case 'dquest': return t('gp.src.dquest', { quest: s.quest, zone: s.dungeonZone || s.zone || '?' });
      case 'crafted': return t('gp.src.crafted', { prof: s.profession, skill: s.yellow });
      case 'favor': return t('gp.src.favor', { prof: s.profession, n: (s.learn || {}).favor || '?' });
      case 'vendor': return t('gp.src.vendor', { npc: s.npc, zone: s.zone || '?' });
      case 'boss': return t('gp.src.boss', { npc: s.npc, zone: s.zone || '?' });
      default: return '';
    }
  }

  // Why it's on the path: how you get it and how long it lasts.
  function why(st) {
    if (st.alt) return t('gp.why.alt', { name: st.alt.item.name });
    const parts = [t('gp.why.' + st.pick.access)];
    parts.push(st.until > 60 ? t('gp.lastsTo60') : t(st.lasts === 1 ? 'gp.lasts1' : 'gp.lasts', { n: st.lasts, until: st.until }));
    if (st.replaces) parts.push(t('gp.replaces', { name: st.replaces.item.name }));
    return parts.join(' · ');
  }

  const slotName = s => t('gp.slot.' + s);

  function stepRow(st) {
    const i = st.pick.item;
    return '<div class="gp-step' + (st.alt ? ' gp-alt' : '') + '"><span class="gp-lv">' + st.level + '</span>' +
      '<span class="gp-slot">' + slotName(st.pick.slot) + '</span>' +
      '<div class="gp-main">' + UI.itemLink(i) + '<span class="wp-sub">' + sourceText(st.pick) + '</span>' +
      '<span class="gp-why">' + why(st) + '</span></div></div>';
  }

  // Zones of the route, in the order you reach them.
  function routeStrip() {
    const seen = [];
    window.Route.brackets(Site.faction, race()).forEach(b => b.zones.forEach(z => { if (!seen.includes(z)) seen.push(z); }));
    return seen;
  }

  function render(container, ui, tabsHtml, onChange) {
    if (!window.GEAR_DATA) { container.innerHTML = tabsHtml + '<div class="caveat">' + t('gp.noData') + '</div>'; return; }
    const { plan, profs, picked } = compute();
    const raceLabel = race() ? t('race.' + race()) : t('race.any');
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Armas + '">' +
      '<div class="role">' + t('wp.role') + ' · ' + Site.spec + ' · ' + t('wp.faction.' + Site.faction) + ' · ' + raceLabel + '</div>' +
      '<h2>' + t('gp.title') + '</h2><p>' + t('gp.intro') + '</p></div>';
    html += tabsHtml;
    html += '<div class="wp-controls"><span class="ctl-label">' + t('wp.profs.label') + '</span>' +
      PROFS.map(p => '<button class="btn prof-btn' + (profs.includes(p) ? ' active' : '') + '" data-gp-prof="' + p + '" title="' + p + '">' +
        '<img class="pb-icon" src="' + UI.icon(PROF_ICONS[p]) + '" alt="">' + p + '</button>').join('') +
      '<span class="dim prof-hint">' + (!picked.length ? t('gp.profsNone') : !profs.length ? t('gp.profsGatherOnly') : '') + '</span></div>' +
      '<div class="wp-controls"><label class="chk chip-toggle" title="' + t('gp.dropsTitle') + '"><input type="checkbox" id="gpDrops"' + (state.drops ? ' checked' : '') + '> ' + t('gp.drops') + '</label></div>';

    // Steps of every slot, by bracket.
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => steps.push(st)));
    steps.sort((a, b) => a.level - b.level || window.GearPlan.SLOTS.indexOf(a.pick.slot) - window.GearPlan.SLOTS.indexOf(b.pick.slot));

    // Don't miss: route quests per zone, zones in route order.
    const order = routeStrip();
    const zones = Object.keys(plan.dontMiss).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    html += '<div class="panel"><h3>' + t('gp.dontMiss') + '</h3><p class="note-text dim">' + t('gp.dontMissNote') + '</p>';
    html += zones.length ? '<div class="gp-zones">' + zones.map(z => {
      const band = (window.Route.data.zones[z] || {})[Site.faction];
      return '<div class="gp-zone"><div class="gp-zone-head"><b>' + z + '</b>' + (band ? '<span class="dim">' + band[0] + '–' + band[1] + '</span>' : '') + '</div>' +
        plan.dontMiss[z].map(stepRow).join('') + '</div>';
    }).join('') + '</div>' : '<p class="dim">' + t('gp.none') + '</p>';
    html += '</div>';

    html += '<div class="panel" style="margin-top:16px"><h3>' + t('gp.byBracket') + '</h3>';
    for (let lo = 1; lo <= 60; lo += 10) {
      const hi = lo + 9;
      const here = steps.filter(st => st.level >= lo && st.level <= hi);
      const routeZones = [...new Set(window.Route.brackets(Site.faction, race()).filter(b => b.to >= lo && b.from <= hi).flatMap(b => b.zones))];
      html += '<div class="gp-bracket"><div class="br-head"><b>' + lo + '–' + Math.min(hi, 60) + '</b><span class="dim">' + routeZones.join(', ') + '</span></div>' +
        (here.length ? here.map(stepRow).join('') : '<p class="dim">' + t('gp.nothing') + '</p>') + '</div>';
    }
    html += '</div>';

    html += ui.renderSources([
      'https://github.com/Questie/QuestieDB — ' + t('gp.srcQuestie'),
      'https://github.com/ATTWoWAddon/AllTheThings — ' + t('gp.srcAtt'),
      'https://www.wowhead.com/forever — ' + t('wp.srcWowhead'),
      'https://foreverchanges.pro — ' + t('wp.srcFc'),
      'https://www.classicwowforever.com — ' + t('gp.srcRecipes')
    ], t('gp.how', { upgrade: Math.round((window.GearPlan.UPGRADE - 1) * 100), favor: window.GearPlan.FAVOR_PER_BRACKET }));
    container.innerHTML = html;

    container.querySelectorAll('[data-gp-prof]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.gpProf;
      UI.store.set('profs', picked.includes(p) ? picked.filter(x => x !== p) : picked.concat(p).slice(-2));
      onChange();
    }));
    const drops = container.querySelector('#gpDrops');
    if (drops) drops.addEventListener('change', e => { state.drops = e.target.checked; UI.store.set('gpDrops', state.drops); onChange(); });
    const byId = new Map(Object.values(plan.dontMiss).flat().concat(steps).map(st => [String(st.pick.item.id), st]));
    UI.tip.bind(container, '[data-item]', a => {
      const st = byId.get(a.dataset.item);
      return st ? UI.itemCard(st.pick.item, [sourceText(st.pick), why(st)]) : null;
    });
  }

  // The Professions page shows the crafted part of the same path.
  window.GearPath = { render, compute, sourceText, why, slotName };
})();
