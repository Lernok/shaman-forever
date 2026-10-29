// "Armá tu Shaman": race (it sets the faction), spec and professions, picked
// on the first visit and from the header chip any time after. Everything the
// site shows adjusts to these choices (js/site.js keeps them).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const UI = window.UI;
  const Site = window.Site;
  const PRIMARY = ['Leatherworking', 'Skinning', 'Blacksmithing', 'Mining', 'Tailoring', 'Enchanting', 'Engineering', 'Herbalism', 'Alchemy'];
  const PROF_ICONS = {
    Leatherworking: 'trade_leatherworking', Blacksmithing: 'trade_blacksmithing', Tailoring: 'trade_tailoring',
    Enchanting: 'trade_engraving', Engineering: 'trade_engineering', Skinning: 'inv_misc_pelt_wolf_01',
    Mining: 'trade_mining', Herbalism: 'spell_nature_naturetouchgrow', Alchemy: 'trade_alchemy'
  };
  // Races new to the class in Forever.
  const NEW_FOR_SHAMAN = ['Skyborne (Windshaper)', 'Dwarf'];
  let el = null;
  let draft = null;
  let firstRun = false;
  // The first visit goes in three short steps (race, spec, professions);
  // reopened from the header chip, everything is on one screen to edit.
  let step = 1;

  const img = (icon, cls) => '<img class="' + (cls || '') + '" src="' + UI.icon(icon) + '" alt="" loading="lazy">';
  const allRaces = () => Site.FACTIONS.flatMap(f => Site.races(f).map(r => Object.assign({ faction: f }, r)));

  function specLine(spec) {
    const g = window.I18N.localize(window.GUIDE_DATA[spec]);
    return { role: g.role, line: String(g.summary).replace(/<[^>]+>/g, '').split(/(?<=\.)\s/)[0] };
  }

  function raceGrid() {
    return '<div class="setup-grid">' +
      allRaces().map(r => '<button class="setup-opt' + (draft.race === r.race ? ' active' : '') + '" data-race="' + r.race + '" data-faction="' + r.faction + '">' +
        img(r.icon) + '<b>' + t('race.' + r.race) + '</b><span class="setup-sub ' + r.faction + '">' + t('wp.faction.' + r.faction) +
        (NEW_FOR_SHAMAN.includes(r.race) ? ' · ' + t('setup.newRace') : '') + '</span></button>').join('') +
      Site.FACTIONS.map(f => '<button class="setup-opt any' + (draft.race === 'any' && draft.faction === f ? ' active' : '') + '" data-race="any" data-faction="' + f + '">' +
        '<b>' + t('wp.faction.' + f) + '</b><span class="setup-sub">' + t('setup.anyRace') + '</span></button>').join('') + '</div>';
  }
  function specGrid() {
    return '<div class="setup-grid specs">' + Site.SPECS.map(s => {
      const l = specLine(s);
      const tree = window.SHAMAN_DATA.talents.trees.find(tr => tr.name === s);
      return '<button class="setup-opt spec' + (draft.spec === s ? ' active' : '') + '" data-spec="' + s + '" style="--spec-color:' + Site.COLORS[s] +
        (tree ? ';--spec-art:url(' + UI.treeArt(tree.bg) + ')' : '') + '">' +
        img(Site.SPEC_ICONS[s]) + '<b>' + s + '</b><span class="setup-sub">' + l.role + '</span><span class="setup-line">' + l.line + '</span></button>';
    }).join('') + '</div>';
  }
  function profGrid(pairs) {
    // The pairs that suit your spec first: one click picks both.
    return (pairs.length ? '<div class="setup-pairs"><span class="dim">' + t('setup.pairs', { spec: draft.spec }) + '</span>' + pairs.map(p =>
      '<button class="btn setup-pair' + (p.pair.split(' + ').every(x => draft.profs.includes(x)) ? ' active' : '') + '" data-pair="' + p.pair + '">' +
      p.pair.split(' + ').map(x => img(PROF_ICONS[x], 'pp-mini')).join('') + p.pair + ' <span class="dim">· ' + p.when + '</span></button>').join('') + '</div>' : '') +
      '<div class="setup-grid profs">' + PRIMARY.map(p => '<button class="setup-opt prof' + (draft.profs.includes(p) ? ' active' : '') + '" data-prof="' + p + '">' +
        img(PROF_ICONS[p]) + '<b>' + I18N.term(p) + '</b></button>').join('') +
      '<button class="setup-opt prof any' + (!draft.profs.length ? ' active' : '') + '" data-prof="none"><b>' + t('setup.noProfs') + '</b></button></div>';
  }

  function drawWizard(pairs) {
    const names = [t('setup.race'), t('setup.spec'), t('setup.profs')];
    let html = '<div class="setup setup-wizard" role="dialog" aria-modal="true" aria-labelledby="setupTitle">' +
      '<div class="setup-head"><div><h2 id="setupTitle">' + t('setup.firstTitle') + '</h2><p>' + t('setup.firstIntro') + '</p></div>' +
      '<div class="setup-head-btns"><button class="btn setup-lang" data-lang-switch title="' + t('lang.switchTitle') + '">' + t('lang.switch') + '</button>' +
      '<button class="btn setup-x" data-close aria-label="' + t('setup.close') + '">×</button></div></div>' +
      '<ol class="setup-progress" aria-label="' + t('setup.progress', { n: step }) + '">' + names.map((n, k) =>
        '<li class="' + (k + 1 < step ? 'done' : k + 1 === step ? 'now' : '') + '"' + (k + 1 === step ? ' aria-current="step"' : '') + '><span class="sp-dot">' + (k + 1 < step ? '✓' : k + 1) + '</span><span class="sp-name">' + n + '</span></li>').join('') + '</ol>';
    html += '<section class="setup-step">';
    if (step === 1) html += '<h3>' + t('setup.q.race') + '</h3>' + raceGrid();
    if (step === 2) html += '<h3>' + t('setup.q.spec') + '</h3>' + specGrid();
    if (step === 3) html += '<h3>' + t('setup.q.profs') + ' <span class="dim">' + t('setup.profsHint') + '</span></h3>' + profGrid(pairs);
    html += '</section><div class="setup-foot">' +
      '<button class="btn setup-skip" data-skip>' + t('setup.skip') + '</button>' +
      '<span class="setup-foot-go">' + (step > 1 ? '<button class="btn" data-back>← ' + t('setup.back') + '</button>' : '') +
      (step === 3 ? '<button class="btn setup-done" data-done>' + t('setup.start') + '</button>' : '<button class="btn setup-done" data-next>' + t('setup.next') + '</button>') +
      '</span></div></div>';
    el.innerHTML = html;
  }

  function draw() {
    const done = UI.store.get('setupDone', false);
    const pairs = window.GUIDE_DATA.Professions ? window.I18N.localize(window.GUIDE_DATA.Professions).pairs.filter(p => p.specs.includes(draft.spec)) : [];
    if (firstRun) return drawWizard(pairs);
    const short = false;
    let html = '<div class="setup' + (short ? ' setup-short' : '') + '" role="dialog" aria-modal="true" aria-labelledby="setupTitle">' +
      '<div class="setup-head"><div><h2 id="setupTitle">' + t(short ? 'setup.firstTitle' : 'setup.title') + '</h2><p>' + t(short ? 'setup.firstIntro' : 'setup.intro') + '</p></div>' +
      '<div class="setup-head-btns"><button class="btn setup-lang" data-lang-switch title="' + t('lang.switchTitle') + '">' + t('lang.switch') + '</button>' +
      '<button class="btn setup-x" data-close aria-label="' + t('setup.close') + '">×</button></div></div>';

    html += '<section class="setup-step"><h3><span class="setup-n">1</span>' + t('setup.race') + '</h3><div class="setup-grid">' +
      allRaces().map(r => '<button class="setup-opt' + (draft.race === r.race ? ' active' : '') + '" data-race="' + r.race + '" data-faction="' + r.faction + '">' +
        img(r.icon) + '<b>' + t('race.' + r.race) + '</b><span class="setup-sub ' + r.faction + '">' + t('wp.faction.' + r.faction) +
        (NEW_FOR_SHAMAN.includes(r.race) ? ' · ' + t('setup.newRace') : '') + '</span></button>').join('') +
      Site.FACTIONS.map(f => '<button class="setup-opt any' + (draft.race === 'any' && draft.faction === f ? ' active' : '') + '" data-race="any" data-faction="' + f + '">' +
        '<b>' + t('wp.faction.' + f) + '</b><span class="setup-sub">' + t('setup.anyRace') + '</span></button>').join('') + '</div></section>';

    html += '<section class="setup-step"><h3><span class="setup-n">2</span>' + t('setup.spec') + '</h3><div class="setup-grid specs">' +
      Site.SPECS.map(s => {
        const l = specLine(s);
        return '<button class="setup-opt spec' + (draft.spec === s ? ' active' : '') + '" data-spec="' + s + '" style="--spec-color:' + Site.COLORS[s] + '">' +
          img(Site.SPEC_ICONS[s]) + '<b>' + s + '</b><span class="setup-sub">' + l.role + '</span><span class="setup-line">' + l.line + '</span></button>';
      }).join('') + '</div></section>';

    if (!short) html += '<section class="setup-step"><h3><span class="setup-n">3</span>' + t('setup.profs') + ' <span class="dim">' + t('setup.profsHint') + '</span></h3>' +
      '<div class="setup-grid profs">' + PRIMARY.map(p => '<button class="setup-opt prof' + (draft.profs.includes(p) ? ' active' : '') + '" data-prof="' + p + '">' +
        img(PROF_ICONS[p]) + '<b>' + I18N.term(p) + '</b></button>').join('') +
      '<button class="setup-opt prof any' + (!draft.profs.length ? ' active' : '') + '" data-prof="none"><b>' + t('setup.noProfs') + '</b></button></div>' +
      (pairs.length ? '<div class="setup-pairs"><span class="dim">' + t('setup.pairs', { spec: draft.spec }) + '</span>' + pairs.map(p =>
        '<button class="btn setup-pair' + (p.pair.split(' + ').every(x => draft.profs.includes(x)) ? ' active' : '') + '" data-pair="' + p.pair + '">' +
        p.pair.split(' + ').map(x => img(PROF_ICONS[x], 'pp-mini')).join('') + p.pair + ' <span class="dim">· ' + p.when + '</span></button>').join('') + '</div>' : '') +
      '</section>';

    if (!short) html += '<section class="setup-step"><h3><span class="setup-n">4</span>' + t('setup.level') + ' <span class="dim">' + t('setup.levelHint') + '</span></h3>' +
      '<select class="setup-level" data-level>' + Array.from({ length: 60 }, (_, k) => '<option' + (k + 1 === draft.level ? ' selected' : '') + '>' + (k + 1) + '</option>').join('') + '</select></section>';

    html += '<div class="setup-foot"><button class="btn setup-done" data-done>' + t(short ? 'setup.start' : 'setup.done') + '</button>' +
      (short ? '<span class="dim setup-later">' + t('setup.later') + '</span>' : '') +
      (done ? '' : '<button class="btn setup-skip" data-skip>' + t('setup.skip') + '</button>') + '</div></div>';
    el.innerHTML = html;
  }

  // First visit only: how many finish the setup, skip it or close it.
  const count = what => firstRun && Site.countEvent && Site.countEvent('setup/' + what);

  // Closing it on the first visit counts as exploring without picking.
  function dismiss() {
    if (UI.store.get('setupDone', false)) return close();
    count('cerrar');
    UI.store.set('setupDone', true);
    close();
    Site.setMany({});
  }

  function onClick(e) {
    if (e.target === el && UI.store.get('setupDone', false)) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.race) { draft.race = b.dataset.race; draft.faction = b.dataset.faction; }
    if (b.dataset.spec) draft.spec = b.dataset.spec;
    if (b.hasAttribute('data-back')) step = Math.max(1, step - 1);
    if (b.hasAttribute('data-next')) step = Math.min(3, step + 1);
    if (b.dataset.prof === 'none') draft.profs = [];
    else if (b.dataset.prof) {
      const p = b.dataset.prof;
      draft.profs = draft.profs.includes(p) ? draft.profs.filter(x => x !== p) : draft.profs.concat(p).slice(-2);
    }
    if (b.dataset.pair) draft.profs = b.dataset.pair.split(' + ');
    if (b.hasAttribute('data-close')) return dismiss();
    if (b.hasAttribute('data-lang-switch')) { window.I18N.toggle(); draw(); return; }
    if (b.hasAttribute('data-skip')) { count('explorar'); UI.store.set('setupDone', true); close(); Site.setMany({}); return; }
    if (b.hasAttribute('data-done')) {
      count('listo: ' + draft.spec);
      // What people pick, to know where to polish first (aggregate counts only).
      const race = draft.race === 'any' ? 'cualquiera' : draft.race;
      count('raza: ' + race + ' (' + draft.faction + ')');
      count('raza y spec: ' + race + ' ' + draft.spec);
      count('profesiones: ' + (draft.profs.length ? draft.profs.slice().sort().join(' + ') : 'ninguna'));
      const before = JSON.stringify([Site.race, Site.faction, UI.store.get('profs', [])]);
      if (before !== JSON.stringify([draft.race, draft.faction, draft.profs])) UI.store.set('learnedProfs', {});
      UI.store.set('profs', draft.profs);
      UI.store.set('level', draft.level);
      UI.store.set('setupDone', true);
      close();
      Site.setMany({ faction: draft.faction, race: draft.race, spec: draft.spec });
      return;
    }
    const y = el.querySelector('.setup').scrollTop;
    draw();
    el.querySelector('.setup').scrollTop = y;
  }

  function open() {
    firstRun = !UI.store.get('setupDone', false);
    step = 1;
    draft = { race: Site.race, faction: Site.faction, spec: Site.spec, profs: firstRun ? [] : UI.store.get('profs', []).slice(), level: Number(UI.store.get('level', 1)) || 1 };
    if (!el) {
      el = document.createElement('div');
      el.className = 'setup-overlay';
      document.body.appendChild(el);
      el.addEventListener('click', onClick);
      el.addEventListener('change', e => { if (e.target.matches('[data-level]')) draft.level = Number(e.target.value); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) dismiss(); });
    }
    draw();
    el.hidden = false;
    document.body.classList.add('setup-open');
    el.querySelector('.setup').scrollTop = 0;
  }

  function close() {
    el.hidden = true;
    document.body.classList.remove('setup-open');
  }

  // The header chip: who you are, and the way back into the setup.
  function chipHtml() {
    const r = Site.race !== 'any' ? Site.races(Site.faction).find(x => x.race === Site.race) : null;
    const profs = UI.store.get('profs', []).filter(p => PRIMARY.includes(p));
    return (r ? img(r.icon, 'pc-icon') : '') + img(Site.SPEC_ICONS[Site.spec], 'pc-icon') +
      '<span class="pc-text"><b>' + (r ? t('race.' + r.race) : t('wp.faction.' + Site.faction)) + ' · ' + Site.spec + '</b>' +
      '<span class="pc-profs">' + (profs.length ? I18N.profs(profs) : t('setup.noProfsShort')) + '</span></span>' +
      profs.map(p => img(PROF_ICONS[p], 'pc-prof')).join('') + '<span class="pc-edit" aria-hidden="true">✎</span>';
  }

  window.Setup = { open, chipHtml, PROF_ICONS };
})();
