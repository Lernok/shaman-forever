// Spell and talent names in guide text get their icon (decorate), and any
// element with data-ref="<name>" shows a card with what it does, when you
// learn it and how it changed from Classic.
(function () {
  const I18N = window.I18N;
  const Site = window.Site;
  const UI = window.UI;
  const t = (key, vars) => I18N.t(key, vars);
  const { badge, pageHead, renderSources } = UI;
  const iconUrl = icon => UI.icon(icon);
  const smallIcon = icon => UI.icon(icon, 'medium');

  let refs = null;
  function refIndex() {
    if (refs) return refs;
    const map = new Map();
    const sd = window.SHAMAN_DATA;
    sd.talents.trees.forEach(tr => tr.talents.forEach(x => map.set(x.name, x.icon)));
    Object.keys(sd.spellbook.icons).forEach(n => map.set(n, sd.spellbook.icons[n]));
    const names = Array.from(map.keys()).filter(n => n.length > 4).sort((a, b) => b.length - a.length);
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    refs = { map, re: new RegExp('\\b(' + names.map(esc).join('|') + ')\\b', 'g') };
    return refs;
  }
  function iconFor(name) { return refIndex().map.get(name); }
  function firstRef(text) {
    const m = String(text).match(refIndex().re);
    return m ? iconFor(m[0]) : null;
  }

  // Wraps known names in text nodes with a small icon (once per name per node).
  const NO_REFS = 'a, h2, h3, .spell-ref, .no-refs, .conf-dot, select, button';
  function decorate(root) {
    const { re } = refIndex();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement.closest(NO_REFS) || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const text = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) return;
      re.lastIndex = 0;
      const seen = new Set();
      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = re.exec(text))) {
        if (seen.has(m[0])) continue;
        seen.add(m[0]);
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement('span');
        span.className = 'spell-ref';
        span.dataset.ref = m[0];
        span.innerHTML = '<img src="' + smallIcon(iconFor(m[0])) + '" alt="" loading="lazy">';
        span.appendChild(document.createTextNode(m[0]));
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  // A colored dot; what it means shows on hover or focus, and in the legend.
  // ---------- hover card for a spell or talent name ----------

  function refTip(name) {
    const sd = window.SHAMAN_DATA;
    const C = s => I18N.client(s);
    let tal = null;
    sd.talents.trees.forEach(tr => { const x = tr.talents.find(y => y.name === name); if (x) tal = { tree: tr.name, x }; });
    const ranks = [];
    sd.spellbook.tabs.forEach(tab => tab.spells.forEach(([n, r]) => { if (n === name && !ranks.includes(r)) ranks.push(r); }));
    const levels = window.Spellbook ? window.Spellbook.levelsOf(name) : sd.spellbook.levels[name] || [];
    const top = ranks[ranks.length - 1];
    const d = top ? sd.spell_desc['Shaman|' + name + '|' + top] || {} : {};
    const lines = l => (l || []).map(row => row.filter(Boolean).map(C).join(' · ')).filter(Boolean).join(' · ');
    let html = '<div class="it-head"><img class="it-icon" src="' + iconUrl(iconFor(name)) + '" alt=""><div><div class="t-name">' + name + '</div>' +
      '<div class="t-cost">' + (tal ? t('ref.talent', { tree: tal.tree, row: tal.x.row }) + (tal.x.max > 1 ? ' · ' + t('ref.ranks', { n: tal.x.max }) : '') : '') +
      (top && ranks.length > 1 ? (tal ? ' · ' : '') + t('ref.ranks', { n: ranks.length }) : '') + '</div></div></div>';
    if (d.d) {
      html += (lines(d.l) ? '<div class="t-cost">' + lines(d.l) + '</div>' : '') + '<div class="t-rank">' + C(d.d) + '</div>';
    } else if (tal) {
      if (tal.x.cost) html += '<div class="t-cost">' + tal.x.cost.split(' | ').map(C).join(' · ') + '</div>';
      html += '<div class="t-rank">' + C(tal.x.desc[tal.x.desc.length - 1]) + '</div>';
      if (tal.x.max > 1) html += '<div class="t-cost">' + t('ref.firstRank') + ': ' + C(tal.x.desc[0]) + '</div>';
    }
    if (levels.length) html += '<div class="t-cost ref-learn">' + t('ref.learnedAt', { level: levels[0] }) + (levels.length > 1 ? ' · ' + t('ref.ranksAt', { list: levels.join(', ') }) : '') + '</div>';
    else if (tal) html += '<div class="t-cost ref-learn">' + t('ref.talentLevel', { level: 10 + (tal.x.row - 1) * 5 }) + '</div>';
    const cmp = top && window.Spellbook && window.Spellbook.compare(name, top);
    if (cmp && cmp.pct != null) html += '<div class="t-classic">Classic: ' + I18N.range(cmp.then) + ' → ' + I18N.range(cmp.now) + ' (' + (cmp.pct > 0 ? '+' : '') + cmp.pct + '%)</div>';
    else if (tal && tal.x.classic && tal.x.classic.status === 'new') html += '<div class="t-classic">' + t('ref.newTalent') + '</div>';
    return html;
  }
  // Any element with data-ref="<name>" shows its card while the mouse is on it.
  let refShown = false;
  document.addEventListener('mousemove', e => {
    const el = e.target.closest && e.target.closest('[data-ref]');
    if (el) { UI.tip.at('<div class="ref-card">' + refTip(el.dataset.ref) + '</div>', e.clientX, e.clientY); refShown = true; }
    else if (refShown) { UI.tip.hide(); refShown = false; }
  });

  window.Refs = { decorate, iconFor, firstRef };
})();
