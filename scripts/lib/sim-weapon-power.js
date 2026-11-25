// Forever gives caster weapons spell power "from weapon damage" (Whiteout
// Staff: 74). Neither the client tables nor Wowhead's tooltips show it, so
// weapons ranked without it: WoWSims' Forever database (MIT) has it in its
// stats (4 healing, 5 spell damage, 10 Nature damage). Fills it in on weapons
// that carry no spell power of their own. Returns how many it filled.
module.exports = function fill(items, simDb) {
  if (!simDb) return 0;
  const by = new Map(simDb.items.map(i => [i.id, i]));
  let n = 0;
  Object.values(items).forEach(it => {
    if (it.dps == null || it.speed == null) return;
    const b = it.bonus || {};
    if (b.spellPower || b.spellDamage || b.healing || b.natureDamage) return;
    const s = (((by.get(it.id) || {}).scalingOptions || {})['0'] || {}).stats || {};
    const heal = s[4] || 0, dmg = s[5] || 0, nature = s[10] || 0;
    if (!heal && !dmg && !nature) return;
    const add = {};
    if (dmg && heal === dmg) add.spellPower = dmg;
    else { if (dmg) add.spellDamage = dmg; if (heal) add.healing = heal; }
    if (nature) add.natureDamage = nature;
    it.bonus = Object.assign({}, b, add);
    it.weaponPowerFrom = 'wowsims';
    n++;
  });
  return n;
};
