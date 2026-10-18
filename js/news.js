// News: the beta calendar, game data changes found by the daily sync
// (data/changelog.json) and site updates (data/news.json).
(function () {
  const I18N = window.I18N;
  const Site = window.Site;
  const UI = window.UI;
  const t = (key, vars) => I18N.t(key, vars);
  const { badge, pageHead, renderSources } = UI;
  const iconUrl = icon => UI.icon(icon);
  const smallIcon = icon => UI.icon(icon, 'medium');

  // "- **Name** #123: what" lines from the sync log.
  // The sync writes these in Spanish; English swaps the fixed words.
  const LINE_EN = [[/^Ítem nuevo: /, 'New item: '], [/^Ítem eliminado: /, 'Item removed: '], [/^Talento nuevo: /, 'New talent: '],
    [/^Talento eliminado: /, 'Talent removed: '], [/^Hechizo nuevo: /, 'New spell: '], [/, nivel (\d+)\)/, ', level $1)'],
    [/posición /g, 'position '], [/rangos /g, 'ranks '], [/requisito /g, 'requires '], [/texto: /g, 'text: '], [/efectos cambiados/g, 'effects changed']];
  function changeLine(line) {
    line = line.replace(/^- /, '');
    if (I18N.lang === 'en') LINE_EN.forEach(([re, to]) => { line = line.replace(re, to); });
    return line
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

  // What each build changed for the Shaman (data/patch-notes.json): spell by
  // spell, before → after, in the client's words (Spanish swaps the usual ones).
  const CLIENT_ES = [[/ of base mana/g, ' del maná base'], [/ of maximum mana/g, ' del maná máximo'], [/\bmana\b/g, 'maná'],
    [/(\d) (fire|nature|frost) damage/g, (m, n, s) => n + ' de daño de ' + { fire: 'Fuego', nature: 'Naturaleza', frost: 'Escarcha' }[s]],
    [/ to the enemy/g, ' al enemigo'], [/healing to the (friendly|chain-heal) target/g, 'de curación'], [/\(at level 60, ([+\d.]+) spell power\)/g, '(a nivel 60, $1 del poder con hechizos)'],
    [/\bparty aura\b/g, 'aura de grupo'], [/\braid aura\b/g, 'aura de banda'], [/restores (\d+) maná every (\d+) s/g, 'restaura $1 de maná cada $2 s'],
    [/^cast time /, 'tiempo de lanzamiento '], [/^duration /, 'duración '], [/^cooldown /, 'reutilización '], [/^range /, 'alcance '], [/^crit chance /, 'probabilidad de crítico '],
    [/ \(category\)/g, ''], [/\bup to\b/g, 'hasta']];
  const clientWords = v => (I18N.lang === 'es' ? CLIENT_ES.reduce((s, [re, to]) => s.replace(re, to), v) : v);
  const SPEC_ORDER = ['enhancement', 'elemental', 'restoration', 'other'];
  function patchSpell(s) {
    const ranks = s.ranks && s.ranks.length > 1 ? ' ' + t('news.p.ranks', { r: s.ranks[0] + '–' + s.ranks[s.ranks.length - 1] })
      : s.ranks ? ' ' + t('news.p.rank', { r: s.ranks[0] }) : '';
    const field = k => t('news.f.' + k.replace(/ \d+$/, '')) + (/\d$/.test(k) ? ' ' + k.match(/\d+$/)[0] : '');
    const lines = s.lines.map(l => field(l.k) + ': ' + (l.from && l.to ? clientWords(l.from) + ' → <b>' + clientWords(l.to) + '</b>'
      : l.to ? '<b>' + clientWords(l.to) + '</b>' : t('news.p.gone', { v: clientWords(l.from) })));
    return '<li>' + (s.status === 'changed' ? '' : '<span class="badge-mini">' + t('news.p.' + s.status) + '</span> ') + '<b>' + s.name + '</b>' + ranks +
      (lines.length ? '<ul class="plain patch-lines">' + lines.map(l => '<li>' + l + '</li>').join('') + '</ul>' : '') + '</li>';
  }
  function patchPanel(updates) {
    if (!updates || !updates.length) return '';
    let html = '<div class="panel"><h3>' + t('news.patches') + '</h3><p class="note-text dim">' + t('news.patchesIntro') + '</p>';
    updates.forEach((u, i) => {
      const told = u.spells.filter(s => s.lines.length || s.status !== 'changed');
      const quiet = u.spells.length - told.length;
      let body = '';
      SPEC_ORDER.forEach(spec => {
        const list = told.filter(s => s.spec === spec);
        if (list.length) body += '<div class="sub-label">' + t('news.p.spec.' + spec) + ' (' + list.length + ')</div><ul class="plain change-lines">' + list.map(patchSpell).join('') + '</ul>';
      });
      if (quiet) body += '<p class="note-text dim">' + t('news.p.quiet', { n: quiet }) + '</p>';
      const head = '<div class="news-date">' + (u.date ? niceDate(u.date) : '') + ' <span class="dim">· build ' + u.version + (u.hotfix ? ' · hotfix' : '') + '</span></div>' +
        '<b class="news-title">' + t('news.p.count', { n: u.spells.length }) + '</b>';
      // The newest open; older ones folded.
      html += '<div class="news-entry">' + (i === 0 ? head + body : '<details class="more"><summary>' + head + '</summary>' + body + '</details>') + '</div>';
    });
    return html + '<p class="note-text dim">' + t('news.patchesSource') + '</p></div>';
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
    html += patchPanel(news.patches);
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

  window.News = { render(app) { app.innerHTML = renderNews(); }, niceDate };
})();
