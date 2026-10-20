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
  const SECTIONS = ['plan', 'cocina', 'auxilios', 'sistemas'];
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
      .replace(/ \(seen in game\)/,' (visto en el juego)')
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
    const lvlNow = Math.min(60, Math.max(1, Number(UI.store.get('level', 1)) || 1));
    let html = '<div class="gp-head"><h2>' + t('pr.mine') + '</h2>' +
      '<span class="gp-lvl"><button class="hn-step" data-pr-step="-1" aria-label="' + t('home.levelDown') + '"' + (lvlNow <= 1 ? ' disabled' : '') + '>−</button>' +
      '<label>' + t('home.next.level') + ' <select data-pr-level>' + Array.from({ length: 60 }, (_, k) => '<option' + (k + 1 === lvlNow ? ' selected' : '') + '>' + (k + 1) + '</option>').join('') + '</select></label>' +
      '<button class="hn-step" data-pr-step="1" aria-label="' + t('home.levelUp') + '"' + (lvlNow >= 60 ? ' disabled' : '') + '>+</button></span>' +
      '<span class="gp-who dim">' + (mine.length ? mine.join(' + ') : t('setup.noProfsShort')) + ' <button class="btn-link" data-open-setup>' + t('home.change') + '</button></span></div>';
    if (mine.length < 2) {
      html += '<p class="note-text" style="margin-top:16px">' + t('pr.plan.none', { spec: Site.spec }) + '</p><div class="pr-pairs">' +
        g.pairs.filter(p => p.specs.includes(Site.spec)).map(p => pairCard(p, true)).join('') + '</div>';
      if (!mine.length) return html;
    }
    let extra = '<details class="pr-more"><summary>' + t('pr.more.camp') + '</summary><div class="camp-grid" style="margin-top:12px">' + mine.map(campCard).join('') + '</div>';
    mine.filter(p => GATHERING.includes(p)).forEach(p => { extra += '<p class="note-text">' + profIcon(p, 'pk-icon') + ' ' + t('pr.prof.gather', { list: FEEDS[p].join(', ') }) + '</p>'; });
    extra += '</details><details class="pr-more"><summary>' + t('pr.prof.guides') + '</summary>' + guidesHtml(g) + '</details>';
    const makers = mine.filter(p => CRAFTING.includes(p));
    if (!makers.length) return html + '<p class="note-text">' + t('pr.plan.gatherOnly') + '</p>' + extra;

    // Leatherworking: the plan to level it while you level, with its pieces.
    const lw = makers.includes('Leatherworking');
    if (lw) html += renderLeveling();
    const others = makers.filter(p => p !== 'Leatherworking');
    if (!others.length) return html + extra;

    const GP = window.GearPath;
    const { plan } = GP.compute();
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => {
      if (['crafted', 'favor'].includes(st.pick.access) && !(lw && st.pick.source.profession === 'Leatherworking')) steps.push(st);
    }));
    steps.sort((x, y) => x.level - y.level);
    html += '<h3 class="block-title" style="margin-top:22px">' + t('pr.plan.title', { spec: Site.spec, profs: others.join(' + ') }) + '</h3>' +
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
    return html + extra;
  }

  function craftRow(st) {
    const GP = window.GearPath;
    const s = st.pick.source;
    return '<div class="gp-step"><span class="gp-lv">' + st.level + '</span><span class="gp-slot">' + GP.slotName(st.pick.slot) + '</span>' +
      '<div class="gp-main">' + UI.itemLink(st.pick.item) + '<span class="wp-sub">' + s.profession + ' · ' + t('pr.plan.skill', { n: (s.learn || {}).learnAt || s.yellow }) +
      (st.pick.access === 'favor' ? ' · ' + t('pr.plan.favorCost', { n: (s.learn || {}).favor || '?' }) : '') + '</span>' +
      '<span class="gp-why">' + GP.why(st) + '</span>' + GP.craftMats(st) + '</div></div>';
  }

  function guidesHtml(g) {
    return '<h3 class="block-title" style="margin-top:22px">' + t('pr.prof.guides') + '</h3><div class="link-grid">' +
      g.leveling.map(l => '<a class="link-card" href="' + l.url + '" target="_blank" rel="noopener"><b>' + l.site + ' ↗</b><span>' + l.note + '</span></a>').join('') + '</div>';
  }

  // ---------- Leatherworking while leveling (js/lw-plan.js) ----------

  const SKIN_LEVELS = ['few', 'normal', 'all'];
  // A stage of the plan covers at least this many levels.
  const STAGE_MIN = 3;
  // What the Leatherworking plan knows about your pieces: when you make each
  // one, what it needs and what it costs. Built for the plan below and for
  // Equipo › Tu camino (each Leatherworking piece says how to make it).
  function lwModel() {
    const mine = myProfs();
    const SK = window.SKINNING_DATA;
    const skinning = mine.includes('Skinning');
    const intensity = SKIN_LEVELS.includes(UI.store.get('lwSkin', 'normal')) ? UI.store.get('lwSkin', 'normal') : 'normal';
    const race = Site.race === 'any' ? null : Site.race;
    const farm = window.GearPath.farm();
    const { plan } = window.GearPath.compute();
    const steps = [];
    Object.values(plan.slots).forEach(p => p.steps.forEach(st => { if ((st.pick.source || {}).profession === 'Leatherworking' && st.level <= BETA_CAP) steps.push(st); }));
    steps.sort((a, b) => a.level - b.level);
    const stepOf = new Map(steps.map(st => [st.pick.item.id, st]));
    // Where and when your route first reaches each trainer.
    const lwAt = window.Route.profFrom('Leatherworking', Site.faction, race);
    const skinAt = window.Route.profFrom('Skinning', Site.faction, race);
    const opts = { faction: Site.faction, race, targets: steps.map(st => ({ id: st.pick.item.id, level: st.level })), intensity, skinning, to: BETA_CAP,
      lwFrom: lwAt.level, skinFrom: skinning ? skinAt.level : 61 };
    const { base, pieces } = window.LwPlan.pieces(opts);
    const pieceOf = new Map(pieces.map(p => [p.id, p]));
    const recipe = new Map(SK.recipes.map(r => [r.id, r]));
    const name = id => SK.names[id] || ((stepOf.get(Number(id)) || {}).pick || { item: {} }).item.name || '#' + id;
    // "[icon] 11 Light Armor Kit", count first (as profession guides write it).
    const chip = (id, n) => '<span class="lw-chip">' + (SK.icons[id] ? '<img src="' + UI.icon(SK.icons[id]) + '" alt="" loading="lazy">' : '') +
      (n != null ? '<b>' + Math.round(n) + '</b> ' : '') + name(id) + '</span>';
    const chips = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([id, n]) => chip(id, n)).join('');
    const row = (label, body, cls) => '<div class="lw-row' + (cls ? ' ' + cls : '') + '"><span class="lw-k">' + label + '</span><div class="lw-v">' + body + '</div></div>';
    // Reagents a piece needs that you neither skin, nor make, nor buy from a
    // vendor: scales, feathers, gems, alchemy (data/skinning.json reagents,
    // from scripts/build-reagents.js).
    const REAG = SK.reagents || {};
    const made = new Set(SK.recipes.map(r => r.id));
    const extraMats = r => (r ? r.mats.filter(([m]) => !SK.skin.includes(m) && !made.has(m) && !(REAG[m] || {}).v) : []);
    const DETOUR_MIN = 0.05;
    const side = Site.faction === 'alliance' ? 'A' : 'H';
    const zonesNear = (from, to) => {
      const out = new Set();
      for (let l = Math.max(1, from); l <= to; l++) window.Route.zonesAt(l, Site.faction, race).forEach(z => out.add(z.name));
      return out;
    };
    // Where to get a reagent for a piece made at level `lvl`: a creature in
    // the zones of your levels (on the way), the first level your route
    // passes one (later), or the nearest elsewhere (a detour); a profession;
    // gathering; else the auction house.
    const whereMat = (m, n, lvl) => {
      const e = REAG[m] || {};
      const parts = [];
      if (m === 249427) return '<div class="lw-mat">' + chip(m, n) + '<span class="dim"> ' + t('pr.lw.mat.pristine', { pct: Math.round(window.LwPlan.PRISTINE * 100) }) + ' · ' + t('pr.lw.mat.market') + '</span></div>';
      const C = window.CRAFT_DATA;
      const sc = C && C.items[m];
      if (sc && sc.s) return '<div class="lw-mat">' + chip(m, n) + '<span class="dim"> ' + t('pr.lw.mat.scarce', { prof: t('gp.gather.' + sc.s) }) +
        (sc.b != null ? ' · ' + t('pr.lw.mat.market') : '') + (e.c ? ' · ' + t('pr.lw.mat.craft', { prof: t('pr.lw.prof.' + e.c[0]), n: e.c[1] }) : '') + (farm ? '' : ' · ' + t('pr.lw.mat.ah')) + '</span></div>';
      const drops = (e.d || []).filter(d => d[6] !== side);
      const kills = d => Math.ceil(n / d[3]);
      const say = (d, key, extra) => t(key, Object.assign({ mob: d[0], zone: d[4][0], lo: d[1], hi: d[2], pct: Math.round(d[3] * 100), kills: kills(d) }, extra || {})) +
        (d[5] & 2 ? ' ' + t('pr.lw.mat.skinned') : '') + (d[5] & 1 ? ' ' + t('pr.lw.mat.elite') : '');
      const near = zonesNear(lvl - 6, lvl);
      const onWay = drops.filter(d => d[1] <= lvl + 2 && d[4].some(z => near.has(z)) && !(d[5] & 1)).sort((a, b) => b[3] - a[3])[0];
      if (onWay) parts.push(say(onWay, 'pr.lw.mat.onWay'));
      else {
        let later = null;
        for (let l = lvl + 1; l <= BETA_CAP + 10 && !later; l++) {
          const zs = zonesNear(l, l);
          const d = drops.filter(x => x[1] <= l + 2 && x[1] >= l - 6 && x[4].some(z => zs.has(z)) && !(x[5] & 1)).sort((a, b) => b[3] - a[3])[0];
          if (d) later = { d, l };
        }
        if (later) parts.push(say(later.d, 'pr.lw.mat.later', { n: later.l }));
        else {
          // A detour only for a drop worth farming (not a rare elite at 2%).
          const d = drops.filter(x => x[3] >= DETOUR_MIN && !(x[5] & 1)).sort((a, b) => a[1] - b[1] || b[3] - a[3])[0];
          if (d) parts.push(say(d, 'pr.lw.mat.detour'));
        }
      }
      if (e.c) {
        // Alchemy's Sulfuric Acid and Cerulean Dye take a scarce material (Pyrite, Frilled Lichen).
        const sub = ((window.CRAFT_DATA || { items: {} }).items[m] || {}).c;
        parts.push(t('pr.lw.mat.craft', { prof: t('pr.lw.prof.' + e.c[0]), n: e.c[1] }) + (sub && sub[2] ? ' ' + t('gp.mat.with', { what: sub[2] }) : ''));
      }
      if (e.g && e.g.mined) parts.push(t('pr.lw.mat.mined', { what: e.g.mined.slice(0, 2).join(', ') }));
      if (e.g && e.g.inItem && !parts.length) parts.push(t('pr.lw.mat.inItem', { what: e.g.inItem.slice(0, 2).join(', ') }));
      if (!farm) parts.push(t('pr.lw.mat.ah'));
      return '<div class="lw-mat">' + chip(m, n) + '<span class="dim"> ' + parts.join(' · ') + '</span></div>';
    };
    // Buying a piece's rare materials: at the last auction scan's prices,
    // as a share of the gold a level's quests pay at the level you make it
    // (cheap under a quarter, dear from three quarters).
    const PR = SK.prices;
    const coin = c => (c >= 10000 ? Math.floor(c / 10000) + 'g ' : '') + (c % 10000 >= 100 ? Math.floor(c % 10000 / 100) + 's' : (c < 100 ? c + 'c' : ''));
    const buyCost = (own, lvl) => {
      if (!PR || !own.length) return '';
      let total = 0;
      let missing = 0;
      own.forEach(([m, n]) => { if (PR.p[m]) total += PR.p[m] * n; else missing++; });
      if (!total) return '';
      const gold = SK.gold[Math.min(59, Math.max(1, lvl)) - 1] || 1;
      const share = total / gold;
      const tier = share < 0.25 ? 'cheap' : share < 0.75 ? 'mid' : 'dear';
      return '<div class="lw-cost lw-' + tier + '">' + t('pr.lw.cost.' + tier) + ' · ' + t('pr.lw.cost.line', { cost: coin(total).trim() + (missing ? '+' : ''), pct: Math.round(share * 100), n: lvl }) + '</div>';
    };
    const piece = id => {
      const st = stepOf.get(id);
      const r = recipe.get(id);
      const own = extraMats(r);
      const lvl = (pieceOf.get(id) || {}).alone || st.level;
      return '<span class="lw-piece">' + UI.itemLink(st.pick.item) + '<span class="dim"> ' + window.GearPath.slotName(st.pick.slot) +
        (r && r.how === 'f' ? ' · ' + t('pr.plan.favorCost', { n: r.favor || 30 }) : '') + '</span>' +
        (own.length ? '<span class="lw-mats">' + own.map(([m, n]) => whereMat(m, n, lvl)).join('') + (farm ? '' : buyCost(own, lvl)) + '</span>' : '') + '</span>';
    };
    // Having a piece at the level your gear path suggests it, when skinning alone is
    // later: offered for the pieces that matter (blue, Favor, or from level 12), not
    // the first handstitched ones.
    const EARLY_FROM = 12;
    const skillAt = lvl => (base.rows[Math.min(base.rows.length, Math.max(1, lvl)) - 1] || {}).skill || 1;
    const early = id => {
      const p = pieceOf.get(id);
      const st = stepOf.get(id);
      const r = recipe.get(id);
      if (!p || !r || !Object.keys(p.extra).length || (skinning && p.alone && p.alone - p.level < 2)) return '';
      if (skinning && p.alone && p.level < EARLY_FROM && st.pick.item.quality < 3 && r.how !== 'f') return '';
      const vars = { skill: r.skill[0], alone: p.alone, n: p.level, cap: BETA_CAP, has: skillAt(BETA_CAP) };
      // When the skill comes before the piece, what holds it back is a skinned
      // material (Light Hide only drops from beasts of level 11 on): say so.
      const skillLvl = (base.rows.find(x => x.skill >= r.skill[0]) || {}).level;
      const hides = r.mats.filter(([m]) => [783, 4231, 4232, 4233, 4235, 4236, 249427].includes(m)).map(([m, n]) => n + ' ' + name(m)).join(', ');
      if (skinning && p.alone && skillLvl && skillLvl < p.alone && hides) Object.assign(vars, { s: skillLvl, mats: hides });
      const key = !skinning ? 'pr.lw.buyNoSkin' : p.alone ? (vars.mats ? 'pr.lw.buyMats' : 'pr.lw.buyEarly') : 'pr.lw.buyLate';
      return '<div class="lw-early"><span>' + t(key, vars) + '</span> ' + chips(p.extra) + buyCost(Object.entries(p.extra).map(([m, n]) => [Number(m), n]), p.level) + '</div>';
    };
    return { SK, mine, skinning, intensity, race, farm, steps, stepOf, base, pieces, pieceOf, recipe, name, chip, chips, row, extraMats, whereMat, buyCost, piece, early, skillAt, lwAt, skinAt };
  }

  // A Leatherworking piece of your gear path, for its row in Equipo › Tu
  // camino: the skill it asks and when you have it, its rare materials and
  // what buying them costs, and a link to the plan.
  // Built again when what it depends on changes (your Shaman, the settings).
  let lwCache = null;
  let lwKey = '';
  function lwHow(st) {
    if (!window.SKINNING_DATA || (st.pick.source || {}).profession !== 'Leatherworking' || !myProfs().includes('Leatherworking')) return '';
    const key = JSON.stringify([Site.spec, Site.faction, Site.race, myProfs(), UI.store.get('lwSkin', 'normal'), window.GearPath.farm(), UI.store.get('gpDrops', false), UI.store.get('learnedProfs', {})]);
    if (!lwCache || key !== lwKey) { lwCache = lwModel(); lwKey = key; }
    const M = lwCache;
    const id = st.pick.item.id;
    const r = M.recipe.get(id);
    if (!r) return '';
    const p = M.pieceOf.get(id) || {};
    const own = M.extraMats(r);
    const when = !M.skinning ? '' : p.alone ? t('pr.lw.how.when', { n: p.alone }) : t('pr.lw.how.never', { cap: BETA_CAP });
    const mats = own.length ? t('pr.lw.how.mats', { list: own.map(([m, n]) => n + ' ' + M.name(m)).join(', ') }) : '';
    const cost = !M.farm && own.length ? M.buyCost(own, p.alone || st.level) : '';
    // The source line above already says the skill: this one, when and what else.
    return '<span class="gp-lw">' + [when, mats, '<a href="#Profesiones/plan">' + t('pr.lw.how.plan') + '</a>'].filter(Boolean).join(' · ') + cost + '</span>';
  }

  function renderLeveling() {
    if (!myProfs().includes('Leatherworking')) {
      return '<p class="note-text">' + t('pr.lw.noLw') + '</p><button class="btn" data-open-setup>' + t('home.plan.pickProfs') + '</button>';
    }
    const M = lwModel();
    const { SK, skinning, intensity, farm, base, pieces, name, chip, chips, row, piece, early, lwAt, skinAt, stepOf } = M;
    const lvl = Math.min(BETA_CAP, Math.max(1, Number(UI.store.get('level', 1)) || 1));

    // The settings, folded: how much you skin, auction house or farming.
    let html = '<div class="pr-sec-head"><h3>' + t('pr.sec.subir') + '</h3><details class="gp-settings"><summary>' + t('gp.settings') + '</summary><div>' +
      (skinning ? '<span class="ctl-label">' + t('pr.lw.skinLabel') + '</span><div class="seg">' + SKIN_LEVELS.map(k =>
        '<button class="btn' + (intensity === k ? ' active' : '') + '" data-lw-skin="' + k + '" title="' + t('pr.lw.skin.' + k + 'Title') + '">' + t('pr.lw.skin.' + k) + '</button>').join('') + '</div>'
        : '<span class="dim">' + t('pr.lw.noSkinning') + '</span>') +
      '<span class="ctl-label">' + t('pr.lw.matsLabel') + '</span><div class="seg">' + ['ah', 'farm'].map(k =>
        '<button class="btn' + ((k === 'farm') === farm ? ' active' : '') + '" data-lw-farm="' + k + '" title="' + t('pr.lw.mats.' + k + 'Title') + '">' + t('pr.lw.mats.' + k) + '</button>').join('') + '</div>' +
      '<span class="dim">' + (farm ? t('pr.lw.farmNote') : SK.prices ? t('pr.lw.pricesNote', { date: SK.prices.date.split('-').reverse().slice(0, 2).join('/') }) : '') + '</span>' +
      '</div></details></div>';

    // Not learned yet: where, at any level, and "I learned it".
    const learned = UI.store.get('learnedProfs', {});
    const first = Math.min(lwAt.level, skinAt.level);
    const pending = ['Leatherworking', 'Skinning'].filter(p => (p === 'Skinning' ? skinning && skinAt : lwAt).level > lvl && learned[p] == null);
    if (pending.length) {
      html += '<div class="gp-learn"><span>' + t('pr.lw.learnWhere', { lw: lwAt.zone || '?', n: lwAt.level, skin: skinAt.zone || '?', m: skinAt.level }) + '</span>' +
        pending.map(p => '<button class="btn" data-learned="' + p + '">' + t('home.learned', { prof: p }) + '</button>').join('') + '</div>';
    }
    const said = Object.keys(learned).filter(p => ['Leatherworking', 'Skinning'].includes(p));
    if (said.length) html += '<p class="note-text dim">' + t('pr.lw.learnedSaid', { list: said.map(p => p + ' (' + t('common.level') + ' ' + learned[p] + ')').join(', ') }) +
      ' <button class="btn-link" data-unlearn>' + t('pr.lw.learnedUndo') + '</button></p>';

    // Stages: from one goal to the next (pieces you make, the 70-75 wall).
    const stages = [];
    let cur = null;
    base.rows.filter(r => r.level >= first).forEach(r => {
      if (!cur) cur = { from: r.level, rows: [] };
      cur.rows.push(r);
      const goal = r.made.length && r.level - cur.from + 1 >= STAGE_MIN;
      if (goal || r.level === base.bridge.level || r.level === BETA_CAP) { stages.push(cur); cur = null; }
    });
    if (cur) stages.push(cur);
    const zonesOf = sg => {
      const zones = [];
      sg.rows.forEach(r => {
        let z = zones.find(x => x.name === r.zone);
        if (!z) zones.push(z = { name: r.zone, skins: 0, from: r.level, to: r.level });
        z.skins += r.skins;
        z.to = r.level;
      });
      return zones.filter(z => z.skins > 0);
    };
    const craftsOf = sg => {
      const crafts = {};
      sg.rows.forEach(r => Object.entries(r.crafts).forEach(([id, n]) => { if (!r.made.includes(Number(id))) crafts[id] = (crafts[id] || 0) + n; }));
      return crafts;
    };
    // The steps to level the skill in a stage, one after another, said in
    // words: "1. Make 40 Light Leather (uses 120 Ruined Leather Scraps).
    // Leatherworking goes from 1 to 33." Each craft in the order you first
    // make it, its stretch as long as the skill it gave; the pieces you wear
    // are steps too. Crafts that no longer raise it go apart.
    const skillBefore = i => (i ? stages[i - 1].rows[stages[i - 1].rows.length - 1].skill : 1);
    const orderOf = (sg, i) => {
      const all = {};
      sg.rows.forEach(r => Object.entries(r.crafts).forEach(([id, n]) => { all[id] = (all[id] || 0) + n; }));
      const first = {};
      const gain = {};
      sg.rows.forEach(r => Object.entries(r.gains || {}).forEach(([id, g]) => {
        gain[id] = (gain[id] || 0) + g;
        const a = ((r.ranges || {})[id] || [])[0];
        if (first[id] == null || a < first[id]) first[id] = a;
      }));
      const ids = Object.keys(gain).filter(id => gain[id] >= 0.5).sort((x, y) => first[x] - first[y]);
      const end = sg.rows[sg.rows.length - 1].skill;
      let at = Math.floor(skillBefore(i));
      let sum = at;
      const steps = ids.map((id, k) => {
        sum += gain[id];
        const a = at;
        const b = k === ids.length - 1 ? end : Math.min(end, Math.round(sum));
        at = b;
        const r = M.recipe.get(Number(id));
        const uses = r && r.mats.length ? r.mats.map(([m, n]) => Math.round(n * all[id]) + ' ' + name(m)).join(', ') : '';
        const wear = sg.rows.some(x => x.made.includes(Number(id)));
        return '<li><span class="lo-do">' + t('pr.lw.step.make', { n: Math.round(all[id]) }) + ' ' + chip(id) + '</span>' +
          (wear ? ' <span class="gpc-tag">' + t(Math.round(all[id]) > 1 ? 'pr.lw.step.wearOne' : 'pr.lw.step.wear') + '</span>' : '') +
          (uses ? ' <span class="dim">' + t('pr.lw.step.uses', { list: uses }) + '</span>' : '') +
          '<span class="lo-up">' + t(a < b ? 'pr.lw.step.up' : 'pr.lw.step.upLittle', { a, b }) + '</span></li>';
      });
      const rest = Object.fromEntries(Object.entries(all).filter(([id]) => !ids.includes(id) && !sg.rows.some(x => x.made.includes(Number(id)))));
      if (!steps.length && !Object.keys(rest).length) return '';
      return '<ol class="lw-order">' + steps.join('') + '</ol>' +
        (Object.keys(rest).length ? '<div class="lo-rest dim">' + t('pr.lw.forMats') + ' ' + chips(rest) + '</div>' : '');
    };

    // Now: the stage you're in, said plainly.
    const mineAt = Math.max(0, stages.findIndex(sg => lvl <= sg.rows[sg.rows.length - 1].level));
    const now = stages[mineAt];
    if (skinning && now) {
      const last = now.rows[now.rows.length - 1];
      const zones = zonesOf(now);
      const crafts = craftsOf(now);
      // Pieces to wear that the steps don't already say (they gave no skill).
      const made = [].concat(...now.rows.map(r => r.made)).filter(id => !now.rows.some(r => (r.gains || {})[id] >= 0.5));
      const line = (k, body) => '<div class="pn-row"><span class="pn-k">' + k + '</span><div class="pn-v">' + body + '</div></div>';
      html += '<section class="pr-now"><span class="hn-kicker">' + t('pr.now.kicker', { lo: now.from, hi: last.level }) + '</span>' +
        '<h2>' + t('pr.now.title', { a: Math.floor(skillBefore(mineAt)), b: last.skill }) + '</h2>' +
        (zones.length ? line(t('pr.lw.kSkin'), zones.map(z => '<b>' + (z.name || '?') + '</b> <span class="dim">· ' + window.LwPlan.beasts(z.name, Math.round((z.from + z.to) / 2)).map(b => b.name).join(', ') + '</span>').join('<br>')) : '') +
        (Object.keys(crafts).length ? line(t('pr.now.craft'), orderOf(now, mineAt)) : '') +
        (Object.keys(last.keep).length ? line(t('pr.lw.kKeep'), chips(last.keep)) : '') +
        (made.length ? line(t('pr.lw.kGoal'), made.map(id => '<span class="lw-chip">' + (stepOf.get(id) ? UI.itemLink(stepOf.get(id).pick.item) : name(id)) + '</span>').join('')) : '') +
        (now.rows.some(r => r.level === base.bridge.level) ? line(t('pr.lw.kBuy'), chips(base.bridge.items) + ' <span class="dim">' + t('pr.lw.bridgeWhy') + '</span>') : '') +
        '</section>';
    }

    // At a glance: the skill at 10, 20 and 30, and the pieces you make.
    if (skinning) {
      const at = l => (base.rows[l - 1] || {}).skill;
      html += '<div class="lw-sum">' + [10, 20, BETA_CAP].map(l => '<div class="lw-tile"><span>' + t('pr.lw.atLevel', { n: l }) + '</span><b>' + at(l) + '</b><small>' + t('pr.lw.skillShort') + '</small></div>').join('') +
        '<div class="lw-tile"><span>' + t('pr.lw.piecesMade') + '</span><b>' + pieces.filter(p => p.alone).length + '/' + pieces.length + '</b><small>' + t('pr.lw.piecesMadeSub', { n: BETA_CAP }) + '</small></div></div>';
    }

    // Your pieces, by the level you make them: one line each, the rest on tap.
    const groups = new Map();
    pieces.slice().sort((a, b) => (a.alone || 99) - (b.alone || 99) || a.level - b.level).forEach(p => {
      const at = skinning && p.alone ? p.alone : null;
      const key = at ? t('home.tile.lv', { n: at }) : t('pr.pieces.later', { n: BETA_CAP });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    html += '<section class="gp-coming"><div class="gp-coming-head"><h3>' + t('pr.pieces.title') + '</h3><span class="dim">' + t('pr.pieces.sub') + '</span></div>' +
      [...groups.entries()].map(([k, list]) => '<div class="gp-lvl-row"><b class="gp-lvl-n">' + k + '</b><div class="gp-cards">' + list.map(p => {
        const st = stepOf.get(p.id);
        const i = st.pick.item;
        const r = M.recipe.get(p.id);
        const tag = r && r.how === 'f' ? t('pr.pieces.favor', { n: r.favor || 30 }) : t('pr.pieces.skill', { n: r ? r.skill[0] : '?' });
        return '<details class="gp-card gp-tag-craft"><summary>' + (i.icon ? '<img class="gst-icon q' + (i.quality || 1) + '" src="' + UI.icon(i.icon) + '" alt="">' : '') +
          '<span class="gpc-main"><b class="q' + i.quality + '">' + i.name + '</b><span class="gpc-sub">' + window.GearPath.slotName(st.pick.slot) + ' · <span class="gpc-tag">' + tag + '</span>' +
          (p.level < (p.alone || 99) ? ' · <span class="dim">' + t('pr.pieces.path', { n: p.level }) + '</span>' : '') + '</span></span></summary>' +
          '<div class="gpc-body">' + piece(p.id) + early(p.id) + '</div></details>';
      }).join('') + '</div></div>').join('') + '</section>';

    // The plan level by level, for whoever wants it.
    if (skinning) {
      html += '<details class="pr-more"><summary>' + t('pr.lw.stagesFull') + '</summary><div class="lw-steps">';
      stages.forEach((sg, i) => {
        const last = sg.rows[sg.rows.length - 1];
        const to = last.level;
        const where = zonesOf(sg).map(z => '<div><b>' + (z.name || '?') + '</b> · ' + t('pr.lw.skinsN', { n: z.skins }) + '</div>').join('');
        const crafts = craftsOf(sg);
        const made = [].concat(...sg.rows.map(r => r.made));
        const pct = Math.min(100, Math.round(last.skill / 3));
        html += '<details class="lw-step"' + (i === mineAt ? ' open' : '') + '><summary class="lw-head"><b>' + t(sg.from === to ? 'pr.lw.stageOne' : 'pr.lw.stage', { lo: sg.from, hi: to }) + '</b>' +
          '<span class="lw-skill">' + t('pr.lw.skillRange', { a: Math.floor(skillBefore(i)), b: last.skill }) + '</span><span class="lw-bar"><i style="width:' + pct + '%"></i></span>' +
          (made.length ? '<span class="lw-goals">' + made.map(id => name(id)).join(', ') + '</span>' : '') + '</summary>' +
          (Object.keys(crafts).length ? row(t('pr.lw.kCraft'), orderOf(sg, i)) : '') +
          (where ? row(t('pr.lw.kSkin'), where) : '') +
          (Object.keys(last.keep).length ? row(t('pr.lw.kKeep'), chips(last.keep)) : '') +
          (to === base.bridge.level ? row(t('pr.lw.kBuy'), chips(base.bridge.items) + '<span class="dim"> ' + t('pr.lw.bridgeWhy') + '</span>', 'lw-buyrow') : '') +
          '</details>';
      });
      html += '</div></details>';
    }
    html += '<details class="pr-more"><summary>' + t('pr.lw.keysTitle') + '</summary><ul class="plain">' +
      ['hide', 'gap', 'ranks', 'pristine', 'zones', 'guide'].map(k => '<li>' + t('pr.lw.key.' + k) + '</li>').join('') + '</ul>' +
      '<p class="note-text dim">' + t('pr.lw.how', { kills: Math.round(window.LwPlan.KILL_SHARE * 100), pristine: Math.round(window.LwPlan.PRISTINE * 100) }) +
      ' <a class="src" href="' + SK.sources.yields + '" target="_blank" rel="noopener">Wowhead</a> · <a class="src" href="' + SK.sources.beasts + '" target="_blank" rel="noopener">QuestieDB</a> · <a class="src" href="' + SK.sources.recipes + '" target="_blank" rel="noopener">classicwowforever</a>' +
      (SK.sources.reagents ? ' · <a class="src" href="' + SK.sources.reagents + '" target="_blank" rel="noopener">' + t('pr.lw.matSource') + '</a>' : '') + '</p></details>';
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
    let html = '<div class="spec-summary"><div class="role">' + t('pr.role') + '</div><h2>' + t('pr.title') + '</h2>' + (section === 'plan' ? '' : '<p>' + g.intro + '</p>') + '</div>';
    html += Site.sectionTabs('Profesiones', SECTIONS, section, k => t('pr.sec.' + k));
    if (section === 'plan') html += renderPlan(g);
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
    container.querySelectorAll('[data-lw-farm]').forEach(b => b.addEventListener('click', () => { window.GearPath.setFarm(b.dataset.lwFarm === 'farm'); renderAll(); }));
    const setLvl = n => { UI.store.set('level', Math.min(60, Math.max(1, n))); renderAll(); };
    container.querySelectorAll('[data-pr-step]').forEach(b => b.addEventListener('click', () => setLvl((Number(UI.store.get('level', 1)) || 1) + Number(b.dataset.prStep))));
    const prSel = container.querySelector('[data-pr-level]');
    if (prSel) prSel.addEventListener('change', e => setLvl(Number(e.target.value)));
    container.querySelectorAll('[data-learned]').forEach(b => b.addEventListener('click', () => {
      const all = UI.store.get('learnedProfs', {});
      all[b.dataset.learned] = Math.max(1, Number(UI.store.get('level', 1)) || 1);
      UI.store.set('learnedProfs', all);
      renderAll();
    }));
    container.querySelectorAll('[data-unlearn]').forEach(b => b.addEventListener('click', () => { UI.store.set('learnedProfs', {}); renderAll(); }));
  }

  window.Professions = {
    lwHow,
    render(target, uiHelpers) {
      container = target;
      ui = uiHelpers;
      if (!window.PROFESSION_DATA || !window.GUIDE_DATA.Professions) { container.innerHTML = '<div class="caveat">' + t('pr.noData') + '</div>'; return; }
      renderAll();
    }
  };
})();
