// The Guide page (one spec) and the Class page (what applies to all three).
(function () {
  const I18N = window.I18N;
  const Site = window.Site;
  const UI = window.UI;
  const t = (key, vars) => I18N.t(key, vars);
  const { badge, pageHead, renderSources } = UI;
  const iconUrl = icon => UI.icon(icon);
  const smallIcon = icon => UI.icon(icon, 'medium');
  const { iconFor, firstRef, decorate } = window.Refs;
  const SPEC_ICONS = Site.SPEC_ICONS;
  const CLASS_ICON = Site.CLASS_ICON;
  // Icons for the guide's summary tiles.
  const STAT_ICONS = {
    'Weapon Damage': 'inv_axe_09', 'Strength': 'spell_nature_strength', 'Spell Power': 'spell_holy_powerinfusion',
    'Healing Power': 'spell_nature_healingwavegreater', 'Intellect': 'spell_holy_magicalsentry'
  };
  const WEAPON_ICONS = { '2H Axe': 'inv_axe_09', '1H Axe': 'inv_axe_01', '2H Mace': 'inv_mace_04', '1H Mace': 'inv_mace_01', 'Staff': 'inv_staff_08', 'Dagger': 'inv_weapon_shortblade_05', 'Fist': 'inv_gauntlets_04' };

  // One card per change: the title shows, the detail opens on click.
  function renderChanges(changes, spec) {
    if (!changes || !changes.length) return '';
    return '<section class="block"><h3 class="block-title">' + t('guide.changesTitle') + ' <span class="count">' + changes.length + '</span></h3>' +
      '<div class="change-grid">' + changes.map(c =>
        '<details class="change-card"><summary class="no-refs">' +
          '<img class="cc-icon" src="' + iconUrl(firstRef(c.change) || SPEC_ICONS[spec]) + '" alt="" loading="lazy">' +
          '<span class="cc-title">' + c.change + '</span>' + badge(c.confidence) +
        '</summary><div class="detail">' + c.detail +
          (c.source ? ' <a class="src" href="' + c.source + '" target="_blank" rel="noopener">' + t('common.source') + '</a>' : '') +
        '</div></details>').join('') +
      '</div></section>';
  }

  function renderStatChips(list) {
    if (!list) return '';
    return '<div class="stat-row">' + list.map((s, i) =>
      '<span class="stat-chip"><span class="n">' + (i + 1) + '</span>' + I18N.term(s) + '</span>'
    ).join('') + '</div>';
  }

  // Priority as bars that shrink down the list.
  // The stats in the order the gear path values them (js/gear-plan.js
  // WEIGHTS: WoWSims for Forever, adjusted for leveling), so the guide and
  // Equipo › Tu camino never disagree. Haste and expertise come at 60 only;
  // a school's damage counts as spell power. Enhancement's weapon goes first
  // (its DPS is judged apart). Each bar is the stat's worth per item point.
  // Main stats first: on a tie they lead.
  const STAT_OF = { spellPower: 'Spell Power', healing: 'Healing Power', strength: 'Strength', attackPower: 'Attack Power', hitRating: 'Hit',
    critRating: 'Critical Strike', intellect: 'Intellect', mp5: 'Mana Regeneration (MP5)', agility: 'Agility', spirit: 'Spirit', stamina: 'Stamina' };
  function statOrder(spec, fallback) {
    const W = window.GearPlan && window.GearPlan.WEIGHTS[spec];
    if (!W) return fallback.map(s => ({ name: s, w: null }));
    // A healer's spell power is its healing power: one line.
    const out = Object.entries(STAT_OF).filter(([k]) => W[k] != null && !(k === 'spellPower' && W.healing != null)).map(([k, name]) => ({ name, w: W[k] }))
      .sort((a, b) => b.w - a.w).slice(0, 5);
    if (spec === 'Enhancement') out.unshift({ name: 'Weapon Damage', w: null });
    return out;
  }
  function renderStatBars(list) {
    const max = Math.max(...list.map(s => s.w || 0)) || 1;
    return '<ol class="stat-bars">' + list.map((s, i) =>
      '<li><span class="sb-n">' + (i + 1) + '</span><span class="sb-name">' + I18N.term(s.name) + '</span>' +
      '<span class="sb-bar"><span style="width:' + (s.w == null ? 100 : Math.max(12, Math.round(s.w / max * 100))) + '%"></span></span></li>').join('') + '</ol>';
  }

  function renderList(items, ordered) {
    if (!items) return '';
    return '<ul class="plain' + (ordered ? ' ordered' : '') + '">' +
      items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
  }

  function renderNoteList(items) {
    if (!items) return '';
    return '<ul class="plain">' + items.map(i =>
      '<li>' + i.note + ' ' + badge(i.confidence) + '</li>'
    ).join('') + '</ul>';
  }

  // ---------- guide ----------

  function tile(icon, label, value, sub, href) {
    const tag = href ? 'a' : 'div';
    return '<' + tag + ' class="tile"' + (href ? ' href="' + href + '"' : '') + '>' +
      '<img src="' + iconUrl(icon) + '" alt="" loading="lazy">' +
      '<div class="tile-text"><span class="tile-label">' + label + '</span><span class="tile-value">' + value + '</span>' +
      (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div></' + tag + '>';
  }

  function weaponAt(level) {
    if (!window.GearPath || !window.GEAR_DATA) return window.Weapons && window.Weapons.bestSafe(level);
    const steps = window.GearPath.compute().plan.slots.Weapon.steps.filter(st => st.level <= level);
    const st = steps[steps.length - 1];
    if (!st) return null;
    const w = st.pick.item;
    const value = Site.spec === 'Enhancement' ? I18N.num(w.dps.toFixed(1)) + ' DPS' : t('wp.ilvl') + ' ' + w.ilvl;
    return { name: w.name, kind: w.kind, quality: w.quality, value, source: window.GearPath.sourceText(st.pick) };
  }

  // The short version, right under the banner.
  function renderTiles(guide, spec) {
    const list = statOrder(spec, guide.statPriority.list).map(s => s.name);
    let html = '<div class="tiles">';
    html += tile(SPEC_ICONS[spec], t('tile.role'), guide.role, spec);
    // The weapon your gear path has you hold at 30 (your race and professions).
    const best = weaponAt(30);
    if (best) {
      html += tile(WEAPON_ICONS[best.kind], t('tile.weapon', { level: 30 }), '<span class="q' + best.quality + '">' + best.name + '</span>',
        best.value + ' · ' + best.source, '#Equipo/camino');
    }
    const build = window.I18N.localize(window.BUILD_DATA || []).find(b => b.spec === spec);
    if (build) {
      const pts = window.SHAMAN_DATA.talents.trees.map(tr => window.TalentRules.treePoints(build.points, tr));
      const capstone = guide.keyTalents && iconFor(guide.keyTalents[0].split(' — ')[0].replace(/ (.*)$/, ''));
      html += tile(capstone || SPEC_ICONS[spec], t('tile.build'), build.name, t('common.level') + ' ' + build.level + ' · ' + pts.join('/'), window.Calculator.linkFor(build));
    }
    html += tile(STAT_ICONS[list[0]] || 'spell_holy_magicalsentry', t('tile.stat'), I18N.term(list[0]),
      t('tile.then', { list: list.slice(1, 4).map(I18N.term).join(', ') }));
    return html + '</div>';
  }

  // Key talents: icon, name, what it does.
  function renderKeyTalents(guide) {
    if (!guide.keyTalents) return '';
    return '<div class="panel"><h3>' + t('guide.keyTalents') + '</h3><ul class="key-talents">' + guide.keyTalents.map(k => {
      const [full, what] = k.split(' — ');
      const name = full.replace(/ \(.*\)$/, '');
      const where = (full.match(/ \((.*)\)$/) || [])[1];
      return '<li class="no-refs" data-ref="' + name + '"><img src="' + iconUrl(iconFor(name)) + '" alt="" loading="lazy"><div><b>' + name + '</b>' +
        (where ? ' <span class="dim">' + where + '</span>' : '') + (what ? '<span class="kt-what">' + what + '</span>' : '') + '</div></li>';
    }).join('') + '</ul></div>';
  }

  function renderRotation(rot, spec) {
    let html = '<div class="panel"><h3>' + t('guide.rotation') + ' ' + badge(rot.confidence) + '</h3>';
    const labels = { level20: t('guide.level20'), level30: t('guide.level30'), level60: t('guide.level60'), priority: t('guide.priority') };
    Object.keys(rot).forEach(key => {
      if (!labels[key]) return;
      const extraBadge = key === 'level60' && rot.level60Confidence ? ' ' + badge(rot.level60Confidence) : '';
      html += '<div class="sub-label">' + labels[key] + extraBadge + '</div><ol class="steps">' +
        rot[key].map(s => '<li><span class="step-icon" style="background-image:url(' + iconUrl(firstRef(s) || SPEC_ICONS[spec]) + ')"></span><div>' + s + '</div></li>').join('') + '</ol>';
    });
    if (rot.totems) {
      html += '<div class="sub-label">' + t('guide.keyTotems') + '</div><div class="totem-row no-refs">' + rot.totems.map(n =>
        '<span class="totem-tile" data-ref="' + n + '"><img src="' + iconUrl(iconFor(n)) + '" alt="" loading="lazy">' + n + '</span>').join('') + '</div>';
    }
    return html + '</div>';
  }

  // What to look for: why the priority is what it is, and the gear notes.
  function renderStatsGear(guide) {
    const sp = guide.statPriority;
    let html = '<div class="panel"><h3>' + t('guide.statsGear') + ' ' + badge(sp.confidence) + '</h3>';
    if (sp.rationale) html += '<p class="note-text">' + sp.rationale + '</p>';
    if (sp.forever) html += '<div class="forever-note">' + sp.forever.note + ' ' + badge(sp.forever.confidence) + '</div>';
    if (sp.alsoReported) {
      html += '<div class="sub-label">' + t('guide.alsoReported') + ' ' + badge(sp.alsoReported.confidence) + '</div>' + renderStatChips(sp.alsoReported.list);
      if (sp.alsoReported.note) html += '<p class="note-text">' + sp.alsoReported.note + '</p>';
    }
    const gear = (guide.gearTargets || []).concat(guide.gearingNotes || []);
    if (gear.length) html += '<div class="sub-label">' + t('guide.gearNotes') + '</div>' + renderNoteList(gear);
    html += '<p class="note-text dim"><a href="#Equipo/camino">' + t('guide.toWeapons') + '</a></p>';
    return html + '</div>';
  }

  // When a spell or talent named in the guide is yours: a trainer spell's
  // first rank, or the level your leveling build takes the talent (else the
  // first level its row opens).
  function learnLevel(name, order) {
    const lv = window.Spellbook.levelsOf(name);
    if (lv && lv.length) return lv[0];
    const row = (order || []).find(r => r[3] === name);
    if (row) return row[0];
    for (const tr of window.SHAMAN_DATA.talents.trees) {
      const tal = tr.talents.find(x => x.name === name);
      if (tal) return window.TalentRules.levelForPoints(5 * (tal.row - 1) + 1);
    }
    return 1;
  }

  // Now, at your level: the rotation with what you have (the rest says from
  // when), your next talent point and the weapon your path has you hold.
  function renderNow(guide, spec) {
    const lvl = UI.levelNow();
    const rot = guide.rotation || {};
    const key = lvl <= 20 && rot.level20 ? 'level20' : lvl <= 30 && rot.level30 ? 'level30' : rot.level60 ? 'level60' : 'priority';
    const tal = window.Home.talentNow(lvl);
    const order = tal && tal.build.order;
    // A step counts from when you have its main spell (the first it names).
    const steps = (rot[key] || []).map(s => ({ s, from: learnLevel(window.Refs.allRefs(s)[0], order) }));
    const now = steps.filter(x => x.from <= lvl);
    const later = steps.filter(x => x.from > lvl).sort((a, b) => a.from - b.from);
    const step = (x, i) => '<li><span class="step-icon" style="background-image:url(' + iconUrl(firstRef(x.s) || SPEC_ICONS[spec]) + ')"></span><div>' + x.s + '</div></li>';
    const line = (k, body) => '<div class="pn-row"><span class="pn-k">' + k + '</span><div class="pn-v">' + body + '</div></div>';
    let html = '<section class="pr-now guide-now"><span class="hn-kicker">' + t('guide.now.kicker', { n: lvl }) + '</span>' +
      '<h2>' + t('guide.now.title') + '</h2>' +
      (now.length ? '<ol class="steps">' + now.map(step).join('') + '</ol>' : '<p class="dim">' + t('guide.now.none') + '</p>');
    // The spells you already have (first ranks), newest first, your spec's
    // tab before the others (Enhancement uses Elemental's shocks too); ten at most.
    const tabs = window.SHAMAN_DATA.spellbook.tabs.slice().sort((a, b) => (b.name === spec) - (a.name === spec));
    const mine = [...new Set(tabs.flatMap(x => x.spells.map(([n]) => n)))].map((n, i) => ({ n, i, lv: (window.Spellbook.levelsOf(n) || [])[0] }))
      .filter(x => x.lv && x.lv <= lvl).sort((a, b) => b.lv - a.lv || a.i - b.i).slice(0, 10);
    if (mine.length) html += line(t('guide.now.spells'), mine.map(x => '<span class="gn-spell">' + x.n + '</span>').join(''));
    if (later.length) {
      html += '<details class="gn-later"><summary>' + t('guide.now.later', { n: later.length }) + '</summary><ol class="steps">' +
        later.map(x => '<li><span class="step-icon" style="background-image:url(' + iconUrl(firstRef(x.s) || SPEC_ICONS[spec]) + ')"></span><div><span class="gpc-tag">' + t('guide.now.from', { n: x.from }) + '</span> ' + x.s + '</div></li>').join('') + '</ol></details>';
    }
    const next = tal && (tal.now || tal.next);
    if (next) html += line(t('guide.now.talent'), '<b>' + next.talent + '</b> <span class="dim">' +
      (tal.now ? t('guide.now.talentNow', { rank: next.rank, max: next.max }) : t('guide.now.talentAt', { n: next.from })) + '</span> <a href="' + window.Calculator.linkFor(tal.build) + '">' + t('home.plan.talentsMore') + '</a>');
    const w = weaponAt(lvl);
    if (w) html += line(t('guide.now.weapon'), '<b class="q' + w.quality + '">' + w.name + '</b> <span class="dim">' + w.value + ' · ' + w.source + '</span> <a href="#Equipo/camino">' + t('guide.now.weaponMore') + '</a>');
    return html + '</section>';
  }

  function renderGuidePage(spec) {
    const guide = window.I18N.localize(window.GUIDE_DATA[spec]);
    let html = pageHead(guide.role, spec, guide.summary);
    html += '<div class="gp-head"><h2>' + t('guide.mine') + '</h2>' + UI.levelStepper() + '</div>';
    html += renderNow(guide, spec);
    html += renderTiles(guide, spec);
    html += renderChanges(guide.mechanicalChanges, spec);
    html += '<div class="guide-cols">';
    html += '<div class="col">' + '<div class="panel"><h3>' + t('guide.stats') + ' ' + badge(guide.statPriority.confidence) + '</h3>' +
      renderStatBars(statOrder(spec, guide.statPriority.list)) + '</div>' + renderKeyTalents(guide) + '</div>';
    html += '<div class="col">' + renderRotation(guide.rotation, spec) + renderStatsGear(guide) + '</div>';
    html += '</div>';
    html += renderSources(guide.sources, guide.caveat);
    return html;
  }

  // ---------- class page ----------

  function renderNotes(notes) {
    return '<ul class="plain">' + notes.map(n => '<li>' + n.fact + ' ' + badge(n.confidence) + '</li>').join('') + '</ul>';
  }

  // Notes as cards, with the icon of the first spell or talent they name.
  function renderNoteCards(notes) {
    return '<div class="note-grid">' + notes.map(n => {
      const icon = firstRef(n.fact);
      return '<div class="note-card' + (icon ? '' : ' plain-note') + '">' + (icon ? '<img src="' + iconUrl(icon) + '" alt="" loading="lazy">' : '') +
        '<div>' + n.fact + ' ' + badge(n.confidence) + '</div></div>';
    }).join('') + '</div>';
  }

  function pctLabel(p) {
    return '<span class="pct ' + (p < 0 ? 'down' : p > 0 ? 'up' : '') + '">' + (p > 0 ? '+' : '') + p + '%</span>';
  }

  function renderTotems(tot) {
    let html = renderNoteCards(tot.notes) + '<div class="panel" style="margin-top:16px"><h3>' + t('ov.totemsChanged') + ' ' + badge(tot.confidence) + '</h3>' +
      '<div class="table-wrap"><table class="cmp"><thead><tr><th>' + t('ov.colTotem') + '</th><th>Classic</th><th>Forever</th><th></th></tr></thead><tbody>';
    tot.changed.forEach(c => {
      html += '<tr><td class="no-refs"><span class="spell-ref"><img src="' + smallIcon(iconFor(c.totem)) + '" alt="">' + c.totem + '</span> <span class="dim">' + c.rank + '</span></td><td class="dim">' + c.classic + '</td>' +
        '<td>' + c.forever + '</td><td>' + pctLabel(c.pct) + '</td></tr>';
    });
    return html + '</tbody></table></div>' +
      '<p class="note-text dim">' + t('ov.totemsMore') + '</p></div>';
  }

  // Top-rank tooltip numbers, worked out live from the spellbook data.
  function renderDamage(dm) {
    let html = '<div class="panel"><h3>' + t('ov.damage') + ' ' + badge('client-data') + '</h3>' +
      '<p class="note-text">' + t('ov.damageIntro') + '</p>' +
      '<div class="dmg-list">';
    dm.spells.forEach(([name, rank]) => {
      const c = window.Spellbook.compare(name, rank);
      if (!c || c.pct == null) return;
      const left = Math.max(0, Math.min(100, 100 + c.pct));
      html += '<div class="dmg-row"><div class="dmg-name no-refs"><img src="' + smallIcon(iconFor(name)) + '" alt="">' + name + ' <span class="dim">' + rank.replace('Rank ', 'R') + '</span></div>' +
        '<div class="dmg-bar"><span style="width:' + left + '%"></span></div>' +
        '<div class="dmg-nums"><span class="dim">' + I18N.range(c.then) + '</span> → ' + I18N.range(c.now) + ' ' + pctLabel(c.pct) + '</div></div>';
    });
    return html + '</div>' + renderNotes(dm.notes) + '</div>';
  }

  function renderRaces(r) {
    const racials = window.SHAMAN_DATA.racials;
    let html = '<div class="panel"><h3>' + t('ov.races') + ' ' + badge(r.confidence) + '</h3>' +
      '<p class="note-text">' + r.note + '</p><div class="race-grid no-refs">';
    [Site.faction === 'horde' ? 'Horde' : 'Alliance'].forEach(faction => {
      // Your race (header picker) first and highlighted.
      const mine = x => (x.race === Site.race ? 0 : 1);
      (racials[faction] || []).filter(x => x.classes.includes('Shaman')).sort((a, b) => mine(a) - mine(b)).forEach(race => {
        const isNew = r.newToShaman.includes(race.race);
        html += '<div class="race-card ' + faction.toLowerCase() + (race.race === Site.race ? ' mine' : '') + '">' +
          '<div class="rc-head"><img src="' + iconUrl(race.icon) + '" alt=""><b>' + race.race + '</b>' +
          '<span class="rc-faction">' + faction + (isNew ? ' · ' + t('ov.newToShaman') : '') + '</span></div><ul>' +
          race.abilities.map(([name, text, icon]) =>
            '<li><img src="' + iconUrl(icon) + '" alt=""><div><b>' + name + '</b><span>' + I18N.client(text) + '</span></div></li>').join('') +
          '</ul>' + I18N.original(race.abilities.map(([name, text]) => '<b>' + name + ':</b> ' + text)) + '</div>';
      });
    });
    return html + '</div></div>';
  }

  // Class page: your spells by level first (Spellbook), every spell, macros,
  // then what applies to every spec, one section at a time.
  const CLASS_SECTIONS = ['nivel', 'lista', 'macros', 'notas', 'totems', 'dano', 'razas'];
  const SPELL_SECTIONS = ['nivel', 'lista', 'macros'];
  function classHead(section) {
    return pageHead(t('ov.role'), t('ov.title'), t('ov.intro')) +
      (section === 'nivel' ? '<div class="gp-head"><h2>' + t('cl.mine') + '</h2>' + UI.levelStepper() + '</div>' : '') +
      Site.sectionTabs('Clase', CLASS_SECTIONS, section, k => t('cl.sec.' + k));
  }
  function renderClass(guide) {
    const section = Site.section('Clase', CLASS_SECTIONS);
    let html = classHead(section);
    if (section === 'totems') html += renderTotems(guide.totems);
    else if (section === 'dano') html += renderDamage(guide.damage);
    else if (section === 'razas') html += renderRaces(guide.races);
    else html += renderNoteCards(guide.classNotes);
    return html + renderSources(guide.sources, guide.caveat);
  }

  window.Guide = {
    render(app, spec) {
      app.innerHTML = renderGuidePage(spec);
      decorate(app);
      UI.bindLevel(app, () => window.Guide.render(app, spec));
    }
  };
  window.ClassPage = {
    render(app, helpers) {
      const section = Site.section('Clase', CLASS_SECTIONS);
      if (SPELL_SECTIONS.includes(section)) {
        window.Spellbook.render(app, helpers, { section, head: () => classHead(section), redraw: () => window.ClassPage.render(app, helpers) });
        return;
      }
      app.innerHTML = renderClass(I18N.localize(window.GUIDE_DATA.Overview));
      decorate(app);
    }
  };
})();
