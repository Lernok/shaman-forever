// Equipo › Pre-raid: the best piece per slot you can get at 60 before the
// raids (dungeons, quests, crafts, vendors and reputations, the Tier 0.5,
// world drops marked), ranked by WoWSims' weights for a raid fight
// (GearPlan.WEIGHTS_RAID: level 63 boss, raid buffs, three minutes). Raid
// drops are left out. Totems and trinkets that only carry an effect are
// ranked by item level and effect, so the page says to check them.
(function () {
  const t = (key, vars) => window.I18N.t(key, vars);
  const UI = window.UI;
  const Site = window.Site;
  const GP = () => window.GearPlan;
  const RAID = /^(Naxxramas|Molten Core|Blackwing Lair|Zul'Gurub|Onyxia's Lair|Ruins of Ahn'Qiraj|Ahn'Qiraj|Temple of Ahn'Qiraj)$/;
  const BG = /^(Alterac Valley|Warsong Gulch|Arathi Basin)$/;
  const RACE_BIT = { Orc: 2, Dwarf: 4, Tauren: 32, Troll: 128 };
  const SHOW = { Finger: 5, Trinket: 5 };
  const PICK = { Finger: 2, Trinket: 2 };
  const isWeapon = i => i.dps != null && i.speed != null;
  const slotOf = i => (isWeapon(i) ? 'Weapon' : ['Shield', 'Held In Off-hand'].includes(i.slot) ? 'Off Hand' : i.slot);
  const gear = () => ((window.GEAR_DATA && window.GEAR_DATA.gear) || []).concat((window.WEAPON_DATA && window.WEAPON_DATA.weapons) || []);
  const state = { boe: UI.store.get('pbBoe', true), pvp: UI.store.get('pbPvp', true) };

  // Sources you can use at 60 for your faction: no raid, no other faction;
  // world drops and PvP only when asked.
  function sources(item) {
    return (item.pre || item.sources || []).filter(s => {
      if (s.faction && s.faction !== 'both' && s.faction !== Site.faction) return false;
      if (s.raid || RAID.test(s.zone || '') || RAID.test(s.dungeonZone || '')) return false;
      if (s.type === 'unknown' || s.type === 'unrecorded') return false;
      if ((s.pvp || BG.test(s.zone || '')) && !state.pvp) return false;
      if ((s.type === 'drop' || s.type === 'trash') && !state.boe) return false;
      return ['quest', 'boss', 'crafted', 'vendor', 'drop', 'trash'].includes(s.type);
    });
  }
  const tag = s => (s.pvp || BG.test(s.zone || '') ? 'pvp' : s.type === 'drop' || s.type === 'trash' ? 'boe' : /Five Thunders/.test(s.note || '') || /Tier 0\.5/.test(s.note || '') ? 't05' : s.type === 'crafted' ? 'craft' : null);

  function list() {
    const spec = Site.spec;
    const W = GP().WEIGHTS_RAID[spec];
    const bit = RACE_BIT[Site.race];
    const bySlot = {};
    // Data from before the phases were synced: no phase filter.
    const phased = gear().some(i => i.phase);
    gear().forEach(item => {
      if ((item.req || 0) > 60) return;
      // Out now: WoWSims' Forever database has it in phase 1 (phase 2 comes
      // with the raids; crafts not in the game yet aren't in it at all).
      if (phased && item.phase !== 1) return;
      if (bit && item.raceMask > 0 && !(item.raceMask & bit)) return;
      const slot = slotOf(item);
      if (!GP().SLOTS.includes(slot)) return;
      if (spec === 'Enhancement' && slot === 'Off Hand') return;
      const v = GP().value(item, spec, W);
      if (!(v > 0)) return;
      const src = sources(item);
      if (!src.length) return;
      (bySlot[slot] = bySlot[slot] || []).push({ item, v, src, effect: !isWeapon(item) && !Object.keys(item.stats || {}).length && !Object.keys(item.bonus || {}).length });
    });
    Object.values(bySlot).forEach(l => l.sort((a, b) => b.v - a.v));
    return bySlot;
  }

  function srcText(s) {
    const txt = window.WeaponSource ? window.WeaponSource(Object.assign({ faction: 'both' }, s)) : s.type;
    return txt + (s.obtainLevel && s.obtainLevel > 1 ? ' · ' + t('pb.from', { level: s.obtainLevel }) : '');
  }

  function render(container, tabs, ui) {
    const bySlot = list();
    const color = ((ui && ui.specColors) || {})[Site.spec] || 'inherit';
    let html = '<div class="spec-summary" style="--spec-color:' + color + '">' +
      '<div class="role">' + t('pb.role') + ' · ' + t('wp.faction.' + Site.faction) + ' · ' + Site.spec + '</div><h2>' + t('pb.title') + '</h2><p>' + t('pb.intro') + '</p></div>';
    html += tabs;
    html += '<div class="wp-controls">' +
      '<label class="chk chip-toggle" title="' + t('pb.boeTitle') + '"><input type="checkbox" id="pbBoe"' + (state.boe ? ' checked' : '') + '> ' + t('pb.boe') + '</label>' +
      '<label class="chk chip-toggle"><input type="checkbox" id="pbPvp"' + (state.pvp ? ' checked' : '') + '> ' + t('pb.pvp') + '</label></div>';
    html += '<p class="note-text dim">' + t('pb.how.' + Site.spec) + '</p>';
    html += '<div class="pb-list">';
    GP().SLOTS.forEach(slot => {
      const l = bySlot[slot];
      if (!l || !l.length) return;
      html += '<section class="pb-slot"><h3 class="block-title">' + t('pb.slot.' + slot) + (l.some(x => x.effect) ? ' <span class="dim pb-effect" title="' + t('pb.effectTitle') + '">' + t('pb.effect') + '</span>' : '') + '</h3><ol class="pb-items">' +
        l.slice(0, SHOW[slot] || 3).map((x, i) => {
          const pct = Math.round(100 * x.v / l[0].v);
          const tags = Array.from(new Set(x.src.map(tag).filter(Boolean)));
          return '<li class="pb-item' + (i < (PICK[slot] || 1) ? ' best' : '') + '"><span class="pb-name">' + UI.itemLink(x.item) +
            tags.map(k => ' <span class="pb-tag pb-' + k + '">' + t('pb.tag.' + k) + '</span>').join('') + '</span>' +
            '<span class="pb-val">' + (i === 0 ? t('pb.best') : pct + '%') + '</span>' +
            '<span class="pb-src">' + x.src.slice(0, 2).map(srcText).join(' / ') + '</span></li>';
        }).join('') + '</ol></section>';
    });
    html += '</div>';
    html += UI.renderSources([
      'https://github.com/wowsims/forever — ' + t('pb.srcSims'),
      'https://forg.gg/en/forever/tips/dungeon-set-2-upgrade — ' + t('pb.srcT05'),
      'https://www.wowhead.com/forever — ' + t('wp.srcWowhead')
    ], t('pb.caveat'));
    container.innerHTML = html;
    container.querySelector('#pbBoe').addEventListener('change', e => { state.boe = e.target.checked; UI.store.set('pbBoe', state.boe); render(container, tabs, ui); });
    container.querySelector('#pbPvp').addEventListener('change', e => { state.pvp = e.target.checked; UI.store.set('pbPvp', state.pvp); render(container, tabs, ui); });
    const byId = new Map(gear().map(i => [String(i.id), i]));
    UI.tip.bind(container, '[data-item]', a => (byId.has(a.dataset.item) ? UI.itemCard(byId.get(a.dataset.item), (byId.get(a.dataset.item).pre || byId.get(a.dataset.item).sources || []).filter(s => sources({ sources: [s] }).length).map(srcText)) : null));
  }

  window.PreBis = { render, list };
})();
