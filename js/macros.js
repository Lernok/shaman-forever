// Hechizos › Macros: one button for what is "the same" on an enemy and on an
// ally (Lightning Bolt / Healing Wave, Purge / Cure Poison…), written for the
// chosen spec and level, with the spell names of the game's language
// (data/macro-names.js). Shift/Ctrl variants are opt-in (people bind those).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const store = () => window.UI.store;
  const OPTS = { mo: false, alt: true, mods: false };
  function opts() {
    const o = {};
    Object.keys(OPTS).forEach(k => { o[k] = !!store().get('macro.' + k, OPTS[k]); });
    return o;
  }

  // The game's language: /cast only takes the spell's name in it. Spanish
  // site → Latin American client by default (the Americas realms).
  const GAME_LANGS = ['enUS', 'esMX', 'esES'];
  function gameLang() {
    const v = store().get('macro.lang', null);
    return GAME_LANGS.includes(v) ? v : window.I18N.lang === 'es' ? 'esMX' : 'enUS';
  }
  // English names in a macro → the game's language, longest first.
  function localize(text, lang) {
    const names = (window.MACRO_NAMES || {})[lang];
    if (!names) return text;
    return Object.keys(names).sort((a, b) => b.length - a.length)
      .reduce((out, en) => out.split(en).join(names[en]), text);
  }
  const SHORTER = [['[@mouseover,harm,nodead]', '[@mouseover,harm]'], ['[harm,nodead]', '[harm]'], ['[@mouseover,help,nodead]', '[@mouseover,help]']];
  // The game counts bytes (UTF-8), so "á" takes two of the 255.
  function bytes(text) { return new TextEncoder().encode(text).length; }

  // Level a spell is usable at for the chosen spec: trainer level, or the
  // level its talent gets a point in the spec's leveling order (null: the spec
  // doesn't take it).
  function talentLevel(name) {
    const build = window.I18N.localize(window.BUILD_DATA || []).filter(b => b.spec === window.Site.spec && b.order).sort((a, b) => b.level - a.level)[0];
    const step = build && build.order.find(o => o[3] === name);
    return step ? step[0] : null;
  }
  function levelOf(name) {
    const sb = window.SHAMAN_DATA.spellbook;
    if (sb.talents.includes(name)) return talentLevel(name);
    const all = sb.tabs.some(tab => tab.spells.some(s => s[0] === name));
    if (!all) return null;
    return window.Spellbook.levelsOf(name)[0] || 1;
  }

  // "/cast [a] X; [b][c] Y": clauses in order, the same spell in a row merged.
  function cast(clauses) {
    const out = [];
    clauses.forEach(([cond, spell]) => {
      const last = out[out.length - 1];
      if (last && last[1] === spell) last[0] += cond; else out.push([cond, spell]);
    });
    return '/cast ' + out.map(([c, s]) => (c ? c + ' ' : '') + s).join('; ');
  }

  // Enemy → harm; dead ally → dead; ally → help; nobody → yourself.
  // Mouseover first (it wins over the target), Alt heals you. `target` lists
  // what only goes to the target, to stay under the game's 255 characters.
  function pair(o, harm, help, dead, target) {
    const c = [];
    if (o.alt && help) c.push(['[mod:alt,@player]', help]);
    const units = o.mo ? ['@mouseover,', ''] : [''];
    const only = target || [];
    units.forEach(u => {
      const may = spell => spell && !(u && only.includes(spell));
      if (may(harm)) c.push(['[' + u + 'harm,nodead]', harm]);
      if (may(dead)) c.push(['[' + u + 'help,dead]', dead]);
      if (may(help)) c.push(['[' + u + 'help,nodead]', help]);
    });
    if (help) c.push(['[@player]', help]);
    return cast(c);
  }

  // id, spells it needs, spec it's for (null: all), the text, and whether it
  // still has to be tried in game.
  const MACROS = [
    { id: 'bolt', spells: ['Lightning Bolt', 'Healing Wave'], extra: ['Ancestral Spirit'],
      text: o => '#showtooltip\n' + pair(o, 'Lightning Bolt', 'Healing Wave', levelOf('Ancestral Spirit') ? 'Ancestral Spirit' : null, ['Ancestral Spirit']) },
    { id: 'chain', spells: ['Chain Lightning', 'Chain Heal'],
      text: o => '#showtooltip\n' + pair(o, 'Chain Lightning', 'Chain Heal') },
    { id: 'instant', spells: ['Earth Shock', 'Riptide'],
      text: o => '#showtooltip\n' + pair(o, 'Earth Shock', 'Riptide') },
    { id: 'cleanse', spells: ['Purge', 'Cure Poison', 'Cure Disease'], test: true,
      text: o => {
        const stop = '[harm,nodead' + (o.alt ? ',nomod:alt' : '') + ']';
        return '#showtooltip\n' + pair(o, 'Purge', 'Cure Poison', null, ['Purge']) + '\n/stopmacro ' + stop + '\n' + pair(o, null, 'Cure Disease');
      } },
    { id: 'swift', spells: ["Nature's Swiftness", 'Healing Wave'], test: true,
      text: o => "#showtooltip Healing Wave\n/cast Nature's Swiftness\n" + pair(o, null, 'Healing Wave') },
    { id: 'storm', spells: ['Stormstrike'],
      text: () => '#showtooltip\n/startattack [harm,nodead]\n/cast Stormstrike' },
    { id: 'mastery', spells: ['Elemental Mastery', 'Lava Burst'], test: true,
      text: () => '#showtooltip Lava Burst\n/cast Elemental Mastery\n/cast Lava Burst' },
    { id: 'wolf', spells: ['Ghost Wolf'],
      text: () => '#showtooltip\n/cast !Ghost Wolf' },
    { id: 'project', spells: ['Totemic Projection'], test: true,
      text: () => '#showtooltip\n/cast [@cursor] Totemic Projection' },
    { id: 'water', spells: ['Water Walking'],
      text: o => '#showtooltip\n' + pair(o, null, 'Water Walking') },
    // With Shift/Ctrl, only if the person asks for them.
    { id: 'shocks', mods: true, spells: ['Earth Shock', 'Frost Shock', 'Flame Shock'],
      text: () => '#showtooltip\n/cast [mod:ctrl] Flame Shock; [mod:shift] Frost Shock; Earth Shock' },
    { id: 'shields', mods: true, spells: ['Lightning Shield', 'Water Shield'],
      text: () => '#showtooltip\n/cast [mod:shift] Water Shield; Lightning Shield' },
    { id: 'imbues', mods: true, spec: 'Enhancement', spells: ['Windfury Weapon', 'Flametongue Weapon', 'Rockbiter Weapon'],
      text: () => '#showtooltip\n/cast [mod:ctrl] Rockbiter Weapon; [mod:shift] Flametongue Weapon; Windfury Weapon' }
  ];

  // The macros for the chosen spec: { m, text, level } (level: when every
  // spell in it is learned), sorted by that level.
  function list(o) {
    return MACROS.filter(m => (!m.mods || o.mods) && (!m.spec || m.spec === window.Site.spec)).map(m => {
      const levels = m.spells.map(levelOf);
      if (levels.some(l => l == null)) return null;
      let text = localize(m.text(o), o.lang || 'enUS');
      // Too long (long Spanish names): drop the "not dead" checks that
      // matter least, one at a time; a cast on a corpse just fails.
      SHORTER.forEach(([from, to]) => { if (bytes(text) > 255) text = text.split(from).join(to); });
      if (bytes(text) > 255) return null; // the game cuts it
      return { m, text, level: Math.max.apply(null, levels) };
    }).filter(Boolean).sort((a, b) => a.level - b.level);
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function render(container) {
    const o = opts();
    o.lang = gameLang();
    const lvl = Math.min(60, Math.max(1, Number(store().get('level', 1)) || 1));
    const items = list(o);
    const box = (k) => '<label class="chk chip-toggle"><input type="checkbox" id="macro-' + k + '" data-opt="' + k + '"' + (o[k] ? ' checked' : '') + '> ' + t('mc.opt.' + k) + '</label>';
    let html = '<div class="mc-intro"><p>' + t('mc.intro', { spec: window.Site.spec, n: lvl }) + '</p>' +
      '<details class="mc-how"><summary>' + t('mc.howTitle') + '</summary><ol>' + t('mc.how') + '</ol></details></div>';
    html += '<div class="lv-toolbar"><label class="mc-lang">' + t('mc.lang') + ' <select id="macro-lang">' +
      GAME_LANGS.map(l => '<option value="' + l + '"' + (l === o.lang ? ' selected' : '') + '>' + t('mc.lang.' + l) + '</option>').join('') +
      '</select></label>' + ['alt', 'mo', 'mods'].map(box).join('') + '</div>';
    html += '<div class="mc-grid">' + items.map(({ m, text, level }) => {
      const later = level > lvl;
      return '<div class="mc-card' + (later ? ' mc-later' : '') + '">' +
        '<div class="mc-head"><b>' + t('mc.' + m.id + '.name') + '</b>' +
          '<span class="mc-tags">' + (m.test ? '<span class="mc-tag test" title="' + t('mc.testTip') + '">' + t('mc.test') + '</span>' : '') +
          '<span class="mc-tag">' + (later ? t('mc.from', { n: level }) : t('mc.ready')) + '</span></span></div>' +
        '<p class="mc-what">' + t('mc.' + m.id + '.what') + '</p>' +
        '<pre class="mc-code">' + esc(text) + '</pre>' +
        '<div class="mc-foot"><button class="btn mc-copy" type="button" data-copy="' + m.id + '">' + t('mc.copy') + '</button>' +
          '<span class="dim">' + t('mc.chars', { n: bytes(text) }) + '</span></div>' +
        '</div>';
    }).join('') + '</div>';
    html += '<p class="note-text dim">' + t('mc.note') + '</p>';
    container.innerHTML = html;

    container.querySelector('#macro-lang').addEventListener('change', e => {
      store().set('macro.lang', e.target.value);
      render(container);
    });
    container.querySelectorAll('[data-opt]').forEach(el => el.addEventListener('change', () => {
      store().set('macro.' + el.dataset.opt, el.checked);
      render(container);
    }));
    container.querySelectorAll('.mc-copy').forEach(btn => btn.addEventListener('click', () => {
      const item = items.find(x => x.m.id === btn.dataset.copy);
      const done = key => { btn.textContent = t(key); setTimeout(() => { btn.textContent = t('mc.copy'); }, 1800); };
      const select = () => {
        const pre = btn.closest('.mc-card').querySelector('.mc-code');
        const r = document.createRange(); r.selectNodeContents(pre);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        done('mc.copySelect');
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(item.text).then(() => done('mc.copied'), select);
      else select();
    }));
  }

  window.Macros = { render, list, MACROS };
})();
