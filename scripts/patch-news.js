// What each Forever build and hotfix changed for the Shaman, spell by spell,
// for the News page: data/patch-notes.json. wowsims/gamedata (MIT) exports
// every class spell from the client, with the hotfixes, every three hours,
// and keeps one folder per update (patches/<build>/patch|hotfix-<push>) with
// CHANGES.md (the list) and spells.diff (each changed spell's card, before
// and after). An update is read once: its files never change.
//   node scripts/patch-news.js        (run by scripts/sync.js)
const http = require('./lib/http');
const { readJSON, writeJSON } = require('./lib/files');

const REPO = 'wowsims/gamedata';
const RAW = 'https://raw.githubusercontent.com/' + REPO + '/main/';
const FILE = 'data/patch-notes.json';
// Card lines worth telling a player; the rest (labels, attributes, spell
// references) are the client's bookkeeping.
const KEYS = /^(cost|cooldown|cast|duration|range|charges|icd|stack|equip|effect \d+)$/;
// The client's modifier names, in words ("SPELLMOD_DURATION +9 s on family
// 11 mask 0x10" = +9 s to the duration of some spells).
const MODS = { DURATION: 'duration', COOLDOWN: 'cooldown', RANGE: 'range', RADIUS: 'radius', COST: 'cost', CASTING_TIME: 'cast time',
  CRITICAL_CHANCE: 'crit chance', ALL_EFFECTS: 'effect', DAMAGE: 'damage', CHAIN_TARGETS: 'targets', THREAT: 'threat', CHANCE_OF_SUCCESS: 'chance' };
// Text that says nothing to a player.
const EMPTY = /dummy aura|dummy effect|unrecognised shape|casts nothing|^summons creature \d+$/;
function words(v) {
  if (v == null) return null;
  v = v.replace(/^SPELLMOD_([A-Z_]+) (.+?) on family .*$/, (m, mod, amount) => (MODS[mod] || mod.toLowerCase().replace(/_/g, ' ')) + ' ' + amount);
  v = v.replace(/ to target \d+/, '');
  return EMPTY.test(v) ? null : v;
}
// The same text with its numbers rounded ("62.2069–69.7931" became "62–71"
// when the client started rounding): not a change.
function rounding(a, b) {
  if (!a || !b) return false;
  const nums = s => (s.match(/\d+(\.\d+)?/g) || []).map(Number);
  const x = nums(a), y = nums(b);
  return a.replace(/\d+(\.\d+)?/g, '#') === b.replace(/\d+(\.\d+)?/g, '#') && x.length === y.length && x.every((n, i) => Math.abs(n - y[i]) <= 1.5);
}
const CHANGE = /^- (added|removed|changed) (\d+) (.+?) · (\w+)$/;

// A spell card's lines as { key: text }: the first line of each field (a
// field's next lines are the client's raw values).
function fields(lines) {
  const out = {};
  for (const l of lines) {
    const m = l.match(/^([a-z][a-z0-9 ]*?)\s{2,}(.*)$/);
    if (m && KEYS.test(m[1])) { const v = words(m[2].trim()); if (v) out[m[1]] = v; }
  }
  return out;
}

// spells.diff -> { spell id: [{ k, from, to }] }.
function cardChanges(diff) {
  const out = {};
  for (const part of diff.split(/\n(?=--- \d+ )/)) {
    const id = (part.match(/^--- (\d+) /) || [])[1];
    if (!id) continue;
    const body = part.split('\n').filter(l => !/^(---|\+\+\+|@@)/.test(l));
    const before = fields(body.filter(l => l[0] === ' ' || l[0] === '-').map(l => l.slice(1)));
    const after = fields(body.filter(l => l[0] === ' ' || l[0] === '+').map(l => l.slice(1)));
    out[id] = [...new Set(Object.keys(before).concat(Object.keys(after)))]
      .filter(k => before[k] !== after[k] && !rounding(before[k], after[k]))
      .map(k => {
        let from = before[k] || null, to = after[k] || null;
        // "party aura: X" -> "raid aura: X": only the part that changed.
        const a = from && from.split(': '), b = to && to.split(': ');
        if (a && b && a.length > 1 && a.slice(1).join(': ') === b.slice(1).join(': ')) { from = a[0]; to = b[0]; }
        return { k, from, to };
      });
  }
  return out;
}

