// Pieces every page shares: icon URLs, the one floating tooltip, item cards
// for it, stat lines, and remembered choices (localStorage, which can fail in
// private mode: then the choice lasts for the visit).
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const ZAM = 'https://wow.zamimg.com/images/wow/';

  // 'large' is 56x56: shown at 48px or less it stays sharp ('medium' is 36x36).
  const icon = (name, size) => ZAM + 'icons/' + (size || 'large') + '/' + (name || 'inv_misc_questionmark') + '.jpg';
  const treeArt = bg => ZAM + 'talents/backgrounds/classic/' + bg + '.jpg';

  // ---------- one tooltip for the whole site ----------
  let el = null;
  function box() {
    if (!el) {
      el = document.createElement('div');
      el.className = 'tooltip calc-tip';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    return el;
  }
  // Touch screens: a tap acts (adds a talent point, opens a link) and a long
  // press shows the card instead, at the top or bottom of the screen away from
  // your finger; it stays until you touch somewhere else. With a mouse, hover.
  let lastPointer = 'mouse';
  document.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; }, true);
  document.addEventListener('touchstart', e => { if (el && !el.contains(e.target)) tip.hide(); }, { capture: true, passive: true });
  const isTouch = () => lastPointer !== 'mouse';
  const LONG_PRESS = 450;
  function longPress(n, show) {
    let timer = null;
    let fired = false;
    n.addEventListener('touchstart', () => { fired = false; clearTimeout(timer); timer = setTimeout(() => { fired = true; show(); }, LONG_PRESS); }, { passive: true });
    n.addEventListener('touchmove', () => clearTimeout(timer), { passive: true });
    n.addEventListener('touchcancel', () => clearTimeout(timer));
    // After a long press, no tap: no click, no link opened.
    n.addEventListener('touchend', e => { clearTimeout(timer); if (fired) e.preventDefault(); });
    n.addEventListener('contextmenu', e => { if (isTouch()) e.preventDefault(); });
  }
  // On a phone: across the screen, on the half your finger isn't on (above
  // the bottom menu bar).
  function placeTouch(b, r) {
    const h = b.offsetHeight;
    const bar = document.getElementById('bottomNav');
    const bottom = window.innerHeight - (bar ? bar.offsetHeight : 0);
    b.style.left = '8px';
    b.style.top = (r.top + r.height / 2 > bottom / 2 ? 8 : Math.max(8, bottom - h - 8)) + 'px';
  }

  const tip = {
    isTouch,
    longPress,
    // Next to the mouse.
    at(html, x, y) {
      const b = box();
      b.innerHTML = html;
      b.style.display = 'block';
      b.classList.remove('touch');
      const w = b.offsetWidth, h = b.offsetHeight;
      let left = x + 14;
      if (left + w > window.innerWidth - 8) left = x - w - 14;
      b.style.left = Math.max(8, left) + 'px';
      b.style.top = Math.max(8, Math.min(y + 12, window.innerHeight - h - 8)) + 'px';
    },
    // Beside an element (talent icons).
    beside(html, target) {
      const b = box();
      b.innerHTML = html;
      b.style.display = 'block';
      const r = target.getBoundingClientRect();
      b.classList.toggle('touch', isTouch());
      if (isTouch()) { placeTouch(b, r); return; }
      const w = b.offsetWidth, h = b.offsetHeight;
      let left = r.right + 10;
      if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 10);
      b.style.left = left + 'px';
      b.style.top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8)) + 'px';
    },
    hide() { if (el) el.style.display = 'none'; },
    // Hover cards for elements matching `selector` inside `root`: html(el) or null.
    // On touch screens a tap shows the card too, instead of leaving for
    // Wowhead (ad-heavy on phones); the card carries the link for whoever wants it.
    bind(root, selector, html) {
      root.querySelectorAll(selector).forEach(n => {
        const touchCard = () => {
          const h = html(n);
          if (!h) return false;
          tip.beside(h + (n.href ? '<a class="t-out" href="' + n.href + '" target="_blank" rel="noopener">' + window.I18N.t('site.openWowhead') + ' ↗</a>' : ''), n);
          return true;
        };
        n.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const h = html(n); if (h) tip.at(h, e.clientX, e.clientY); });
        n.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tip.hide(); });
        n.addEventListener('click', e => { if (isTouch() && touchCard()) e.preventDefault(); });
        longPress(n, touchCard);
      });
    }
  };

  // ---------- items ----------

  // "+8 Strength, +4 Stamina, +15 Spell Power" (stats, then equip bonuses).
  function statsText(i, statsOnly) {
    const I = window.I18N;
    const parts = Object.entries(i.stats || {}).map(([k, v]) => '+' + v + ' ' + I.term(k.charAt(0).toUpperCase() + k.slice(1)));
    if (statsOnly) return parts.join(', ');
    const b = i.bonus || {};
    if (b.spellPower) parts.push('+' + b.spellPower + ' ' + I.term('Spell Power'));
    if (b.healing) parts.push('+' + b.healing + ' ' + t('pr.healing'));
    if (b.attackPower) parts.push('+' + b.attackPower + ' ' + I.term('Attack Power'));
    if (b.spellDamage) parts.push('+' + b.spellDamage + ' ' + t('pr.stat.spellDamage'));
    ['nature', 'fire', 'frost'].forEach(k => { if (b[k + 'Damage']) parts.push('+' + b[k + 'Damage'] + ' ' + t('ui.school.' + k)); });
    if (b.crit) parts.push('+' + b.crit + '% ' + I.term('Critical Strike'));
    if (b.spellCrit) parts.push('+' + b.spellCrit + '% ' + t('ui.spellCrit'));
    if (b.hit) parts.push('+' + b.hit + '% ' + I.term('Hit'));
    if (b.spellHit) parts.push('+' + b.spellHit + '% ' + t('ui.spellHit'));
    if (b.mp5) parts.push('+' + b.mp5 + ' MP5');
    // Forever's ratings (the client's numbers, scripts/client-items.js).
    [['critRating', 'Critical Strike Rating'], ['hitRating', 'Hit Rating'], ['hasteRating', 'Haste Rating'], ['expertiseRating', 'Expertise Rating']]
      .forEach(([k, name]) => { if (b[k]) parts.push('+' + b[k] + ' ' + I.term(name)); });
    return parts.join(', ');
  }

  // Wowhead's plain equip lines for the bonuses statsText already states (the item's bonus keys they need).
  const BONUS_LINES = [
    [/^Equip: Increases damage and healing done by magical spells and effects by up to \d+\.$/, ['spellPower']],
    [/^Equip: Increases healing done by spells and effects by up to \d+\.$/, ['healing']],
    [/^Equip: Increases healing done by up to \d+ and damage done by up to \d+ for all magical spells and effects\.$/, ['healing']],
    [/^Equip: \+\d+ Attack Power\.$/, ['attackPower']],
    [/^Equip: Restores \d+ mana per 5 sec\.$/, ['mp5']],
    [/^Equip: Improves your chance to hit with all spells and attacks by \d+%\.$/, ['hit', 'spellHit']],
    [/^Equip: Improves your chance to hit by \d+%\.$/, ['hit']],
    [/^Equip: Improves your chance to hit with spells by \d+%\.$/, ['spellHit']],
    [/^Equip: Improves your chance to get a critical strike with all spells and attacks by \d+%\.$/, ['crit', 'spellCrit']],
    [/^Equip: Improves your chance to get a critical strike by \d+%\.$/, ['crit']],
    [/^Equip: Improves your chance to get a critical strike with spells by \d+%\.$/, ['spellCrit']]
  ];
  const bindText = b => (b === 'pickup' ? ' · BoP' : b === 'equip' ? ' · BoE' : '');
  const itemIcon = (i, cls) => '<img class="' + (cls || 'item-icon') + ' qb' + i.quality + '" src="' + icon(i.icon) + '" alt="" loading="lazy">';

  // Card like the game's: name, item level, kind, damage or armor, stats,
  // equip effects; `lead` above it and `foot` lines (sources) below.
  function itemCard(i, foot, lead) {
    const I = window.I18N;
    const right = i.dmgMin ? I.num(String(i.speed)) + ' s' : i.armor ? i.armor + ' ' + t('pr.armor') : i.dps ? I.num(i.dps.toFixed(1)) + ' DPS' : '';
    return (lead ? '<div class="t-cost">' + lead + '</div>' : '') +
      '<div class="it-head">' + itemIcon(i, 'it-icon') + '<div><div class="t-name q' + i.quality + '">' + i.name + '</div>' +
        '<div class="t-cost">' + t('wp.ilvl') + ' ' + i.ilvl + bindText(i.bind) + '</div></div></div>' +
      '<div class="it-row"><span>' + i.kind + '</span><span>' + right + '</span></div>' +
      (i.dmgMin ? '<div class="it-row"><span>' + I.range(i.dmgMin + ' to ' + i.dmgMax) + '</span><span>' + I.num(i.dps.toFixed(1)) + ' DPS</span></div>' : '') +
      // Every stat and bonus on one line; an equip line that only says one of those bonuses goes.
      (statsText(i) ? '<div class="it-stats">' + statsText(i) + '</div>' : '') +
      (i.equip || []).filter(e => !BONUS_LINES.some(([re, keys]) => re.test(e) && keys.every(k => (i.bonus || {})[k])))
        .map(e => '<div class="it-equip">' + I.client(e) + '</div>').join('') +
      (foot && foot.length ? '<hr class="t-sep">' + foot.map(f => '<div class="t-rank">' + f + '</div>').join('') : '');
  }

  // Link to Wowhead with icon; data-item lets a page attach its hover card.
  const itemLink = i => '<a class="item-link q' + i.quality + '" data-item="' + i.id + '" href="https://www.wowhead.com/forever/item=' + i.id + '" target="_blank" rel="noopener">' +
    itemIcon(i) + '<span>' + i.name + '</span></a>';

  // ---------- remembered choices ----------
  const store = {
    get(key, fallback) {
      let v;
      try { v = localStorage.getItem('shaman.' + key); } catch (e) { return fallback; }
      if (v == null) return fallback;
      // Older visits saved spec and faction as plain text.
      try { return JSON.parse(v); } catch (e) { return v; }
    },
    set(key, value) {
      try { localStorage.setItem('shaman.' + key, JSON.stringify(value)); } catch (e) { /* private mode: this visit only */ }
    }
  };

  // ---------- page pieces ----------

  // How sure a fact is: a colored dot; its name shows on hover or focus.
  const CONFIDENCE = { 'tested': 'conf-tested', 'client-data': 'conf-client', 'classic-assumed': 'conf-classic', 'community-untested': 'conf-untested', 'official': 'conf-official' };
  function badge(confidence) {
    if (!confidence) return '';
    const label = t('conf.' + confidence);
    return '<span class="conf-dot ' + (CONFIDENCE[confidence] || 'conf-untested') + '" tabindex="0" role="img" aria-label="' + label + '" data-label="' + label + '"></span>';
  }

  // Page banner: kicker, title and one line over the spec's talent tree art.
  const pageHead = (kicker, title, intro) => '<div class="spec-summary"><div class="role">' + kicker + '</div><h2>' + title + '</h2>' +
    (intro ? '<p>' + intro + '</p>' : '') + '</div>';

  // Folded at the bottom of each page, with the page's caveat if it has one.
  function renderSources(sources, caveat) {
    return '<details class="sources"><summary>' + t('common.sourcesN', { n: sources.length }) + '</summary><ul>' + sources.map(s => {
      const m = s.match(/^(https?:\/\/[^\s]+)(.*)$/);
      if (!m) return '<li>' + s + '</li>';
      // Host plus path, so several pages of one site stay distinguishable.
      let label = m[1].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      if (label.length > 60) label = label.slice(0, 57) + '…';
      return '<li><a href="' + m[1] + '" target="_blank" rel="noopener" title="' + m[1] + '">' + label + '</a>' + m[2] + '</li>';
    }).join('') + '</ul>' + (caveat ? '<p class="sources-caveat">' + caveat + '</p>' : '') + '</details>';
  }

  // Your level (saved), and the − level + of a page's head: the pages that
  // follow your level (Guía, Talentos, Clase) share it with Equipo and Profesiones.
  const levelNow = () => Math.min(60, Math.max(1, Number(store.get('level', 1)) || 1));
  function levelStepper() {
    const lvl = levelNow();
    return '<span class="gp-lvl"><button class="hn-step" data-lv-step="-1" aria-label="' + t('home.levelDown') + '"' + (lvl <= 1 ? ' disabled' : '') + '>−</button>' +
      '<label>' + t('home.next.level') + ' <select data-lv-select>' + Array.from({ length: 60 }, (_, k) => '<option' + (k + 1 === lvl ? ' selected' : '') + '>' + (k + 1) + '</option>').join('') + '</select></label>' +
      '<button class="hn-step" data-lv-step="1" aria-label="' + t('home.levelUp') + '"' + (lvl >= 60 ? ' disabled' : '') + '>+</button></span>';
  }
  function bindLevel(root, redraw) {
    const set = n => { store.set('level', Math.min(60, Math.max(1, n))); redraw(); };
    root.querySelectorAll('[data-lv-step]').forEach(b => b.addEventListener('click', () => set(levelNow() + Number(b.dataset.lvStep))));
    const sel = root.querySelector('[data-lv-select]');
    if (sel) sel.addEventListener('change', e => set(Number(e.target.value)));
  }

  window.UI = { icon, treeArt, tip, statsText, bindText, itemIcon, itemCard, itemLink, store,
    badge, pageHead, renderSources, levelNow, levelStepper, bindLevel, CONFIDENCE_KEYS: Object.keys(CONFIDENCE) };
})();
