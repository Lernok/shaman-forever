// Your gear path, slot by slot: which piece to get at each level and why, for
// your spec, faction, race (its leveling route, js/route.js) and professions.
// Data: data/gear.js (scripts/build-gear.js) and data/weapons.js (the weapon
// slot). Pure functions: the Equipo page
// draws the result; scripts can run it in Node too.
//
// How a piece is judged (an approximation, said on the page):
// - Value: the piece's stats, each turned into budget points (COST: what a
//   point of it costs in an item's stat budget) and weighted by how much your
//   spec wants it (WEIGHTS, declared below; no measured weights for Forever
//   exist). A blue with more stats beats a green of the same item level, and
//   a piece full of stats you don't use is worth little. Enhancement's
//   two-hander is judged by its DPS.
// - Access, best first: a quest in a zone of your route > a dungeon quest >
//   a trainer recipe of your profession > a Merchant's Favor recipe (at most
//   FAVOR_PER_BRACKET per 10 levels: crates to fill are rare) > a boss drop
//   (only if you ask for drops: it may not drop).
// - Duration: how long it lasts before something you can get beats it,
//   weighted by leveling time (a level in the 30s takes far longer than one
//   in the 10s). Quests on your route are taken anyway; anything else has to
//   last a few levels (MIN_LEVELS) to be worth the detour.
(function (root) {
  // Budget points per point of each stat (rough Classic item costs): 2 attack
  // power cost as much as 1 Strength, 1% crit as much as 14 Strength...
  const COST = {
    strength: 1, agility: 1, stamina: 1, intellect: 1, spirit: 1, attackPower: 0.5,
    spellPower: 1.2, spellDamage: 0.85, healing: 0.55, natureDamage: 0.7, fireDamage: 0.7, frostDamage: 0.7, otherDamage: 0.7,
    mp5: 2.5, crit: 14, hit: 10, spellCrit: 14, spellHit: 10, defense: 1, dodge: 12
  };
  // How much each stat is worth to each spec (1 = all of it).
  const WEIGHTS = {
    // Enhancement, from the conversions (attack power = AP): 1 Strength =
    // 2 AP (1); 1% crit is worth about 22 AP at 60, and keeps Flurry up (0.8
    // of its 14-point cost); 20 Agility = 1% crit, so 1 Agility ~ 1.1 AP
    // (0.55); 1 Intellect = 1 AP with Mental Dexterity, plus mana (0.5);
    // spell power helps its shocks and Lightning Bolt a little (0.3).
    Enhancement: { strength: 1, agility: 0.55, attackPower: 1, crit: 0.8, hit: 1, intellect: 0.5, stamina: 0.25, spellPower: 0.3, spellDamage: 0.3, natureDamage: 0.15, fireDamage: 0.15 },
    // Elemental casts Flame Shock and Lava Burst (Fire) and Lightning Bolt
    // (Nature); melee crit and hit do nothing for it.
    Elemental: { spellPower: 1, spellDamage: 1, natureDamage: 0.6, fireDamage: 0.6, frostDamage: 0.15, intellect: 0.75, spellCrit: 0.75, spellHit: 0.6, mp5: 0.5, stamina: 0.25, spirit: 0.25 },
    Restoration: { healing: 1, spellPower: 1, intellect: 0.75, mp5: 1, spirit: 0.5, spellCrit: 0.4, stamina: 0.25 }
  };
  // Totems and trinkets judged by their effect: budget points per item level.
  const EFFECT_POINTS = 0.3;
  // Slots of the path; two rings and two trinkets.
  const SLOTS = ['Weapon', 'Head', 'Neck', 'Shoulder', 'Back', 'Chest', 'Wrist', 'Hands', 'Waist', 'Legs', 'Feet', 'Finger', 'Trinket', 'Off Hand', 'Relic'];
  const COUNT = { Finger: 2, Trinket: 2 };
  // Off hand: a shield or a held item; Enhancement wields a two-hander.
  const OFF_HAND = ['Shield', 'Held In Off-hand'];
  // Weapons each spec uses (as on Equipo › Progresión): Enhancement a
  // two-hander, judged by its DPS; casters a staff or a one-hander, by stats.
  const WEAPON_KINDS = {
    Enhancement: ['2H Axe', '2H Mace'],
    Elemental: ['Staff', '1H Mace', '1H Axe', 'Dagger', 'Fist'],
    Restoration: ['Staff', '1H Mace', '1H Axe', 'Dagger', 'Fist']
  };
  const isWeapon = item => item.dps != null && item.speed != null;
  const MAIL_AT = 40; // Shamans learn Mail at 40
  const UPGRADE = 1.05; // a piece must be 5% better to count as an upgrade
  const MIN_FIT = 0.5; // at least half of a piece's stats (Stamina aside) must be ones your spec uses
  const MIN_LEVELS = { class: 0, route: 0, dquest: 3, quest: 5, crafted: 4, favor: 6, vendor: 4, boss: 3 };
  const FAVOR_PER_BRACKET = 2;
  const TIER = { class: 1, route: 1, dquest: 2, quest: 3, crafted: 4, favor: 5, vendor: 6, boss: 7 };
  // Quest "zones" that aren't places: class quests, and ones you can't plan
  // a leveling path around (events, raids, PvP, other professions).
  const CLASS_ZONE = 'Shaman';
  const UNPLANNED = /^(Special|Invasion|Darkmoon Faire|Epic|Ahn'Qiraj|Ruins of Ahn'Qiraj|Naxxramas|Zul'Gurub|Blackwing Lair|Molten Core|Onyxia's Lair|Alterac Valley|Shen'dralas)$/;
  const BATTLEGROUND = /^(Alterac Valley|Warsong Gulch|Arathi Basin)$/;
  const PROF_ZONES = ['Alchemy', 'Blacksmithing', 'Enchanting', 'Engineering', 'Leatherworking', 'Tailoring', 'Cooking', 'Fishing', 'First Aid', 'Herbalism', 'Mining', 'Skinning'];
  // Race bits of the client's AllowableRace mask (Skyborne's isn't known: allowed).
  const RACE_BIT = { Orc: 2, Dwarf: 4, Tauren: 32, Troll: 128 };

  // Leveling time of one level, relative: grows with the level.
  const levelTime = l => l;
  const weighted = (from, to) => { let s = 0; for (let l = from; l < to; l++) s += levelTime(l); return s; };

  // Stats every spec takes a little of (Stamina): they add to a piece's
  // worth but don't decide whether the piece is for you.
  const NEUTRAL = ['stamina'];
  // Budget points of a piece: all of them, the ones your spec uses, and the
  // same two without the neutral stats (for MIN_FIT).
  function points(item, spec) {
    const w = WEIGHTS[spec];
    let total = 0;
    let useful = 0;
    let coreTotal = 0;
    let coreUseful = 0;
    const add = (k, v) => {
      if (!v || !COST[k]) return;
      total += v * COST[k];
      useful += v * COST[k] * (w[k] || 0);
      if (NEUTRAL.includes(k)) return;
      coreTotal += v * COST[k];
      coreUseful += v * COST[k] * (w[k] || 0);
    };
    Object.entries(item.stats || {}).forEach(([k, v]) => add(k, v));
    const b = item.bonus || {};
    // "Healing done by up to 22 and damage done by up to 7" is one healer's
    // stat: the damage comes with the healing, it costs no budget of its own
    // (it still counts for a caster who wants damage).
    const paired = b.healing && b.spellDamage && !b.spellPower;
    Object.entries(b).forEach(([k, v]) => {
      // "Damage and healing" (spellPower) already covers the healing line.
      if (k === 'healing' && b.spellPower) return;
      if (k === 'spellDamage' && paired) {
        const u = v * COST[k] * (w[k] || 0);
        useful += u;
        coreUseful += u;
        return;
      }
      add(k, v);
    });
    return { total, useful, coreTotal, coreUseful };
  }
  // Share of a piece's budget your spec uses, Stamina aside (a Stamina-only
  // piece fits anyone).
  function fit(item, spec) {
    const p = points(item, spec);
    if (!p.total) return 0;
    return p.coreTotal ? p.coreUseful / p.coreTotal : 1;
  }

  // Totems and many trinkets carry an effect instead of stats: it counts when
  // it names something the spec uses (a spell of its rotation, its main stat).
  // Forever has very few totems before 60, so any totem with an effect beats
  // an empty slot: one for your spec counts 0.8, pure utility (Grounding,
  // Reincarnation, totem mana) 0.4, another spec's effect 0.2.
  const EFFECT = {
    Enhancement: /Stormstrike|Windfury|Flametongue|Rockbiter|Earth Shock|Flame Shock|Frost Shock|Lightning Shield|Attack Power|melee|weapon damage|attack speed/i,
    Elemental: /Lightning Bolt|Chain Lightning|Lava Burst|Earth Shock|Flame Shock|Frost Shock|Searing Totem|Magma Totem|Fire Nova|spell damage|damage done by (magical )?spells|spell critical|Nature damage|Fire damage|[Mm]ana regeneration/i,
    Restoration: /Healing Wave|Chain Heal|Healing Stream|Mana Spring|Earth Shield|healing|[Mm]ana regeneration|mana per 5|[Rr]egain .*mana/i
  };
  function effectFit(item, spec) {
    const text = (item.equip || []).concat(item.use || []).join(' ');
    if (!text) return 0;
    if (EFFECT[spec].test(text)) return 0.8;
    if (item.slot !== 'Relic') return 0;
    return Object.keys(EFFECT).some(o => EFFECT[o].test(text)) ? 0.2 : 0.4;
  }

  // Worth of a piece to a spec (0 = useless to it).
  function value(item, spec) {
    if (isWeapon(item)) {
      if (!WEAPON_KINDS[spec].includes(item.kind)) return 0;
      if (spec === 'Enhancement') return item.dps || 0;
    }
    const p = points(item, spec);
    let v;
    if (p.total) {
      // Mostly stats you don't use: not for you, whatever it adds up to.
      if (fit(item, spec) < MIN_FIT) return 0;
      v = p.useful;
    } else {
      const f = ['Relic', 'Trinket'].includes(item.slot) ? effectFit(item, spec) : 0;
      if (!f || (f < MIN_FIT && item.slot !== 'Relic')) return 0;
      v = (item.ilvl || 0) * f * EFFECT_POINTS;
    }
    if (item.kind === 'Cloth' && spec === 'Enhancement') v *= 0.85;
    return Math.round(v * 10) / 10;
  }

  function slotOf(item) {
    if (isWeapon(item)) return 'Weapon';
    if (OFF_HAND.includes(item.slot)) return 'Off Hand';
    return SLOTS.includes(item.slot) ? item.slot : null;
  }

  // How you'd get a piece, as the best access you have; null if you can't.
  // opts: { spec, faction, race, profs (crafting professions; null = any),
  //   drops, route(zone, level), away(zone): zones you never go to,
  //   reach(zone): false for zones only the other faction quests in and
  //   dungeons in its land }
  function access(item, s, opts) {
    if (s.faction && s.faction !== 'both' && s.faction !== opts.faction) return null;
    if (s.raid || s.pvp || BATTLEGROUND.test(s.zone || '')) return null;
    if (s.type === 'quest') {
      // Holiday and event quests (no level, no zone) can't be planned.
      if (!s.level && !s.zone) return null;
      // Class quests sit under the "Shaman" heading of the quest log.
      if (s.zone === CLASS_ZONE) return 'class';
      if (UNPLANNED.test(s.zone || '')) return null;
      if (PROF_ZONES.includes(s.zone) && !(opts.profs || []).includes(s.zone)) return null;
      if (opts.away && opts.away(s.zone)) return null;
      if (s.dungeon) return 'dquest';
      return opts.route(s.zone, s.rec) ? 'route' : 'quest';
    }
    if (s.type === 'crafted') {
      if (opts.profs && !opts.profs.includes(s.profession)) return null;
      const learn = s.learn || {};
      if (learn.type === 'favor') return 'favor';
      return learn.type === 'trainer' ? 'crafted' : null;
    }
    // Vendors deep in the other faction's land don't count.
    if (s.type === 'vendor') return opts.reach && !opts.reach(s.zone) ? null : 'vendor';
    if ((s.type === 'boss' || s.type === 'drop') && opts.drops) return opts.reach && !opts.reach(s.zone) ? null : 'boss';
    return null;
  }

  // Every piece you could use, with its value and best way to get it.
  function candidates(gear, opts) {
    const out = [];
    gear.forEach(item => {
      const slot = slotOf(item);
      if (!slot || (slot === 'Off Hand' && opts.spec === 'Enhancement')) return;
      const bit = RACE_BIT[opts.race];
      if (bit && item.raceMask > 0 && !(item.raceMask & bit)) return;
      const v = value(item, opts.spec);
      if (!v) return;
      let best = null;
      item.sources.forEach(s => {
        const a = access(item, s, opts);
        if (!a) return;
        let at = Math.max(s.rec, item.req || 0);
        if (item.kind === 'Mail') at = Math.max(at, MAIL_AT);
        if (!best || TIER[a] < TIER[best.access] || (TIER[a] === TIER[best.access] && at < best.at)) best = { access: a, at, source: s };
      });
      // Scarce Merchant's Favor isn't spent on a totem that isn't for your spec.
      if (best && best.access === 'favor' && slot === 'Relic' && effectFit(item, opts.spec) < 0.8) return;
      if (best && best.at <= 60) out.push(Object.assign({ item, slot, value: v }, best));
    });
    return out;
  }

  // The path of one slot: the pieces you hold from each level on.
  function slotPath(list, count, allowFavor) {
    const pool = list.filter(c => c.access !== 'favor' || allowFavor.has(c.item.id)).sort((a, b) => a.at - b.at || b.value - a.value);
    const held = [];
    const steps = [];
    const skipped = [];
    // First level something at least `v * UPGRADE` is available, from `from` on.
    const nextBetter = (v, from, except) => {
      const n = pool.find(c => c.at > from && c.value >= v * UPGRADE && c !== except);
      return n ? n.at : 61;
    };
    for (let lvl = 1; lvl <= 60; lvl++) {
      pool.filter(c => c.at === lvl).sort((a, b) => b.value - a.value).forEach(c => {
        // Rings and trinkets are unique: never the same one twice.
        if (held.some(h => h === c || h.item.name === c.item.name)) return;
        const weakest = held.length < count ? null : held.reduce((a, b) => (a.value <= b.value ? a : b));
        if (weakest && c.value < weakest.value * UPGRADE) return;
        const until = nextBetter(c.value, lvl, c);
        const lasts = until - lvl;
        if (lasts < MIN_LEVELS[c.access]) { skipped.push({ c, lasts, until }); return; }
        if (weakest) held.splice(held.indexOf(weakest), 1);
        held.push(c);
        steps.push({ level: lvl, pick: c, replaces: weakest, lasts, until, weight: weighted(lvl, until) });
      });
    }
    return { steps, skipped };
  }

  function plan(gear, opts) {
    const all = candidates(gear, opts);
    const bySlot = {};
    SLOTS.forEach(s => { bySlot[s] = all.filter(c => c.slot === s); });
    // Merchant's Favor: the recipes that would help most (gain over what you'd
    // wear otherwise, times how long it lasts), FAVOR_PER_BRACKET per 10 levels.
    const none = new Set();
    const base = {};
    SLOTS.forEach(s => { base[s] = slotPath(bySlot[s], COUNT[s] || 1, none); });
    const scored = [];
    SLOTS.forEach(s => bySlot[s].filter(c => c.access === 'favor').forEach(c => {
      const wearing = base[s].steps.filter(st => st.level <= c.at).map(st => st.pick.value);
      const cur = wearing.length ? Math.min(...wearing.slice(-(COUNT[s] || 1))) : 0;
      if (c.value < cur * UPGRADE) return;
      const until = (base[s].steps.find(st => st.level > c.at && st.pick.value >= c.value * UPGRADE) || { level: 61 }).level;
      if (until - c.at < MIN_LEVELS.favor) return;
      scored.push({ c, score: (cur ? c.value / cur - 1 : 1) * weighted(c.at, until) });
    }));
    const favor = new Set();
    const perBracket = {};
    scored.sort((a, b) => b.score - a.score).forEach(({ c }) => {
      const br = Math.floor((c.at - 1) / 10);
      if ((perBracket[br] || 0) >= FAVOR_PER_BRACKET) return;
      perBracket[br] = (perBracket[br] || 0) + 1;
      favor.add(c.item.id);
    });
    const slots = {};
    SLOTS.forEach(s => { slots[s] = slotPath(bySlot[s], COUNT[s] || 1, favor); });
    // "Don't miss" per zone: route quests whose reward made it into the path.
    const dontMiss = {};
    SLOTS.forEach(s => slots[s].steps.filter(st => st.pick.access === 'route').forEach(st => {
      const z = st.pick.source.zone || '?';
      (dontMiss[z] = dontMiss[z] || []).push(st);
    }));
    // A route quest beaten only by a craft or a boss drop stays there as the
    // alternative: your skill or materials may not be there in time, the drop
    // may not drop, and the quest is free.
    if (!opts.noAlt && (!opts.profs || opts.profs.length || opts.drops)) {
      const plain = plan(gear, Object.assign({}, opts, { profs: [], drops: false, noAlt: true }));
      SLOTS.forEach(s => plain.slots[s].steps.filter(st => st.pick.access === 'route').forEach(st => {
        const mine = slots[s].steps;
        if (mine.some(m => m.pick.item.id === st.pick.item.id)) return;
        const held = mine.filter(m => m.level <= st.level).slice(-(COUNT[s] || 1));
        const craft = held.find(m => ['crafted', 'favor', 'boss'].includes(m.pick.access));
        if (!craft) return;
        const z = st.pick.source.zone || '?';
        (dontMiss[z] = dontMiss[z] || []).push(Object.assign({}, st, { alt: craft.pick, replaces: null }));
      }));
    }
    Object.values(dontMiss).forEach(l => l.sort((a, b) => a.level - b.level));
    return { slots, dontMiss, favor: [...favor], candidates: all.length };
  }

  root.GearPlan = { plan, value, fit, points, candidates, access, SLOTS, WEIGHTS, COST, MIN_LEVELS, FAVOR_PER_BRACKET, UPGRADE };
})(typeof window !== 'undefined' ? window : globalThis);
