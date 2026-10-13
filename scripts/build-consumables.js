// Food (Cooking) and bandages/potions (First Aid) from the beta client: every
// recipe of those skills (SkillLineAbility), the item it creates (SpellEffect
// "create item"), and what the item does from its Wowhead Forever tooltip
// (well-fed stat and amount, health, mana). Recipe sources from QuestieDB when
// a "Recipe:"/"Manual:" item exists for it.
//
//   node scripts/build-consumables.js [--offline]
//
// Writes data/consumables.json.
const { parseCSV } = require('./lib/csv');
const { readJSON, writeJSON } = require('./lib/files');
const http = require('./lib/http');
const wowhead = require('./lib/wowhead');
const questie = require('./lib/questie');
const att = require('./lib/att');
const fs = require('fs');
const path = require('path');

const SKILLS = { 185: 'Cooking', 129: 'First Aid' };
const CREATE_ITEM = '24';

// "gain 10 Intellect", "gain 14 spell damage", "increase your critical strike chance by 1%"…
const STATS = [
  [/gain (\d+) Strength/i, 'strength'], [/gain (\d+) Agility/i, 'agility'], [/gain (\d+) Stamina/i, 'stamina'],
  [/gain (\d+) Intellect/i, 'intellect'], [/gain (\d+) Spirit/i, 'spirit'],
  [/(?:healing|heal)[^.]*?by up to (\d+)|gain (\d+) healing/i, 'healing'],
  [/spell (?:damage|power)[^.]*?(?:by up to )?(\d+)|gain (\d+) spell (?:damage|power)/i, 'spellDamage'],
  [/(\d+) attack power|attack power by (\d+)/i, 'attackPower'],
  [/(\d+)% Critical Strike|critical strike[^.]*?(\d+)%/i, 'crit'], [/(\d+) armor|armor by (\d+)/i, 'armor'],
  [/(\d+) Fishing|Fishing skill by (\d+)/i, 'fishing'], [/(\d+) mana every 5|(\d+) mana per 5/i, 'mp5']
];

function parseUse(text) {
  const out = {};
  const req = text.match(/Requires Level (\d+)/);
  out.req = req ? Number(req[1]) : 1;
  const ilvl = text.match(/Item Level (\d+)/);
  out.ilvl = ilvl ? Number(ilvl[1]) : null;
  const use = (text.match(/Use: (.*?)(?: Max Stack| Sell Price|$)/) || [])[1] || '';
  out.use = use.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const hp = use.match(/Restores (\d+) health/i) || use.match(/Heals (\d+) damage/i);
  if (hp) out.health = Number(hp[1]);
  const range = use.match(/Restores (\d+) to (\d+) health/i);
  if (range) out.health = [Number(range[1]), Number(range[2])];
  const mana = use.match(/(\d+) mana over/i) || use.match(/Restores (\d+) to (\d+) mana/i);
  if (mana) out.mana = mana[2] ? [Number(mana[1]), Number(mana[2])] : Number(mana[1]);
  const fed = use.split(/well fed/i)[1];
  if (fed) {
    for (const [re, stat] of STATS) {
      const m = fed.match(re);
      if (m) { out.buff = { stat, amount: Number(m[1] || m[2]) }; break; }
    }
    if (!out.buff) out.buff = { stat: 'other' };
    out.buff.text = fed.replace(/^[^,]*?(?=gain|and)/, '').replace(/^and\s+/, '').split(/\.\s*(?:Additionally|&nbsp;|Also)/)[0].replace(/\.\s*$/, '').trim();
    out.xp = /experience gained from kills is increased by (\d+)%/i.test(use) ? Number(use.match(/increased by (\d+)%/i)[1]) : undefined;
  }
  return out;
}

(async () => {
  const meta = readJSON('data/meta.json');
  const build = meta.items.build;
  const dir = path.join(http.cacheDir, 'wago', build);
  const read = name => parseCSV(fs.readFileSync(path.join(dir, name + '.csv'), 'utf8'));
  const abilities = read('SkillLineAbility').filter(r => SKILLS[r.SkillLine]);
  const effects = read('SpellEffect').filter(r => r.Effect === CREATE_ITEM);
  const sparse = new Map(read('ItemSparse').map(r => [r.ID, r]));
  const creates = new Map(effects.map(r => [r.SpellID, r.EffectItemType]));
  // Recipe items ("Recipe: Crab Cake", "Manual: Heavy Silk Bandage") by what they teach.
  const recipeItem = new Map();
  sparse.forEach(r => {
    const m = /^(?:Recipe|Manual|Formula): (.+)$/.exec(r.Display_lang || '');
    if (m) recipeItem.set(m[1], r.ID);
  });
  const zones = {};
  read('AreaTable').forEach(r => { zones[r.ID] = r.AreaName_lang; });
  const Q = questie.open(http.cacheDir, zones);

  const out = [];
  for (const a of abilities) {
    const itemId = creates.get(a.Spell);
    if (!itemId || itemId === '0') continue;
    const raw = await wowhead.item('forever', itemId);
    let j = null;
    try { j = JSON.parse(raw); } catch (e) { /* none */ }
    if (!j || !j.tooltip) continue;
    const text = j.tooltip.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const info = parseUse(text);
    // How the recipe is learned: from the start / trainer, or a recipe item and where it comes from.
    const recipe = recipeItem.get(j.name);
    let learn = { type: a.AcquireMethod === '1' ? 'start' : 'trainer' };
    if (recipe) {
      const src = (Q.sources(Number(recipe)) || []).map(s => s.type === 'vendor' ? { type: 'vendor', npc: s.name, zone: s.zone, faction: s.faction }
        : s.type === 'drop' ? { type: 'drop', npc: s.name, zone: s.zone } : s.type === 'quest' ? { type: 'quest', quest: s.name, zone: s.zone } : null).filter(Boolean);
      learn = { type: 'recipe', item: Number(recipe), sources: src.slice(0, 3) };
    }
    const reagents = a.SkillLine === '185' ? await wowhead.reagents(a.Spell) : [];
    out.push(Object.assign({
      id: Number(itemId), reagents, name: j.name, icon: j.icon || null, quality: j.quality, profession: SKILLS[a.SkillLine],
      skill: [Number(a.MinSkillLineRank) || 1, Number(a.TrivialSkillLineRankLow) || null, Number(a.TrivialSkillLineRankHigh) || null],
      learn
    }, info));
  }
  out.sort((x, y) => x.profession.localeCompare(y.profession) || x.req - y.req || x.skill[0] - y.skill[0] || x.name.localeCompare(y.name));
  // Where to catch the fish the recipes use (AllTheThings).
  const fishAll = att.fishing(await att.files());
  const used = new Set(out.flatMap(x => (x.reagents || []).map(r => String(r.id))));
  const fish = {};
  Object.entries(fishAll).forEach(([id, f]) => { if (used.has(id)) fish[id] = f; });
  writeJSON('data/consumables.json', { build, fishSource: 'https://github.com/ATTWoWAddon/AllTheThings (MIT)', items: out, fish });
  const n = p => out.filter(x => x.profession === p).length;
  const fed = out.filter(x => x.buff);
  console.log('Peces para cocinar con lugar conocido: ' + Object.keys(fish).length);
  console.log('Consumibles: cocina ' + n('Cooking') + ' (con Well Fed: ' + fed.length + ', sin clasificar: ' + fed.filter(x => x.buff.stat === 'other').length + ') · primeros auxilios ' + n('First Aid'));
  console.log('Descargas: ' + (http.summary() || 'ninguna'));
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
