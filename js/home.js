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
  // Nothing within two levels: the first upgrade ahead.
  function aheadStep(steps, lvl) {
    const have = got();
    return steps.filter(st => st.level > lvl && !have.has(st.pick.item.id)).sort((a, b) => a.level - b.level || gainOf(b) - gainOf(a))[0] || null;
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
    // Below 10 there's no point to spend yet: the first one is "next".
    return {
      build,
      now: lvl < 10 ? null : at(build.order.find(([from, to]) => from <= lvl && lvl <= to)),
      next: at(lvl < 10 ? build.order[0] : build.order.find(([from]) => from > lvl))
    };
  }

  // A profession you picked whose trainer your route hasn't reached yet.
  function pendingProf(lvl) {
    const race = Site.race === 'any' ? null : Site.race;
    return UI.store.get('profs', []).filter(p => CRAFTING.includes(p) || p === 'Skinning')
      .map(p => Object.assign({ prof: p }, window.Route.profFrom(p, Site.faction, race)))
      .filter(x => x.level > lvl).sort((a, b) => a.level - b.level);
  }
  // Skinning learned, Leatherworking still ahead: what leather to keep for
  // the first Leatherworking piece of your path (its skinned materials).
  function leatherGoal(steps, lvl, learn) {
    const SK = window.SKINNING_DATA;
    const race = Site.race === 'any' ? null : Site.race;
    if (!SK || !learn || learn.prof !== 'Leatherworking' || learn.level <= lvl) return null;
    if (window.Route.profFrom('Skinning', Site.faction, race).level > lvl) return null;
    const first = steps.filter(st => (st.pick.source || {}).profession === 'Leatherworking' && st.until > lvl).sort((a, b) => a.level - b.level || gainOf(b) - gainOf(a))[0];
    const r = first && SK.recipes.find(x => x.id === first.pick.item.id);
    if (!r) return null;
    // Raw skins: cured hides count as their raw hide.
    const RAW = { 4231: 783, 4233: 4232, 4236: 4235 };
    const need = {};
    r.mats.forEach(([m, n]) => { const raw = RAW[m] || m; if (SK.skin.includes(raw)) need[raw] = (need[raw] || 0) + n; });
    if (!Object.keys(need).length) return null;
    return { item: first.pick.item.name, list: Object.entries(need).map(([m, n]) => n + ' ' + (SK.names[m] || '#' + m)).join(', ') };
  }
  // "Ya la aprendí": the button that moves a profession to now.
  const learnedBtn = p => '<button class="btn" data-learned="' + p + '">' + t('home.learned', { prof: p }) + '</button>';

  function nextCard(steps, lvl, tal) {
    const st = nextStep(steps, lvl);
    const ahead = !st ? aheadStep(steps, lvl) : null;
    const tree = window.SHAMAN_DATA.talents.trees.find(tr => tr.name === Site.spec);
    const art = tree ? ' style="--spec-color:' + SPEC_COLORS[Site.spec] + ';--hn-art:url(' + UI.treeArt(tree.bg) + ')"' : '';
    const head = '<span class="hn-kicker">' + t('home.next.kicker') + ' <span class="hn-level"><button class="hn-step" data-level-step="-1" aria-label="' + t('home.levelDown') + '"' + (lvl <= 1 ? ' disabled' : '') + '>−</button>' +
      '<label>' + t('home.next.level') + ' <select data-plan-level>' + Array.from({ length: 60 }, (_, k) => '<option' + (k + 1 === lvl ? ' selected' : '') + '>' + (k + 1) + '</option>').join('') + '</select></label>' +
      '<button class="hn-step" data-level-step="1" aria-label="' + t('home.levelUp') + '"' + (lvl >= 60 ? ' disabled' : '') + '>+</button></span></span>';
    if (st) {
      planSteps.set(String(st.pick.item.id), st);
      const i = st.pick.item;
      const gain = st.replaces ? t('home.next.better', { pct: Math.round((st.pick.value / st.replaces.value - 1) * 100) }) : t('home.next.empty');
      const lasts = st.until > 60 ? t('home.next.lastsLong') : t('home.next.lasts', { n: st.until });
      // Far ahead (beyond the next two levels): said as what comes, not as an order.
      const verb = st.level > lvl + 2 ? 'home.next.later' : ['crafted', 'favor'].includes(st.pick.access) ? 'home.next.make' : 'home.next.get';
      const slot = window.GearPath.slotName(st.pick.slot).toLowerCase();
      const forWhat = [t(st.level > lvl ? 'home.next.forSoon' : 'home.next.forNow', { slot, n: st.level }), st.replaces ? gain : t('home.next.nothingThere')].join(', ') + '. ' + lasts.charAt(0).toUpperCase() + lasts.slice(1) + '.';
      return '<section class="home-next"' + art + ' aria-labelledby="hnTitle"><div class="hn-text">' + head +
        '<h2 id="hnTitle">' + t(verb, { item: i.name, n: st.level }) + '</h2>' +
        '<p class="hn-how"><b>' + t('home.next.howLabel') + '</b> ' + window.GearPath.sourceText(st.pick) + '</p>' +
        '<p class="dim">' + forWhat + '</p>' +
        '<div class="hn-actions"><a class="btn hn-go" href="#Equipo/camino">' + t('home.next.how') + '</a>' +
        '<button class="btn" data-got="' + i.id + '">' + t('home.next.have') + '</button></div></div>' +
        '<div class="hn-card tooltip">' + UI.itemCard(i) + '</div></section>';
    }
    // No gear ahead: the talent that's due.
    if (tal && tal.now) {
      return '<section class="home-next"' + art + ' aria-labelledby="hnTitle"><div class="hn-text">' + head +
        '<h2 id="hnTitle">' + t('home.next.talent', { talent: tal.now.talent, rank: tal.now.rank, max: tal.now.max }) + '</h2>' +
        '<p class="dim">' + t('home.next.talentWhy') + '</p><div class="hn-actions"><a class="btn hn-go" href="' + window.Calculator.linkFor(tal.build) + '">' + t('home.plan.talentsMore') + '</a></div></div></section>';
    }
    // Nothing to change now: keep leveling; what comes next, in a line; and,
    // if a profession is still ahead, the way to say you learned it already.
    const pend = pendingProf(lvl);
    return '<section class="home-next"' + art + ' aria-labelledby="hnTitle"><div class="hn-text">' + head +
      '<h2 id="hnTitle">' + t('home.next.quiet') + '</h2>' +
      '<p class="dim">' + (ahead ? t('home.next.aheadLine', { item: ahead.pick.item.name, n: ahead.level }) : t('home.next.none')) + '</p>' +
      (pend.length ? '<p class="dim">' + t('home.next.learnLine', { prof: pend[0].prof, zone: pend[0].zone || '?', n: pend[0].level }) + '</p><div class="hn-actions">' + pend.map(x => learnedBtn(x.prof)).join('') + '</div>' : '') +
      '</div></section>';
  }

  // icon: a game icon name; tone: gear, talents or prof (its color).
  function tile(kind, title, line, href, more, icon, tone) {
    return '<a class="home-tile ht-' + tone + '" href="' + href + '"><span class="ht-head">' + (icon ? '<img src="' + smallIcon(icon) + '" alt="">' : '') +
      '<span class="ht-kind">' + kind + '</span></span><b>' + title + '</b>' +
      (line ? '<span class="dim">' + line + '</span>' : '') + '<span class="ht-more">' + more + '</span></a>';
  }

  function tiles(plan, steps, lvl, tal) {
    // Gear: the upgrades in the next five levels.
    // Not the one the big card already shows.
    const main = nextStep(steps, lvl);
    const soon = steps.filter(st => st.level > lvl && st.level <= lvl + 5 && st !== main).sort((a, b) => a.level - b.level);
    const gear = soon.length
      ? tile(t('home.tile.gear'), t('home.tile.gearNext'),
        '<span class="ht-list">' + soon.slice(0, 3).map(st => '<span><span class="ht-lv">' + t('home.tile.lv', { n: st.level }) + '</span> ' + st.pick.item.name + '</span>').join('') + '</span>',
        '#Equipo/camino', t('home.plan.gearMore'), soon[0].pick.item.icon, 'gear')
      : tile(t('home.tile.gear'), t('home.tile.gearNone', { lvl: lvl + 5 }), '', '#Equipo/camino', t('home.plan.gearMore'), 'inv_chest_chain', 'gear');
    // Talents: now and next.
    const tIcon = tal && ((tal.now || tal.next) || {}).icon;
    const talents = tal && (tal.now || tal.next)
      ? tile(t('home.tile.talents'), tal.now ? t('home.tile.talentNow', { talent: tal.now.talent, rank: tal.now.rank, max: tal.now.max }) : t(lvl < 10 ? 'home.tile.talentFirst' : 'home.tile.talentNext', { talent: tal.next.talent, n: tal.next.from }),
        tal.now && tal.next ? t('home.tile.talentThen', { talent: tal.next.talent, n: tal.next.from }) : lvl < 10 ? t('home.tile.talentFirstWhy') : '', window.Calculator.linkFor(tal.build), t('home.plan.talentsMore'), tIcon, 'talents')
      : tile(t('home.tile.talents'), t('home.plan.talentsDone'), '', '#Talentos', t('home.plan.talentsMore'), null, 'talents');
    // Profession: the skill the coming crafts ask for, or picking yours.
    const profs = UI.store.get('profs', []);
    const makers = profs.filter(p => CRAFTING.includes(p));
    let prof;
    if (!profs.length) prof = '<button class="home-tile ht-prof" data-open-setup><span class="ht-head"><img src="' + smallIcon('trade_leatherworking') + '" alt=""><span class="ht-kind">' + t('home.tile.profs') + '</span></span><b>' + t('home.tile.profsPick') + '</b><span class="dim">' + t('home.tile.profsWhy') + '</span><span class="ht-more">' + t('home.plan.pickProfs') + '</span></button>';
    else if (!makers.length) prof = tile(t('home.tile.profs'), t('home.tile.gatherOnly', { profs: I18N.profs(profs) }), '', '#Profesiones', t('home.plan.profsMore'), window.Setup.PROF_ICONS[profs[0]], 'prof');
    else {
      // No trainer of it yet on your route: where and when you learn it.
      const race = Site.race === 'any' ? null : Site.race;
      const learn = makers.map(p => Object.assign({ prof: p }, window.Route.profFrom(p, Site.faction, race))).sort((a, b) => a.level - b.level)[0];
      const goal = leatherGoal(steps, lvl, learn);
      if (goal) {
        return '<div class="home-tiles">' + gear + talents + '<div class="home-tile ht-prof"><span class="ht-head"><img src="' + smallIcon(window.Setup.PROF_ICONS.Skinning) + '" alt=""><span class="ht-kind">' + I18N.term('Skinning') + '</span></span>' +
          '<b>' + t('home.tile.gather') + '</b><span class="dim ht-keep">' + t('home.tile.gatherFor', { list: goal.list, item: goal.item, zone: learn.zone || '?' }) + '</span>' +
          '<span class="ht-actions">' + learnedBtn('Leatherworking') + '</span></div></div>';
      }
      if (learn && learn.level > lvl) {
        return '<div class="home-tiles">' + gear + talents + '<div class="home-tile ht-prof"><span class="ht-head"><img src="' + smallIcon(window.Setup.PROF_ICONS[learn.prof]) + '" alt=""><span class="ht-kind">' + I18N.term(learn.prof) + '</span></span>' +
          '<b>' + t('home.tile.learnAt', { prof: learn.prof, zone: learn.zone || '?', n: learn.level }) + '</b><span class="dim">' + t('home.tile.learnWhy', { n: learn.level }) + '</span>' +
          '<span class="ht-actions">' + learnedBtn(learn.prof) + '</span></div></div>';
      }
      // The next craft from your level on (one you're already wearing is behind you).
      const crafts = steps.filter(st => ['crafted', 'favor'].includes(st.pick.access) && st.level >= lvl && st.level <= lvl + 9 && !got().has(st.pick.item.id)).sort((a, b) => a.level - b.level);
      const first = crafts[0];
      const skill = first && ((first.pick.source.learn || {}).learnAt || first.pick.source.yellow);
      prof = first
        ? tile(I18N.term(first.pick.source.profession), skill > 1 ? t('home.tile.skillGoal', { prof: first.pick.source.profession, n: skill, lvl: first.level }) : t('home.tile.knownRecipe', { lvl: first.level }), t('home.tile.craftFirst', { item: first.pick.item.name }), '#Profesiones/plan', t('home.plan.profsMore'), window.Setup.PROF_ICONS[first.pick.source.profession], 'prof')
        : tile(I18N.profs(makers), t('home.tile.craftNone'), '', '#Profesiones/plan', t('home.plan.profsMore'), window.Setup.PROF_ICONS[makers[0]], 'prof');
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
    const now = new Date();
    const stress = now > new Date('2026-10-21T03:00:00Z') && now < STRESS[1];
    const key = stress ? 'home.status.stress' : now < BETA_END ? 'home.status.beta' : days > 0 ? 'home.status.betaOver' : 'home.status.live';
    const time = (stress ? STRESS[0] : LAUNCH).toLocaleTimeString(I18N.lang === 'es' ? 'es-AR' : 'en-US', { hour: 'numeric', minute: '2-digit' });
    return '<div class="home-status"><span class="hs-state">' + t(key + 'Tag') + '</span><span>' + t(key, { n: days, time }) + '</span>' +
      '<a href="#Guia">' + t('home.me.guide', { spec: Site.spec }) + '</a></div>';
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

  const LAUNCH = Site.LAUNCH;
  // The beta's last day is Oct 22 (no hour given). The stress test: Oct 21
  // from 14:00 PDT for a few hours, with the beta off.
  const BETA_END = new Date('2026-10-23T07:00:00Z');
  const STRESS = [new Date('2026-10-21T21:00:00Z'), new Date('2026-10-22T05:00:00Z')];
  function renderHome() {
    const setupDone = UI.store.get('setupDone', false);
    // With your Shaman picked: only what to do now (the pages are in the menu).
    if (setupDone) return planCard();
    const days = Math.ceil((LAUNCH - new Date()) / 86400000);
    const launch = days > 0 ? t('home.launchIn', { n: days }) : days === 0 ? t('home.launchToday') : t('home.launched');
    let html = '<section class="home-hero"><div class="home-hero-text"><div class="role">' + t('home.kicker') + '</div>' +
      '<h2>' + t('home.title') + '</h2><p>' + t('home.tagline') + '</p></div>' +
      '<div class="countdown"><b>' + launch + '</b><span>' + t('home.launchDate') + '</span>' + (new Date() < BETA_END ? '<span class="dim">' + t('home.betaEnds') + '</span>' : days > 0 ? '<span class="dim">' + t('home.betaOver') + '</span>' : '') + '</div></section>';
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
    talentNow,
    render(app) {
      app.innerHTML = renderHome();
      app.querySelectorAll('[data-go-spec]').forEach(a => a.addEventListener('click', () => Site.set('spec', a.dataset.goSpec)));
      app.querySelectorAll('[data-open-setup]').forEach(b => b.addEventListener('click', () => window.Setup.open()));
      app.querySelectorAll('[data-learned]').forEach(b => b.addEventListener('click', () => {
        const all = UI.store.get('learnedProfs', {});
        all[b.dataset.learned] = level();
        UI.store.set('learnedProfs', all);
        Site.setMany({});
      }));
      app.querySelectorAll('[data-level-step]').forEach(b => b.addEventListener('click', () => {
        const next = Math.min(60, Math.max(1, level() + Number(b.dataset.levelStep)));
        UI.store.set('level', next);
        Site.setMany({});
      }));
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
