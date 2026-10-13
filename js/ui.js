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
  const tip = {
    // Next to the mouse.
    at(html, x, y) {
      const b = box();
      b.innerHTML = html;
      b.style.display = 'block';
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
      const w = b.offsetWidth, h = b.offsetHeight;
      let left = r.right + 10;
      if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 10);
      b.style.left = left + 'px';
      b.style.top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8)) + 'px';
    },
    hide() { if (el) el.style.display = 'none'; },
    // Hover cards for elements matching `selector` inside `root`: html(el) or null.
    bind(root, selector, html) {
      root.querySelectorAll(selector).forEach(n => {
        n.addEventListener('mousemove', e => { const h = html(n); if (h) tip.at(h, e.clientX, e.clientY); });
        n.addEventListener('mouseleave', tip.hide);
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
    if (b.crit) parts.push('+' + b.crit + '% ' + I.term('Critical Strike'));
    if (b.hit) parts.push('+' + b.hit + '% ' + I.term('Hit'));
    if (b.mp5) parts.push('+' + b.mp5 + ' MP5');
    return parts.join(', ');
  }

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
      (Object.keys(i.stats || {}).length ? '<div class="it-stats">' + statsText(i, true) + '</div>' : '') +
      (i.equip || []).map(e => '<div class="it-equip">' + I.client(e) + '</div>').join('') +
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

  window.UI = { icon, treeArt, tip, statsText, bindText, itemIcon, itemCard, itemLink, store,
    badge, pageHead, renderSources, CONFIDENCE_KEYS: Object.keys(CONFIDENCE) };
})();
