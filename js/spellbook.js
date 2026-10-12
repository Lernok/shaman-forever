// Spellbook tab: every Shaman trainer spell and rank from data/shaman.json
// (talentsforever.com export, beta client), Forever beside Classic, with the
// change in the spell's main number worked out from the two tooltips.
(function () {
  let ui = null;
  let container = null;
  let filter = 'all';
  let query = '';
  const chosenRank = {}; // spell name -> rank label picked in its selector

  const t = (key, vars) => window.I18N.t(key, vars);
  const STATUS = {
    new: { label: 'sb.new', plural: 'sb.newPl', cls: 'st-new' },
    changed: { label: 'sb.changed', plural: 'sb.changedPl', cls: 'st-changed' },
    same: { label: 'sb.same', plural: 'sb.samePl', cls: 'st-same' }
  };

  function data() { return window.SHAMAN_DATA; }
  function desc(name, rank) { return data().spell_desc['Shaman|' + name + '|' + rank] || null; }

  // One entry per spell: its ranks in book order, levels, icon, overall status.
  function spells() {
    const sb = data().spellbook;
    const byTab = sb.tabs.map(tab => {
      const map = new Map();
      tab.spells.forEach(([name, rank]) => {
        if (!map.has(name)) map.set(name, { name, ranks: [], tab: tab.name });
        map.get(name).ranks.push(rank);
      });
      return { name: tab.name, spells: Array.from(map.values()) };
    });
    byTab.forEach(tab => tab.spells.forEach(s => {
      s.icon = sb.icons[s.name];
      s.levels = sb.levels[s.name] || [];
      s.fromTalent = sb.talents.includes(s.name);
      const states = s.ranks.map(r => (desc(s.name, r) || {}).cs);
      s.status = states.includes('new') ? 'new' : states.includes('changed') ? 'changed' : 'same';
    }));
    return byTab;
  }

  // First "a to b" range in a tooltip (commas allowed), as its midpoint.
  function mainNumber(text) {
    if (!text) return null;
    const m = text.match(/(\d[\d,]*)\s+to\s+(\d[\d,]*)/);
    if (m) return (Number(m[1].replace(/,/g, '')) + Number(m[2].replace(/,/g, ''))) / 2;
    return null;
  }

  function pctChange(d) {
    const now = mainNumber(d.d);
    const then = mainNumber(d.cd);
    if (now == null || then == null || then === 0) return null;
    return Math.round((now / then - 1) * 100);
  }

  // "71.4% of spell power (direct)" -> "71,4% (directo)" in Spanish.
  function coef(s) {
    const I = window.I18N;
    return I.num(s.replace(/ of spell power/g, ''))
      .replace('(direct)', '(' + t('sb.direct') + ')')
      .replace('(per tick)', '(' + t('sb.perTick') + ')')
      .replace('(heal)', '(' + t('sb.heal') + ')');
  }

  function rankLabel(r) {
    const m = /^Rank (\d+)$/.exec(r);
    return m ? t('sb.rank', { n: m[1] }) : r;
  }

  function lines(l) {
    return (l || []).map(row => row.filter(Boolean).map(c => window.I18N.client(c)).join(' · ')).filter(Boolean).join(' · ');
  }

  function renderSpell(s) {
    const rank = chosenRank[s.name] && s.ranks.includes(chosenRank[s.name]) ? chosenRank[s.name] : s.ranks[s.ranks.length - 1];
    const d = desc(s.name, rank) || {};
    const st = STATUS[s.status];
    const pct = d.cs === 'changed' ? pctChange(d) : null;
    let html = '<div class="spell-card ' + st.cls + '">' +
      '<div class="sp-head">' +
        '<img class="sp-icon" src="' + ui.iconUrl(s.icon) + '" alt="" loading="lazy">' +
        '<div class="sp-title"><b>' + s.name + '</b>' +
          '<span class="sp-meta">' + (s.levels.length ? t('sb.levels', { list: s.levels.join(', ') }) : '') +
          (s.fromTalent ? ' · ' + t('sb.fromTalent') : '') + '</span></div>' +
        '<span class="sp-status">' + t(st.label) + '</span>' +
      '</div>';
    if (s.ranks.length > 1) {
      html += '<select class="sp-rank" data-spell="' + s.name + '">' +
        s.ranks.map(r => '<option value="' + r + '"' + (r === rank ? ' selected' : '') + '>' + rankLabel(r) + '</option>').join('') + '</select>';
    }
    html += '<div class="sp-cost">' + lines(d.l) + '</div>' +
      '<p class="sp-text">' + window.I18N.client(d.d || '') + '</p>';
    if (d.co) html += '<div class="sp-coef">' + t('sb.coef') + ': <b>' + coef(d.co) + '</b>' +
      (d.cc && d.cc !== d.co ? ' <span class="was">(Classic: ' + coef(d.cc) + ')</span>' : '') + '</div>';
    if (d.cs === 'changed' && d.cd) {
      html += '<details class="sp-classic"><summary>Classic' +
        (pct != null ? ' <span class="pct ' + (pct < 0 ? 'down' : pct > 0 ? 'up' : '') + '">' + (pct > 0 ? '+' : '') + pct + '%</span>' : '') +
        '</summary><div class="sp-cost">' + lines(d.cl) + '</div><p class="sp-text">' + window.I18N.client(d.cd) + '</p></details>';
    }
    html += window.I18N.original([d.d, d.cs === 'changed' && d.cd ? 'Classic: ' + d.cd : '']);
    html += '</div>';
    return html;
  }

  function matches(s) {
    if (filter !== 'all' && s.status !== filter) return false;
    if (query && !s.name.toLowerCase().includes(query)) return false;
    return true;
  }

  function renderAll() {
    const tabs = spells();
    const all = tabs.flatMap(t => t.spells);
    const count = k => all.filter(s => s.status === k).length;
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Spellbook + '">' +
      '<div class="role">Spellbook</div><h2>' + t('sb.title') + '</h2>' +
      '<p>' + t('sb.intro', { build: data().spellbook.build }) + '</p></div>';
    html += '<div class="sb-toolbar">' +
      ['all', 'new', 'changed', 'same'].map(k =>
        '<button class="btn sb-filter' + (filter === k ? ' active' : '') + '" data-filter="' + k + '">' +
        (k === 'all' ? t('sb.all', { n: all.length }) : t(STATUS[k].plural, { n: count(k) })) + '</button>').join('') +
      '<input class="sb-search" type="search" placeholder="' + t('sb.search') + '" value="' + query.replace(/"/g, '&quot;') + '">' +
      '</div>';
    // One spellbook tab at a time (the chosen spec's first); a search looks in all three.
    const names = tabs.map(x => x.name);
    const ordered = [window.Site.spec].concat(names.filter(n => n !== window.Site.spec));
    const section = window.Site.section('Hechizos', ordered);
    html += window.Site.sectionTabs('Hechizos', ordered, section, n =>
      n + ' <span class="n">' + tabs.find(x => x.name === n).spells.filter(matches).length + '</span>');
    tabs.forEach(tab => {
      const list = tab.spells.filter(matches);
      if (!list.length || (!query && tab.name !== section)) return;
      html += '<h3 class="sb-tab" style="--spec-color:' + ui.specColors[tab.name] + '">' + tab.name + ' <span>' + list.length + '</span></h3>' +
        '<div class="spell-grid">' + list.map(renderSpell).join('') + '</div>';
    });
    const gone = data().spellbook.gone || [];
    if (gone.length && (filter === 'all')) {
      html += '<p class="note-text dim">' + t('sb.gone', { list: gone.join(', ') }) + '</p>';
    }
    html += ui.renderSources(['https://talentsforever.com (CC BY 4.0) — data/shaman.json, ' + t('sb.source')]);
    container.innerHTML = html;
    bind();
  }

  function bind() {
    container.querySelectorAll('.sb-filter').forEach(b => b.addEventListener('click', () => {
      filter = b.dataset.filter;
      renderAll();
    }));
    const search = container.querySelector('.sb-search');
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      const pos = search.selectionStart;
      renderAll();
      const again = container.querySelector('.sb-search');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    container.querySelectorAll('.sp-rank').forEach(sel => sel.addEventListener('change', () => {
      chosenRank[sel.dataset.spell] = sel.value;
      renderAll();
    }));
  }

  window.Spellbook = {
    // Tooltip numbers for one rank, Forever vs Classic: { now, then, pct, d }.
    compare(name, rank) {
      const d = desc(name, rank);
      if (!d) return null;
      const range = text => (text && (text.match(/(\d[\d,]*)\s+to\s+(\d[\d,]*)/) || [])[0]) || null;
      return { now: range(d.d), then: range(d.cd), pct: pctChange(d), d };
    },
    render(target, uiHelpers) {
      container = target;
      ui = uiHelpers;
      renderAll();
    }
  };
})();
