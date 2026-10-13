// Your leveling route: the zones a Shaman of your race and faction usually
// quests in at each level, from each zone's level band (data/zones.json, built
// from its quests' levels) and your race's starting zone. With no race picked
// ("any"), every starting zone of your faction counts.
(function () {
  const Z = window.ZONE_DATA || { zones: {}, dungeons: {}, starts: {} };
  // Shaman starting zones; other races' (Elwynn, Tirisfal...) are skipped too.
  const startZones = () => [...new Set(Object.values(Z.starts).map(s => s.zone))];
  const isStart = name => !!(Z.zones[name] || {}).start;
  // Starting zones are left after this level (the next zones begin around 10-12).
  const START_TOP = 12;

  const Route = {
    // Zones of your route around level `lvl`, best fit first (the band's middle
    // closest to that level).
    zonesAt(lvl, faction, race) {
      const mine = race && Z.starts[race] ? [Z.starts[race].zone] : startZones().filter(z => (Z.zones[z] || {})[faction]);
      return Object.entries(Z.zones).filter(([name, z]) => {
        const b = z[faction];
        if (!b) return false;
        if (isStart(name)) return mine.includes(name) && lvl <= Math.max(b[1], START_TOP);
        return lvl >= b[0] && lvl <= b[1];
      }).map(([name, z]) => ({ name, levels: z[faction], from: z.from }))
        .sort((a, b) => Math.abs((a.levels[0] + a.levels[1]) / 2 - lvl) - Math.abs((b.levels[0] + b.levels[1]) / 2 - lvl));
    },

    // Is a quest in `zone` at level `lvl` on your route?
    onRoute(zone, lvl, faction, race) {
      return Route.zonesAt(lvl, faction, race).some(z => z.name === zone);
    },

    // The route as brackets of levels: [{ from, to, zones: [names] }], merging
    // consecutive levels with the same zones.
    brackets(faction, race) {
      const out = [];
      for (let l = 1; l <= 60; l++) {
        const zones = Route.zonesAt(l, faction, race).map(z => z.name).sort();
        const last = out[out.length - 1];
        if (last && last.zones.join() === zones.join()) last.to = l;
        else out.push({ from: l, to: l, zones });
      }
      return out;
    },

    // A zone you'd go to: unknown zones (cities, dungeons) count; a zone only
    // the other faction quests in doesn't.
    reachable(zone, faction) {
      const z = Z.zones[zone];
      return !z || !!z[faction];
    },

    // Another race's starting zone: you don't go there.
    otherStart(zone, faction, race) {
      if (!isStart(zone)) return false;
      const mine = race && Z.starts[race] ? [Z.starts[race].zone] : startZones();
      return !mine.includes(zone);
    },

    dungeon: name => (Z.dungeons[name] || null),
    start: race => (Z.starts[race] || null),
    data: Z
  };

  window.Route = Route;
})();
