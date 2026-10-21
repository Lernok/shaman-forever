(function () {
  const SPEC_COLORS = window.Site.COLORS;
  const SPEC_ICONS = window.Site.SPEC_ICONS;
  const CLASS_ICON = window.Site.CLASS_ICON;

  const I18N = window.I18N;
  const Site = window.Site;
  const t = (key, vars) => I18N.t(key, vars);

  const UI = window.UI;

  const app = document.getElementById('app');
  const tabs = Array.from(document.querySelectorAll('.spec-tab'));
  // Home has no menu tab: the brand links to it.
  const PAGES = tabs.map(t => t.dataset.spec).concat('Inicio');
  // Hash is "#<Page>", "#<Page>/<section>" or, for the calculator,
  // "#Talentos/<level>/<build code>".
  function hashParts() { return location.hash.slice(1).split('/'); }
  // Links from before the pages were regrouped (one tab per spec, etc.).
  // Hechizos (and Spellbook before it) is now the Class page's first sections.
  const LEGACY = { Overview: 'Clase', Calculadora: 'Talentos', Armas: 'Equipo' };
  function upgradeHash() {
    const parts = hashParts();
    if (Site.SPECS.includes(parts[0])) { Site.set('spec', parts[0]); parts.splice(0, 1, 'Guia'); }
    else if (parts[0] === 'Hechizos' || parts[0] === 'Spellbook') parts.splice(0, 2, 'Clase', parts[1] === 'macros' ? 'macros' : Site.SPECS.includes(parts[1]) ? 'lista' : 'nivel');
    else if (LEGACY[parts[0]]) parts[0] = LEGACY[parts[0]];
    else return;
    history.replaceState(null, '', '#' + parts.join('/'));
  }
  upgradeHash();
  let currentPage = PAGES.includes(hashParts()[0]) ? hashParts()[0] : 'Inicio';
  let currentHash = location.hash;

  const iconUrl = icon => UI.icon(icon);
  const treeBg = tree => 'linear-gradient(rgba(12,13,16,.55), rgba(12,13,16,.82)), url(' + UI.treeArt(tree.bg) + ')';

  // Footer: the five dots once, with their names, and the feedback link.
  function renderLegend() {
    const el = document.getElementById('confLegend');
    if (!el) return;
    el.innerHTML = t('conf.legend') + ' ' + UI.CONFIDENCE_KEYS.map(k =>
      '<span class="conf-key">' + UI.badge(k) + t('conf.' + k) + '</span>').join('');
    const fb = document.getElementById('feedbackLink');
    const btn = window.Feedback.button(t('fb.button'), 'idea');
    if (fb) fb.innerHTML = btn ? btn + '<span class="dim">' + t('fb.note') + '</span>' : '';
  }

  // Errors on visitors' browsers reach the visit counter as events
  // ("error/Page: message"), once per message and visit: the dashboard shows
  // what breaks out there without anyone having to report it.
  const reported = new Set();
  function countEvent(path, title) {
    if (reported.has(path) || !Site.GOATCOUNTER) return;
    reported.add(path);
    const send = () => window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path, title: title || path, event: true });
    if (window.goatcounter && window.goatcounter.count) send();
    else setTimeout(send, 3000); // the counter's script may still be loading
  }
  // Other scripts count their own events too (the setup screen: done/skip/close).
  Site.countEvent = countEvent;
  function reportError(e, page) {
    const msg = String(e && e.message || e || 'error').replace(/\s+/g, ' ').slice(0, 120);
    countEvent('error/' + (page || currentPage) + ': ' + msg, msg);
  }
  window.addEventListener('error', e => reportError(e.error || e.message));
  window.addEventListener('unhandledrejection', e => reportError(e.reason));

  // Anonymous visit counter: one count per page shown (the hash names it).
  function countVisit(page) {
    if (!Site.GOATCOUNTER) return;
    const count = () => window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path: '/' + page, title: page });
    if (!window.goatcounter) {
      window.goatcounter = { no_onload: true };
      const sc = document.createElement('script');
      sc.async = true;
      sc.src = 'https://gc.zgo.at/count.js';
      sc.dataset.goatcounter = 'https://' + Site.GOATCOUNTER + '.goatcounter.com/count';
      sc.onload = count;
      document.head.appendChild(sc);
    } else count();
  }

  // ---------- pages ----------

  // After drawing: the section strip scrolls to the open section (it scrolls sideways on phones).
  // A page that breaks shows a message with the report button instead of a
  // blank screen, and the error is counted (reportError).
  // Pages that read the big data bundles (Site.NEEDS): home draws at once and
  // fills in your plan when they arrive; the others wait behind a short message.
  function render(page) {
    const need = Site.NEEDS[page] || [];
    if (!Site.has(need)) {
      const redraw = () => { if (currentPage !== page) return; const y = window.scrollY; render(page); window.scrollTo(0, y); };
      Site.need(need).then(redraw, e => { reportError(e, page); app.innerHTML = '<section class="page-error"><h2>' + t('err.title') + '</h2><p>' + t('site.loadFailed') + '</p></section>'; });
      if (page !== 'Inicio') { app.innerHTML = '<p class="page-loading dim">' + t('site.loading') + '</p>'; return; }
    }
    try {
      draw(page);
    } catch (e) {
      console.error(e);
      reportError(e, page);
      app.innerHTML = '<section class="page-error"><h2>' + t('err.title') + '</h2><p>' + t('err.text') + '</p>' +
        window.Feedback.button(t('fb.button'), 'bug', 'error: ' + String(e && e.message || e).slice(0, 200)) + '</section>';
      return;
    }
    const active = app.querySelector('.subtab.active');
    if (active) active.parentElement.scrollLeft = active.offsetLeft - 16;
  }

  // Phones: the page banner's intro shows two lines and a "Ver más" (the CSS
  // clamps it only on narrow screens; elsewhere nothing overflows and the
  // button stays out). Pages redraw their banner on their own too, so every
  // new banner is checked once.
  function clampBanner(sum) {
    sum.dataset.clamp = '1';
    const p = sum.querySelector('p');
    if (!p) return;
    sum.classList.add('clamped');
    if (p.scrollHeight <= p.clientHeight + 2) { sum.classList.remove('clamped'); return; }
    const btn = document.createElement('button');
    btn.className = 'sum-more';
    btn.textContent = t('site.more');
    btn.addEventListener('click', () => { btn.textContent = t(sum.classList.toggle('open') ? 'site.less' : 'site.more'); });
    sum.appendChild(btn);
  }
  new MutationObserver(() => app.querySelectorAll('.spec-summary:not([data-clamp])').forEach(clampBanner)).observe(app, { childList: true, subtree: true });

  function draw(page) {
    UI.tip.hide();
    const spec = Site.spec;
    // Every page but the class and news ones is about the chosen spec, and wears its color and art.
    const general = page === 'Clase' || page === 'Novedades' || page === 'Inicio';
    const color = general ? SPEC_COLORS.Clase : SPEC_COLORS[spec];
    const specColors = Object.assign({}, SPEC_COLORS, { Calculadora: color, Armas: color, Profesiones: color, Spellbook: color });
    const tree = window.SHAMAN_DATA.talents.trees.find(tr => tr.name === spec);
    const root = document.documentElement.style;
    root.setProperty('--spec-color', color);
    root.setProperty('--hero-bg', 'url(' + UI.treeArt(tree.bg) + ')');
    root.setProperty('--hero-icon', 'url(' + iconUrl(general ? CLASS_ICON : SPEC_ICONS[spec]) + ')');
    app.style.setProperty('--spec-color', color);
    document.body.dataset.page = page;
    const helpers = { badge: UI.badge, iconUrl, treeBg, renderSources: UI.renderSources, specColors };

    if (page === 'Profesiones') return window.Professions.render(app, helpers);
    if (page === 'Equipo') return window.Weapons.render(app, helpers);
    if (page === 'Talentos') return window.Calculator.render(app, hashParts().slice(1), helpers);
    if (page === 'Novedades') return window.News.render(app);
    if (page === 'Inicio') return window.Home.render(app);
    if (page === 'Clase') return window.ClassPage.render(app, helpers);
    window.Guide.render(app, spec);
  }

  function selectPage(page) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.spec === page));
    currentPage = page;
    renderBottom();
    currentHash = location.hash;
    render(page);
    countVisit(page);
  }

  // Header: your Shaman in one chip; it opens the setup.
  const chip = document.getElementById('profileChip');
  function renderPickers() {
    chip.innerHTML = window.Setup.chipHtml();
    chip.title = t('setup.change');
  }
  chip.addEventListener('click', () => window.Setup.open());
  // A race remembered from another faction (or one Forever removed) reads as "any".
  Site.race = Site.validRace(Site.race, Site.faction);
  Site.onChange(() => {
    renderPickers();
    const y = window.scrollY;
    render(currentPage);
    window.scrollTo(0, y);
  });

  // Coming back to the calculator restores the build you left there.
  const goTo = page => { location.hash = page === 'Talentos' && window.Calculator.lastHash ? window.Calculator.lastHash : page; };
  tabs.forEach(tab => tab.addEventListener('click', () => goTo(tab.dataset.spec)));

  // Phones: the four main pages in a bar at the bottom, within thumb reach,
  // and the rest under "More". Visible menus get used far more than hidden ones.
  const BOTTOM = ['Inicio', 'Equipo', 'Talentos', 'Guia'];
  const bottom = document.getElementById('bottomNav');
  const tabIcon = p => (p === 'Inicio' ? UI.icon(CLASS_ICON, 'medium') : tabs.find(x => x.dataset.spec === p).querySelector('img').src);
  function renderBottom() {
    if (!bottom) return;
    const more = PAGES.filter(p => !BOTTOM.includes(p));
    bottom.innerHTML = BOTTOM.map(p => '<button class="bn-item' + (p === currentPage ? ' active' : '') + '" data-page="' + p + '"><img src="' + tabIcon(p) + '" alt=""><span>' + t('tab.' + p) + '</span></button>').join('') +
      '<button class="bn-item' + (more.includes(currentPage) ? ' active' : '') + '" data-more aria-expanded="false"><span class="bn-dots" aria-hidden="true">•••</span><span>' + t('nav.more') + '</span></button>' +
      '<div class="bn-sheet" hidden>' + more.map(p => '<button class="bn-link' + (p === currentPage ? ' active' : '') + '" data-page="' + p + '"><img src="' + tabIcon(p) + '" alt="">' +
        '<span><b>' + t('tab.' + p) + '</b><span>' + t('home.desc.' + p) + '</span></span></button>').join('') + '</div>';
  }
  if (bottom) {
    bottom.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const sheet = bottom.querySelector('.bn-sheet');
      if (b.hasAttribute('data-more')) { sheet.hidden = !sheet.hidden; b.setAttribute('aria-expanded', String(!sheet.hidden)); return; }
      sheet.hidden = true;
      if (b.dataset.page === currentPage) window.scrollTo(0, 0);
      else goTo(b.dataset.page);
    });
    document.addEventListener('click', e => { if (!bottom.contains(e.target)) { const s = bottom.querySelector('.bn-sheet'); if (s) s.hidden = true; } });
  }

  window.addEventListener('hashchange', () => {
    upgradeHash();
    const page = hashParts()[0];
    if (!PAGES.includes(page)) return;
    if (page !== currentPage) { selectPage(page); window.scrollTo(0, 0); return; }
    if (page === 'Talentos') { selectPage(page); return; }
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

  // Language switch: re-render the current tab in place (hash and scroll stay).
  document.getElementById('langToggle').addEventListener('click', () => window.I18N.toggle());
  window.I18N.onChange(() => {
    const y = window.scrollY;
    renderPickers();
    renderLegend();
    renderBottom();
    render(currentPage);
    window.scrollTo(0, y);
  });

  window.I18N.apply();
  renderLegend();
  renderPickers();
  selectPage(currentPage);
  // Then the rest of the data, quietly, so the next page opens at once:
  // after the page you opened has its own (on a slow phone they'd share the line).
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
  Site.first.then(() => idle(() => Site.need(Site.LAZY).catch(() => {})));
  // First visit: build your Shaman before anything else.
  if (!UI.store.get('setupDone', false)) window.Setup.open();
})();
