// Site-wide choices picked once in the header and remembered (spec, faction),
// and the sub-section strip inside long pages ("#Page/section" in the hash).
(function () {
  const SPECS = ['Enhancement', 'Elemental', 'Restoration'];
  const FACTIONS = ['horde', 'alliance'];
  const load = (key, allowed, fallback) => { const v = window.UI.store.get(key, fallback); return allowed.includes(v) ? v : fallback; };
  const listeners = [];

  const Site = {
    SPECS,
    FACTIONS,
    COLORS: { Elemental: '#e0742c', Enhancement: '#b07a42', Restoration: '#3fa9f5', Clase: '#c8aa6e' },
    // Talent tree icons stand for each spec.
    SPEC_ICONS: { Enhancement: 'spell_nature_lightningshield', Elemental: 'spell_nature_lightning', Restoration: 'spell_nature_magicimmunity' },
    CLASS_ICON: 'classicon_shaman',
    spec: load('spec', SPECS, 'Enhancement'),
    faction: load('faction', FACTIONS, 'horde'),

    set(key, value) {
      if (Site[key] === value) return;
      Site[key] = value;
      window.UI.store.set(key, value);
      listeners.forEach(fn => fn(key, value));
    },
    onChange(fn) { listeners.push(fn); },

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
