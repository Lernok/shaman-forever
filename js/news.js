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

  window.News = { render(app) { app.innerHTML = renderNews(); }, niceDate };
})();
