(function () {
  const SPEC_COLORS = {
    Elemental: '#e0742c',
    Enhancement: '#b07a42',
    Restoration: '#3fa9f5',
    Clase: '#c8aa6e'
  };
  // Talent tree icons stand for each spec in the header.
  const SPEC_ICONS = { Enhancement: 'spell_nature_lightningshield', Elemental: 'spell_nature_lightning', Restoration: 'spell_nature_magicimmunity' };
  const CLASS_ICON = 'classicon_shaman';
  // Icons for the guide's summary tiles.
  const STAT_ICONS = {
    'Weapon Damage': 'inv_axe_09', 'Strength': 'spell_nature_strength', 'Spell Power': 'spell_holy_powerinfusion',
    'Healing Power': 'spell_nature_healingwavegreater', 'Intellect': 'spell_holy_magicalsentry'
  };
  const WEAPON_ICONS = { '2H Axe': 'inv_axe_09', '1H Axe': 'inv_axe_01', '2H Mace': 'inv_mace_04', '1H Mace': 'inv_mace_01', 'Staff': 'inv_staff_08', 'Dagger': 'inv_weapon_shortblade_05', 'Fist': 'inv_gauntlets_04' };

  const I18N = window.I18N;
  const Site = window.Site;
  const t = (key, vars) => I18N.t(key, vars);

  const CONFIDENCE = {
    'tested': 'conf-tested',
    'client-data': 'conf-client',
    'classic-assumed': 'conf-classic',
    'community-untested': 'conf-untested',
    'official': 'conf-official'
  };

  // 'large' is 56x56: shown at 48px it's downscaled (sharp) instead of the
  // 36x36 'medium' being blown up (blurry). Tree art is Classic's, same CDN.
  const ICON_BASE = 'https://wow.zamimg.com/images/wow/icons/large/';
  const ICON_SMALL = 'https://wow.zamimg.com/images/wow/icons/medium/';
  const TREE_BG_BASE = 'https://wow.zamimg.com/images/wow/talents/backgrounds/classic/';

  const app = document.getElementById('app');
  const tabs = Array.from(document.querySelectorAll('.spec-tab'));
  const PAGES = tabs.map(t => t.dataset.spec);
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
  let currentPage = PAGES.includes(hashParts()[0]) ? hashParts()[0] : 'Guia';
  let currentHash = location.hash;

  function iconUrl(icon) {
    return ICON_BASE + (icon || 'inv_misc_questionmark') + '.jpg';
  }
  function smallIcon(icon) {
    return ICON_SMALL + (icon || 'inv_misc_questionmark') + '.jpg';
  }

  function treeBg(tree) {
    return 'linear-gradient(rgba(12,13,16,.55), rgba(12,13,16,.82)), url(' + TREE_BG_BASE + tree.bg + '.jpg)';
  }

  // ---------- spell and talent names get their icon ----------

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
  function badge(confidence) {
    if (!confidence) return '';
    const cls = CONFIDENCE[confidence] || 'conf-untested';
    const label = t('conf.' + confidence);
    return '<span class="conf-dot ' + cls + '" tabindex="0" role="img" aria-label="' + label + '" data-label="' + label + '"></span>';
  }

  // Footer: the five dots once, with their names.
  function renderLegend() {
    const el = document.getElementById('confLegend');
    if (!el) return;
    el.innerHTML = t('conf.legend') + ' ' + Object.keys(CONFIDENCE).map(k =>
      '<span class="conf-key">' + badge(k) + t('conf.' + k) + '</span>').join('');
  }

  // Page banner: kicker, title and one line over the spec's talent tree art.
  function pageHead(kicker, title, intro) {
    return '<div class="spec-summary"><div class="role">' + kicker + '</div><h2>' + title + '</h2>' +
      (intro ? '<p>' + intro + '</p>' : '') + '</div>';
  }

  // One card per change: the title shows, the detail opens on click.
  function renderChanges(changes, spec) {
    if (!changes || !changes.length) return '';
    return '<section class="block"><h3 class="block-title">' + t('guide.changesTitle') + ' <span class="count">' + changes.length + '</span></h3>' +
      '<div class="change-grid">' + changes.map(c =>
        '<details class="change-card"><summary class="no-refs">' +
          '<img class="cc-icon" src="' + iconUrl(firstRef(c.change) || SPEC_ICONS[spec]) + '" alt="" loading="lazy">' +
          '<span class="cc-title">' + c.change + '</span>' + badge(c.confidence) +
        '</summary><div class="detail">' + c.detail +
          (c.source ? ' <a class="src" href="' + c.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a>' : '') +
        '</div></details>').join('') +
      '</div></section>';
  }

  function renderStatChips(list) {
    if (!list) return '';
    return '<div class="stat-row">' + list.map((s, i) =>
      '<span class="stat-chip"><span class="n">' + (i + 1) + '</span>' + I18N.term(s) + '</span>'
    ).join('') + '</div>';
  }

  // Priority as bars that shrink down the list.
  function renderStatBars(list) {
    return '<ol class="stat-bars">' + list.map((s, i) =>
      '<li><span class="sb-n">' + (i + 1) + '</span><span class="sb-name">' + I18N.term(s) + '</span>' +
      '<span class="sb-bar"><span style="width:' + Math.max(18, 100 - i * 18) + '%"></span></span></li>').join('') + '</ol>';
  }

  function renderList(items, ordered) {
    if (!items) return '';
    return '<ul class="plain' + (ordered ? ' ordered' : '') + '">' +
      items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
  }

  function renderNoteList(items) {
    if (!items) return '';
    return '<ul class="plain">' + items.map(i =>
      '<li>' + i.note + ' ' + badge(i.confidence) + '</li>'
    ).join('') + '</ul>';
  }

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

  // ---------- guide ----------

  function tile(icon, label, value, sub, href) {
    const tag = href ? 'a' : 'div';
    return '<' + tag + ' class="tile"' + (href ? ' href="' + href + '"' : '') + '>' +
      '<img src="' + iconUrl(icon) + '" alt="" loading="lazy">' +
      '<div class="tile-text"><span class="tile-label">' + label + '</span><span class="tile-value">' + value + '</span>' +
      (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div></' + tag + '>';
  }

  // The short version, right under the banner.
  function renderTiles(guide, spec) {
    const list = guide.statPriority.list;
    let html = '<div class="tiles">';
    html += tile(SPEC_ICONS[spec], t('tile.role'), guide.role, spec);
    const best = window.Weapons && window.Weapons.bestSafe(30);
    if (best) {
      html += tile(WEAPON_ICONS[best.kind], t('tile.weapon', { level: 30 }), '<span class="q' + best.quality + '">' + best.name + '</span>',
        best.value + ' · ' + best.source, '#Equipo');
    }
    const build = window.I18N.localize(window.BUILD_DATA || []).find(b => b.spec === spec);
    if (build) {
      const pts = window.SHAMAN_DATA.talents.trees.map(tr => window.TalentRules.treePoints(build.points, tr));
      const capstone = guide.keyTalents && iconFor(guide.keyTalents[0].split(' — ')[0].replace(/ (.*)$/, ''));
      html += tile(capstone || SPEC_ICONS[spec], t('tile.build'), build.name, t('common.level') + ' ' + build.level + ' · ' + pts.join('/'), window.Calculator.linkFor(build));
    }
    html += tile(STAT_ICONS[list[0]] || 'spell_holy_magicalsentry', t('tile.stat'), I18N.term(list[0]),
      t('tile.then', { list: list.slice(1, 4).map(I18N.term).join(', ') }));
    return html + '</div>';
  }

  // Key talents: icon, name, what it does.
  function renderKeyTalents(guide) {
    if (!guide.keyTalents) return '';
    return '<div class="panel"><h3>' + t('guide.keyTalents') + '</h3><ul class="key-talents">' + guide.keyTalents.map(k => {
      const [full, what] = k.split(' — ');
      const name = full.replace(/ \(.*\)$/, '');
      const where = (full.match(/ \((.*)\)$/) || [])[1];
      return '<li class="no-refs"><img src="' + iconUrl(iconFor(name)) + '" alt="" loading="lazy"><div><b>' + name + '</b>' +
        (where ? ' <span class="dim">' + where + '</span>' : '') + (what ? '<span class="kt-what">' + what + '</span>' : '') + '</div></li>';
    }).join('') + '</ul></div>';
  }

  function renderRotation(rot, spec) {
    let html = '<div class="panel"><h3>' + t('guide.rotation') + ' ' + badge(rot.confidence) + '</h3>';
    const labels = { level20: t('guide.level20'), level30: t('guide.level30'), level60: t('guide.level60'), priority: t('guide.priority') };
    Object.keys(rot).forEach(key => {
      if (!labels[key]) return;
      const extraBadge = key === 'level60' && rot.level60Confidence ? ' ' + badge(rot.level60Confidence) : '';
      html += '<div class="sub-label">' + labels[key] + extraBadge + '</div><ol class="steps">' +
        rot[key].map(s => '<li><span class="step-icon" style="background-image:url(' + iconUrl(firstRef(s) || SPEC_ICONS[spec]) + ')"></span><div>' + s + '</div></li>').join('') + '</ol>';
    });
    if (rot.totems) {
      html += '<div class="sub-label">' + t('guide.keyTotems') + '</div><div class="totem-row no-refs">' + rot.totems.map(n =>
        '<span class="totem-tile"><img src="' + iconUrl(iconFor(n)) + '" alt="" loading="lazy">' + n + '</span>').join('') + '</div>';
    }
    return html + '</div>';
  }

  // What to look for: why the priority is what it is, and the gear notes.
  function renderStatsGear(guide) {
    const sp = guide.statPriority;
    let html = '<div class="panel"><h3>' + t('guide.statsGear') + ' ' + badge(sp.confidence) + '</h3>';
    if (sp.rationale) html += '<p class="note-text">' + sp.rationale + '</p>';
    if (sp.forever) html += '<div class="forever-note">' + sp.forever.note + ' ' + badge(sp.forever.confidence) + '</div>';
    if (sp.alsoReported) {
      html += '<div class="sub-label">' + t('guide.alsoReported') + ' ' + badge(sp.alsoReported.confidence) + '</div>' + renderStatChips(sp.alsoReported.list);
      if (sp.alsoReported.note) html += '<p class="note-text">' + sp.alsoReported.note + '</p>';
    }
    const gear = (guide.gearTargets || []).concat(guide.gearingNotes || []);
    if (gear.length) html += '<div class="sub-label">' + t('guide.gearNotes') + '</div>' + renderNoteList(gear);
    html += '<p class="note-text dim">' + t('guide.toWeapons') + '</p>';
    return html + '</div>';
  }

  function renderGuidePage(spec) {
    const guide = window.I18N.localize(window.GUIDE_DATA[spec]);
    let html = pageHead(guide.role, spec, guide.summary);
    html += renderTiles(guide, spec);
    html += renderChanges(guide.mechanicalChanges, spec);
    html += '<div class="guide-cols">';
    html += '<div class="col">' + '<div class="panel"><h3>' + t('guide.stats') + ' ' + badge(guide.statPriority.confidence) + '</h3>' +
      renderStatBars(guide.statPriority.list) + '</div>' + renderKeyTalents(guide) + '</div>';
    html += '<div class="col">' + renderRotation(guide.rotation, spec) + renderStatsGear(guide) + '</div>';
    html += '</div>';
    html += renderSources(guide.sources, guide.caveat);
    return html;
  }

  // ---------- class page ----------

  function renderNotes(notes) {
    return '<ul class="plain">' + notes.map(n => '<li>' + n.fact + ' ' + badge(n.confidence) + '</li>').join('') + '</ul>';
  }

  // Notes as cards, with the icon of the first spell or talent they name.
  function renderNoteCards(notes) {
    return '<div class="note-grid">' + notes.map(n => {
      const icon = firstRef(n.fact);
      return '<div class="note-card' + (icon ? '' : ' plain-note') + '">' + (icon ? '<img src="' + iconUrl(icon) + '" alt="" loading="lazy">' : '') +
        '<div>' + n.fact + ' ' + badge(n.confidence) + '</div></div>';
    }).join('') + '</div>';
  }

  function pctLabel(p) {
    return '<span class="pct ' + (p < 0 ? 'down' : p > 0 ? 'up' : '') + '">' + (p > 0 ? '+' : '') + p + '%</span>';
  }

  function renderTotems(tot) {
    let html = renderNoteCards(tot.notes) + '<div class="panel" style="margin-top:16px"><h3>' + t('ov.totemsChanged') + ' ' + badge(tot.confidence) + '</h3>' +
      '<div class="table-wrap"><table class="cmp"><thead><tr><th>' + t('ov.colTotem') + '</th><th>Classic</th><th>Forever</th><th></th></tr></thead><tbody>';
    tot.changed.forEach(c => {
      html += '<tr><td class="no-refs"><span class="spell-ref"><img src="' + smallIcon(iconFor(c.totem)) + '" alt="">' + c.totem + '</span> <span class="dim">' + c.rank + '</span></td><td class="dim">' + c.classic + '</td>' +
        '<td>' + c.forever + '</td><td>' + pctLabel(c.pct) + '</td></tr>';
    });
    return html + '</tbody></table></div>' +
      '<p class="note-text dim">' + t('ov.totemsMore') + '</p></div>';
  }

  // Top-rank tooltip numbers, worked out live from the spellbook data.
  function renderDamage(dm) {
    let html = '<div class="panel"><h3>' + t('ov.damage') + ' ' + badge('client-data') + '</h3>' +
      '<p class="note-text">' + t('ov.damageIntro') + '</p>' +
      '<div class="dmg-list">';
    dm.spells.forEach(([name, rank]) => {
      const c = window.Spellbook.compare(name, rank);
      if (!c || c.pct == null) return;
      const left = Math.max(0, Math.min(100, 100 + c.pct));
      html += '<div class="dmg-row"><div class="dmg-name no-refs"><img src="' + smallIcon(iconFor(name)) + '" alt="">' + name + ' <span class="dim">' + rank.replace('Rank ', 'R') + '</span></div>' +
        '<div class="dmg-bar"><span style="width:' + left + '%"></span></div>' +
        '<div class="dmg-nums"><span class="dim">' + I18N.range(c.then) + '</span> → ' + I18N.range(c.now) + ' ' + pctLabel(c.pct) + '</div></div>';
    });
    return html + '</div>' + renderNotes(dm.notes) + '</div>';
  }

  function renderRaces(r) {
    const racials = window.SHAMAN_DATA.racials;
    let html = '<div class="panel"><h3>' + t('ov.races') + ' ' + badge(r.confidence) + '</h3>' +
      '<p class="note-text">' + r.note + '</p><div class="race-grid no-refs">';
    [Site.faction === 'horde' ? 'Horde' : 'Alliance'].forEach(faction => {
      (racials[faction] || []).filter(x => x.classes.includes('Shaman')).forEach(race => {
        const isNew = r.newToShaman.includes(race.race);
        html += '<div class="race-card ' + faction.toLowerCase() + '">' +
          '<div class="rc-head"><img src="' + iconUrl(race.icon) + '" alt=""><b>' + race.race + '</b>' +
          '<span class="rc-faction">' + faction + (isNew ? ' · ' + t('ov.newToShaman') : '') + '</span></div><ul>' +
          race.abilities.map(([name, text, icon]) =>
            '<li><img src="' + iconUrl(icon) + '" alt=""><div><b>' + name + '</b><span>' + I18N.client(text) + '</span></div></li>').join('') +
          '</ul>' + I18N.original(race.abilities.map(([name, text]) => '<b>' + name + ':</b> ' + text)) + '</div>';
      });
    });
    return html + '</div></div>';
  }

  // Class page: what applies to every spec, one section at a time.
  const CLASS_SECTIONS = ['notas', 'totems', 'dano', 'razas'];
  function renderClass(guide) {
    const section = Site.section('Clase', CLASS_SECTIONS);
    let html = pageHead(t('ov.role'), t('ov.title'), t('ov.intro'));
    html += Site.sectionTabs('Clase', CLASS_SECTIONS, section, k => t('cl.sec.' + k));
    if (section === 'totems') html += renderTotems(guide.totems);
    else if (section === 'dano') html += renderDamage(guide.damage);
    else if (section === 'razas') html += renderRaces(guide.races);
    else html += renderNoteCards(guide.classNotes);
    return html + renderSources(guide.sources, guide.caveat);
  }

  // ---------- news page ----------

  // "- **Name** #123: what" lines from the sync log.
  function changeLine(line) {
    return line.replace(/^- /, '')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/#(\d{3,})/, '<a href="https://www.wowhead.com/forever/item=$1" target="_blank" rel="noopener">#$1</a>');
  }

  function changeList(title, lines) {
    if (!lines.length) return '';
    const shown = 8;
    return '<div class="sub-label">' + title + ' (' + lines.length + ')</div><ul class="plain change-lines">' +
      lines.slice(0, shown).map(l => '<li>' + changeLine(l) + '</li>').join('') + '</ul>' +
      (lines.length > shown ? '<details class="more"><summary>' + t('news.more', { n: lines.length - shown }) + '</summary><ul class="plain change-lines">' +
        lines.slice(shown).map(l => '<li>' + changeLine(l) + '</li>').join('') + '</ul></details>' : '');
  }

  function niceDate(iso) {
    const d = new Date(iso + 'T12:00:00Z');
    return d.toLocaleDateString(I18N.lang === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderNews() {
    const news = window.NEWS_DATA || { site: [], data: [] };
    let html = pageHead(t('news.title'), t('news.title'), t('news.intro'));
    html += '<div class="news-cols">';

    // Calendar: past events dimmed, a "today" marker between past and future.
    const raw = window.GUIDE_DATA.Overview.timeline;
    const today = new Date();
    let marked = false;
    html += '<div class="panel"><h3>' + t('news.calendar') + '</h3><ol class="cal">';
    raw.forEach(e => {
      const when = new Date(e.date.en);
      const past = !isNaN(when) && when < today;
      if (!past && !marked) { marked = true; html += '<li class="cal-today"><span>' + t('news.today') + '</span></li>'; }
      html += '<li class="' + (past ? 'past' : 'future') + '"><span class="cal-date">' + I18N.localize(e.date) + '</span>' +
        '<span class="cal-event">' + I18N.localize(e.event) + ' ' + badge(e.confidence) + '</span></li>';
    });
    html += '</ol></div>';

    html += '<div class="col">';
    html += '<div class="panel"><h3>' + t('news.data') + '</h3><p class="note-text dim">' + t('news.dataIntro') +
      (window.SITE_META ? ' ' + t('news.lastSync', { date: niceDate(window.SITE_META.syncedAt) }) : '') + '</p>';
    if (!news.data.length) html += '<p class="note-text">' + t('news.dataEmpty') + '</p>';
    news.data.forEach(e => {
      html += '<div class="news-entry"><div class="news-date">' + niceDate(e.date) + ' <span class="dim">· build ' + e.build + '</span></div>' +
        changeList(t('news.talents'), e.talents) + changeList(t('news.items'), e.items) + '</div>';
    });
    html += '</div>';

    html += '<div class="panel"><h3>' + t('news.site') + '</h3>';
    I18N.localize(news.site).forEach(e => {
      html += '<div class="news-entry"><div class="news-date">' + niceDate(e.day) + '</div><b class="news-title">' + e.title + '</b>' +
        '<ul class="plain">' + e.items.map(i => '<li>' + i + '</li>').join('') + '</ul></div>';
    });
    html += '</div></div></div>';
    return html;
  }

  // ---------- pages ----------

  function render(page) {
    window.Calculator.hide();
    if (window.Weapons) window.Weapons.hide();
    const spec = Site.spec;
    // Every page but the class and news ones is about the chosen spec, and wears its color and art.
    const general = page === 'Clase' || page === 'Novedades';
    const color = general ? SPEC_COLORS.Clase : SPEC_COLORS[spec];
    const specColors = Object.assign({}, SPEC_COLORS, { Calculadora: color, Armas: color, Profesiones: color, Spellbook: color });
    const tree = window.SHAMAN_DATA.talents.trees.find(tr => tr.name === spec);
    const root = document.documentElement.style;
    root.setProperty('--spec-color', color);
    root.setProperty('--hero-bg', 'url(' + TREE_BG_BASE + tree.bg + '.jpg)');
    root.setProperty('--hero-icon', 'url(' + iconUrl(general ? CLASS_ICON : SPEC_ICONS[spec]) + ')');
    app.style.setProperty('--spec-color', color);
    document.body.dataset.page = page;
    const helpers = { badge, iconUrl, treeBg, renderSources, specColors };

    if (page === 'Profesiones') return window.Professions.render(app, helpers);
    if (page === 'Equipo') return window.Weapons.render(app, helpers);
    if (page === 'Hechizos') return window.Spellbook.render(app, helpers);
    if (page === 'Talentos') return window.Calculator.render(app, hashParts().slice(1), helpers);
    if (page === 'Novedades') { app.innerHTML = renderNews(); return; }
    app.innerHTML = page === 'Clase' ? renderClass(window.I18N.localize(window.GUIDE_DATA.Overview)) : renderGuidePage(spec);
    decorate(app);
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
