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
  const LEGACY = { Overview: 'Clase', Calculadora: 'Talentos', Armas: 'Equipo', Spellbook: 'Hechizos' };
  function upgradeHash() {
    const parts = hashParts();
    if (Site.SPECS.includes(parts[0])) { Site.set('spec', parts[0]); parts.splice(0, 1, 'Guia'); }
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
    const href = Site.feedbackLink(t('fb.kind.idea'));
    if (fb) fb.innerHTML = href ? '<a class="btn feedback-btn" href="' + href + '" target="_blank" rel="noopener">' + t('fb.button') + '</a><span class="dim">' + t('fb.note') + '</span>' : '';
  }

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
  function render(page) {
    draw(page);
    const active = app.querySelector('.subtab.active');
    if (active) active.parentElement.scrollLeft = active.offsetLeft - 16;
  }

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
    if (page === 'Hechizos') return window.Spellbook.render(app, helpers);
    if (page === 'Talentos') return window.Calculator.render(app, hashParts().slice(1), helpers);
    if (page === 'Novedades') return window.News.render(app);
    if (page === 'Inicio') return window.Home.render(app);
    if (page === 'Clase') return window.ClassPage.render(app);
    window.Guide.render(app, spec);
  }

  function selectPage(page) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.spec === page));
    currentPage = page;
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

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.spec;
      // Coming back to the calculator restores the build you left there.
      location.hash = page === 'Talentos' && window.Calculator.lastHash ? window.Calculator.lastHash : page;
    });
  });

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
    render(currentPage);
    window.scrollTo(0, y);
  });

  window.I18N.apply();
  renderLegend();
  renderPickers();
  selectPage(currentPage);
  // First visit: build your Shaman before anything else.
  if (!UI.store.get('setupDone', false)) window.Setup.open();
})();
