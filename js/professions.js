// Professions tab: which pair suits each spec and why, the new Forever systems
// (Merchant's Favor, camping, Legacy points) and, per profession, every crafted
// item a Shaman can use with how its recipe is learned.
// Data: data/guides/professions.json (content) + data/professions.js (items).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  let ui = null;
  let container = null;
  const state = { spec: 'all', profession: 'Leatherworking', role: 'all', rareOnly: true };
  const PROFESSIONS = ['Leatherworking', 'Blacksmithing', 'Tailoring', 'Enchanting', 'Engineering'];
  const ROLES = ['all', 'melee', 'caster'];

  // classicwowforever's "how to learn" lines are formulaic; translate the
  // fixed parts and keep names (vendors, factions, zones) as they are.
  const REP = { Friendly: 'Amistoso', Honored: 'Honorable', Revered: 'Reverenciado', Exalted: 'Exaltado' };
  function learnText(text) {
    if (!text) return t('pr.learnUnknown');
    if (window.I18N.lang !== 'es') return text;
    return text
      .replace(/^Pattern\b/, 'Patrón').replace(/^Plans\b/, 'Planos').replace(/^Formula\b/, 'Fórmula')
      .replace(/^Schematic\b/, 'Esquema').replace(/^Recipe\b/, 'Receta')
      .replace(/ for (\d+) Merchant.s Favor/, ' por $1 de Merchant\'s Favor')
      .replace(/^Trainer, (.*), learn at (≈?\d+)/, 'Entrenador, $1, se aprende con $2')
      .replace(/^Known from the start/, 'Se conoce desde el principio')
      .replace(/[Ss]ource not found yet/, 'fuente todavía desconocida')
      .replace(/, binds on pickup/, ', se liga al recogerlo')
      .replace(/, needs reputation/, ', pide reputación')
      .replace(/, dungeon vendor/, ', vendedor de dungeon')
      .replace(/world drop or fishing/, 'drop del mundo o pesca').replace(/world drop/, 'drop del mundo')
      .replace(/drop or fishing/, 'drop o pesca')
      .replace(/drops from (.+?) in /, 'cae de $1 en ').replace(/drops from /, 'cae de ').replace(/drops in /, 'cae en ')
      .replace(/: from (.+?) in /, ': de $1 en ')
      .replace(/ and (\d+) more/, ' y $1 más')
      .replace(/\) or /g, ') o ')
      .replace(/^Vendor$/, 'Vendedor')
      .replace(/, (Friendly|Honored|Revered|Exalted)/, (m, r) => ', ' + REP[r]);
  }

  function statsText(i) {
    const I = window.I18N;
    const parts = Object.entries(i.stats || {}).map(([k, v]) => '+' + v + ' ' + I.term(k.charAt(0).toUpperCase() + k.slice(1)));
    const b = i.bonus || {};
    if (b.spellPower) parts.push('+' + b.spellPower + ' ' + I.term('Spell Power'));
    if (b.healing) parts.push('+' + b.healing + ' ' + t('pr.healing'));
    if (b.attackPower) parts.push('+' + b.attackPower + ' ' + I.term('Attack Power'));
    if (b.crit) parts.push('+' + b.crit + '% ' + I.term('Critical Strike'));
    if (b.hit) parts.push('+' + b.hit + '% ' + I.term('Hit'));
    if (b.mp5) parts.push('+' + b.mp5 + ' MP5');
    return parts.join(', ');
  }

  function kindText(i) {
    if (i.dps) return i.kind + ' · ' + window.I18N.num(i.dps.toFixed(1)) + ' DPS';
    return i.kind + (i.armor ? ' · ' + i.armor + ' ' + t('pr.armor') : '');
  }

  function itemsFor() {
    const data = window.PROFESSION_DATA && window.PROFESSION_DATA.professions[state.profession];
    return (data || []).filter(i => {
      if (state.rareOnly && i.quality < 3) return false;
      if (state.role === 'melee' && !(i.role === 'melee' || i.role === 'hybrid')) return false;
      if (state.role === 'caster' && !(i.role === 'caster' || i.role === 'hybrid')) return false;
      return true;
    });
  }

  function bracket(level) {
    if (level < 10) return '1–9';
    const lo = Math.floor(level / 10) * 10;
    return lo + '–' + (lo + 9 > 60 ? 60 : lo + 9);
  }

  function renderItems() {
    const list = itemsFor();
    let html = '<div class="pr-filters">' +
      '<div class="seg">' + PROFESSIONS.map(p => '<button class="btn' + (state.profession === p ? ' active' : '') + '" data-prof="' + p + '">' + p + '</button>').join('') + '</div>' +
      '<div class="seg">' + ROLES.map(r => '<button class="btn' + (state.role === r ? ' active' : '') + '" data-role="' + r + '">' + t('pr.role.' + r) + '</button>').join('') + '</div>' +
      '<label class="chk"><input type="checkbox" id="prRare"' + (state.rareOnly ? ' checked' : '') + '> ' + t('pr.rareOnly') + '</label>' +
      '</div>';
    if (!list.length) return html + '<p class="note-text">' + t('pr.none') + '</p>';
    html += '<p class="note-text dim">' + t('pr.count', { n: list.length }) + '</p>';
    let current = null;
    html += '<div class="table-wrap"><table class="cmp pr-table"><thead><tr><th>' + t('pr.colLevel') + '</th><th>' + t('pr.colItem') + '</th><th>' + t('wp.colStats') + '</th><th>' + t('pr.colLearn') + '</th></tr></thead><tbody>';
    list.forEach(i => {
      const b = bracket(i.req);
      if (b !== current) { current = b; html += '<tr class="pr-bracket"><td colspan="4">' + t('pr.bracket', { range: b }) + '</td></tr>'; }
      html += '<tr><td class="num">' + i.req + '</td>' +
        '<td><a class="q' + i.quality + '" href="https://www.wowhead.com/forever/item=' + i.id + '" target="_blank" rel="noopener">' + i.name + '</a>' +
          (i.isNew ? ' <span class="wp-new">' + t('wp.newInForever') + '</span>' : '') +
          '<span class="wp-sub">' + kindText(i) + (i.bind === 'pickup' ? ' · BoP' : i.bind === 'equip' ? ' · BoE' : '') +
          (i.mailFrom40 ? ' · <span class="pr-warn">' + t('pr.mail40') + '</span>' : '') + '</span></td>' +
        '<td>' + (statsText(i) || '—') + '</td>' +
        '<td>' + learnText(i.learn.text) + '<span class="wp-sub">' + t('pr.skill', { orange: i.skill[0], grey: i.skill[3] }) + '</span></td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  function renderAll() {
    const g = window.I18N.localize(window.GUIDE_DATA.Professions);
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Profesiones + '">' +
      '<div class="role">' + t('pr.role') + '</div><h2>' + t('pr.title') + '</h2><p>' + g.intro + '</p></div>';

    // Recommended pairs, filtered by spec.
    const specs = ['all', 'Enhancement', 'Elemental', 'Restoration'];
    html += '<div class="panel"><h3>' + t('pr.pairs') + '</h3>' +
      '<div class="seg pr-specs">' + specs.map(s => '<button class="btn' + (state.spec === s ? ' active' : '') + '" data-spec-filter="' + s + '">' + (s === 'all' ? t('pr.allSpecs') : s) + '</button>').join('') + '</div>' +
      '<div class="pr-pairs">' + g.pairs.filter(p => state.spec === 'all' || p.specs.includes(state.spec)).map(p =>
        '<div class="pr-pair"><div class="pr-pair-head"><b>' + p.pair + '</b><span class="pr-when">' + p.when + '</span></div>' +
        '<div class="pr-pair-specs">' + p.specs.map(s => '<span style="--spec-color:' + ui.specColors[s] + '">' + s + '</span>').join('') + '</div>' +
        '<p>' + p.why + '</p></div>').join('') + '</div>' +
      '<p class="note-text dim">' + g.pairsNote + '</p></div>';

    // New systems.
    html += '<div class="panel" style="margin-top:16px"><h3>' + t('pr.systems') + '</h3><ul class="plain">' +
      g.systems.map(s => '<li><b>' + s.title + '.</b> ' + s.fact + ' ' + ui.badge(s.confidence) +
        ' <a class="src" href="' + s.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a></li>').join('') + '</ul></div>';

    // Crafted items per profession.
    html += '<div class="panel" style="margin-top:16px"><h3>' + t('pr.items') + '</h3>' +
      '<p class="note-text">' + t('pr.itemsIntro') + '</p><div id="prItems">' + renderItems() + '</div></div>';

    // How to level them.
    html += '<div class="panel" style="margin-top:16px"><h3>' + t('pr.leveling') + '</h3><ul class="plain">' +
      g.leveling.map(l => '<li><a href="' + l.url + '" target="_blank" rel="noopener">' + l.site + '</a> — ' + l.note + '</li>').join('') + '</ul></div>';

    html += ui.renderSources(g.sources);
    html += '<div class="caveat">' + g.caveat + '</div>';
    container.innerHTML = html;
    bind();
  }

  function bind() {
    container.querySelectorAll('[data-spec-filter]').forEach(b => b.addEventListener('click', () => { state.spec = b.dataset.specFilter; renderAll(); }));
    bindItems();
  }

  // The items block re-renders on its own so the page doesn't jump.
  function bindItems() {
    const box = container.querySelector('#prItems');
    const rerender = () => { box.innerHTML = renderItems(); bindItems(); };
    box.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', () => { state.profession = b.dataset.prof; rerender(); }));
    box.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { state.role = b.dataset.role; rerender(); }));
    box.querySelector('#prRare').addEventListener('change', e => { state.rareOnly = e.target.checked; rerender(); });
  }

  window.Professions = {
    render(target, uiHelpers) {
      container = target;
      ui = uiHelpers;
      if (!window.PROFESSION_DATA || !window.GUIDE_DATA.Professions) { container.innerHTML = '<div class="caveat">' + t('pr.noData') + '</div>'; return; }
      renderAll();
    }
  };
})();
