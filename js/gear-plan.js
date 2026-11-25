// Your gear path, slot by slot: which piece to get at each level and why, for
// your spec, faction, race (its leveling route, js/route.js) and professions.
// Data: data/gear.js (scripts/build-gear.js) and data/weapons.js (the weapon
// slot). Pure functions: the Equipo page
// draws the result; scripts can run it in Node too.
//
// How a piece is judged (an approximation, said on the page):
// - Value: the piece's stats, each turned into budget points (COST: what a
//   point of it costs in an item's stat budget) and weighted by how much your
//   spec wants it (WEIGHTS, declared below: WoWSims' measured weights for
//   Forever at 60, adjusted for leveling). A blue with more stats beats a green of the same item level, and
//   a piece full of stats you don't use is worth little. Enhancement's
//   two-hander is judged by its DPS.
// - Access, best first: a quest in a zone of your route > a group quest
//   there (an elite to kill) or a dungeon quest >
//   a trainer recipe of your profession > a Merchant's Favor recipe (the
//   patterns Pawani sells and the like; only if you ask for them, and then
//   all of them count, to see how long each lasts) > a dungeon boss drop
//   (only if you ask for drops: it may not drop). Drops out in the world
//   (BoEs, rare creatures) don't count: too unlikely or too dear to plan on.
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
    mp5: 2.5, crit: 14, hit: 10, spellCrit: 14, spellHit: 10, defense: 1, dodge: 12,
    // Forever's ratings (the client's numbers, scripts/client-items.js): at
    // 60, 14 crit rating = 1% crit and 10 hit rating = 1% hit, for melee and
    // spells alike (WoWSims' constants), the same price as the percentages.
    critRating: 1, hitRating: 1, hasteRating: 1, expertiseRating: 1, dodgeRating: 1
  };
  // How much each stat is worth to each spec (1 = all of it), measured with
  // WoWSims Forever (wowsims/forever master of 2026-11-25: the client's own
  // spell data with every hotfix to Nov 23, Windfury Totem's armor and
  // cooldown fix of Nov 16, Flurry's of Nov 17) in .cache/tools/enhsim2
  // (ep2.js): the stat added to the sim's default gear and the DPS it gains.
  // Leveling: alone, level 60 against a mob 2 levels above, no raid buffs or
  // consumables, the mean of 30 s and 45 s fights with full mana at the pull.
  // Raid (WEIGHTS_RAID, for Equipo › Pre-raid): a level 63 boss, raid buffs,
  // three minutes.
  const WEIGHTS = {
    // Enhancement, in AP per point (these units are half that: 1 Strength =
    // 2.2 AP = 1.1): Strength 2.2, Agility 1.37, Intellect 2.8 (1.98 in 30 s
    // fights, 3.63 in 45 s: you run out of mana, and Mental Dexterity turns
    // it into attack power), crit rating 2.68, hit rating 6.1 with none on
    // gear (2.6 here: nothing past the cap), expertise rating 4.2, haste
    // rating 1.95, spell damage 1.49, Nature 0.83, Fire 0.66. A point of
    // weapon DPS is 14.4 AP (DPS_WEIGHT). Stamina adds no damage; it keeps a
    // little for staying alive while leveling.
    Enhancement: { strength: 1.1, agility: 0.68, attackPower: 1, crit: 1.34, critRating: 1.34, hit: 2.6, hitRating: 2.6, hasteRating: 0.97, expertiseRating: 2.1,
      intellect: 1.4, stamina: 0.25, spellPower: 0.62, spellDamage: 0.88, natureDamage: 0.59, fireDamage: 0.47 },
    // Elemental, in spell power per point (these units are 1.2 per spell
    // power point, so each weight is that times 1.2 over the stat's price):
    // Nature 0.89, Fire and Frost 0.11 (Flame Shock), crit rating 0.53,
    // haste rating 0.81, Intellect 0.3 and MP5 0.15 (alone you don't run out
    // in 30-45 s), hit 0.6 (half the raid's: mobs of your level).
    Elemental: { spellPower: 1, spellDamage: 1, natureDamage: 0.89, fireDamage: 0.11, frostDamage: 0.11, intellect: 0.36, spellCrit: 0.64, critRating: 0.64,
      spellHit: 0.72, hitRating: 0.72, hasteRating: 0.97, mp5: 0.07, stamina: 0.25, spirit: 0.06 },
    // Restoration: WoWSims has no healing sim yet; Classic's usual weights.
    Restoration: { healing: 1, spellPower: 1, intellect: 0.75, mp5: 1, spirit: 0.5, spellCrit: 0.4, critRating: 0.4, hasteRating: 0.6, stamina: 0.25 }
  };
  const WEIGHTS_RAID = {
    // Per point in AP: Strength 2.2, Agility 1.56, Intellect 2.87 (out of
    // mana 27 s of 180 with raid buffs and no Mana Spring from others), crit
    // rating 2.88, hit rating 8.1 below the 8% cap (6.4 here for the cap),
    // expertise rating 5.45, haste rating 2.42, spell damage 1.31, Nature
    // 0.67, Fire 0.64, weapon DPS 14.4.
    Enhancement: { strength: 1.1, agility: 0.78, attackPower: 1, crit: 1.44, critRating: 1.44, hit: 3.2, hitRating: 3.2, hasteRating: 1.21, expertiseRating: 2.72,
      intellect: 1.43, stamina: 0, spellPower: 0.55, spellDamage: 0.77, natureDamage: 0.48, fireDamage: 0.46 },
    // In spell power: Nature 0.88, Fire 0.12, Intellect 0.61, Spirit 0.28,
    // MP5 0.8, crit rating 0.65, hit rating 1.57 below the cap, haste 0.69.
    Elemental: { spellPower: 1, spellDamage: 1, natureDamage: 0.88, fireDamage: 0.12, frostDamage: 0.12, intellect: 0.73, spellCrit: 0.78, critRating: 0.78,
      spellHit: 1.88, hitRating: 1.88, hasteRating: 0.83, mp5: 0.38, stamina: 0, spirit: 0.34 },
    Restoration: { healing: 1, spellPower: 1, intellect: 0.75, mp5: 1, spirit: 0.5, spellCrit: 0.4, critRating: 0.4, hasteRating: 0.6, stamina: 0 }
  };
  // Enhancement's two-hander: a point of weapon DPS in these units (14.4 AP).
  const DPS_WEIGHT = 7.2;
  // Your whole power, roughly, for the addon's "+3% damage" and its gear
  // level: unit = attack power (Enhancement) or spell power / healing
  // (casters) per point of these weights; base = what your spells and weapon
  // do with no stats, per level (the sims' DPS over their DPS per AP or SP,
  // minus the stats of their gear: ~4,500 AP-worth at 60 for Enhancement in
  // a raid, ~1,300 SP for Elemental); dps, crit, sp, int: AP or SP per point
  // of weapon DPS, 1% crit, spell damage, Intellect.
  const POWER = {
    Enhancement: { unit: 2, base: 13, dps: 14.4, crit: 38, sp: 1.5 },
    Elemental: { unit: 1 / 1.2, base: 12, crit: 7.5, int: 0.3 },
    Restoration: { unit: 1 / 1.2, base: 15, crit: 5.6, int: 0.6 }
  };
  // Stats that do the same for a spec are worth the same per point, priced
  // like the one they equal: to a healer "+healing" heals exactly like
  // "+damage and healing" (spell power), to Elemental "+spell damage" hits
  // like it (school damage only for its spells of that school: weight 0.6).
  // The budget price alone would make 67 healing worth less than 26 spell
  // power. In these units Intellect ~0.6, MP5 ~2 and 1% spell crit ~5-9
  // healing or damage, close to Classic's usual weights for these specs.
  const SAME = {
    Elemental: { spellDamage: 'spellPower', natureDamage: 'spellPower', fireDamage: 'spellPower', frostDamage: 'spellPower' },
    Restoration: { healing: 'spellPower' }
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
  const MIN_LEVELS = { class: 0, route: 0, group: 3, dquest: 3, quest: 5, crafted: 2, favor: 2, vendor: 4, boss: 3 };
  const TIER = { class: 1, route: 1, group: 2, dquest: 2, quest: 3, crafted: 4, favor: 5, vendor: 6, boss: 7 };
  // A quest's rewards are a choice: you get one of them. The Argent Dawn's
  // Armaments of Battle are turned in again and again, one piece each time.
  const REPEATABLE = /Armaments of Battle/;
  const rewardOf = s => (s.quest && !REPEATABLE.test(s.quest) ? [s.quest, s.faction === 'both' ? '' : s.faction || '', s.zone || s.dungeon || ''].join('|') : null);
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
  // Budget points of a piece: all of them and, without the neutral stats,
  // all and the ones your spec uses (for MIN_FIT); and its worth to the
  // spec (useful: each stat at its price for the spec, see SAME).
  function points(item, spec, weights) {
    const w = weights || WEIGHTS[spec];
    const same = SAME[spec] || {};
    const worth = k => COST[same[k] || k] * (w[k] || 0);
    let total = 0;
    let useful = 0;
    let coreTotal = 0;
    let coreUseful = 0;
    const add = (k, v) => {
      if (!v || !COST[k]) return;
      total += v * COST[k];
      useful += v * worth(k);
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
        useful += v * worth(k);
        coreUseful += v * COST[k] * (w[k] || 0);
        return;
      }
      add(k, v);
    });
    return { total, useful, coreTotal, coreUseful };
  }
  // Share of a piece's budget your spec uses, Stamina aside (a Stamina-only
  // piece fits anyone).
  function fit(item, spec, weights) {
    const p = points(item, spec, weights);
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
  // weights: another set of WEIGHTS (WEIGHTS_RAID for the pre-raid list).
  function value(item, spec, weights) {
    if (isWeapon(item)) {
      if (!WEAPON_KINDS[spec].includes(item.kind)) return 0;
      // Enhancement's two-hander: its DPS at what a point of weapon DPS is
      // worth, plus its stats (Rage of the Storm's 16 Strength).
      if (spec === 'Enhancement') return Math.round(((item.dps || 0) * DPS_WEIGHT + points(item, spec, weights).useful) * 10) / 10;
    }
    const p = points(item, spec, weights);
    let v;
    if (p.total) {
      // Mostly stats you don't use: not for you, whatever it adds up to.
      if (fit(item, spec, weights) < MIN_FIT) return 0;
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
  //   drops, favor (count Merchant's Favor recipes), route(zone, level), away(zone): zones you never go to,
  //   reach(zone): false for zones only the other faction quests in and
  //   dungeons in its land }
  function access(item, s, opts) {
    if (s.faction && s.faction !== 'both' && s.faction !== opts.faction) return null;
    // Quests for some races only (Call of Fire has a Skyborne one).
    if (s.races && opts.race && opts.race !== 'any' && !s.races.includes(opts.race)) return null;
    if (s.raid || s.pvp || s.endgame || BATTLEGROUND.test(s.zone || '')) return null;
    if (s.type === 'quest') {
      // Holiday and event quests (no level, no zone) can't be planned.
      if (!s.level && !s.zone) return null;
      // Class quests sit under the "Shaman" heading of the quest log.
      if (s.zone === CLASS_ZONE) return 'class';
      if (UNPLANNED.test(s.zone || '')) return null;
      if (PROF_ZONES.includes(s.zone) && !(opts.profs || []).includes(s.zone)) return null;
      if (opts.away && opts.away(s.zone)) return null;
      if (s.dungeon) return 'dquest';
      if (!opts.route(s.zone, s.rec)) return 'quest';
      // An elite to kill on your route: you need a group, like a dungeon quest.
      return s.group || (s.basis || {}).group ? 'group' : 'route';
    }
    if (s.type === 'crafted') {
      if (opts.profs && !opts.profs.includes(s.profession)) return null;
      const learn = s.learn || {};
      if (learn.type === 'favor') return opts.favor ? 'favor' : null;
      return learn.type === 'trainer' ? 'crafted' : null;
    }
    // Vendors deep in the other faction's land don't count.
    if (s.type === 'vendor') return UNPLANNED.test(s.zone || '') || (opts.reach && !opts.reach(s.zone)) ? null : 'vendor';
    // Dungeon bosses only: a BoE here is the dungeon's trash table, as unlikely as a world drop.
    if (s.type === 'boss' && item.bind !== 'equip' && opts.drops) return opts.reach && !opts.reach(s.zone) ? null : 'boss';
    return null;
  }

  // Every piece you could use, with its value and best way to get it.
  function candidates(gear, opts) {
    const out = [];
    // Group quests count as on the way unless you level alone (opts.groups false).
    const easy = a => a === 'group' && opts.groups !== false ? 'route' : a;
    const tier = a => TIER[easy(a)];
    gear.forEach(item => {
      const slot = slotOf(item);
      if (!slot || (slot === 'Off Hand' && opts.spec === 'Enhancement')) return;
      const bit = RACE_BIT[opts.race];
      if (bit && item.raceMask > 0 && !(item.raceMask & bit)) return;
      const v = value(item, opts.spec);
      if (!v) return;
      let best = null;
      item.sources.forEach(s => {
        if (opts.banned && opts.banned.has(rewardOf(s) + '#' + item.id)) return;
        const a = access(item, s, opts);
        if (!a) return;
        let at = Math.max(s.rec, item.req || 0);
        if (item.kind === 'Mail') at = Math.max(at, MAIL_AT);
        // A craft waits until your route reaches a trainer of its profession.
        if ((a === 'crafted' || a === 'favor') && opts.profAt) at = Math.max(at, opts.profAt(s.profession));
        // Farming everything yourself: a craft waits for its reagents (or never).
        if ((a === 'crafted' || a === 'favor') && opts.matsAt) at = Math.max(at, opts.matsAt(item, s));
        if (!isFinite(at)) return;
        if (!best || tier(a) < tier(best.access) || (tier(a) === tier(best.access) && at < best.at)) best = { access: a, at, source: s };
      });
      // Scarce Merchant's Favor isn't spent on a totem that isn't for your spec.
      if (best && best.access === 'favor' && slot === 'Relic' && effectFit(item, opts.spec) < 0.8) return;
      if (best && best.at <= 60) out.push(Object.assign({ item, slot, value: v, min: MIN_LEVELS[easy(best.access)] }, best));
    });
    return out;
  }

  // The path of one slot: the pieces you hold from each level on.
  function slotPath(list, count) {
    const pool = list.slice().sort((a, b) => a.at - b.at || b.value - a.value);
    const held = [];
    const steps = [];
    const skipped = [];
    // When a piece of worth `v` taken at `from` would be pushed out: once
    // `count` better ones (at least `v * UPGRADE`, different pieces) came,
    // since with two ring or trinket slots a better one replaces the weaker
    // of the two, not necessarily this one.
    const nextBetter = (v, from, except) => {
      const names = new Set();
      for (const c of pool) {
        if (c.at <= from || c === except || c.value < v * UPGRADE || names.has(c.item.name)) continue;
        names.add(c.item.name);
        if (names.size >= count) return c.at;
      }
      return 61;
    };
    for (let lvl = 1; lvl <= 60; lvl++) {
      pool.filter(c => c.at === lvl).sort((a, b) => b.value - a.value).forEach(c => {
        // Rings and trinkets are unique: never the same one twice.
        if (held.some(h => h === c || h.item.name === c.item.name)) return;
        const weakest = held.length < count ? null : held.reduce((a, b) => (a.value <= b.value ? a : b));
        if (weakest && c.value < weakest.value * UPGRADE) return;
        const until = nextBetter(c.value, lvl, c);
        const lasts = until - lvl;
        // A craft of your own for a slot that's empty is worth it however soon
        // it's replaced: you make such pieces anyway to raise the skill.
        const empty = !weakest && c.access === 'crafted';
        // Nothing replaces it before 60: you keep it at the level cap, however late it comes.
        if (lasts < c.min && until <= 60 && !empty) { skipped.push({ c, lasts, until }); return; }
        if (weakest) {
          held.splice(held.indexOf(weakest), 1);
          // What it replaces lasted until now, whatever the estimate said.
          const old = steps.find(st => st.pick === weakest);
          Object.assign(old, { until: lvl, lasts: lvl - old.level, weight: weighted(old.level, lvl) });
        }
        held.push(c);
        steps.push({ level: lvl, pick: c, replaces: weakest, lasts, until, weight: weighted(lvl, until) });
      });
    }
    // Still worn at 60: it lasts the whole way.
    steps.forEach(st => { if (held.includes(st.pick)) Object.assign(st, { until: 61, lasts: 61 - st.level, weight: weighted(st.level, 61) }); });
    return { steps, skipped };
  }

  // The path, taking one reward per quest: when two slots want rewards of the
  // same quest, the one that helps most (gain over what it replaces, times
  // how long it lasts) stays and the others find another piece.
  function plan(gear, opts) {
    const banned = new Set(opts.banned || []);
    let p;
    for (let i = 0; i < 12; i++) {
      p = planOnce(gear, Object.assign({}, opts, { banned }));
      const byQuest = {};
      SLOTS.forEach(s => p.slots[s].steps.forEach(st => {
        const k = rewardOf(st.pick.source || {});
        if (!k) return;
        const gain = (st.pick.value - (st.replaces ? st.replaces.value : 0)) * st.weight;
        const q = byQuest[k] = byQuest[k] || {};
        q[st.pick.item.id] = Math.max(q[st.pick.item.id] || 0, gain);
      }));
      const losers = [];
      Object.entries(byQuest).forEach(([k, q]) => {
        const ids = Object.keys(q).sort((a, b) => q[b] - q[a]);
        ids.slice(1).forEach(id => losers.push(k + '#' + id));
      });
      if (!losers.length) break;
      losers.forEach(l => banned.add(l));
    }
    return p;
  }

  function planOnce(gear, opts) {
    const all = candidates(gear, opts);
    const bySlot = {};
    SLOTS.forEach(s => { bySlot[s] = all.filter(c => c.slot === s); });
    const slots = {};
    SLOTS.forEach(s => { slots[s] = slotPath(bySlot[s], COUNT[s] || 1); });
    // What each Favor recipe of the path costs in gold (filled crates at
    // auction prices; none without prices). The first crate comes with a
    // one-time quest's bonus Favor: the first recipes cost only that crate.
    const paid = {};
    const favorSteps = SLOTS.flatMap(s => slots[s].steps).filter(st => st.pick.access === 'favor').sort((a, b) => a.level - b.level);
    let first = null;
    favorSteps.forEach(({ pick: c }) => {
      const per = opts.favorCost && opts.favorCost(c.at);
      if (!per) return;
      const n = ((c.source || {}).learn || {}).favor || 30;
      if (!first) first = Object.assign({ paid: false }, (opts.favorFirst && opts.favorFirst(c.at)) || { favor: 0 });
      const use = Math.min(first.favor, n);
      paid[c.item.id] = Math.round((n - use) * per + (use && !first.paid ? first.cost : 0));
      if (use) { first.favor -= use; first.paid = true; }
    });
    // "Don't miss" per zone: route quests whose reward made it into the path.
    const dontMiss = {};
    const onWay = a => a === 'route' || (a === 'group' && opts.groups !== false);
    SLOTS.forEach(s => slots[s].steps.filter(st => onWay(st.pick.access)).forEach(st => {
      const z = st.pick.source.zone || '?';
      (dontMiss[z] = dontMiss[z] || []).push(st);
    }));
    // A route quest beaten only by a craft or a boss drop stays there as the
    // alternative: your skill or materials may not be there in time, the drop
    // may not drop, and the quest is free.
    if (!opts.noAlt && (!opts.profs || opts.profs.length || opts.drops)) {
      const plain = plan(gear, Object.assign({}, opts, { profs: [], drops: false, noAlt: true, banned: null }));
      SLOTS.forEach(s => plain.slots[s].steps.filter(st => onWay(st.pick.access)).forEach(st => {
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
    return { slots, dontMiss, favor: favorSteps.map(st => st.pick.item.id), favorPaid: paid, candidates: all.length };
  }

  // Copper per point of Merchant's Favor at a level: the cheapest Waylaid
  // Crate of Textiles you can fill then, crate and bundle at auction prices
  // (data/favor.json, scripts/import-prices.js). Null without prices.
  function favorCost(level) {
    const C = root.CRAFT_DATA;
    const P = C && C.prices && C.prices.p;
    if (!P || !C.favor) return null;
    let best = null;
    C.favor.crates.filter(k => k.from <= level && P[k.crate]).forEach(k => {
      const fills = k.fills.map(f => f.every(([m]) => P[m]) ? f.reduce((a, [m, n]) => a + P[m] * n, 0) : null).filter(x => x != null);
      if (!fills.length) return;
      const per = (P[k.crate] + Math.min(...fills)) / k.favor;
      if (best == null || per < best) best = per;
    });
    return best;
  }

  // Your first crate: its Favor plus the one-time quest's, for the crate alone.
  function favorFirst(level) {
    const C = root.CRAFT_DATA;
    const per = favorCost(level);
    if (!per || !C.favor.firstBonus) return null;
    const B = C.favor.firstBonus;
    const k = C.favor.crates.filter(x => x.from <= level && C.prices.p[x.crate])
      .sort((a, b) => cratePrice(a) / (B + a.favor) - cratePrice(b) / (B + b.favor))[0];
    return k ? { favor: C.favor.firstBonus + k.favor, cost: cratePrice(k) } : null;
  }
  // A crate filled with its cheapest bundle, at auction prices.
  function cratePrice(k) {
    const P = root.CRAFT_DATA.prices.p;
    const fills = k.fills.filter(f => f.every(([m]) => P[m])).map(f => f.reduce((a, [m, n]) => a + P[m] * n, 0));
    return fills.length ? P[k.crate] + Math.min(...fills) : Infinity;
  }
  // Quest gold of a level (data/crafts.js, from Classic's quest rewards).

  root.GearPlan = { plan, value, fit, points, candidates, access, favorCost, favorFirst, SLOTS, WEIGHTS, WEIGHTS_RAID, DPS_WEIGHT, POWER, COST, MIN_LEVELS, UPGRADE };
})(typeof window !== 'undefined' ? window : globalThis);
