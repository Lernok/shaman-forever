// The report window: what's wrong, sent to the Google Form from the page
// itself (no new tab). Any element with data-feedback opens it:
//   data-kind   idea | bug | data | piece (the chip picked at first)
//   data-extra  what the report is about (e.g. a piece of Your path),
//               added to the context the site sends along;
//   data-about  how the window names it (e.g. the piece's name).
// The answer lands in the form's sheet and from there in GitHub issues
// (scripts/feedback.js). If sending fails, the form opens in a tab instead.
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const Site = window.Site;
  const KINDS = ['bug', 'data', 'idea'];
  let el = null;
  let state = null;

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function draw() {
    const s = state;
    let html = '<div class="setup fb-modal" role="dialog" aria-modal="true" aria-labelledby="fbTitle">' +
      '<div class="setup-head"><div><h2 id="fbTitle">' + t('fb.title') + '</h2><p>' + t('fb.intro') + '</p></div>' +
      '<button class="btn setup-x" data-close aria-label="' + t('setup.close') + '">×</button></div>';
    if (s.sent) {
      html += '<div class="fb-done"><b>' + t('fb.thanks') + '</b><p>' + t('fb.thanksText') + '</p>' +
        '<button class="btn setup-done" data-close>' + t('setup.close') + '</button></div></div>';
      el.innerHTML = html;
      return;
    }
    if (s.kind === 'piece') html += '<p class="fb-about">' + t('fb.kind.piece') + ': <b>' + esc(s.about || s.extra) + '</b></p>';
    else html += '<div class="fb-kinds">' + KINDS.map(k => '<button class="btn' + (s.kind === k ? ' active' : '') + '" data-kind-pick="' + k + '">' + t('fb.kind.' + k) + '</button>').join('') + '</div>';
    html += '<textarea class="fb-text" maxlength="3000" rows="5" placeholder="' + esc(t('fb.placeholder.' + s.kind)) + '">' + esc(s.text) + '</textarea>' +
      '<input class="fb-contact" maxlength="80" placeholder="' + esc(t('fb.contact')) + '" value="' + esc(s.contact) + '">' +
      '<details class="fb-ctx"><summary>' + t('fb.ctx') + '</summary><code>' + esc(context()) + '</code></details>' +
      (s.error ? '<p class="fb-error">' + t('fb.failed') + ' <a href="' + esc(Site.feedbackLink(s.kind, s.extra)) + '" target="_blank" rel="noopener">' + t('fb.openForm') + '</a></p>' : '') +
      '<div class="setup-foot"><button class="btn setup-done" data-send' + (s.sending ? ' disabled' : '') + '>' + t(s.sending ? 'fb.sending' : 'fb.send') + '</button>' +
      '<span class="dim fb-hint">' + t('fb.anon') + '</span></div></div>';
    el.innerHTML = html;
  }

  const context = () => Site.feedbackContext(state.kind, state.extra);

  async function send() {
    const F = Site.FEEDBACK;
    const text = state.text.trim() + (state.contact.trim() ? '\n\n— ' + state.contact.trim() : '');
    if (state.text.trim().length < 3) { el.querySelector('.fb-text').focus(); return; }
    state.sending = true; state.error = false; draw();
    try {
      const body = new URLSearchParams({ [F.fields.text]: text, [F.fields.context]: context() });
      // Google doesn't let a page read the answer (no-cors): a request that
      // goes out counts as sent; only a network failure counts as failed.
      await fetch(F.url.replace(/\/viewform.*$/, '/formResponse'), { method: 'POST', mode: 'no-cors', body });
      state.sent = true;
    } catch (e) {
      state.error = true;
    }
    state.sending = false;
    draw();
  }

  function onClick(e) {
    if (e.target === el) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) return close();
    if (b.dataset.kindPick) { keep(); state.kind = b.dataset.kindPick; draw(); el.querySelector('.fb-text').focus(); }
    if (b.hasAttribute('data-send')) { keep(); send(); }
  }

  // What was typed survives a redraw.
  function keep() {
    const ta = el.querySelector('.fb-text');
    const c = el.querySelector('.fb-contact');
    if (ta) state.text = ta.value;
    if (c) state.contact = c.value;
  }

  function open(kind, extra, about) {
    if (!Site.FEEDBACK.url) return;
    state = { kind: kind === 'piece' || KINDS.includes(kind) ? kind : 'idea', extra: extra || '', about: about || '', text: '', contact: '', sent: false, sending: false, error: false };
    if (!el) {
      el = document.createElement('div');
      el.className = 'setup-overlay';
      document.body.appendChild(el);
      el.addEventListener('click', onClick);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) close(); });
    }
    draw();
    el.hidden = false;
    document.body.classList.add('setup-open');
    el.querySelector('.fb-text').focus();
  }

  function close() {
    el.hidden = true;
    document.body.classList.remove('setup-open');
  }

  // One listener for every report button on the site.
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-feedback]');
    if (!b) return;
    e.preventDefault();
    open(b.dataset.kind, b.dataset.extra, b.dataset.about);
  });

  // A report button's markup.
  function button(label, kind, extra, cls, about) {
    if (!Site.FEEDBACK.url) return '';
    return '<button type="button" class="' + (cls || 'btn feedback-btn') + '" data-feedback data-kind="' + kind + '"' +
      (extra ? ' data-extra="' + esc(extra) + '"' : '') + (about ? ' data-about="' + esc(about) + '"' : '') + '>' + label + '</button>';
  }

  window.Feedback = { open, button };
})();
