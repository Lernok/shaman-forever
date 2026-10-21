// Leatherworking while leveling: level by level, the skins your route gives
// (beasts of your level in the zone you quest in, data/skinning.js), what to
// craft with them for the most skill per skin, which hides to keep, and when
// you can make each Leatherworking piece of your gear path. Optionally, what
// to buy at the auction house to have each piece on time.
//
// The model, on purpose simple and shown on the page:
// - XP to level up = (8 × level + Classic's extra from 29) kills of your level;
//   about 40% of it comes from kills while questing (KILL_SHARE), the rest
//   from quests. Of those kills, the zone's share of skinnable beasts are
//   skinned, times how much you skin (few / normal / everything).
// - A skin gives what Wowhead Classic records for beasts of that level
//   (Light Hide: 1 in 20). Pristine Leather (new, scarce): PRISTINE per skin
//   of beasts 11 to 25, an assumption until it is measured.
// - A craft's skill-up chance: 1 up to yellow, then falling to 0 at grey.
// - Recipes: the trainer's (up to your rank: Journeyman at 10, Expert at 20,
//   Artisan at 35) and the Merchant's Favor pieces of your path.
(function () {
  const KILL_SHARE = 0.4;
  const START_KILLS = 0.6;
  const START_SHARE = 0.8;
  const PRISTINE = 0.02;
  const PRISTINE_ID = 249427;
  // Bought from leatherworking supply vendors (threads, salt, dyes, bleach, buckles).
  const VENDOR = new Set([2320, 2321, 4291, 8343, 14341, 4289, 4340, 2324, 2325, 2604, 2605, 6260, 6261, 7071]);
  // Raw leathers and hides (skinned) and what's made from them.
  const LIGHT = 2318, LIGHT_HIDE = 783, CURED_LIGHT = 4231, MEDIUM = 2319, MEDIUM_HIDE = 4232, CURED_MEDIUM = 4233, HEAVY = 4234, HEAVY_HIDE = 4235, CURED_HEAVY = 4236, SCRAPS = 2934;
  // Skins one unit takes (how scarce it is): picks the recipes that spend the least.
  const SKINS = { [SCRAPS]: 1.7, [LIGHT]: 1.5, [LIGHT_HIDE]: 20, [MEDIUM]: 1.6, [MEDIUM_HIDE]: 25, [HEAVY]: 2, [HEAVY_HIDE]: 45, [PRISTINE_ID]: 50 };
  // Hides cured before use: the cure recipe and the raw hide.
  const CURE = { [CURED_LIGHT]: LIGHT_HIDE, [CURED_MEDIUM]: MEDIUM_HIDE, [CURED_HEAVY]: HEAVY_HIDE };
  // The leather made from the one below it (Light from 3 scraps, Medium from 4 Light...).
  const CONVERT = [LIGHT, MEDIUM, HEAVY];
  const INTENSITY = { few: 0.6, normal: 1, all: 1.6 };
  // Skill a recipe with Medium Leather needs, and from where Light Leather falls short.
  const BRIDGE = [40, 75];
  // Share of your kills by level difference with you.
  const AROUND = { '-2': 0.15, '-1': 0.25, 0: 0.35, 1: 0.25 };
  const rank = lvl => (lvl >= 35 ? 300 : lvl >= 20 ? 225 : lvl >= 10 ? 150 : 75);
  // Extra kills per level from 29 (Classic's XP formula).
  const diff = l => (l <= 28 ? 0 : l === 29 ? 1 : l === 30 ? 3 : l === 31 ? 6 : 5 * (l - 30));

  function chance(r, s) {
    if (s < r.skill[0]) return 0;
    if (s < r.skill[1]) return 1;
    if (s >= r.skill[3]) return 0;
    return (r.skill[3] - s) / (r.skill[3] - r.skill[1]);
  }

  /**
   * opts: { faction, race, targets: [{ id, level }], intensity: 'few'|'normal'|'all',
   *         skinning: bool, buy: bool (or buyFor: Set of target ids), to: level }
   * Returns { rows: [{ level, zone, skins, skill, crafts: {id: n}, made: [id], bought: {id: n}, keep: {id: n} }],
   *           made: { id: level }, bought: {id: n}, names }
   */
  function run(opts) {
    const S = window.SKINNING_DATA;
    const recipes = S.recipes;
    const byId = new Map(recipes.map(r => [r.id, r]));
    const targetIds = new Set(opts.targets.map(t => t.id));
    // Skill-ups use trainer recipes; Favor ones only as pieces of your path.
    const trainer = recipes.filter(r => r.how === 't');
    const inv = {};
    const bought = {};
    const madeAt = {};
    const add = (id, n) => { inv[id] = (inv[id] || 0) + n; };
    const have = id => inv[id] || 0;
    let skill = 1;
    const rows = [];
    const bridge = { level: null, items: {} };
    const mult = INTENSITY[opts.intensity] || 1;
    // Pieces you buy for, to have them on time.
    const buys = tg => opts.buy === true || !!(opts.buyFor && opts.buyFor.has(tg.id));

    const isVendor = id => VENDOR.has(id);
    const skinned = id => SKINS[id] != null || CURE[id] != null || CONVERT.includes(id);
    // Not skinned, not from a vendor (gems, alchemy reagents): bought, and listed.
    const fromAH = id => !isVendor(id) && !skinned(id) && !byId.has(id);
    // Turning scraps into Light Leather (or Light into Medium) is nearly free:
    // the lower leather is only good converted, so it's done while it still
    // raises the skill (the guides' "1-20: Light Leather").
    const cost = r => CONVERT.includes(r.id) ? 0.4 : r.mats.reduce((a, [id, n]) => a + n * (isVendor(id) ? 0.05 : SKINS[id] != null ? SKINS[id] : CURE[id] ? SKINS[CURE[id]] : fromAH(id) ? 15 : 8), 0);

    // ranges[id] = [skill when you start making it, skill when you stop]: the
    // order to level the profession in ("1 to 20: Light Leather").
    // gains[id]: the skill those crafts gave (to say the steps one after another).
    let ranges = {};
    let gains = {};
    // forMats[id]: of those crafts, the ones made as a material for another.
    let forMats = {};
    function craft(r, crafts, asMat) {
      if (asMat) forMats[r.id] = (forMats[r.id] || 0) + 1;
      const p = chance(r, skill);
      const from = Math.floor(skill);
      r.mats.forEach(([id, n]) => {
        if (isVendor(id)) return;
        if (fromAH(id)) { bought[id] = (bought[id] || 0) + n; return; }
        inv[id] -= n;
      });
      add(r.id, 1);
      const before = skill;
      skill = Math.min(capNow, skill + p);
      if (skill > before) gains[r.id] = (gains[r.id] || 0) + skill - before;
      crafts[r.id] = (crafts[r.id] || 0) + 1;
      // Only crafts that can raise the skill make the order to follow.
      if (p > 0) {
        const g = ranges[r.id] || [from, from];
        ranges[r.id] = [Math.min(g[0], from), Math.max(g[1], Math.floor(skill))];
      }
    }
    let capNow = 75;

    // Make `n` of an intermediate (cured hide, converted leather) from raw, if it can.
    function makeFrom(id, n, crafts, buy, buyLog) {
      const r = byId.get(id);
      for (let i = 0; i < n; i++) {
        if (!r || skill < r.skill[0]) return false;
        const ok = r.mats.every(([m, k]) => isVendor(m) || fromAH(m) || have(m) >= k || ensure(m, k, crafts, false, buyLog));
        if (!ok) return false;
        craft(r, crafts, true);
      }
      return true;
    }
    // Have `n` of `id` on hand: make it from what you skinned, or else buy it
    // (the leather itself, or the raw hide to cure).
    function ensure(id, n, crafts, buy, buyLog) {
      const short = n - have(id);
      if (short <= 0) return true;
      if ((CURE[id] || CONVERT.includes(id)) && canMake(id, Math.ceil(short)) && makeFrom(id, Math.ceil(short), crafts, false, buyLog) && have(id) >= n) return true;
      if (!buy) return false;
      const raw = CURE[id] || id;
      const need = Math.ceil(n - have(id));
      if (CURE[id]) { add(raw, need); buyLog[raw] = (buyLog[raw] || 0) + need; return makeFrom(id, need, crafts, buy, buyLog); }
      add(id, need);
      buyLog[id] = (buyLog[id] || 0) + need;
      return true;
    }
    // Enough on hand to make `n` of an intermediate without buying.
    function canMake(id, n) {
      const r = byId.get(id);
      return !!r && skill >= r.skill[0] && r.mats.every(([m, k]) => isVendor(m) || have(m) >= k * n);
    }
    const affordable = (r, keep) => r.mats.every(([id, n]) => isVendor(id) || fromAH(id) || have(id) - (keep[id] || 0) >= n);

    // Like the guides: a craft that raises the skill is kept until it turns
    // green ("1-30: Light Leather"), waiting for its materials rather than
    // switching back and forth.
    let current = null;
    let stall = 0;
    for (let L = 1; L <= opts.to; L++) {
      capNow = rank(L);
      let waited = false;
      const zone = (window.Route.zonesAt(L, opts.faction, opts.race)[0] || {}).name || null;
      const z = (zone && S.zones[zone]) || null;
      // Starting zones are beasts and kill quests: more of your XP comes from
      // kills and more of them skin (calibrated on 40-60 Ruined Leather
      // Scraps when an Orc leaves the Valley of Trials, about level 6).
      const start = zone && (window.ZONE_DATA.zones[zone] || {}).start;
      const share = Math.max(z ? z.share : 0.4, start ? START_SHARE : 0);
      const kills = start ? START_KILLS : KILL_SHARE;
      const skins = opts.skinning && L >= (opts.skinFrom || 1) ? Math.round(kills * (8 * L + diff(L)) * share * mult) : 0;
      // The beasts you meet are around your level, some a little lower.
      Object.entries(AROUND).forEach(([d, w]) => {
        const lv = Math.min(60, Math.max(1, L + Number(d)));
        Object.entries(S.yields[lv - 1] || {}).forEach(([id, p]) => add(Number(id), skins * w * p));
        if (lv >= 11 && lv <= 25) add(PRISTINE_ID, skins * w * PRISTINE);
      });

      // Keep the scarce hides the next pieces (6 levels ahead) ask for.
      const keep = {};
      opts.targets.filter(t => !madeAt[t.id] && t.level <= L + 6).forEach(t => (byId.get(t.id) || { mats: [] }).mats.forEach(([id, n]) => {
        const raw = CURE[id] || id;
        if ([LIGHT_HIDE, MEDIUM_HIDE, HEAVY_HIDE, PRISTINE_ID].includes(raw)) keep[raw] = (keep[raw] || 0) + n;
      }));

      const crafts = {};
      const buyLog = {};
      const made = [];
      ranges = {};
      gains = {};
      forMats = {};
      // No trainer yet: nothing to craft.
      for (let guard = L >= (opts.lwFrom || 1) ? 0 : 600; guard < 600; guard++) {
        // 1) A piece of your path, due now, that your skill allows.
        const due = opts.targets.find(t => !madeAt[t.id] && t.level <= L + 1 && byId.has(t.id) && skill >= byId.get(t.id).skill[0]);
        if (due) {
          const r = byId.get(due.id);
          const buyNow = buys(due) && due.level <= L;
          const ready = r.mats.every(([id, n]) => isVendor(id) || fromAH(id) || ensure(id, n, crafts, buyNow, buyLog));
          if (ready) { craft(r, crafts); madeAt[due.id] = L; made.push(due.id); continue; }
        }
        // 2) The most skill for the skins it spends, keeping what the next pieces need.
        const usable = trainer.filter(r => skill >= r.skill[0] && skill < capNow && chance(r, skill) >= 0.3 && !CURE[r.id]);
        const can = r => affordable(r, keep) || (CONVERT.includes(r.id) && affordable(r, {}));
        if (current && skill < current.skill[2] && skill < capNow) {
          if (can(current)) { craft(current, crafts); continue; }
          // Wait while the beasts of your level still give its material
          // (Ruined Leather Scraps up to level 10); a level or two otherwise.
          const comes = current.mats.every(([id]) => isVendor(id) || fromAH(id) || [L, L + 1].some(l => (S.yields[l - 1] || {})[CURE[id] || id]));
          if (comes || stall < 2) { waited = true; break; }
        }
        let best = null;
        usable.forEach(r => {
          if (!can(r)) return;
          const v = chance(r, skill) / cost(r);
          if (!best || v > best.v) best = { r, v };
        });
        if (best) { current = best.r; craft(best.r, crafts); continue; }
        // 3) Buying: short of skill for a piece that's due, buy the cheapest leather for skill-ups.
        const late = opts.targets.find(t => buys(t) && !madeAt[t.id] && t.level <= L && byId.has(t.id) && skill < byId.get(t.id).skill[0]);
        // The 70-75 wall: nothing there uses Medium Leather, which is what drops
        // once Light Leather stops; a little Light Leather bought gets you over.
        const wall = opts.bridge !== false && skill >= BRIDGE[0] && skill < BRIDGE[1] && L >= 21;
        if ((late || wall) && skill < capNow) {
          const pick = usable.filter(r => r.mats.every(([id]) => isVendor(id) || fromAH(id) || id === LIGHT || id === MEDIUM || id === HEAVY))
            .map(r => ({ r, v: chance(r, skill) / cost(r) })).sort((a, b) => b.v - a.v)[0];
          if (pick) {
            pick.r.mats.forEach(([id, n]) => {
              if (isVendor(id) || fromAH(id) || have(id) >= n) return;
              const k = n - have(id);
              add(id, k);
              if (late) buyLog[id] = (buyLog[id] || 0) + k;
              else { bridge.level = bridge.level || L; bridge.items[id] = (bridge.items[id] || 0) + k; }
            });
            craft(pick.r, crafts);
            continue;
          }
        }
        break;
      }
      stall = waited ? stall + 1 : 0;
      Object.entries(buyLog).forEach(([id, n]) => { bought[id] = (bought[id] || 0) + n; });
      rows.push({ level: L, zone, skins, skill: Math.floor(skill), crafts, ranges, gains, forMats, made, bought: buyLog,
        keep: Object.fromEntries(Object.entries(keep).filter(([id]) => have(Number(id)) >= 1).map(([id, n]) => [id, Math.min(n, Math.floor(have(Number(id))))])) });
    }
    return { rows, made: madeAt, bought, bridge };
  }

  // The best beasts to skin in a zone around a level (most numerous first).
  function beasts(zone, lvl) {
    const z = (window.SKINNING_DATA.zones || {})[zone];
    if (!z) return [];
    return z.beasts.filter(b => b.level[1] >= lvl - 3 && b.level[0] <= lvl + 2).slice(0, 3);
  }

  /**
   * Each piece of your path: the level you'd make it with what you skin, and
   * what buying it on time adds (bought for it and every piece before it).
   * Returns { base: run without buying, pieces: [{ id, level, alone, onTime, extra: {item: n} }] }.
   */
  function pieces(opts) {
    const targets = opts.targets.slice().sort((a, b) => a.level - b.level);
    const base = run(Object.assign({}, opts, { targets, buy: false }));
    const buyFor = new Set();
    let before = {};
    const out = targets.map(tg => {
      buyFor.add(tg.id);
      const res = run(Object.assign({}, opts, { targets, buy: false, buyFor }));
      const extra = {};
      // Leathers and hides only: gems and alchemy reagents are the recipe's own, listed with it.
      Object.entries(res.bought).forEach(([id, n]) => { const d = Math.round(n - (before[id] || 0)); if (d > 0 && SKINS[id] != null) extra[id] = d; });
      before = res.bought;
      return { id: tg.id, level: tg.level, alone: base.made[tg.id] || null, onTime: res.made[tg.id] || null, extra };
    });
    return { base, pieces: out };
  }

  // Farming everything yourself (no auction house): the first level you can
  // gather a Leatherworking piece's reagents that aren't skinned, made by
  // Leatherworking or sold by vendors (data/skinning.js reagents): a creature
  // of about your level in a zone of your levels that drops it often enough
  // (not elite, not of your faction; skinned ones need Skinning), a
  // profession of yours that makes it (Alchemy) or gathers it (Mining).
  // Infinity: never by yourself. 0: no constraint (not Leatherworking).
  const FARM_MIN = 0.05;
  const MAKES = { alchemy: 'Alchemy', tailoring: 'Tailoring', blacksmithing: 'Blacksmithing', engineering: 'Engineering', enchanting: 'Enchanting', cooking: 'Cooking' };
  const zoneCache = {};
  function zonesOf(lvl, faction, race) {
    const k = lvl + faction + race;
    if (!zoneCache[k]) zoneCache[k] = new Set(window.Route.zonesAt(lvl, faction, race).map(z => z.name));
    return zoneCache[k];
  }
  function matsAt(itemId, ctx) {
    const SK = window.SKINNING_DATA;
    if (!SK || !SK.reagents) return 0;
    const r = SK.recipes.find(x => x.id === itemId);
    if (!r) return 0;
    const profs = ctx.profs || [];
    const side = ctx.faction === 'alliance' ? 'A' : 'H';
    const made = new Set(SK.recipes.map(x => x.id));
    let at = 0;
    r.mats.forEach(([m]) => {
      if (SK.skin.includes(m) || made.has(m) || VENDOR.has(m)) return;
      if (m === PRISTINE_ID) { if (!profs.includes('Skinning')) at = Infinity; return; }
      const e = SK.reagents[m] || {};
      if (e.v) return;
      let best = Infinity;
      if (e.c && profs.includes(MAKES[e.c[0]])) best = 0;
      if (e.g && e.g.mined && profs.includes('Mining')) best = 0;
      const drops = (e.d || []).filter(d => d[6] !== side && !(d[5] & 1) && d[3] >= FARM_MIN && (!(d[5] & 2) || profs.includes('Skinning')));
      for (let L = 1; L <= 60 && best > L; L++) {
        const zs = zonesOf(L, ctx.faction, ctx.race);
        if (drops.some(d => d[1] <= L + 2 && d[1] >= L - 8 && d[4].some(z => zs.has(z)))) best = L;
      }
      at = Math.max(at, best);
    });
    return at;
  }

  // A gear path (js/gear-plan.js) whose Leatherworking pieces wait for the
  // level this plan makes them: with the auction house, as soon as your skill
  // gets there (it buys the leather and hides); farming everything, with what
  // you skin. Planned again with those levels, so the path takes something
  // else meanwhile; farming, other pieces change which hides you keep, so
  // again until the pieces stay put. A piece's wait only grows from round to
  // round, so it settles (two or three rounds). Equipo, Profesiones and
  // scripts/plan.js, audit-path.js all plan through here.
  //   ctx: { picked: your professions (Skinning too), farm, intensity }
  const PATH_CAP = 30;
  const lwSteps = plan => Object.values(plan.slots).flatMap(p => p.steps).filter(st => (st.pick.source || {}).profession === 'Leatherworking');
  const lwKey = plan => lwSteps(plan).map(st => st.pick.item.id + '@' + st.level).sort().join(',');
  function settle(gear, opts, ctx) {
    let plan = window.GearPlan.plan(gear, opts);
    if (!(opts.profs || []).includes('Leatherworking') || !window.SKINNING_DATA) return plan;
    const wait = new Map();
    for (let round = 0; round < 5; round++) {
      const lwAt = waits(plan, opts, ctx);
      const at = item => { const n = Math.max(wait.get(item.id) || 0, lwAt(item)); wait.set(item.id, n); return n; };
      const next = window.GearPlan.plan(gear, Object.assign({}, opts, {
        matsAt: (item, s) => Math.max(opts.matsAt ? opts.matsAt(item, s) : 0, s.profession === 'Leatherworking' ? at(item) : 0)
      }));
      const same = lwKey(next) === lwKey(plan);
      plan = next;
      if (same) break;
    }
    return plan;
  }
  // The level you make each piece, from this plan run on a path's pieces up
  // to the beta's cap: one it doesn't reach by then waits until after it.
  function waits(plan, opts, ctx) {
    const SK = window.SKINNING_DATA;
    const steps = lwSteps(plan).filter(st => st.level <= PATH_CAP);
    const skinning = (ctx.picked || []).includes('Skinning');
    const from = p => window.Route.profFrom(p, opts.faction, opts.race).level;
    const res = run({
      faction: opts.faction, race: opts.race, targets: steps.map(st => ({ id: st.pick.item.id, level: st.level })).sort((a, b) => a.level - b.level),
      intensity: INTENSITY[ctx.intensity] ? ctx.intensity : 'normal', skinning, to: PATH_CAP, buy: !ctx.farm,
      lwFrom: from('Leatherworking'), skinFrom: skinning ? from('Skinning') : 61
    });
    const recipe = new Map(SK.recipes.map(r => [r.id, r]));
    const wanted = new Set(steps.map(st => st.pick.item.id));
    return item => {
      if (res.made[item.id]) return res.made[item.id];
      if (wanted.has(item.id)) return PATH_CAP + 1;
      const r = recipe.get(item.id);
      if (!r) return 0;
      // Not one of the path's pieces: the level your skill reaches its recipe.
      const row = res.rows.find(x => x.skill >= r.skill[0]);
      return row ? row.level : PATH_CAP + 1;
    };
  }

  window.LwPlan = { run, pieces, beasts, matsAt, settle, KILL_SHARE, PRISTINE };
})();
