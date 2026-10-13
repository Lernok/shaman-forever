// Spellbook tab: every Shaman trainer spell and rank from data/shaman.json
// (talentsforever.com export, beta client), Forever beside Classic, with the
// change in the spell's main number worked out from the two tooltips.
(function () {
  let ui = null;
  let container = null;
  let filter = 'all';
  let query = '';
  let newOnly = false; // By level: only first ranks
  const chosenRank = {}; // spell name -> rank label picked in its selector
  const opened = new Set(); // spells whose card is expanded

  const t = (key, vars) => window.I18N.t(key, vars);
  const STATUS = {
    new: { label: 'sb.new', plural: 'sb.newPl', cls: 'st-new' },
    changed: { label: 'sb.changed', plural: 'sb.changedPl', cls: 'st-changed' },
    same: { label: 'sb.same', plural: 'sb.samePl', cls: 'st-same' }
  };

  function data() { return window.SHAMAN_DATA; }

  // Level of each rank, from its tooltip ("Learned at level 30"); the export's
  // level list leaves out spells with a single rank (Astral Recall, Ghost Wolf…).
  function levelsOf(name) {
    const ranks = [];
    data().spellbook.tabs.forEach(tab => tab.spells.forEach(([n, r]) => { if (n === name && !ranks.includes(r)) ranks.push(r); }));
    const fromDesc = ranks.map(r => Number(((data().spell_desc['Shaman|' + name + '|' + r] || {}).lv || '').replace(/\D+/g, '')) || null);
    return fromDesc.every(Boolean) ? fromDesc : data().spellbook.levels[name] || [];
  }
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
      s.levels = levelsOf(s.name);
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
    const open = opened.has(s.name);
    let html = '<div class="spell-card ' + st.cls + (open ? ' open' : '') + '">' +
      '<button class="sp-head" type="button" data-toggle="' + s.name.replace(/"/g, '&quot;') + '" aria-expanded="' + open + '">' +
        '<img class="sp-icon" src="' + ui.iconUrl(s.icon) + '" alt="" loading="lazy">' +
        '<span class="sp-title"><b>' + s.name + '</b>' +
          '<span class="sp-meta">' + (s.levels.length ? t('sb.learnAt', { level: s.levels[0] }) : '') +
          (s.fromTalent ? ' · ' + t('sb.fromTalent') : '') + '</span></span>' +
        '<span class="sp-badges"><span class="sp-status">' + t(st.label) + '</span>' +
          (pct != null ? '<span class="pct-pill ' + (pct < 0 ? 'down' : pct > 0 ? 'up' : '') + '">' + (pct > 0 ? '+' : '') + pct + '%</span>' : '') + '</span>' +
        '<span class="sp-chevron">' + (open ? '–' : '+') + '</span>' +
      '</button>';
    html += '<p class="sp-text sp-short">' + window.I18N.client(d.d || '') + '</p>';
    if (!open) return html + '</div>';
    html += '<div class="sp-extra">';
    if (s.ranks.length > 1) {
      html += '<select class="sp-rank" data-spell="' + s.name + '">' +
        s.ranks.map((r, i) => '<option value="' + r + '"' + (r === rank ? ' selected' : '') + '>' + rankLabel(r) + (s.levels[i] ? ' · ' + t('sb.atLevel', { level: s.levels[i] }) : '') + '</option>').join('') + '</select>';
    }
    html += '<div class="sp-cost">' + lines(d.l) + '</div>';
    if (d.co) html += '<div class="sp-coef">' + t('sb.coef') + ': <b>' + coef(d.co) + '</b>' +
      (d.cc && d.cc !== d.co ? ' <span class="was">(Classic: ' + coef(d.cc) + ')</span>' : '') + '</div>';
    if (d.cs === 'changed' && d.cd) {
      html += '<details class="sp-classic"><summary>Classic' +
        (pct != null ? ' <span class="pct ' + (pct < 0 ? 'down' : pct > 0 ? 'up' : '') + '">' + (pct > 0 ? '+' : '') + pct + '%</span>' : '') +
        '</summary><div class="sp-cost">' + lines(d.cl) + '</div><p class="sp-text">' + window.I18N.client(d.cd) + '</p></details>';
    }
    html += window.I18N.original([d.d, d.cs === 'changed' && d.cd ? 'Classic: ' + d.cd : '']);
    html += '</div></div>';
    return html;
  }

  function matches(s) {
    if (filter !== 'all' && s.status !== filter) return false;
    if (query && !s.name.toLowerCase().includes(query)) return false;
    return true;
  }

  // Every level from 1 to 60 with the spells and ranks you learn at it.
  function byLevel(tabs) {
    const at = {};
    const fromTalents = [];
    tabs.forEach(tab => tab.spells.filter(matches).forEach(sp => {
      if (!sp.levels.length) { fromTalents.push(sp); return; }
      if (sp.fromTalent) {
        (at[sp.levels[0]] = at[sp.levels[0]] || []).push({ sp, rank: 1, total: 1, tab: tab.name, talent: true });
        return;
      }
      sp.levels.forEach((lv, i) => {
        if (newOnly && i > 0) return;
        (at[lv] = at[lv] || []).push({ sp, rank: i + 1, total: sp.levels.length, tab: tab.name });
      });
    }));
    const mine = Math.min(60, Math.max(1, Number(window.UI.store.get('level', 1)) || 1));
    let html = '<div class="lv-toolbar"><label class="chk chip-toggle"><input type="checkbox" id="sbNewOnly"' + (newOnly ? ' checked' : '') + '> ' + t('sb.newOnly') + '</label>' +
      '<span class="dim">' + t('sb.byLevelIntro') + ' ' + t('sb.yourLevel', { n: mine }) + '</span></div><div class="lv-timeline">';
    Object.keys(at).map(Number).sort((a, b) => a - b).forEach(lv => {
      const list = at[lv].sort((a, b) => (a.rank === 1 ? 0 : 1) - (b.rank === 1 ? 0 : 1) || a.sp.name.localeCompare(b.sp.name));
      // Your level (Equipo › Tu camino): what you already learned dims, the next ten levels stand out.
      const cls = lv <= mine ? ' lv-past' : lv <= mine + 10 ? ' lv-next' : '';
      html += '<div class="lv-row' + (lv > 30 ? ' post-cap' : '') + cls + '"><div class="lv-num">' + lv + '</div><div class="lv-spells">' +
        list.map(e => '<span class="lv-spell' + (e.talent ? ' talent' : e.rank === 1 ? ' first' : '') + '" data-ref="' + e.sp.name + '" style="--tab-color:' + ui.specColors[e.tab] + '">' +
          '<img src="' + ui.iconUrl(e.sp.icon) + '" alt="" loading="lazy"><span><b>' + e.sp.name + '</b><small>' +
          (e.talent ? t('sb.talentSpell') : e.rank === 1 ? t('sb.newSpell') : t('sb.rankOf', { n: e.rank, total: e.total })) + '</small></span></span>').join('') +
        '</div></div>';
    });
    html += '</div>';
    if (fromTalents.length) html += '<p class="note-text dim">' + t('sb.talentSpells', { list: fromTalents.map(x => x.name).join(', ') }) + '</p>';
    return html;
  }

  function renderAll() {
    const tabs = spells();
    const all = tabs.flatMap(t => t.spells);
    const count = k => all.filter(s => s.status === k).length;
    let html = '<div class="spec-summary" style="--spec-color:' + ui.specColors.Spellbook + '">' +
      '<div class="role">Spellbook</div><h2>' + t('sb.title') + '</h2>' +
      '<p>' + t('sb.intro') + '</p></div>';
    html += '<div class="sb-toolbar">' +
      ['all', 'new', 'changed', 'same'].map(k =>
        '<button class="btn sb-filter' + (filter === k ? ' active' : '') + '" data-filter="' + k + '">' +
        (k === 'all' ? t('sb.all', { n: all.length }) : t(STATUS[k].plural, { n: count(k) })) + '</button>').join('') +
      '<input class="sb-search" type="search" placeholder="' + t('sb.search') + '" value="' + query.replace(/"/g, '&quot;') + '">' +
      '</div>';
    // One spellbook tab at a time (the chosen spec's first); a search looks in all three.
    const names = tabs.map(x => x.name);
    const ordered = [window.Site.spec].concat(names.filter(n => n !== window.Site.spec)).concat('nivel');
    const section = window.Site.section('Hechizos', ordered);
    html += window.Site.sectionTabs('Hechizos', ordered, section, n => n === 'nivel' ? t('sb.byLevel') :
      n + ' <span class="n">' + tabs.find(x => x.name === n).spells.filter(matches).length + '</span>');
    if (section === 'nivel' && !query) {
      html += byLevel(tabs);
      html += ui.renderSources(['https://talentsforever.com (CC BY 4.0) — data/shaman.json, ' + t('sb.source')], t('sb.how', { build: data().spellbook.build }));
      container.innerHTML = html;
      bind();
      return;
    }
    tabs.forEach(tab => {
      const list = tab.spells.filter(matches);
      if (!list.length || (!query && tab.name !== section)) return;
      // The tab's name only when a search shows all three.
      if (query) html += '<h3 class="sb-tab" style="--spec-color:' + ui.specColors[tab.name] + '">' + tab.name + ' <span>' + list.length + '</span></h3>';
      html += '<div class="spell-grid">' + list.map(renderSpell).join('') + '</div>';
    });
    const gone = data().spellbook.gone || [];
    if (gone.length && (filter === 'all')) {
      html += '<p class="note-text dim">' + t('sb.gone', { list: gone.join(', ') }) + '</p>';
    }
    html += ui.renderSources(['https://talentsforever.com (CC BY 4.0) — data/shaman.json, ' + t('sb.source')], t('sb.how', { build: data().spellbook.build }));
    container.innerHTML = html;
    bind();
  }

  function bind() {
    container.querySelectorAll('.sb-filter').forEach(b => b.addEventListener('click', () => {
      filter = b.dataset.filter;
      renderAll();
    }));
    const only = container.querySelector('#sbNewOnly');
    if (only) only.addEventListener('change', () => { newOnly = only.checked; renderAll(); });
    const search = container.querySelector('.sb-search');
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      const pos = search.selectionStart;
      renderAll();
      const again = container.querySelector('.sb-search');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    container.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const name = b.dataset.toggle;
      if (opened.has(name)) opened.delete(name); else opened.add(name);
      renderAll();
    }));
    container.querySelectorAll('.sp-rank').forEach(sel => sel.addEventListener('change', () => {
      chosenRank[sel.dataset.spell] = sel.value;
      renderAll();
    }));
  }

  window.Spellbook = {
    // Tooltip numbers for one rank, Forever vs Classic: { now, then, pct, d }.
    levelsOf,
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
