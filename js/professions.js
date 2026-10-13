// Professions tab: which pair suits each spec and why, the new Forever systems
// (Merchant's Favor, camping, Legacy points) and, per profession, every crafted
// item a Shaman can use with how its recipe is learned.
// Data: data/guides/professions.json (content) + data/professions.js (items).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  let ui = null;
  let container = null;
  // role: null follows the spec picked in the header (Enhancement melee, the rest caster).
  const state = { profession: 'Leatherworking', role: null, range: 'beta', rareOnly: true };
  const Site = window.Site;
  const SECTIONS = ['pares', 'sistemas', 'crafteo', 'secundarias', 'subir'];
  const PROFESSIONS = ['Leatherworking', 'Blacksmithing', 'Tailoring', 'Enchanting', 'Engineering'];
  const ROLES = ['all', 'melee', 'caster'];
  // Level ranges, the beta's cap first: a whole profession is 300+ rows.
  const RANGES = { beta: [1, 30], mid: [31, 45], high: [46, 60], all: [1, 60] };
  const role = () => state.role || (Site.spec === 'Enhancement' ? 'melee' : 'caster');
  const UI = window.UI;
  const PROF_ICONS = {
    Leatherworking: 'trade_leatherworking', Blacksmithing: 'trade_blacksmithing', Tailoring: 'trade_tailoring',
    Enchanting: 'trade_engraving', Engineering: 'trade_engineering', Skinning: 'inv_misc_pelt_wolf_01',
    Mining: 'trade_mining', Herbalism: 'spell_nature_naturetouchgrow', Alchemy: 'trade_alchemy'
  };
  // The new systems, in the order of data/guides/professions.json.
  const SYSTEM_ICONS = ['inv_misc_book_09', 'inv_misc_coin_02', 'inv_misc_bag_10', 'spell_holy_wordfortitude', 'inv_scroll_03'];
  const profIcon = (p, cls) => '<img class="' + (cls || 'prof-icon') + '" src="' + UI.icon(PROF_ICONS[p]) + '" alt="" loading="lazy">';

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

  const statsText = i => UI.statsText(i);

  function kindText(i) {
    if (i.dps) return i.kind + ' · ' + window.I18N.num(i.dps.toFixed(1)) + ' DPS';
    return i.kind + (i.armor ? ' · ' + i.armor + ' ' + t('pr.armor') : '');
  }

  function itemsFor() {
    const data = window.PROFESSION_DATA && window.PROFESSION_DATA.professions[state.profession];
    return (data || []).filter(i => {
      if (state.rareOnly && i.quality < 3) return false;
      if (role() === 'melee' && !(i.role === 'melee' || i.role === 'hybrid')) return false;
      if (role() === 'caster' && !(i.role === 'caster' || i.role === 'hybrid')) return false;
      return true;
    });
  }

  function bracket(level) {
    if (level < 10) return '1–9';
    const lo = Math.floor(level / 10) * 10;
    return lo + '–' + (lo + 9 > 60 ? 60 : lo + 9);
  }

  function renderItems() {
    const forRole = itemsFor();
    const inRange = (i, r) => i.req >= RANGES[r][0] && i.req <= RANGES[r][1];
    const list = forRole.filter(i => inRange(i, state.range));
    let html = '<div class="pr-filters">' +
      '<div class="seg">' + PROFESSIONS.map(p => '<button class="btn prof-btn' + (state.profession === p ? ' active' : '') + '" data-prof="' + p + '">' + profIcon(p, 'pb-icon') + p + '</button>').join('') + '</div>' +
      '<div class="seg">' + ROLES.map(r => '<button class="btn' + (role() === r ? ' active' : '') + '" data-role="' + r + '">' + t('pr.role.' + r) + '</button>').join('') + '</div>' +
      '<div class="seg">' + Object.keys(RANGES).map(r => '<button class="btn' + (state.range === r ? ' active' : '') + '" data-range="' + r + '">' +
        t('pr.range.' + r) + ' <span class="dim">' + forRole.filter(i => inRange(i, r)).length + '</span></button>').join('') + '</div>' +
      '<label class="chk chip-toggle"><input type="checkbox" id="prRare"' + (state.rareOnly ? ' checked' : '') + '> ' + t('pr.rareOnly') + '</label>' +
      '</div>';
    if (!list.length) return html + '<p class="note-text">' + t('pr.none') + '</p>';
    html += '<p class="note-text dim">' + t('pr.count', { n: list.length }) + '</p>';
    let current = null;
    html += '<div class="table-wrap"><table class="cmp pr-table"><thead><tr><th>' + t('pr.colLevel') + '</th><th>' + t('pr.colItem') + '</th><th>' + t('wp.colStats') + '</th><th>' + t('pr.colLearn') + '</th></tr></thead><tbody>';
    list.forEach(i => {
      const b = bracket(i.req);
      if (b !== current) { current = b; html += '<tr class="pr-bracket"><td colspan="4">' + t('pr.bracket', { range: b }) + '</td></tr>'; }
      html += '<tr><td class="num">' + i.req + '</td>' +
        '<td>' + UI.itemLink(i) +
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

    const section = Site.section('Profesiones', SECTIONS);
    const label = { pares: 'pr.pairs', sistemas: 'pr.systems', crafteo: 'pr.items', secundarias: 'pr.secondary', subir: 'pr.leveling' };
    html += Site.sectionTabs('Profesiones', SECTIONS, section, k => t(label[k]));

    // Recommended pairs for the chosen spec.
    if (section === 'pares') html += '<div class="panel"><h3>' + t('pr.pairs') + ' · ' + Site.spec + '</h3>' +
      '<div class="pr-pairs">' + g.pairs.filter(p => p.specs.includes(Site.spec)).map(p =>
        '<div class="pr-pair"><div class="pr-pair-icons">' + p.pair.split(' + ').map(x => profIcon(x, 'pp-icon')).join('<span class="pp-plus">+</span>') + '</div>' +
        '<div class="pr-pair-head"><b>' + p.pair + '</b><span class="pr-when">' + p.when + '</span></div>' +
        (p.tldr ? '<p class="pr-tldr"><b>TL;DR</b> ' + p.tldr + '</p>' : '') +
        '<div class="pr-pair-specs">' + p.specs.map(s => '<span style="--spec-color:' + ui.specColors[s] + '">' + s + '</span>').join('') + '</div>' +
        '<p>' + p.why + '</p></div>').join('') + '</div>' +
      '<p class="note-text dim">' + g.pairsNote + '</p></div>';

    // New systems.
    if (section === 'sistemas') html += '<div class="note-grid">' +
      g.systems.map((s, i) => '<div class="note-card"><img src="' + UI.icon(SYSTEM_ICONS[i] || 'inv_misc_note_01') + '" alt="" loading="lazy"><div>' +
        '<b class="nc-title">' + s.title + ' ' + ui.badge(s.confidence) + '</b>' + s.fact +
        ' <a class="src" href="' + s.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a></div></div>').join('') + '</div>';

    // Crafted items per profession.
    if (section === 'crafteo') html += '<div class="panel"><h3>' + t('pr.items') + '</h3>' +
      '<p class="note-text">' + t('pr.itemsIntro') + '</p><div id="prItems">' + renderItems() + '</div></div>';

    if (section === 'secundarias') html += renderSecondary(g.secondary);

    // How to level them.
    if (section === 'subir') html += '<div class="link-grid">' +
      g.leveling.map(l => '<a class="link-card" href="' + l.url + '" target="_blank" rel="noopener"><b>' + l.site + ' ↗</b><span>' + l.note + '</span></a>').join('') + '</div>';

    html += ui.renderSources(g.sources, g.caveat);
    container.innerHTML = html;
    bind();
  }

  function bind() {
    if (container.querySelector('#prItems')) bindItems();
    const food = new Map(((window.CONSUMABLE_DATA || {}).items || []).map(i => [String(i.id), i]));
    UI.tip.bind(container, '[data-food]', a => (food.has(a.dataset.food) ? foodCard(food.get(a.dataset.food)) : null));
  }

  // ---------- cooking, fishing, first aid ----------

  // Stats worth eating for, per spec (first = most important).
  const SPEC_FOOD = {
    Enhancement: ['strength', 'agility', 'attackPower', 'crit'],
    Elemental: ['spellDamage', 'intellect', 'crit'],
    Restoration: ['healing', 'intellect', 'spirit']
  };
  const STAT_ICONS = { strength: 'spell_nature_strength', agility: 'ability_rogue_sprint', attackPower: 'ability_warrior_battleshout',
    spellDamage: 'spell_fire_flamebolt', intellect: 'spell_holy_magicalsentry', healing: 'spell_nature_healingwavegreater', spirit: 'spell_holy_divinespirit',
    crit: 'ability_criticalstrike', stamina: 'spell_nature_unyeildingstamina', fishing: 'trade_fishing', other: 'inv_misc_food_15' };

  function learnLine(f) {
    const L = f.learn || {};
    if (L.type !== 'recipe') return t('pr.learn.' + (L.type || 'unknown'));
    const s = (L.sources || [])[0];
    const where = !s ? t('pr.learn.unknown') : s.type === 'vendor' ? t('pr.learn.vendor', { npc: s.npc, zone: s.zone || '?' })
      : s.type === 'drop' ? t('pr.learn.drop', { npc: s.npc, zone: s.zone || '?' }) : t('pr.learn.quest', { quest: s.quest });
    return t('pr.learn.recipe') + ': ' + where + ((L.sources || []).length > 1 ? ' …' : '');
  }

  // What it does, in the site's language: built from the client text's numbers.
  function useText(f) {
    const I = window.I18N;
    if (I.lang !== 'es') return f.use;
    const u = f.use;
    const parts = [];
    let m;
    if ((m = u.match(/Restores (\d+) health over (\d+) sec/i))) parts.push('Restaura ' + m[1] + ' de salud en ' + m[2] + ' s');
    if ((m = u.match(/Restores (\d+) mana over (\d+) sec/i))) parts.push('Restaura ' + m[1] + ' de maná en ' + m[2] + ' s');
    if ((m = u.match(/Restores (\d+) to (\d+) health/i))) parts.push('Restaura ' + m[1] + ' a ' + m[2] + ' de salud');
    if ((m = u.match(/Heals (\d+) damage over (\d+) sec/i))) parts.push('Cura ' + m[1] + ' de daño en ' + m[2] + ' s');
    if ((m = u.match(/cured of (poisons|diseases|bleeds) up to level (\d+)/i))) parts.push('Cura ' + { poisons: 'venenos', diseases: 'enfermedades', bleeds: 'sangrados' }[m[1].toLowerCase()] + ' hasta nivel ' + m[2]);
    if (f.buff) {
      const b = f.buff;
      const gain = b.stat !== 'other' ? '+' + b.amount + (b.stat === 'crit' ? '%' : '') + ' de ' + t('pr.stat.' + b.stat) : b.text;
      parts.push('Si comés al menos 10 s quedás Well Fed: ' + gain + ' por 15 min' + (f.xp ? ' y +' + f.xp + '% de experiencia al matar' : ''));
    }
    return parts.length ? parts.join('. ') + '.' : u;
  }

  // Hover card: what it does and how to learn it.
  function foodCard(f) {
    const I = window.I18N;
    return '<div class="it-head"><img class="it-icon qb' + f.quality + '" src="' + UI.icon(f.icon) + '" alt=""><div><div class="t-name q' + (f.quality || 1) + '">' + f.name + '</div>' +
      '<div class="t-cost">' + f.profession + (f.skill[1] ? ' · ' + skillRange(f) : '') + (f.req > 1 ? ' · ' + t('pr.atLevel', { n: f.req }) : '') + '</div></div></div>' +
      '<div class="t-rank">' + useText(f) + '</div>' + (I.lang === 'es' ? I.original([f.use]) : '') + '<hr class="t-sep"><div class="t-rank">' + learnLine(f) + '</div>';
  }

  // The client gives the skill range where a recipe still raises your skill (yellow to grey).
  const skillRange = f => (f.skill[1] ? t('pr.skillRange', { low: f.skill[1], high: f.skill[2] }) : '');

  const foodLink = f => '<span class="food-chip" data-food="' + f.id + '"><img src="' + UI.icon(f.icon, 'medium') + '" alt="" loading="lazy">' + f.name + '</span>';

  // One row per stat: the best amount at each level it changes, with its foods.
  function statRow(items, stat) {
    const list = items.filter(f => f.buff && f.buff.stat === stat);
    if (!list.length) return '';
    const byLevel = new Map();
    list.forEach(f => { const k = f.req; if (!byLevel.has(k) || byLevel.get(k).amount < f.buff.amount) byLevel.set(k, { amount: f.buff.amount, foods: [] }); });
    list.forEach(f => { const b = byLevel.get(f.req); if (b.amount === f.buff.amount) b.foods.push(f); });
    let best = 0;
    const steps = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).filter(([, b]) => { if (b.amount <= best) return false; best = b.amount; return true; });
    const unit = stat === 'crit' ? '%' : '';
    return '<div class="food-row"><div class="food-stat"><img src="' + UI.icon(STAT_ICONS[stat]) + '" alt=""><b>' + t('pr.stat.' + stat) + '</b></div><div class="food-steps">' +
      steps.map(([lv, b]) => '<div class="food-step' + (lv > 30 ? ' post-cap' : '') + '"><div class="fs-head"><span class="fs-lv">' + t('pr.atLevel', { n: lv }) + '</span><b>+' + b.amount + unit + '</b></div>' +
        b.foods.slice(0, 3).map(foodLink).join('') + '</div>').join('') + '</div></div>';
  }

  function factCards(list) {
    return '<div class="note-grid">' + list.map(f => '<div class="note-card plain-note"><div>' + f.fact + ' ' + ui.badge(f.confidence) +
      ' <a class="src" href="' + f.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a></div></div>').join('') + '</div>';
  }

  function renderSecondary(sec) {
    const data = (window.CONSUMABLE_DATA || {}).items || [];
    const cook = data.filter(f => f.profession === 'Cooking');
    const aid = data.filter(f => f.profession === 'First Aid');
    let html = '<p class="note-text">' + sec.intro + '</p>';
    html += '<div class="panel"><h3>' + t('pr.food', { spec: Site.spec }) + '</h3><p class="note-text dim">' + t('pr.foodIntro') + '</p>' +
      SPEC_FOOD[Site.spec].map(s => statRow(cook, s)).join('') + '</div>';
    html += '<div class="panel" style="margin-top:16px"><h3>' + t('pr.foodAll') + '</h3>' + ['stamina', 'fishing'].map(s => statRow(cook, s)).join('') + '</div>';
    html += '<h3 class="block-title" style="margin-top:22px">' + t('pr.cooking') + '</h3>' + factCards(sec.cooking);
    // First aid: bandages by skill, potions by level, cures.
    const group = (title, list, line) => list.length ? '<div class="sub-label">' + title + '</div><div class="aid-list">' + list.map(f =>
      '<div class="aid-row">' + foodLink(f) + '<span class="aid-val">' + line(f) + '</span><span class="dim">' + skillRange(f) + '</span></div>').join('') + '</div>' : '';
    const bandages = aid.filter(f => /Bandage/.test(f.name)).sort((a, b) => (a.skill[1] || 0) - (b.skill[1] || 0));
    const potions = aid.filter(f => /Healing Potion/.test(f.name)).sort((a, b) => a.req - b.req);
    const cures = aid.filter(f => /Anti-Venom|Poultice|Tourniquet/.test(f.name)).sort((a, b) => (a.skill[1] || 0) - (b.skill[1] || 0));
    const num = h => Array.isArray(h) ? h.join('–') : h;
    html += '<h3 class="block-title" style="margin-top:22px">' + t('pr.firstAid') + '</h3>' + factCards(sec.firstAid) +
      '<div class="panel" style="margin-top:12px">' +
      group(t('pr.bandages'), bandages, f => t('pr.heals', { n: num(f.health) })) +
      group(t('pr.potions'), potions, f => t('pr.heals', { n: num(f.health) }) + ' · ' + t('pr.atLevel', { n: f.req })) +
      group(t('pr.cures'), cures, f => useText(f).replace(/\s*\(.*$/, '').replace(/\..*$/, '')) + '</div>';
    html += '<h3 class="block-title" style="margin-top:22px">' + t('pr.fishing') + '</h3>' + factCards(sec.fishing);
    return html;
  }

  // The items block re-renders on its own so the page doesn't jump.
  function bindItems() {
    const box = container.querySelector('#prItems');
    const rerender = () => { box.innerHTML = renderItems(); bindItems(); };
    box.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', () => { state.profession = b.dataset.prof; rerender(); }));
    box.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { state.role = b.dataset.role; rerender(); }));
    box.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => { state.range = b.dataset.range; rerender(); }));
    box.querySelector('#prRare').addEventListener('change', e => { state.rareOnly = e.target.checked; rerender(); });
    const byId = new Map(itemsFor().map(i => [String(i.id), i]));
    UI.tip.bind(box, '[data-item]', a => byId.has(a.dataset.item) ? UI.itemCard(byId.get(a.dataset.item), [t('common.level') + ' ' + byId.get(a.dataset.item).req, learnText(byId.get(a.dataset.item).learn.text)]) : null);
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
