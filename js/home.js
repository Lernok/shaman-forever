// Home. Before the setup: what the site is, the specs, every page, latest
// news. After it: what to do now (your next step and a line per area).
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

  // ---------- after the setup: what to do now ----------
  // One question answered: "what do I do now?". The next step (the biggest
  // upgrade around your level, else the talent that's due), then a line each
  // for gear, talents and your profession; the details live in their pages
  // (show the essential, the rest one click away).
  const level = () => Math.min(60, Math.max(1, Number(UI.store.get('level', 1)) || 1));
  const CRAFTING = ['Blacksmithing', 'Leatherworking', 'Tailoring', 'Engineering', 'Enchanting', 'Alchemy'];
  let planSteps = new Map(); // item id -> step, for the tooltips

  // Gain = how much better than what it replaces, times how long it lasts.
  const gainOf = st => (st.replaces ? st.pick.value / st.replaces.value - 1 : 1) * st.weight;
  // Pieces you said you have ("Ya la tengo"): the next step moves on.
  const got = () => new Set(UI.store.get('gotItems', []));

  function allSteps(plan) {
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => steps.push(st)));
    return steps;
  }

  // The biggest upgrade you can get now or within two levels, not had yet.
  function nextStep(steps, lvl) {
    const have = got();
    return steps.filter(st => st.level <= lvl + 2 && st.until > lvl && !have.has(st.pick.item.id))
      .sort((a, b) => gainOf(b) - gainOf(a))[0] || null;
  }

  function talentNow(lvl) {
    const build = I18N.localize(window.BUILD_DATA || []).filter(b => b.spec === Site.spec && b.order).sort((a, b) => b.level - a.level)[0];
    if (!build) return null;
    const trees = window.SHAMAN_DATA.talents.trees;
    const at = row => {
      if (!row) return null;
      const [from, to, treeName, talent, rank] = row;
      const tal = trees.find(x => x.name === treeName).talents.find(x => x.name === talent);
      return { from, to, talent, rank, max: tal.max, icon: tal.icon };
    };
    return {
      build,
      now: at(lvl < 10 ? build.order[0] : build.order.find(([from, to]) => from <= lvl && lvl <= to)),
      next: at(build.order.find(([from]) => from > Math.max(lvl, 9)))
    };
  }

  function nextCard(steps, lvl, tal) {
    const st = nextStep(steps, lvl);
    const head = '<span class="hn-kicker">' + t('home.next.kicker') + ' · <label class="hn-level">' + t('home.next.level') +
      ' <select data-plan-level>' + Array.from({ length: 60 }, (_, k) => '<option' + (k + 1 === lvl ? ' selected' : '') + '>' + (k + 1) + '</option>').join('') + '</select></label></span>';
    if (st) {
      planSteps.set(String(st.pick.item.id), st);
      const i = st.pick.item;
      const gain = st.replaces ? t('home.next.better', { pct: Math.round((st.pick.value / st.replaces.value - 1) * 100) }) : t('home.next.empty');
      const lasts = st.until > 60 ? t('home.next.lastsLong') : t('home.next.lasts', { n: st.until });
      const verb = ['crafted', 'favor'].includes(st.pick.access) ? 'home.next.make' : 'home.next.get';
      return '<section class="home-next" aria-labelledby="hnTitle"><div class="hn-text">' + head +
        '<h2 id="hnTitle">' + t(verb, { item: i.name }) + '</h2>' +
        '<p class="dim">' + t(st.level > lvl ? 'home.next.whySoon' : 'home.next.why', { slot: window.GearPath.slotName(st.pick.slot), n: st.level }) + '</p>' +
        '<div class="hn-actions"><a class="btn hn-go" href="#Equipo/camino">' + t('home.next.how') + '</a>' +
        '<button class="btn" data-got="' + i.id + '">' + t('home.next.have') + '</button></div></div>' +
        '<div class="hn-item">' + UI.itemLink(i) + '<span class="dim">' + window.GearPath.slotName(st.pick.slot) + ' · ' + window.GearPath.sourceText(st.pick) + '</span>' +
        '<span class="hn-gain">' + gain + ' · ' + lasts + '</span></div></section>';
    }
    // No gear ahead: the talent that's due.
    if (tal && tal.now) {
      return '<section class="home-next" aria-labelledby="hnTitle"><div class="hn-text">' + head +
        '<h2 id="hnTitle">' + t('home.next.talent', { talent: tal.now.talent, rank: tal.now.rank, max: tal.now.max }) + '</h2>' +
        '<p class="dim">' + t('home.next.talentWhy') + '</p><div class="hn-actions"><a class="btn hn-go" href="' + window.Calculator.linkFor(tal.build) + '">' + t('home.plan.talentsMore') + '</a></div></div></section>';
    }
    return '<section class="home-next"><div class="hn-text">' + head + '<h2>' + t('home.next.none') + '</h2></div></section>';
  }

  function tile(kind, title, line, href, more, attrs) {
    return '<a class="home-tile" href="' + href + '"' + (attrs || '') + '><span class="ht-kind">' + kind + '</span><b>' + title + '</b>' +
      (line ? '<span class="dim">' + line + '</span>' : '') + '<span class="ht-more">' + more + ' →</span></a>';
  }

  function tiles(plan, steps, lvl, tal) {
    // Gear: the upgrades in the next five levels.
    const soon = steps.filter(st => st.level > lvl && st.level <= lvl + 5).sort((a, b) => a.level - b.level);
    const gear = soon.length
      ? tile(t('home.tile.gear'), t(soon.length === 1 ? 'home.tile.gearOne' : 'home.tile.gearN', { n: soon.length, lvl: lvl + 5 }),
        soon.slice(0, 2).map(st => st.pick.item.name + ' (' + st.level + ')').join(', '), '#Equipo/camino', t('home.plan.gearMore'))
      : tile(t('home.tile.gear'), t('home.tile.gearNone', { lvl: lvl + 5 }), '', '#Equipo/camino', t('home.plan.gearMore'));
    // Talents: now and next.
    const talents = tal && (tal.now || tal.next)
      ? tile(t('home.tile.talents'), tal.now ? t('home.tile.talentNow', { talent: tal.now.talent, rank: tal.now.rank, max: tal.now.max }) : t('home.tile.talentNext', { talent: tal.next.talent, n: tal.next.from }),
        tal.now && tal.next ? t('home.tile.talentThen', { talent: tal.next.talent, n: tal.next.from }) : '', window.Calculator.linkFor(tal.build), t('home.plan.talentsMore'))
      : tile(t('home.tile.talents'), t('home.plan.talentsDone'), '', '#Talentos', t('home.plan.talentsMore'));
    // Profession: the skill the coming crafts ask for, or picking yours.
    const profs = UI.store.get('profs', []);
    const makers = profs.filter(p => CRAFTING.includes(p));
    let prof;
    if (!profs.length) prof = '<button class="home-tile" data-open-setup><span class="ht-kind">' + t('home.tile.profs') + '</span><b>' + t('home.tile.profsPick') + '</b><span class="dim">' + t('home.tile.profsWhy') + '</span><span class="ht-more">' + t('home.plan.pickProfs') + ' →</span></button>';
    else if (!makers.length) prof = tile(t('home.tile.profs'), t('home.tile.gatherOnly', { profs: profs.join(' + ') }), '', '#Profesiones', t('home.plan.profsMore'));
    else {
      // The next craft from your level on (one you're already wearing is behind you).
      const crafts = steps.filter(st => ['crafted', 'favor'].includes(st.pick.access) && st.level >= lvl && st.level <= lvl + 9 && !got().has(st.pick.item.id)).sort((a, b) => a.level - b.level);
      const first = crafts[0];
      const skill = first && ((first.pick.source.learn || {}).learnAt || first.pick.source.yellow);
      prof = first
        ? tile(first.pick.source.profession, t('home.tile.skillGoal', { n: skill || '?', lvl: first.level }), t('home.tile.craftFirst', { item: first.pick.item.name }), '#Profesiones/plan', t('home.plan.profsMore'))
        : tile(makers.join(' + '), t('home.tile.craftNone'), '', '#Profesiones/plan', t('home.plan.profsMore'));
    }
    return '<div class="home-tiles">' + gear + talents + prof + '</div>';
  }

  // What changed since your last visit (site news newer than it), once.
  function sinceStrip() {
    const news = I18N.localize((window.NEWS_DATA || { site: [] }).site);
    const last = UI.store.get('newsSeen', null);
    if (!news.length) return '';
    if (!last) { UI.store.set('newsSeen', news[0].day); return ''; }
    const fresh = news.filter(e => e.day > last);
    if (!fresh.length) return '';
    return '<div class="home-since"><span class="hs-tag">' + t('home.since') + '</span><span>' + fresh.slice(0, 2).map(e => e.title).join(' · ') + '</span>' +
      '<a href="#Novedades">' + t('home.sinceAll') + '</a><button class="hs-x" data-news-seen="' + news[0].day + '" aria-label="' + t('home.sinceClose') + '">×</button></div>';
  }

  // The beta and the launch, said as of today.
  function launchLine() {
    const days = Math.ceil((LAUNCH - new Date()) / 86400000);
    const key = new Date() < BETA_END ? 'home.status.beta' : days > 0 ? 'home.status.betaOver' : 'home.status.live';
    return '<div class="home-status"><span class="hs-state">' + t(key + 'Tag') + '</span><span>' + t(key, { n: days }) + '</span>' +
      '<a href="#Guia">' + t('home.me.guide', { spec: Site.spec }) + ' →</a></div>';
  }

  function planCard() {
    const lvl = level();
    planSteps = new Map();
    if (!(window.GearPath && window.GEAR_DATA)) return '<p class="page-loading dim">' + t('site.loading') + '</p>';
    const { plan } = window.GearPath.compute();
    const steps = allSteps(plan);
    const tal = talentNow(lvl);
    return sinceStrip() + nextCard(steps, lvl, tal) + tiles(plan, steps, lvl, tal) + launchLine();
  }

  const LAUNCH = new Date('2026-11-04T23:00:00Z');
  const BETA_END = new Date('2026-10-22T07:00:00Z');
  function renderHome() {
    const setupDone = UI.store.get('setupDone', false);
    // With your Shaman picked: only what to do now (the pages are in the menu).
    if (setupDone) return planCard();
    const days = Math.ceil((LAUNCH - new Date()) / 86400000);
    const launch = days > 0 ? t('home.launchIn', { n: days }) : days === 0 ? t('home.launchToday') : t('home.launched');
    let html = '<section class="home-hero"><div class="home-hero-text"><div class="role">' + t('home.kicker') + '</div>' +
      '<h2>' + t('home.title') + '</h2><p>' + t('home.tagline') + '</p></div>' +
      '<div class="countdown"><b>' + launch + '</b><span>' + t('home.launchDate') + '</span>' + (new Date() < BETA_END ? '<span class="dim">' + t('home.betaEnds') + '</span>' : '<span class="dim">' + t('home.betaOver') + '</span>') + '</div></section>';
    html += specCards();

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
      app.querySelectorAll('[data-got]').forEach(b => b.addEventListener('click', () => {
        UI.store.set('gotItems', UI.store.get('gotItems', []).concat(Number(b.dataset.got)));
        window.Home.render(app);
      }));
      app.querySelectorAll('[data-news-seen]').forEach(b => b.addEventListener('click', () => {
        UI.store.set('newsSeen', b.dataset.newsSeen);
        b.closest('.home-since').remove();
      }));
      const sel = app.querySelector('[data-plan-level]');
      if (sel) sel.addEventListener('change', e => { UI.store.set('level', Number(e.target.value)); Site.setMany({}); });
      UI.tip.bind(app, '[data-item]', a => {
        const st = planSteps.get(a.dataset.item);
        return st ? UI.itemCard(st.pick.item, [window.GearPath.sourceText(st.pick), window.GearPath.why(st)]) : null;
      });
    }
  };
})();
