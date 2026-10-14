// Site-wide choices picked once in the header and remembered (spec, faction,
// race: 'any' shows everything as if none was picked),
// and the sub-section strip inside long pages ("#Page/section" in the hash).
(function () {
  const SPECS = ['Enhancement', 'Elemental', 'Restoration'];
  const FACTIONS = ['horde', 'alliance'];
  const load = (key, allowed, fallback) => { const v = window.UI.store.get(key, fallback); return allowed.includes(v) ? v : fallback; };
  const listeners = [];

  const Site = {
    // Feedback goes to a Google Form (js/feedback.js sends it from the page).
    // url: the form's "viewform" link; fields: the entry id of each question
    // (text: what's wrong; context: what the person was looking at).
    FEEDBACK: { url: 'https://docs.google.com/forms/d/e/1FAIpQLSfkp8ZYjanltzj9XBkwoEmwO7oJJepL2QrO1eSzHfb_O2ZxKA/viewform', fields: { text: 'entry.239420346', context: 'entry.663155691' } },
    // Anonymous visit counter (goatcounter.com, no cookies): the site's code.
    GOATCOUNTER: 'lernok',
    SPECS,
    FACTIONS,
    COLORS: { Elemental: '#e0742c', Enhancement: '#b07a42', Restoration: '#3fa9f5', Clase: '#c8aa6e' },
    // Talent tree icons stand for each spec.
    SPEC_ICONS: { Enhancement: 'spell_nature_lightningshield', Elemental: 'spell_nature_lightning', Restoration: 'spell_nature_magicimmunity' },
    CLASS_ICON: 'classicon_shaman',
    spec: load('spec', SPECS, 'Enhancement'),
    faction: load('faction', FACTIONS, 'horde'),
    race: window.UI.store.get('race', 'any'),

    // Races of a faction that can be Shaman: [{ race, icon }] (data/shaman.json).
    races(faction) {
      const list = (window.SHAMAN_DATA.racials || {})[faction === 'horde' ? 'Horde' : 'Alliance'] || [];
      return list.filter(r => r.classes.includes('Shaman')).map(r => ({ race: r.race, icon: r.icon }));
    },
    // The race only when it belongs to the faction; 'any' otherwise.
    validRace(race, faction) {
      return Site.races(faction).some(r => r.race === race) ? race : 'any';
    },

    set(key, value) {
      if (Site[key] === value) return;
      Site[key] = value;
      window.UI.store.set(key, value);
      // Another faction: a race of the old one no longer applies.
      if (key === 'faction' && Site.validRace(Site.race, value) !== Site.race) {
        Site.race = 'any';
        window.UI.store.set('race', 'any');
      }
      listeners.forEach(fn => fn(key, value));
    },
    // Several choices at once (the setup screen): one re-render, which also
    // picks up the professions it stored.
    setMany(values) {
      Object.entries(values).forEach(([k, v]) => { Site[k] = v; window.UI.store.set(k, v); });
      if (Site.validRace(Site.race, Site.faction) !== Site.race) {
        Site.race = 'any';
        window.UI.store.set('race', 'any');
      }
      listeners.forEach(fn => fn('setup'));
    },
    onChange(fn) { listeners.push(fn); },

    // What a report carries besides its text, read by scripts/feedback.js:
    //   kind | #Page/section | Race Spec (faction) | profs | lvl N | [extra]
    // kind is a code (idea, bug, data, piece), the same in both languages.
    feedbackContext(kind, extra) {
      const profs = window.UI.store.get('profs', []).join('+') || '-';
      return [kind, location.hash || '#Inicio', Site.race + ' ' + Site.spec + ' (' + Site.faction + ')', profs, 'lvl ' + window.UI.store.get('level', 1), extra || ''].filter(Boolean).join(' | ');
    },
    // The form in a tab, with the context filled in: the way out when the
    // report window can't send.
    feedbackLink(kind, extra) {
      const F = Site.FEEDBACK;
      if (!F.url) return null;
      return F.url + '?usp=pp_url&' + F.fields.context + '=' + encodeURIComponent(Site.feedbackContext(kind, extra));
    },

    // Current section of a page: the hash's second part if it's one of
    // `sections`, else the first section.
    section(page, sections) {
      const parts = location.hash.slice(1).split('/');
      return parts[0] === page && sections.includes(parts[1]) ? parts[1] : sections[0];
    },

    // Strip of section links; `label(s)` gives each one's text.
    sectionTabs(page, sections, active, label) {
      return '<nav class="subtabs">' + sections.map(s =>
        '<a class="subtab' + (s === active ? ' active' : '') + '" href="#' + page + '/' + s + '">' + label(s) + '</a>').join('') + '</nav>';
    }
  };

  window.Site = Site;
})();