// One update's Shaman changes, ranks of a spell together (the highest rank's
// lines stand for all: the ranks change alike).
function shamanChanges(changes, diff) {
  const section = (changes.split(/\n(?=### )/).find(s => /^### Shaman:/.test(s)) || '').split('\n');
  const cards = diff ? cardChanges(diff) : {};
  const groups = new Map();
  for (const line of section) {
    const m = line.match(CHANGE);
    if (!m) continue;
    const [, status, id, full, spec] = m;
    const rank = Number((full.match(/\(Rank (\d+)\)$/) || [])[1] || 0);
    const name = full.replace(/ \(Rank \d+\)$/, '');
    const key = status + '|' + name + '|' + spec;
    const g = groups.get(key) || { name, spec, status, ranks: [], lines: [], top: -1 };
    if (rank && !g.ranks.includes(rank)) g.ranks.push(rank);
    if (rank >= g.top) { g.top = rank; g.lines = cards[id] || []; }
    groups.set(key, g);
  }
  return [...groups.values()].map(g => {
    const out = { name: g.name, spec: g.spec, status: g.status, lines: g.lines };
    if (g.ranks.length) out.ranks = g.ranks.sort((a, b) => a - b);
    return out;
  });
}

if (require.main === module) (async () => {
  const notes = readJSON(FILE, null) || {
    _readme: 'What each Forever build and hotfix changed for the Shaman, newest first. Written by scripts/patch-news.js from wowsims/gamedata (MIT), read from the game client with its hotfixes. Field values are the client\'s own words.',
    source: 'https://github.com/' + REPO, checked: [], updates: []
  };
  const tree = await http.get('https://api.github.com/repos/' + REPO + '/git/trees/main?recursive=1',
    // In GitHub Actions the API limits unsigned calls per shared address: the workflow's token avoids it.
    { cache: 'wowsims/gamedata-tree.json', maxAgeDays: 0.1, json: true,
      headers: process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {} });
  if (!tree || !tree.tree) { console.log('wowsims/gamedata no respondió: Novedades de parches sin cambios.'); return; }
  const dirs = [...new Set(tree.tree.map(e => (e.path.match(/^patches\/([^/]+\/[^/]+)\/CHANGES\.md$/) || [])[1]).filter(Boolean))];
  const fresh = dirs.filter(d => !notes.checked.includes(d));
  for (const dir of fresh) {
    const changes = await http.get(RAW + 'patches/' + dir + '/CHANGES.md', { cache: 'wowsims/patches/' + dir + '/CHANGES.md', maxAgeDays: null, valid: t => t.startsWith('# ') });
    if (changes == null) continue;
    notes.checked.push(dir);
    if (!/^### Shaman:/m.test(changes)) continue;
    const diff = /spells\.diff/.test(changes)
      ? await http.get(RAW + 'patches/' + dir + '/spells.diff', { cache: 'wowsims/patches/' + dir + '/spells.diff', maxAgeDays: null, valid: t => t.includes('--- ') })
      : null;
    const [version, kind] = dir.split('/');
    notes.updates.push({
      id: dir, version, hotfix: kind !== 'patch',
      date: (changes.match(/Exported by \S+ on (\d{4}-\d{2}-\d{2})/) || [])[1] || null,
      spells: shamanChanges(changes, diff)
    });
  }
  // Newest first: by date, then build.
  notes.updates.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.version.localeCompare(a.version, undefined, { numeric: true }) || b.id.localeCompare(a.id));
  notes.checked.sort();
  writeJSON(FILE, notes);
  console.log('Parches leídos: ' + fresh.length + ' nuevos de ' + dirs.length + ' · con cambios para Shaman: ' + notes.updates.length);
})().catch(e => { console.error(e.message); process.exit(1); });

module.exports = { cardChanges, shamanChanges };
