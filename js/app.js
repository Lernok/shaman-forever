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

  // Footer: the five dots once, with their names.
  function renderLegend() {
    const el = document.getElementById('confLegend');
    if (!el) return;
    el.innerHTML = t('conf.legend') + ' ' + UI.CONFIDENCE_KEYS.map(k =>
      '<span class="conf-key">' + UI.badge(k) + t('conf.' + k) + '</span>').join('');
  }

  // ---------- pages ----------

  function render(page) {
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
  }

  // Header: spec and faction pickers.
  function renderPickers() {
    document.getElementById('specPick').innerHTML = Site.SPECS.map(s =>
      '<button class="btn' + (Site.spec === s ? ' active' : '') + '" data-pick-spec="' + s + '" style="--spec-color:' + SPEC_COLORS[s] + '" title="' + s + '">' +
      '<img src="' + iconUrl(SPEC_ICONS[s]) + '" alt=""><span>' + s + '</span></button>').join('');
    document.getElementById('factionPick').innerHTML = Site.FACTIONS.map(f =>
      '<button class="btn ' + f + (Site.faction === f ? ' active' : '') + '" data-pick-faction="' + f + '">' + t('wp.faction.' + f) + '</button>').join('');
  }
  document.querySelector('.picker').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pickSpec) Site.set('spec', b.dataset.pickSpec);
    if (b.dataset.pickFaction) Site.set('faction', b.dataset.pickFaction);
  });
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
})();
