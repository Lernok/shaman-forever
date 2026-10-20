// Professions page, built around the player's plan:
//   subir       Leatherworking while leveling (js/lw-plan.js): what to skin,
//               craft and keep at each level, and your pieces on time
//   plan        your two professions (shared with the Gear page), their camp
//               objects and, every 10 levels, only what's worth crafting: the
//               crafted pieces of your gear path (js/gear-plan.js), your 1-2
//               Merchant's Favor recipes with their cost
//   cocina      the best food for your spec in each level bracket; leveling
//               Cooking and Fishing is left to wow-professions.com's guides
//   auxilios    first aid: a bandage per level bracket, potions, cures
//   sistemas    Forever's systems (Merchant's Favor, camping, Legacy…)
// Data: data/guides/professions.json (content), data/professions.js (crafted
// gear), data/consumables.js (food, first aid, fish), data/camp.js.
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const Site = window.Site;
  const UI = window.UI;
  let ui = null;
  let container = null;
  const SECTIONS = ['plan', 'subir', 'cocina', 'auxilios', 'sistemas'];
  const CRAFTING = ['Leatherworking', 'Blacksmithing', 'Tailoring', 'Enchanting', 'Engineering', 'Alchemy'];
  const GATHERING = ['Skinning', 'Mining', 'Herbalism'];
  const PRIMARY = ['Leatherworking', 'Skinning', 'Blacksmithing', 'Mining', 'Tailoring', 'Enchanting', 'Engineering', 'Herbalism', 'Alchemy'];
  // Which crafting profession a gathering one supplies.
  const FEEDS = { Skinning: ['Leatherworking'], Mining: ['Blacksmithing', 'Engineering'], Herbalism: ['Alchemy'] };
  const PROF_ICONS = {
    Leatherworking: 'trade_leatherworking', Blacksmithing: 'trade_blacksmithing', Tailoring: 'trade_tailoring',
    Enchanting: 'trade_engraving', Engineering: 'trade_engineering', Skinning: 'inv_misc_pelt_wolf_01',
    Mining: 'trade_mining', Herbalism: 'spell_nature_naturetouchgrow', Alchemy: 'trade_alchemy',
    Cooking: 'inv_misc_food_15', Fishing: 'trade_fishing', 'First Aid': 'spell_holy_sealofsacrifice'
  };
  // Every 10 levels; the beta is capped at 30.
  const BRACKETS = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 49], [50, 60]];
  const BETA_CAP = 30;
  // The new systems, in the order of data/guides/professions.json.
  const SYSTEM_ICONS = ['inv_misc_book_09', 'inv_misc_coin_02', 'inv_misc_bag_10', 'spell_holy_wordfortitude', 'inv_scroll_03'];
  // The bandage for each bracket follows the cloth its enemies drop.
  const BANDAGES = [['Linen Bandage', 'Heavy Linen Bandage'], ['Wool Bandage', 'Heavy Wool Bandage'], ['Silk Bandage', 'Heavy Silk Bandage'],
    ['Mageweave Bandage', 'Heavy Mageweave Bandage'], ['Runecloth Bandage', 'Heavy Runecloth Bandage'], ['Heavy Runecloth Bandage', 'Dense Runecloth Bandage']];

  const profIcon = (p, cls) => '<img class="' + (cls || 'prof-icon') + '" src="' + UI.icon(PROF_ICONS[p]) + '" alt="" loading="lazy">';
  const myProfs = () => UI.store.get('profs', []).filter(p => PRIMARY.includes(p));
  const consumables = () => (window.CONSUMABLE_DATA || { items: [], fish: {} });
  const guide = () => window.I18N.localize(window.GUIDE_DATA.Professions);
  const bracketHead = ([lo, hi]) => '<div class="br-title"><b>' + t('pr.levels', { lo, hi }) + '</b>' + (lo > BETA_CAP ? '<span class="dim">' + t('pr.postCap') + '</span>' : '') + '</div>';

  // ---------- text helpers ----------

  // classicwowforever's "how to learn" lines are formulaic; translate the
  // fixed parts and keep names (vendors, factions, zones) as they are.
  const REP = { Friendly: 'Amistoso', Honored: 'Honorable', Revered: 'Reverenciado', Exalted: 'Exaltado' };
  function learnText(text) {
    if (!text) return t('pr.learnUnknown');
    if (window.I18N.lang !== 'es') return text;
    return text
      .replace(/^Pattern\b/, 'Patrón').replace(/^Plans\b/, 'Planos').replace(/^Formula\b/, 'Fórmula')
      .replace(/^Schematic\b/, 'Esquema').replace(/^Recipe\b/, 'Receta')
      .replace(/ for (\d+) Merchant.s Favor/, ' por $1 de Merchant\'s Favor')
      .replace(/^Trainer, (.*), learn at (≈?\d+)/, 'Entrenador, $1, se aprende con $2')
      .replace(/^Known from the start/, 'Se conoce desde el principio')
      .replace(/[Ss]ource not found yet/, 'fuente todavía desconocida')
      .replace(/, binds on pickup/, ', se liga al recogerlo')
      .replace(/, needs reputation/, ', pide reputación')
      .replace(/, dungeon vendor/, ', vendedor de dungeon')
      .replace(/world drop or fishing/, 'drop del mundo o pesca').replace(/world drop/, 'drop del mundo')
      .replace(/drop or fishing/, 'drop o pesca')
      .replace(/drops from (.+?) in /, 'cae de $1 en ').replace(/drops from /, 'cae de ').replace(/drops in /, 'cae en ')
      .replace(/: from (.+?) in /, ': de $1 en ')
      .replace(/ and (\d+) more/, ' y $1 más')
      .replace(/\) or /g, ') o ')
      .replace(/^Vendor$/, 'Vendedor')
      .replace(/, (Friendly|Honored|Revered|Exalted)/, (m, r) => ', ' + REP[r]);
  }

  function learnLine(f) {
    const L = f.learn || {};
    if (L.type !== 'recipe') return t('pr.learn.' + (L.type || 'unknown'));
    // Your faction's vendor or quest first.
    const mine = x => (!x.faction || x.faction === 'both' || x.faction === Site.faction ? 0 : 1);
    const s = (L.sources || []).slice().sort((a, b) => mine(a) - mine(b))[0];
    const where = !s ? t('pr.learn.unknown') : s.type === 'vendor' ? t('pr.learn.vendor', { npc: s.npc, zone: s.zone || '?' })
      : s.type === 'drop' ? t('pr.learn.drop', { npc: s.npc, zone: s.zone || '?' }) : t('pr.learn.quest', { quest: s.quest });
    return t('pr.learn.recipe') + ': ' + where + ((L.sources || []).length > 1 ? ' …' : '');
  }

  // What a consumable does, in the site's language: built from the client text's numbers.
  function useText(f) {
    const I = window.I18N;
    if (I.lang !== 'es') return f.use;
    const u = f.use;
    const parts = [];
    let m;
    if ((m = u.match(/Restores (\d+) health over (\d+) sec/i))) parts.push('Restaura ' + m[1] + ' de salud en ' + m[2] + ' s');
    if ((m = u.match(/Restores (\d+) mana over (\d+) sec/i))) parts.push('Restaura ' + m[1] + ' de maná en ' + m[2] + ' s');
    if ((m = u.match(/Restores (\d+) to (\d+) health/i))) parts.push('Restaura ' + m[1] + ' a ' + m[2] + ' de salud');
    if ((m = u.match(/Heals (\d+) damage over (\d+) sec/i))) parts.push('Cura ' + m[1] + ' de daño en ' + m[2] + ' s');
    if ((m = u.match(/cured of (poisons|diseases|bleeds) up to level (\d+)/i))) parts.push('Cura ' + { poisons: 'venenos', diseases: 'enfermedades', bleeds: 'sangrados' }[m[1].toLowerCase()] + ' hasta nivel ' + m[2]);
    if (f.buff) {
      const b = f.buff;
      const gain = b.stat !== 'other' ? '+' + b.amount + (b.stat === 'crit' ? '%' : '') + ' de ' + t('pr.stat.' + b.stat) : b.text;
      parts.push('Si comés al menos 10 s quedás Well Fed: ' + gain + ' por 15 min' + (f.xp ? ' y +' + f.xp + '% de experiencia al matar' : ''));
    }
    return parts.length ? parts.join('. ') + '.' : u;
  }

  // The client gives the skill range where a recipe still raises your skill (yellow to grey).
  const skillRange = f => (f.skill[1] ? t('pr.skillRange', { low: f.skill[1], high: f.skill[2] }) : '');

  function foodCard(f) {
    const I = window.I18N;
    return '<div class="it-head"><img class="it-icon qb' + f.quality + '" src="' + UI.icon(f.icon) + '" alt=""><div><div class="t-name q' + (f.quality || 1) + '">' + f.name + '</div>' +
      '<div class="t-cost">' + f.profession + (f.skill[1] ? ' · ' + skillRange(f) : '') + (f.req > 1 ? ' · ' + t('pr.atLevel', { n: f.req }) : '') + '</div></div></div>' +
      '<div class="t-rank">' + useText(f) + '</div>' + (I.lang === 'es' ? I.original([f.use]) : '') +
      ((f.reagents || []).length ? '<div class="t-cost">' + t('pr.cook.needs') + ': ' + f.reagents.map(r => r.name + (r.count > 1 ? ' ×' + r.count : '')).join(', ') + '</div>' : '') +
      '<hr class="t-sep"><div class="t-rank">' + learnLine(f) + '</div>';
  }

  const foodLink = f => '<span class="food-chip" data-food="' + f.id + '"><img src="' + UI.icon(f.icon, 'medium') + '" alt="" loading="lazy">' + f.name + '</span>';

  // "inland waters and waterways" -> Spanish, plus the first zones.
  function fishWhere(fish) {
    let w = fish.where || '';
    if (window.I18N.lang === 'es') {
      w = w.replace(/^Schools can be found (in|on) /, 'Bancos de peces en ').replace(/^Can be (?:caught|found) (?:in|on) /, 'Se pesca en ')
        .replace(/inland waters and waterways/, 'aguas interiores y ríos').replace(/the seaside/, 'la costa').replace(/open water in the given zones/, 'aguas abiertas de estas zonas')
        .replace(/during night time.*$/, 'de noche').replace(/during day time.*$/, 'de día').replace(/ This fish have a .*$/, '');
    }
    w = w.replace(/\.$/, '');
    const zones = (fish.zones || []).slice(0, 3).join(', ') + ((fish.zones || []).length > 3 ? '…' : '');
    return w + (zones ? (w ? ': ' : '') + zones : '');
  }

  function factCards(list) {
    return '<div class="note-grid">' + list.map(f => '<div class="note-card plain-note"><div>' + f.fact + ' ' + ui.badge(f.confidence) +
      ' <a class="src" href="' + f.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a></div></div>').join('') + '</div>';
  }

  // ---------- sections ----------

  function pairCard(p, withButton) {
    return '<div class="pr-pair"><div class="pr-pair-icons">' + p.pair.split(' + ').map(x => profIcon(x, 'pp-icon')).join('<span class="pp-plus">+</span>') + '</div>' +
      '<div class="pr-pair-head"><b>' + p.pair + '</b><span class="pr-when">' + p.when + '</span></div>' +
      (p.tldr ? '<p class="pr-tldr"><b>TL;DR</b> ' + p.tldr + '</p>' : '') +
      (withButton ? '<button class="btn pr-use" data-use-pair="' + p.pair + '">' + t('pr.plan.use') + '</button>' : '') +
      '<details class="pr-why"><summary>' + t('pr.why') + '</summary><p>' + p.why + '</p></details></div>';
  }

  function campCard(prof) {
    const c = ((window.CAMP_DATA || {}).objects || {})[prof];
    if (!c) return '';
    return '<div class="camp-card"><img src="' + UI.icon(c.icon) + '" alt="" loading="lazy"><div><b>' + c.object + '</b> <span class="dim">· ' + prof + '</span>' +
      '<span class="camp-effect">' + window.I18N.localize(c.effect) + '</span><span class="dim camp-up">' + c.upgrades + '</span></div></div>';
  }

  // What's worth crafting: the crafted pieces of your gear path (Equipo › Tu
  // camino, weapon included), by bracket.
  function renderPlan(g) {
    const mine = myProfs();
    // Your professions come from your Shaman (the setup screen).
    let html = '<div class="gp-for"><span>' + t('pr.plan.yours') + ' <b>' + (mine.length ? mine.join(' + ') : t('setup.noProfsShort')) + '</b></span>' +
      '<button class="btn" data-open-setup>' + t('home.change') + '</button></div>';
    if (mine.length < 2) {
      html += '<p class="note-text" style="margin-top:16px">' + t('pr.plan.none', { spec: Site.spec }) + '</p><div class="pr-pairs">' +
        g.pairs.filter(p => p.specs.includes(Site.spec)).map(p => pairCard(p, true)).join('') + '</div>';
      if (!mine.length) return html;
    }
    html += '<div class="camp-grid" style="margin-top:16px">' + mine.map(campCard).join('') + '</div>';
    mine.filter(p => GATHERING.includes(p)).forEach(p => { html += '<p class="note-text">' + profIcon(p, 'pk-icon') + ' ' + t('pr.prof.gather', { list: FEEDS[p].join(', ') }) + '</p>'; });
    const makers = mine.filter(p => CRAFTING.includes(p));
    if (!makers.length) return html + '<p class="note-text">' + t('pr.plan.gatherOnly') + '</p>' + guidesHtml(g);

    const GP = window.GearPath;
    const { plan } = GP.compute();
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => { if (['crafted', 'favor'].includes(st.pick.access)) steps.push(st); }));
    steps.sort((x, y) => x.level - y.level);
    html += '<h3 class="block-title" style="margin-top:22px">' + t('pr.plan.title', { spec: Site.spec, profs: makers.join(' + ') }) + '</h3>' +
      '<p class="note-text dim">' + t('pr.plan.worth') + '</p><div class="plan-list">';
    BRACKETS.forEach(([lo, hi]) => {
      const here = steps.filter(st => st.level >= lo && st.level <= hi);
      const favor = here.filter(st => st.pick.access === 'favor');
      let rows = here.filter(st => st.pick.access === 'crafted').map(st => craftRow(st)).join('');
      if (favor.length) rows += '<div class="plan-favor"><b>' + t('pr.plan.favor', { n: favor.length }) + '</b>' + favor.map(st => craftRow(st)).join('') + '</div>';
      html += '<div class="plan-bracket' + (lo > BETA_CAP ? ' post-cap' : '') + '">' + bracketHead([lo, hi]) +
        (rows || '<p class="dim">' + t('pr.plan.nothingWorth') + '</p>') + '</div>';
    });
    html += '</div><p class="note-text dim">' + t('pr.plan.note2') + '</p>';
    return html + guidesHtml(g);
  }

  function craftRow(st) {
    const GP = window.GearPath;
    const s = st.pick.source;
    return '<div class="gp-step"><span class="gp-lv">' + st.level + '</span><span class="gp-slot">' + GP.slotName(st.pick.slot) + '</span>' +
      '<div class="gp-main">' + UI.itemLink(st.pick.item) + '<span class="wp-sub">' + s.profession + ' · ' + t('pr.plan.skill', { n: s.yellow }) +
      (st.pick.access === 'favor' ? ' · ' + t('pr.plan.favorCost', { n: (s.learn || {}).favor || '?' }) : '') + '</span>' +
      '<span class="gp-why">' + GP.why(st) + '</span></div></div>';
  }

  function guidesHtml(g) {
    return '<h3 class="block-title" style="margin-top:22px">' + t('pr.prof.guides') + '</h3><div class="link-grid">' +
      g.leveling.map(l => '<a class="link-card" href="' + l.url + '" target="_blank" rel="noopener"><b>' + l.site + ' ↗</b><span>' + l.note + '</span></a>').join('') + '</div>';
  }

  // ---------- Leatherworking while leveling (js/lw-plan.js) ----------

  const SKIN_LEVELS = ['few', 'normal', 'all'];
  function renderLeveling() {
    const mine = myProfs();
    let html = '<p class="note-text" style="margin-top:16px">' + t('pr.lw.intro') + '</p>';
    if (!mine.includes('Leatherworking')) {
      return html + '<p class="note-text">' + t('pr.lw.noLw') + '</p><button class="btn" data-open-setup>' + t('home.plan.pickProfs') + '</button>';
    }
    const SK = window.SKINNING_DATA;
    const skinning = mine.includes('Skinning');
    const intensity = SKIN_LEVELS.includes(UI.store.get('lwSkin', 'normal')) ? UI.store.get('lwSkin', 'normal') : 'normal';
    const race = Site.race === 'any' ? null : Site.race;
    const { plan } = window.GearPath.compute();
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => { if ((st.pick.source || {}).profession === 'Leatherworking' && st.level <= BETA_CAP) steps.push(st); }));
    steps.sort((a, b) => a.level - b.level);
    const items = new Map(steps.map(st => [st.pick.item.id, st.pick.item]));
    const opts = { faction: Site.faction, race, targets: steps.map(st => ({ id: st.pick.item.id, level: st.level })), intensity, skinning, to: BETA_CAP };
    const { base, pieces } = window.LwPlan.pieces(opts);
    const name = id => SK.names[id] || (items.get(Number(id)) || {}).name || '#' + id;
    const list = o => Object.entries(o).map(([id, n]) => '<b>' + Math.round(n) + '</b> ' + name(id)).join(', ');
    const recipe = new Map(SK.recipes.map(r => [r.id, r]));
    const at = lvl => base.rows[lvl - 1] ? base.rows[lvl - 1].skill : null;

    html += '<div class="wp-controls" style="margin-top:12px">' + (skinning
      ? '<span class="ctl-label">' + t('pr.lw.skinLabel') + '</span><div class="seg">' + SKIN_LEVELS.map(k =>
        '<button class="btn' + (intensity === k ? ' active' : '') + '" data-lw-skin="' + k + '" title="' + t('pr.lw.skin.' + k + 'Title') + '">' + t('pr.lw.skin.' + k) + '</button>').join('') + '</div>'
      : '<span class="dim">' + t('pr.lw.noSkinning') + '</span>') + '</div>';
    if (skinning) {
      html += '<p class="plan-zones">' + t('pr.lw.reach', { a: at(10), b: at(15), c: at(20), d: at(BETA_CAP) }) + '</p>';
      const br = base.bridge;
      if (br.level) html += '<p class="plan-zones">' + t('pr.lw.bridge', { lvl: br.level, list: list(br.items) }) + '</p>';
    }

    // Your pieces: when with what you skin, and what buying them on time takes.
    html += '<h3 class="block-title" style="margin-top:18px">' + t('pr.lw.piecesTitle') + '</h3><p class="note-text dim">' + t('pr.lw.piecesNote') + '</p><div class="plan-list"><div class="plan-bracket">';
    html += pieces.map(p => {
      const st = steps.find(s => s.pick.item.id === p.id);
      const r = recipe.get(p.id);
      const own = r ? r.mats.filter(([id]) => !SK.skin.includes(id) && ![2318, 2319, 4234, 4231, 4233, 4236, 249427].includes(id) && !/Thread|Dye|Salt|Bleach|Buckle/.test(name(id))) : [];
      const when = !skinning ? '' : p.alone === p.level ? t('pr.lw.onTime') : p.alone ? t('pr.lw.alone', { n: p.alone }) : t('pr.lw.notAlone', { n: BETA_CAP });
      const buy = Object.keys(p.extra).length ? t('pr.lw.buy', { list: list(p.extra) }) : (skinning ? '' : t('pr.lw.buyNothing'));
      return '<div class="gp-step"><span class="gp-lv">' + p.level + '</span><span class="gp-slot">' + window.GearPath.slotName(st.pick.slot) + '</span>' +
        '<div class="gp-main">' + UI.itemLink(st.pick.item) + '<span class="wp-sub">' + t('pr.plan.skill', { n: r ? r.skill[0] : '?' }) +
        (r && r.how === 'f' ? ' · ' + t('pr.plan.favorCost', { n: r.favor || 30 }) : '') + (own.length ? ' · ' + t('pr.lw.ahMats', { list: own.map(([id, n]) => n + ' ' + name(id)).join(', ') }) : '') + '</span>' +
        '<span class="gp-why">' + [when, buy].filter(Boolean).join(' · ') + '</span></div></div>';
    }).join('') + '</div></div>';

    // Level by level: where to skin, what to craft, what to keep.
    if (skinning) {
      html += '<h3 class="block-title" style="margin-top:22px">' + t('pr.lw.stepsTitle') + '</h3><div class="plan-list">';
      BRACKETS.filter(([lo]) => lo <= BETA_CAP).forEach(([lo, hi]) => {
        const rows = base.rows.filter(r => r.level >= lo && r.level <= hi);
        html += '<div class="plan-bracket">' + bracketHead([lo, hi]) + rows.map(r => {
          const crafts = Object.entries(r.crafts).filter(([id]) => !r.made.includes(Number(id)));
          const beasts = r.zone ? window.LwPlan.beasts(r.zone, r.level).map(b => b.name).join(', ') : '';
          const keep = Object.keys(r.keep).length ? t('pr.lw.keep', { list: list(r.keep) }) : '';
          const what = r.made.map(id => '<b>' + t('pr.lw.make', { name: name(id) }) + '</b>').concat(crafts.length ? [t('pr.lw.craft', { list: crafts.map(([id, n]) => n + '× ' + name(id)).join(', ') })] : []);
          return '<div class="gp-step"><span class="gp-lv">' + r.level + '</span><span class="gp-slot">' + t('pr.lw.skill', { n: r.skill }) + '</span><div class="gp-main">' +
            '<span>' + (what.join(' · ') || '<span class="dim">' + t('pr.lw.nothing') + '</span>') + '</span>' +
            '<span class="gp-why">' + t('pr.lw.skins', { n: r.skins, zone: r.zone || '?' }) + (beasts ? ': ' + beasts : '') + (keep ? ' · ' + keep : '') + '</span></div></div>';
        }).join('') + '</div>';
      });
      html += '</div>';
    }
    html += '<h3 class="block-title" style="margin-top:22px">' + t('pr.lw.keysTitle') + '</h3><ul class="plain">' +
      ['hide', 'gap', 'ranks', 'pristine', 'zones'].map(k => '<li>' + t('pr.lw.key.' + k) + '</li>').join('') + '</ul>' +
      '<p class="note-text dim">' + t('pr.lw.how', { kills: Math.round(window.LwPlan.KILL_SHARE * 100), pristine: Math.round(window.LwPlan.PRISTINE * 100) }) +
      ' <a class="src" href="' + SK.sources.yields + '" target="_blank" rel="noopener">Wowhead</a> · <a class="src" href="' + SK.sources.beasts + '" target="_blank" rel="noopener">QuestieDB</a> · <a class="src" href="' + SK.sources.recipes + '" target="_blank" rel="noopener">classicwowforever</a></p>';
    return html;
  }

  // ---------- cooking ----------

  // Stats worth eating for, per spec (first = most important); stamina for everyone.
  const SPEC_FOOD = {
    Enhancement: ['strength', 'agility', 'attackPower', 'crit'],
    Elemental: ['spellDamage', 'intellect', 'crit'],
    Restoration: ['healing', 'intellect', 'spirit']
  };
  const STAT_ICONS = { strength: 'spell_nature_strength', agility: 'ability_rogue_sprint', attackPower: 'ability_warrior_battleshout',
    spellDamage: 'spell_fire_flamebolt', intellect: 'spell_holy_magicalsentry', healing: 'spell_nature_healingwavegreater', spirit: 'spell_holy_divinespirit',
    crit: 'ability_criticalstrike', stamina: 'spell_nature_unyeildingstamina' };
  // Leveling Cooking and Fishing is left to the guides that cover it well.
  const COOK_GUIDES = [
    ['Cooking', 'https://www.wow-professions.com/forever/cooking-leveling-guide'],
    ['Fishing', 'https://www.wow-professions.com/forever/fishing-leveling-guide'],
    ['Fishing + Cooking', 'https://www.wow-professions.com/forever/fishing-and-cooking-leveling-guide']
  ];

  // The best food for a stat you can eat by level `hi` (and whether it's new in the bracket).
  function bestFood(stat, lo, hi) {
    const list = consumables().items.filter(f => f.profession === 'Cooking' && f.buff && f.buff.stat === stat && f.buff.amount && f.req <= hi);
    if (!list.length) return null;
    const top = Math.max(...list.map(f => f.buff.amount));
    const foods = list.filter(f => f.buff.amount === top).sort((a, b) => b.req - a.req);
    return { stat, amount: top, foods, isNew: foods.some(f => f.req >= lo) };
  }

  // Fish the given foods need, with where to catch them.
  function fishFor(foods) {
    const fish = consumables().fish || {};
    const out = new Map();
    foods.forEach(f => (f.reagents || []).forEach(r => { if (fish[r.id]) out.set(r.id, Object.assign({ id: r.id }, fish[r.id])); }));
    return [...out.values()];
  }

  function renderCooking(g) {
    const sec = g.secondary;
    let html = '<p class="note-text">' + t('pr.cook.intro', { spec: Site.spec }) + '</p>' +
      '<div class="link-grid">' + COOK_GUIDES.map(([name, url]) => '<a class="link-card" href="' + url + '" target="_blank" rel="noopener"><b>' + profIcon(name.split(' ')[0], 'pk-icon') + ' ' + name + ' ↗</b><span>' + t('pr.cook.guide') + '</span></a>').join('') + '</div>' +
      '<h3 class="block-title" style="margin-top:22px">' + t('pr.food', { spec: Site.spec }) + '</h3><div class="plan-list">';
    BRACKETS.forEach(([lo, hi]) => {
      const foods = SPEC_FOOD[Site.spec].concat('stamina').map(s => bestFood(s, lo, hi)).filter(Boolean);
      const rows = foods.map(b => {
        const f = b.foods[0];
        const fish = fishFor([f]);
        return '<div class="cook-row' + (b.isNew ? '' : ' same') + '"><span class="cook-stat"><img src="' + UI.icon(STAT_ICONS[b.stat], 'medium') + '" alt=""><b>+' + b.amount + (b.stat === 'crit' ? '%' : '') + '</b> ' + t('pr.stat.' + b.stat) + '</span>' +
          '<span>' + b.foods.slice(0, 2).map(foodLink).join(' ') + '</span>' +
          '<span class="dim">' + ((f.reagents || []).map(r => r.name).join(', ')) + '</span>' +
          '<span class="dim">' + (fish.length ? fishWhere(fish[0]) : skillRange(f)) + '</span></div>';
      }).join('');
      html += '<div class="plan-bracket' + (lo > BETA_CAP ? ' post-cap' : '') + '">' + bracketHead([lo, hi]) +
        '<div class="cook-row cook-head"><span>' + t('pr.cook.colStat') + '</span><span>' + t('pr.cook.colFood') + '</span><span>' + t('pr.cook.needs') + '</span><span>' + t('pr.cook.colWhere') + '</span></div>' + rows + '</div>';
    });
    html += '</div><p class="note-text dim">' + t('pr.fc.xp') + '</p>';
    html += '<details class="pr-facts"><summary>' + t('pr.cook.facts') + '</summary>' + factCards(sec.cooking.concat(sec.fishing)) + '</details>';
    return html;
  }

  function renderFirstAid(g) {
    const aid = consumables().items.filter(f => f.profession === 'First Aid');
    const num = h => (Array.isArray(h) ? h.join('–') : h);
    let html = '<p class="note-text">' + t('pr.aid.intro') + '</p><div class="camp-grid">' + campCard('First Aid') + '</div><div class="plan-list">';
    BRACKETS.forEach(([lo, hi], bi) => {
      const band = BANDAGES[bi].map(n => aid.find(f => f.name === n)).filter(Boolean);
      const pots = aid.filter(f => /Healing Potion/.test(f.name) && f.req <= hi).sort((a, b) => b.req - a.req).slice(0, 1);
      html += '<div class="plan-bracket' + (lo > BETA_CAP ? ' post-cap' : '') + '">' + bracketHead([lo, hi]) +
        band.concat(pots).map(f => '<div class="aid-row">' + foodLink(f) + '<span class="aid-val">' + t('pr.heals', { n: num(f.health) }) + '</span><span class="dim">' + skillRange(f) + '</span></div>').join('') + '</div>';
    });
    const cures = aid.filter(f => /Anti-Venom|Poultice|Tourniquet/.test(f.name)).sort((a, b) => (a.skill[1] || 0) - (b.skill[1] || 0));
    html += '</div><div class="panel" style="margin-top:16px"><h3>' + t('pr.cures') + '</h3>' + cures.map(f =>
      '<div class="aid-row">' + foodLink(f) + '<span class="aid-val">' + useText(f).replace(/\s*\(.*$/, '').replace(/\..*$/, '') + '</span><span class="dim">' + skillRange(f) + '</span></div>').join('') + '</div>';
    html += '<details class="pr-facts"><summary>' + t('pr.cook.facts') + '</summary>' + factCards(g.secondary.firstAid) + '</details>';
    return html;
  }

  function renderSystems(g) {
    return '<div class="note-grid">' + g.systems.map((s, i) => '<div class="note-card"><img src="' + UI.icon(SYSTEM_ICONS[i] || 'inv_misc_note_01') + '" alt="" loading="lazy"><div>' +
      '<b class="nc-title">' + s.title + ' ' + ui.badge(s.confidence) + '</b>' + s.fact +
      ' <a class="src" href="' + s.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a></div></div>').join('') + '</div>' +
      '<h3 class="block-title" style="margin-top:22px">' + t('pr.sys.camp') + '</h3><div class="camp-grid">' +
      PRIMARY.concat(['Cooking', 'Fishing', 'First Aid']).map(campCard).join('') + '</div>' +
      '<p class="note-text dim">' + t('pr.sys.campNote') + ' <a class="src" href="' + (window.CAMP_DATA || {}).source + '" target="_blank" rel="noopener">' + t('common.source') + '</a></p>';
  }

  function renderAll() {
    const g = guide();
    const section = Site.section('Profesiones', SECTIONS);
    let html = '<div class="spec-summary"><div class="role">' + t('pr.role') + '</div><h2>' + t('pr.title') + '</h2><p>' + g.intro + '</p></div>';
    html += Site.sectionTabs('Profesiones', SECTIONS, section, k => t('pr.sec.' + k));
    if (section === 'plan') html += renderPlan(g);
    if (section === 'subir') html += renderLeveling();
    if (section === 'cocina') html += renderCooking(g);
    if (section === 'auxilios') html += renderFirstAid(g);
    if (section === 'sistemas') html += renderSystems(g);
    html += ui.renderSources(g.sources, g.caveat);
    container.innerHTML = html;
    bind(section);
  }

  function bind(section) {
    const all = new Map();
    Object.values(((window.PROFESSION_DATA || {}).professions) || {}).forEach(list => list.forEach(i => all.set(String(i.id), i)));
    UI.tip.bind(container, '[data-item]', a => (all.has(a.dataset.item) ? UI.itemCard(all.get(a.dataset.item), [t('common.level') + ' ' + all.get(a.dataset.item).req, learnText(all.get(a.dataset.item).learn.text)]) : null));
    const food = new Map(consumables().items.map(i => [String(i.id), i]));
    UI.tip.bind(container, '[data-food]', a => (food.has(a.dataset.food) ? foodCard(food.get(a.dataset.food)) : null));
    container.querySelectorAll('[data-use-pair]').forEach(b => b.addEventListener('click', () => { UI.store.set('profs', b.dataset.usePair.split(' + ')); Site.setMany({}); }));
    container.querySelectorAll('[data-open-setup]').forEach(b => b.addEventListener('click', () => window.Setup.open()));
    container.querySelectorAll('[data-lw-skin]').forEach(b => b.addEventListener('click', () => { UI.store.set('lwSkin', b.dataset.lwSkin); renderAll(); }));
  }

  window.Professions = {
    render(target, uiHelpers) {
      container = target;
      ui = uiHelpers;
      if (!window.PROFESSION_DATA || !window.GUIDE_DATA.Professions) { container.innerHTML = '<div class="caveat">' + t('pr.noData') + '</div>'; return; }
      renderAll();
    }
  };
})();
