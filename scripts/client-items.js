// The game client's own numbers for every item, over Wowhead's tooltips.
// Wowhead Forever keeps tooltips from when someone first saw the item, so
// pieces Forever reworked later (other stats, crit and hit as ratings instead
// of percentages, "damage and healing" as spell power) stay old there.
// wowsims/gamedata (MIT) exports every item from the client's tables with the
// hotfixes applied, every three hours: items/items.txt, one card per item.
// Run by scripts/sync.js; by hand it corrects data/items.json in place:
//   node scripts/client-items.js            (then node scripts/build-data.js)
const http = require('./lib/http');
const { readJSON, writeJSON } = require('./lib/files');

const URL = 'https://raw.githubusercontent.com/wowsims/gamedata/main/items/items.txt';

// Card stat names -> where they go: a primary stat (stats) or a bonus.
const PRIMARY = { strength: 'strength', agility: 'agility', stamina: 'stamina', intellect: 'intellect', spirit: 'spirit', armor: 'armor' };
const BONUS = {
  'spell power': 'spellPower', healing: 'healing', 'spell damage': 'spellDamage',
  'nature damage': 'natureDamage', 'fire damage': 'fireDamage', 'frost damage': 'frostDamage',
  'shadow damage': 'otherDamage', 'arcane damage': 'otherDamage', 'holy damage': 'otherDamage',
  'attack power': 'attackPower', 'mana per 5 sec': 'mp5',
  'crit rating': 'critRating', 'hit rating': 'hitRating', 'haste rating': 'hasteRating', 'expertise rating': 'expertiseRating',
  'defense rating': 'defense', 'dodge rating': 'dodgeRating'
};
// Equip lines that only state a stat the card already gives as a number:
// dropped once the client's numbers are in (the rest, effects, stay).
const STAT_LINE = new RegExp([
  'damage and healing done by magical spells', 'healing done by (magical )?spells and effects', 'healing done by up to \\d+ and damage',
  'damage done by magical spells and effects', 'damage done by (Shadow|Arcane|Holy|Nature|Fire|Frost) spells and effects',
  '^Equip: \\+\\d+ Attack Power\\.?$', 'critical strike', 'chance to hit', 'Restores \\d+ mana per 5 sec', 'Increased Defense',
  'chance to [Dd]odge'
].join('|'));

function parse(text) {
  const cards = new Map();
  for (const block of text.split('\n=======\n')) {
    const head = block.match(/^(\d+) (.+)/);
    const level = block.match(/^level\s+ilvl (\d+)(?:, requires level (\d+))?/m);
    if (!head || !level) continue;
    const card = { ilvl: Number(level[1]), req: Number(level[2] || 0), stats: {}, bonus: {} };
    const line = (block.match(/^stats\s+(.*)$/m) || [])[1] || '';
    for (const m of line.matchAll(/\+(\d+) ([a-z0-9 ]+?)(?=,|$)/g)) {
      const name = m[2].trim();
      if (PRIMARY[name]) card.stats[PRIMARY[name]] = Number(m[1]);
      else if (BONUS[name]) card.bonus[BONUS[name]] = (card.bonus[BONUS[name]] || 0) + Number(m[1]);
    }
    const w = block.match(/^weapon\s+(\d+) - (\d+) damage, speed ([\d.]+), ([\d.]+) dps/m);
    if (w) Object.assign(card, { dmgMin: Number(w[1]), dmgMax: Number(w[2]), speed: Number(w[3]), dps: Number(w[4]) });
    cards.set(Number(head[1]), card);
  }
  return cards;
}

async function load() {
  const text = await http.get(URL, { cache: 'wowsims/items.txt', maxAgeDays: 0.5, valid: t => /\n=======\n/.test(t) && /^level\s+ilvl/m.test(t) });
  return text == null ? null : parse(text);
}

// Same keys and values, whatever the order.
const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());

// Puts the client's numbers on our items (in place). Returns how many changed.
// Forever reworked many Classic pieces: caster weapons lost the equip spell
// that gave spell power (Icicle Rod: spell 7703 in Classic Era's ItemEffect,
// none in Forever's ItemXItemEffect) and hit harder instead. The items the
// server streams (no row in the client files we read) come from the server's
// hotfixes in wowsims/gamedata, so they're covered too.
function apply(items, cards) {
  let changed = 0;
  for (const it of Object.values(items)) {
    const c = cards.get(it.id);
    if (!c) continue;
    const before = JSON.stringify([it.stats, it.bonus, it.req, it.ilvl, it.dmgMin, it.dmgMax, it.speed]);
    if (!same(it.stats, c.stats)) it.stats = c.stats;
    // What the card doesn't state stays from the tooltip (effects' numbers
    // like "+30 Attack Power against Undead" never were bonuses).
    if (!same(it.bonus, c.bonus)) it.bonus = Object.assign({}, c.bonus);
    if (c.ilvl) it.ilvl = c.ilvl;
    it.req = c.req;
    // The card rounds DPS to one decimal: only when the damage itself differs.
    if (c.dps && (c.dmgMin !== it.dmgMin || c.dmgMax !== it.dmgMax || c.speed !== it.speed)) Object.assign(it, { dmgMin: c.dmgMin, dmgMax: c.dmgMax, speed: c.speed, dps: c.dps });
    it.equip = (it.equip || []).filter(e => !STAT_LINE.test(e));
    // Attack power some pieces give through an effect spell ("+14 Attack
    // Power. This effect is tripled in..."): not on the card, still yours.
    // Conditional lines ("against Undead") never count.
    for (const e of it.equip) {
      const m = e.match(/^Equip: \+(\d+) Attack Power\.(?! against)/);
      if (m && !it.bonus.attackPower) it.bonus.attackPower = Number(m[1]);
    }
    it.numbers = 'client';
    if (JSON.stringify([it.stats, it.bonus, it.req, it.ilvl, it.dmgMin, it.dmgMax, it.speed]) !== before) changed++;
  }
  return changed;
}

module.exports = { load, apply, parse };

if (require.main === module) {
  (async () => {
    const cards = await load();
    if (!cards) throw new Error('sin items.txt de wowsims/gamedata');
    const data = readJSON('data/items.json');
    const n = apply(data.items, cards);
    writeJSON('data/items.json', data);
    console.log('Números del cliente: ' + n + ' ítems corregidos de ' + Object.keys(data.items).length +
      ' (' + Object.values(data.items).filter(i => i.numbers === 'client').length + ' con números del cliente)');
  })().catch(e => { console.error(e.message); process.exit(1); });
}
