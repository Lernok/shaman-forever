// Home: pick a spec, launch countdown, shortcuts to every page, latest news.
(function () {
  const I18N = window.I18N;
  const Site = window.Site;
  const UI = window.UI;
  const t = (key, vars) => I18N.t(key, vars);
  const { badge, pageHead, renderSources } = UI;
  const iconUrl = icon => UI.icon(icon);
  const smallIcon = icon => UI.icon(icon, 'medium');
  const SPEC_COLORS = Site.COLORS;
  const SPEC_ICONS = Site.SPEC_ICONS;
  const niceDate = iso => window.News.niceDate(iso);
  const tabs = Array.from(document.querySelectorAll('.spec-tab'));

  const LAUNCH = new Date('2026-11-04T23:00:00Z');
  function renderHome() {
    const days = Math.ceil((LAUNCH - new Date()) / 86400000);
    const launch = days > 0 ? t('home.launchIn', { n: days }) : days === 0 ? t('home.launchToday') : t('home.launched');
    let html = '<section class="home-hero"><div class="home-hero-text"><div class="role">' + t('home.kicker') + '</div>' +
      '<h2>' + t('home.title') + '</h2><p>' + t('home.tagline') + '</p></div>' +
      '<div class="countdown"><b>' + launch + '</b><span>' + t('home.launchDate') + '</span><span class="dim">' + t('home.betaEnds') + '</span></div></section>';

    html += '<h3 class="block-title">' + t('home.pick') + '</h3><div class="spec-cards">';
    Site.SPECS.forEach(spec => {
      const g = I18N.localize(window.GUIDE_DATA[spec]);
      const tree = window.SHAMAN_DATA.talents.trees.find(tr => tr.name === spec);
      // The summary's first sentences, enough for a line or two.
      const first = String(g.summary).replace(/<[^>]+>/g, '').split(/(?<=\.)\s/).reduce((a, x) => (a.length < 80 ? (a ? a + ' ' : '') + x : a), '');
      html += '<a class="spec-card' + (Site.spec === spec ? ' current' : '') + '" href="#Guia" data-go-spec="' + spec + '" style="--spec-color:' + SPEC_COLORS[spec] + ';--card-bg:url(' + UI.treeArt(tree.bg) + ')">' +
        '<img src="' + iconUrl(SPEC_ICONS[spec]) + '" alt="">' +
        '<span class="role">' + g.role + '</span><b>' + spec + '</b><span class="sc-line">' + first + '</span>' +
        '<span class="sc-go">' + t('home.goGuide') + '</span></a>';
    });
    html += '</div>';

    html += '<div class="home-cols"><div><h3 class="block-title">' + t('home.pages') + '</h3><div class="page-cards">';
    tabs.filter(b => b.dataset.spec !== 'Guia').forEach(b => {
      const p = b.dataset.spec;
      html += '<a class="page-card" href="#' + p + '"><img src="' + b.querySelector('img').src.replace('/medium/', '/large/') + '" alt="">' +
        '<span><b>' + t('tab.' + p) + '</b><span>' + t('home.desc.' + p) + '</span></span></a>';
    });
    html += '</div></div>';

    const news = I18N.localize((window.NEWS_DATA || { site: [] }).site).slice(0, 2);
    html += '<div><h3 class="block-title">' + t('home.latest') + '</h3><div class="panel home-news">' +
      news.map(e => '<div class="news-entry"><div class="news-date">' + niceDate(e.day) + '</div><b class="news-title">' + e.title + '</b>' +
        '<p class="note-text">' + e.items[0] + '</p></div>').join('') +
      '<a class="home-more" href="#Novedades">' + t('home.allNews') + '</a></div></div></div>';
    return html;
  }

  window.Home = {
    render(app) {
      app.innerHTML = renderHome();
      app.querySelectorAll('[data-go-spec]').forEach(a => a.addEventListener('click', () => Site.set('spec', a.dataset.goSpec)));
    }
  };
})();
