// Home: pick a spec, launch countdown, shortcuts to every page, latest news.
(function () {
  const I18N = window.I18N;
  const Site = window.Site;
  const UI = window.UI;
  const t = (key, vars) => I18N.t(key, vars);
  const { badge, pageHead, renderSources } = UI;
  const iconUrl = icon => UI.icon(icon);
  const smallIcon = icon => UI.icon(icon, 'medium');
  const SPEC_COLORS = Site.COLORS;
  const SPEC_ICONS = Site.SPEC_ICONS;
  const niceDate = iso => window.News.niceDate(iso);
  const tabs = Array.from(document.querySelectorAll('.spec-tab'));

  // Before the setup: the three specs.
  function specCards() {
    let html = '';
    html += '<h3 class="block-title">' + t('home.pick') + '</h3><div class="spec-cards">';
    Site.SPECS.forEach(spec => {
      const g = I18N.localize(window.GUIDE_DATA[spec]);
      const tree = window.SHAMAN_DATA.talents.trees.find(tr => tr.name === spec);
      // The summary's first sentences, enough for a line or two.
      const first = String(g.summary).replace(/<[^>]+>/g, '').split(/(?<=\.)\s/).reduce((a, x) => (a.length < 80 ? (a ? a + ' ' : '') + x : a), '');
      html += '<a class="spec-card' + (Site.spec === spec ? ' current' : '') + '" href="#Guia" data-go-spec="' + spec + '" style="--spec-color:' + SPEC_COLORS[spec] + ';--card-bg:url(' + UI.treeArt(tree.bg) + ')">' +
        '<img src="' + iconUrl(SPEC_ICONS[spec]) + '" alt="">' +
        '<span class="role">' + g.role + '</span><b>' + spec + '</b><span class="sc-line">' + first + '</span>' +
        '<span class="sc-go">' + t('home.goGuide') + '</span></a>';
    });
    html += '</div>';
    return html;
  }

  // ---------- after the setup: your plan for the level you're at ----------
  // Not a menu: what to do now (gear worth getting, talent points, crafts),
  // each block with a way into its page. Players asked for guidance that
  // starts where they are and suggests rather than dictates.
  const level = () => Math.min(60, Math.max(1, Number(UI.store.get('level', 1)) || 1));
  const CRAFTING = ['Blacksmithing', 'Leatherworking', 'Tailoring', 'Engineering', 'Enchanting', 'Alchemy'];
  let planSteps = new Map(); // item id -> step, for the tooltips

  // Gear steps of your path around your level: the few worth the trip.
  // Gain = how much better than what it replaces, times how long it lasts.
  function gearNow(steps, lvl) {
    const gain = st => (st.replaces ? st.pick.value / st.replaces.value - 1 : 1) * st.weight;
    let near = steps.filter(st => st.level >= lvl - 2 && st.level <= lvl + 5 && st.until > lvl);
    if (!near.length) near = steps.filter(st => st.level > lvl).sort((a, b) => a.level - b.level).slice(0, 2);
    return near.sort((a, b) => gain(b) - gain(a)).slice(0, 3).sort((a, b) => a.level - b.level);
  }

  function planBlock(n, title, body, href, more) {
    return '<section class="plan-block"><h4><span class="setup-n">' + n + '</span>' + title + '</h4>' + body +
      (href ? '<a class="plan-more" href="' + href + '">' + more + ' →</a>' : '') + '</section>';
  }

  function gearBlock(plan, lvl) {
    const GP = window.GearPath;
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => steps.push(st)));
    const picks = gearNow(steps, lvl);
    picks.forEach(st => planSteps.set(String(st.pick.item.id), st));
    const race = Site.race === 'any' ? null : Site.race;
    const zones = [...new Set(window.Route.brackets(Site.faction, race).filter(b => b.from <= lvl + 2 && b.to >= lvl).flatMap(b => b.zones))];
    const body = (zones.length ? '<p class="plan-zones">' + t('home.plan.zones', { list: zones.join(', ') }) + '</p>' : '') +
      (picks.length ? '<p class="note-text dim">' + t('home.plan.gearNote') + '</p>' + picks.map(st => GP.stepRow(st, st.level < lvl ? 'gp-done' : '')).join('')
        : '<p class="note-text">' + t('home.plan.gearNone') + '</p>');
    return planBlock(1, t('home.plan.gear', { n: lvl }), body, '#Equipo/camino', t('home.plan.gearMore'));
  }

  function talentBlock(lvl) {
    const build = I18N.localize(window.BUILD_DATA || []).filter(b => b.spec === Site.spec && b.order).sort((a, b) => b.level - a.level)[0];
    if (!build) return '';
    const trees = window.SHAMAN_DATA.talents.trees;
    const row = ([from, to, treeName, talent, rank], tag) => {
      const tal = trees.find(x => x.name === treeName).talents.find(x => x.name === talent);
      return '<div class="plan-row"><span class="plan-tag">' + tag + ' · ' + t('calc.lv') + ' ' + (from === to ? from : from + '–' + to) + '</span>' +
        '<span class="plan-tal"><img src="' + smallIcon(tal.icon) + '" alt=""><b>' + talent + '</b> <span class="dim">' + rank + '/' + tal.max + '</span></span></div>';
    };
    let body;
    if (lvl < 10) body = '<p class="note-text">' + t('home.plan.talentsAt10') + '</p>' + row(build.order[0], t('home.plan.first'));
    else {
      const now = build.order.find(([from, to]) => from <= lvl && lvl <= to);
      const next = build.order.find(([from]) => from > lvl);
      body = (now ? row(now, t('home.plan.now')) : '') + (next ? row(next, t('home.plan.next')) : '') +
        (!now && !next ? '<p class="note-text">' + t('home.plan.talentsDone') + '</p>' : '');
    }
    return planBlock(2, t('home.plan.talents'), '<p class="note-text dim">' + t('home.plan.talentsNote', { name: build.name }) + '</p>' + body,
      window.Calculator.linkFor(build), t('home.plan.talentsMore'));
  }

  // Crafts ahead: the skill each profession needs and by when, then the
  // pieces the gear block above doesn't already show.
  function profBlock(plan, lvl, shown) {
    const GP = window.GearPath;
    const profs = UI.store.get('profs', []);
    const makers = profs.filter(p => CRAFTING.includes(p));
    let body;
    if (!profs.length) body = '<p class="note-text">' + t('home.plan.profsNone') + '</p><button class="btn" data-open-setup>' + t('home.plan.pickProfs') + '</button>';
    else if (!makers.length) body = '<p class="note-text">' + t('home.plan.profsGather', { profs: profs.join(' + ') }) + '</p>';
    else {
      const crafts = [];
      Object.values(plan.slots).forEach(p => p.steps.forEach(st => { if (['crafted', 'favor'].includes(st.pick.access) && st.level >= lvl - 2 && st.until > lvl) crafts.push(st); }));
      crafts.sort((a, b) => a.level - b.level);
      const soon = crafts.filter(st => st.level <= lvl + 9).slice(0, 4);
      soon.forEach(st => planSteps.set(String(st.pick.item.id), st));
      if (!soon.length) body = '<p class="note-text">' + (crafts.length ? t('home.plan.craftLater', { n: crafts[0].level, profs: makers.join(' + ') }) : t('home.plan.craftNone', { profs: makers.join(' + ') })) + '</p>';
      else {
        // The skill to reach per profession: the highest the coming pieces ask for.
        const goals = makers.map(p => {
          const mine = soon.filter(st => st.pick.source.profession === p);
          if (!mine.length) return '';
          const top = mine.reduce((a, b) => ((b.pick.source.yellow || 0) > (a.pick.source.yellow || 0) ? b : a));
          return '<p class="plan-zones">' + t('home.plan.skillGoal', { prof: p, n: top.pick.source.yellow || '?', lvl: top.level }) + '</p>';
        }).join('');
        const rest = soon.filter(st => !shown.has(st.pick.item.id));
        body = goals + (rest.length ? rest.map(st => GP.stepRow(st, st.level < lvl ? 'gp-done' : '')).join('') : '<p class="note-text dim">' + t('home.plan.craftAbove') + '</p>');
      }
    }
    return planBlock(3, t('home.plan.profs'), body, '#Profesiones', t('home.plan.profsMore'));
  }

  function planCard() {
    const r = Site.race !== 'any' ? Site.races(Site.faction).find(x => x.race === Site.race) : null;
    const profs = UI.store.get('profs', []);
    const g = I18N.localize(window.GUIDE_DATA[Site.spec]);
    const lvl = level();
    planSteps = new Map();
    let html = '<div class="me-card plan-card" style="--spec-color:' + SPEC_COLORS[Site.spec] + '">' +
      '<div class="me-head">' + (r ? '<img src="' + iconUrl(r.icon) + '" alt="">' : '') + '<img src="' + iconUrl(SPEC_ICONS[Site.spec]) + '" alt="">' +
      '<div><b>' + (r ? t('race.' + r.race) : t('wp.faction.' + Site.faction)) + ' · ' + Site.spec + '</b><span class="dim">' + g.role + ' · ' +
      (profs.length ? profs.join(' + ') : t('setup.noProfsShort')) + '</span></div>' +
      '<button class="btn me-change" data-open-setup>' + t('home.change') + '</button></div>' +
      '<div class="plan-level"><label>' + t('home.plan.level') + ' <select data-plan-level>' +
      Array.from({ length: 60 }, (_, k) => '<option' + (k + 1 === lvl ? ' selected' : '') + '>' + (k + 1) + '</option>').join('') + '</select></label>' +
      '<span class="dim">' + t('home.plan.levelHint') + '</span></div>';
    if (window.GearPath && window.GEAR_DATA) {
      const { plan } = window.GearPath.compute();
      const gear = gearBlock(plan, lvl);
      const shown = new Set([...planSteps.values()].map(st => st.pick.item.id));
      html += '<div class="plan-blocks">' + gear + talentBlock(lvl) + profBlock(plan, lvl, shown) + '</div>';
    } else html += '<p class="page-loading dim">' + t('site.loading') + '</p>';
    html += '<a class="me-link plan-guide" href="#Guia"><img src="' + smallIcon(SPEC_ICONS[Site.spec]) + '" alt=""><span><b>' + t('home.me.guide', { spec: Site.spec }) + '</b><span>' + t('home.plan.guideSub') + '</span></span></a>';
    return '<h3 class="block-title">' + t('home.plan.title') + '</h3>' + html + '</div>';
  }

  const LAUNCH = new Date('2026-11-04T23:00:00Z');
  const BETA_END = new Date('2026-10-22T07:00:00Z');
  function renderHome() {
    const days = Math.ceil((LAUNCH - new Date()) / 86400000);
    const launch = days > 0 ? t('home.launchIn', { n: days }) : days === 0 ? t('home.launchToday') : t('home.launched');
    const setupDone = UI.store.get('setupDone', false);
    let html = setupDone ? planCard() : '';
    html += '<section class="home-hero"><div class="home-hero-text"><div class="role">' + t('home.kicker') + '</div>' +
      '<h2>' + t('home.title') + '</h2><p>' + t('home.tagline') + '</p></div>' +
      '<div class="countdown"><b>' + launch + '</b><span>' + t('home.launchDate') + '</span>' + (new Date() < BETA_END ? '<span class="dim">' + t('home.betaEnds') + '</span>' : '') + '</div></section>';

    if (!setupDone) html += specCards();

    html += '<div class="home-cols"><div><h3 class="block-title">' + t('home.pages') + '</h3><div class="page-cards">';
    tabs.filter(b => b.dataset.spec !== 'Guia').forEach(b => {
      const p = b.dataset.spec;
      html += '<a class="page-card" href="#' + p + '"><img src="' + b.querySelector('img').src.replace('/medium/', '/large/') + '" alt="">' +
        '<span><b>' + t('tab.' + p) + '</b><span>' + t('home.desc.' + p) + '</span></span></a>';
    });
    html += '</div></div>';

    const news = I18N.localize((window.NEWS_DATA || { site: [] }).site).slice(0, 2);
    html += '<div><h3 class="block-title">' + t('home.latest') + '</h3><div class="panel home-news">' +
      news.map(e => '<div class="news-entry"><div class="news-date">' + niceDate(e.day) + '</div><b class="news-title">' + e.title + '</b>' +
        '<p class="note-text">' + e.items[0] + '</p></div>').join('') +
      '<a class="home-more" href="#Novedades">' + t('home.allNews') + '</a></div></div></div>';
    return html;
  }

  window.Home = {
    render(app) {
      app.innerHTML = renderHome();
      app.querySelectorAll('[data-go-spec]').forEach(a => a.addEventListener('click', () => Site.set('spec', a.dataset.goSpec)));
      app.querySelectorAll('[data-open-setup]').forEach(b => b.addEventListener('click', () => window.Setup.open()));
      const sel = app.querySelector('[data-plan-level]');
      if (sel) sel.addEventListener('change', e => { UI.store.set('level', Number(e.target.value)); Site.setMany({}); });
      UI.tip.bind(app, '[data-item]', a => {
        const st = planSteps.get(a.dataset.item);
        return st ? UI.itemCard(st.pick.item, [window.GearPath.sourceText(st.pick), window.GearPath.why(st)]) : null;
      });
    }
  };
})();
