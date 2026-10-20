// Equipo › Tu camino: the gear path for your spec, faction, race and
// professions (js/gear-plan.js), one 10-level bracket at a time (your level
// picks it): the zones of your route and the pieces in level order, quests of
// those zones starred, why each one on demand.
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const UI = window.UI;
  const Site = window.Site;
  const PROFS = ['Blacksmithing', 'Leatherworking', 'Tailoring', 'Engineering', 'Enchanting', 'Alchemy'];
  const level = Math.min(60, Math.max(1, Number(UI.store.get('level', 1)) || 1));
  const state = { drops: UI.store.get('gpDrops', false), farm: UI.store.get('gpFarm', false), detail: UI.store.get('gpDetail', false), level, bracket: Math.min(5, Math.floor((level - 1) / 10)) };

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
      reach: zone => window.Route.reachable(zone, Site.faction),
      // No auction house: crafts wait until you can gather their reagents.
      matsAt: state.farm && window.LwPlan ? (item => window.LwPlan.matsAt(item.id, { faction: Site.faction, race: race(), profs: picked })) : null
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
      case 'crafted': return t((s.learn || {}).type === 'unreleased' ? 'gp.src.unreleased' : 'gp.src.crafted', { prof: s.profession, skill: (s.learn || {}).learnAt || s.yellow });
      case 'favor': return t('gp.src.favor', { prof: s.profession, n: (s.learn || {}).favor || '?' });
      case 'vendor': return t('gp.src.vendor', { npc: s.npc, zone: s.zone || '?' });
      case 'boss': return t('gp.src.boss', { npc: s.npc, zone: s.zone || '?' });
      case 'unknown': case 'unrecorded': return t('gp.src.unknown');
      default: return '';
    }
  }

  // Why it's on the path: how you get it and how long it lasts.
  function why(st) {
    if (st.alt) return t(st.alt.access === 'boss' ? 'gp.why.altDrop' : 'gp.why.alt', { name: st.alt.item.name });
    const parts = [t('gp.why.' + st.pick.access)];
    parts.push(st.until > 60 ? t('gp.lastsTo60') : t(st.lasts === 1 ? 'gp.lasts1' : 'gp.lasts', { n: st.lasts, until: st.until }));
    if (st.replaces) parts.push(t('gp.replaces', { name: st.replaces.item.name }));
    return parts.join(' · ');
  }

  const slotName = s => t('gp.slot.' + s);

  // Totems: Forever has very few before 60. All of them, with how each one
  // is had and whether your path uses it.
  const TOTEM_ACCESS = s => (s.type === 'quest' ? (s.zone === 'Shaman' ? 'class' : s.dungeon ? 'dquest' : 'quest')
    : s.type === 'crafted' ? ((s.learn || {}).type === 'favor' ? 'favor' : 'crafted') : s.type === 'drop' ? 'boss' : s.type);
  // How you'd get a totem: your faction's and race's way, class quest first.
  const TOTEM_ORDER = ['class', 'route', 'quest', 'dquest', 'crafted', 'favor', 'vendor', 'boss'];
  function totemWay(i) {
    return i.sources.filter(s => (!s.faction || s.faction === 'both' || s.faction === Site.faction) && s.type !== 'unknown' && s.type !== 'unrecorded')
      .filter(s => !(s.type === 'quest' && window.Route.otherStart(s.zone, Site.faction, race())))
      .sort((a, b) => TOTEM_ORDER.indexOf(TOTEM_ACCESS(a)) - TOTEM_ORDER.indexOf(TOTEM_ACCESS(b)))[0] || null;
  }
  function totemSource(i) {
    const s = totemWay(i);
    return s ? sourceText({ access: TOTEM_ACCESS(s), source: s }) : t('gp.src.unknown');
  }
  const totemLevel = i => Math.max(i.req || 1, (totemWay(i) || {}).rec || 0);
  function totems() {
    return gear().filter(i => i.slot === 'Relic' && (i.req || 0) < 60 && (i.equip || []).length)
      .filter(i => !(window.Route && i.sources.every(s => s.type === 'quest' && window.Route.otherStart(s.zone, Site.faction, race()))))
      .sort((a, b) => totemLevel(a) - totemLevel(b));
  }
  function totemPanel(plan) {
    const used = new Set(plan.slots.Relic.steps.map(st => st.pick.item.id));
    const list = totems();
    if (!list.length) return '';
    return '<details class="panel gp-more"><summary>' + t('gp.totems') + '</summary><p class="note-text dim">' + t('gp.totemsNote') + '</p>' +
      list.map(i => '<div class="gp-step' + (used.has(i.id) ? '' : ' gp-off') + '"><span class="gp-lv">' + totemLevel(i) + '</span>' +
        '<span class="gp-slot">' + (used.has(i.id) ? t('gp.inPath') : '') + '</span><div class="gp-main">' + UI.itemLink(i) +
        '<span class="wp-sub">' + totemSource(i) + '</span><span class="gp-why">' + window.I18N.client(i.equip[0]) + '</span></div></div>').join('') + '</details>';
  }

  // One row: level, slot, the piece and where it comes from; why, on demand.
  // A star marks a quest of a zone of your route (the old "don't miss").
  function stepRow(st, cls) {
    const i = st.pick.item;
    const star = st.pick.access === 'route' || st.alt;
    return '<div class="gp-step' + (st.alt ? ' gp-alt' : '') + (cls ? ' ' + cls : '') + '"><span class="gp-lv">' + st.level + '</span>' +
      '<span class="gp-slot">' + (star ? '<span class="gp-star" title="' + t('gp.starTitle') + '">★</span>' : '') + slotName(st.pick.slot) + '</span>' +
      '<div class="gp-main">' + UI.itemLink(i) + '<span class="wp-sub">' + sourceText(st.pick) +
      (st.pick.access === 'quest' ? ' · <span class="gp-off-tag">' + t('gp.offRoute') + '</span>' : '') + '</span>' +
      (st.pick.access === 'crafted' || st.pick.access === 'favor' ? (window.Professions && window.Professions.lwHow ? window.Professions.lwHow(st) : '') + craftMats(st) : '') +
      (st.alt || state.detail ? '<span class="gp-why">' + why(st) + '</span>' : '') + reportLink(st) + '</div></div>';
  }

  // A crafted piece of another profession than Leatherworking (that one has
  // its plan, js/professions.js): its materials, each with where it comes
  // from in a word, and what buying them costs against the quest gold of
  // that level (data/crafts.js, scripts/build-reagents.js).
  const PROF_KEY = { blacksmithing: 'Blacksmithing', tailoring: 'Tailoring', engineering: 'Engineering', enchanting: 'Enchanting', alchemy: 'Alchemy', leatherworking: 'Leatherworking', cooking: 'Cooking' };
  const coin = c => ((c >= 10000 ? Math.floor(c / 10000) + 'g ' : '') + (c % 10000 >= 100 ? Math.floor(c % 10000 / 100) + 's' : (c < 100 ? c + 'c' : ''))).trim();
  // The tag of a material and whether you get it yourself (then it isn't bought).
  function matTag(e, mine) {
    const g = e.g || {};
    if (g.smelt) return mine.includes('Mining') ? [t('gp.mat.smeltYou'), true] : [t('gp.mat.smelt')];
    if ((e.d || []).some(d => d[5] & 2)) return mine.includes('Skinning') ? [t('gp.mat.skinYou'), true] : [t('gp.mat.skin')];
    if (e.c) return mine.includes(PROF_KEY[e.c[0]]) ? [t('gp.mat.youMake'), true] : [t('gp.mat.prof', { prof: t('pr.lw.prof.' + e.c[0]) })];
    if (g.de) return mine.includes('Enchanting') ? [t('gp.mat.deYou'), true] : [t('gp.mat.de')];
    if (g.mined) return mine.includes('Mining') ? [t('gp.mat.minedYou'), true] : [t('gp.mat.mined')];
    if (e.d && e.d.length) return [t('gp.mat.drop')];
    if (g.inItem) return [t('gp.mat.inItem')];
    return [''];
  }
  const PRISTINE = [249427, 249428, 249429];
  function craftMats(st) {
    const C = window.CRAFT_DATA;
    const s = st.pick.source || {};
    if (!C || s.profession === 'Leatherworking') return '';
    const mats = (C.mats[st.pick.item.id] || []).filter(([m]) => !(C.items[m] || {}).v);
    if (!mats.length) return '';
    const mine = UI.store.get('profs', []);
    const buy = [];
    const list = mats.map(([m, n]) => {
      const e = C.items[m] || {};
      // Forever's Pristine Leather, Hide and Scale: rare, from skinning (named and rare beasts).
      const [tag, yours] = PRISTINE.includes(m) ? [t('gp.mat.pristine')] : matTag(e, mine);
      if (!yours) buy.push([m, n]);
      return n + ' ' + (e.n || '#' + m) + (tag ? ' <span class="dim">(' + tag + ')</span>' : '');
    }).join(', ');
    // The cost: only what you don't make or gather yourself.
    let cost = '';
    const P = C.prices;
    if (P && !buy.length) cost = '<span class="lw-cost lw-cheap">' + t('gp.mat.allYours') + '</span>';
    else if (P) {
      let total = 0;
      let missing = 0;
      buy.forEach(([m, n]) => { if (P.p[m]) total += P.p[m] * n; else missing++; });
      if (total) {
        const share = total / (C.gold[Math.min(59, Math.max(1, st.level)) - 1] || 1);
        const tier = share < 0.25 ? 'cheap' : share < 0.75 ? 'mid' : 'dear';
        cost = '<span class="lw-cost lw-' + tier + '">' + t('pr.lw.cost.' + tier) + ' · ' +
          t('pr.lw.cost.line', { cost: coin(total) + (missing ? '+' : ''), pct: Math.round(share * 100), n: st.level }) + '</span>';
      }
    }
    return '<span class="gp-lw">' + t('gp.mat.list', { list }) + cost + '</span>';
  }

  // "Wrong piece?": opens the feedback form with this step filled in.
  function reportLink(st) {
    if (!state.detail) return '';
    return window.Feedback.button(t('fb.wrongPiece'), 'piece', st.level + ' ' + st.pick.slot + ' ' + st.pick.item.name + ' #' + st.pick.item.id + ' (' + st.pick.access + ')', 'gp-report', st.pick.item.name);
  }

  // Brackets of ten levels; you look at one at a time.
  const BRACKETS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60]];
  const bracketOf = lvl => Math.min(5, Math.floor((Math.max(1, lvl) - 1) / 10));

  function render(container, ui, tabsHtml, onChange) {
    // The level may have changed in the setup screen.
    const stored = Math.min(60, Math.max(1, Number(UI.store.get('level', 1)) || 1));
    if (stored !== state.level) { state.level = stored; state.bracket = bracketOf(stored); }
    if (!window.GEAR_DATA) { container.innerHTML = tabsHtml + '<div class="caveat">' + t('gp.noData') + '</div>'; return; }
    const { plan, profs, picked } = compute();
    const raceLabel = race() ? t('race.' + race()) : t('wp.faction.' + Site.faction);
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Armas + '">' +
      '<div class="role">' + t('wp.role') + ' · ' + raceLabel + ' · ' + Site.spec + '</div>' +
      '<h2>' + t('gp.title') + '</h2><p>' + t('gp.intro') + '</p></div>';
    html += tabsHtml;

    // For whom: your Shaman (change it in the setup) and the drops toggle.
    html += '<div class="gp-for"><span>' + t('gp.for', { who: raceLabel + ' · ' + Site.spec, profs: picked.length ? picked.join(' + ') : t('setup.noProfsShort') }) +
      (!picked.length ? ' <span class="dim">' + t('gp.profsNone') + '</span>' : !profs.length ? ' <span class="dim">' + t('gp.profsGatherOnly') + '</span>' : '') + '</span>' +
      '<button class="btn" data-open-setup>' + t('home.change') + '</button>' +
      '<label class="chk chip-toggle" title="' + t('gp.dropsTitle') + '"><input type="checkbox" id="gpDrops"' + (state.drops ? ' checked' : '') + '> ' + t('gp.drops') + '</label>' +
      (profs.length ? '<label class="chk chip-toggle" title="' + t('gp.farmTitle') + '"><input type="checkbox" id="gpFarm"' + (state.farm ? ' checked' : '') + '> ' + t('gp.farm') + '</label>' : '') + '</div>';

    // Your level picks the bracket; the bracket strip jumps to another one.
    const br = state.bracket;
    const [lo, hi] = BRACKETS[br];
    html += '<div class="gp-levelbar"><label class="gp-level">' + t('gp.level') + ' <select id="gpLevel">' +
      Array.from({ length: 60 }, (_, k) => '<option' + (k + 1 === state.level ? ' selected' : '') + '>' + (k + 1) + '</option>').join('') + '</select></label>' +
      '<div class="seg gp-brackets">' + BRACKETS.map(([a, z], k) => '<button class="btn' + (k === br ? ' active' : '') + '" data-bracket="' + k + '">' + a + '–' + z + '</button>').join('') + '</div></div>';

    // The bracket: its zones, then every piece in level order, route quests
    // starred and free alternatives to crafts in between.
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => steps.push(st)));
    const alts = Object.values(plan.dontMiss).flat().filter(st => st.alt);
    const order = (a, b) => a.level - b.level || window.GearPlan.SLOTS.indexOf(a.pick.slot) - window.GearPlan.SLOTS.indexOf(b.pick.slot);
    const here = steps.concat(alts).filter(st => st.level >= lo && st.level <= hi).sort(order);
    const routeZones = [...new Set(window.Route.brackets(Site.faction, race()).filter(b => b.to >= lo && b.from <= hi).flatMap(b => b.zones))];
    const mine = state.level >= lo && state.level <= hi;
    html += '<div class="panel gp-bracket-panel"><div class="gp-br-head"><b>' + t('gp.levels', { lo, hi }) + '</b>' +
      (routeZones.length ? '<span class="dim">' + t('gp.zones', { list: routeZones.join(', ') }) + '</span>' : '') + '</div>' +
      (here.length ? here.map(st => stepRow(st, mine && st.level < state.level ? 'gp-done' : '')).join('') : '<p class="dim">' + t('gp.nothing') + '</p>') +
      '<div class="gp-br-foot"><span class="dim"><span class="gp-star">★</span> ' + t('gp.starTitle') + '</span>' +
      '<button class="btn" data-detail title="' + t('gp.whyTitle') + '">' + t(state.detail ? 'gp.hideWhy' : 'gp.showWhy') + '</button></div>' +
      '<div class="gp-br-nav">' + (br > 0 ? '<button class="btn" data-bracket="' + (br - 1) + '">← ' + BRACKETS[br - 1].join('–') + '</button>' : '<span></span>') +
      (br < 5 ? '<button class="btn" data-bracket="' + (br + 1) + '">' + BRACKETS[br + 1].join('–') + ' →</button>' : '') + '</div></div>';

    html += totemPanel(plan);
    html += ui.renderSources([
      'https://github.com/Questie/QuestieDB — ' + t('gp.srcQuestie'),
      'https://github.com/ATTWoWAddon/AllTheThings — ' + t('gp.srcAtt'),
      'https://www.wowhead.com/forever — ' + t('wp.srcWowhead'),
      'https://foreverchanges.pro — ' + t('wp.srcFc'),
      'https://www.classicwowforever.com — ' + t('gp.srcRecipes')
    ], t('gp.how', { upgrade: Math.round((window.GearPlan.UPGRADE - 1) * 100), favor: window.GearPlan.FAVOR_PER_BRACKET }));
    container.innerHTML = html;

    // The bracket strip slides sideways on phones: show the open one, from
    // the one before it (whole buttons on the left, the fade on the right).
    const strip = container.querySelector('.gp-brackets');
    const on = strip && strip.querySelector('.active');
    if (on && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = (on.previousElementSibling || on).offsetLeft - strip.offsetLeft - 14;
    container.querySelectorAll('[data-open-setup]').forEach(b => b.addEventListener('click', () => window.Setup.open()));
    const drops = container.querySelector('#gpDrops');
    if (drops) drops.addEventListener('change', e => { state.drops = e.target.checked; UI.store.set('gpDrops', state.drops); onChange(); });
    const farm = container.querySelector('#gpFarm');
    if (farm) farm.addEventListener('change', e => { setFarm(e.target.checked); onChange(); });
    container.querySelector('#gpLevel').addEventListener('change', e => {
      state.level = Number(e.target.value);
      state.bracket = bracketOf(state.level);
      UI.store.set('level', state.level);
      onChange();
    });
    container.querySelectorAll('[data-bracket]').forEach(b => b.addEventListener('click', () => {
      state.bracket = Number(b.dataset.bracket);
      onChange();
      const head = container.querySelector('.gp-levelbar');
      if (b.closest('.gp-br-nav') && head) head.scrollIntoView({ block: 'nearest' });
    }));
    container.querySelector('[data-detail]').addEventListener('click', () => { state.detail = !state.detail; UI.store.set('gpDetail', state.detail); onChange(); });
    const byId = new Map(steps.concat(alts).map(st => [String(st.pick.item.id), st]));
    const totemById = new Map(totems().map(i => [String(i.id), i]));
    UI.tip.bind(container, '[data-item]', a => {
      const st = byId.get(a.dataset.item);
      if (st) return UI.itemCard(st.pick.item, [sourceText(st.pick), why(st)]);
      const tot = totemById.get(a.dataset.item);
      return tot ? UI.itemCard(tot, [totemSource(tot)]) : null;
    });
  }

  // The Professions page shows the crafted part of the same path.
  function setFarm(on) { state.farm = !!on; UI.store.set('gpFarm', state.farm); }
  window.GearPath = { render, compute, sourceText, why, slotName, stepRow, craftMats, setFarm, farm: () => state.farm };
})();
