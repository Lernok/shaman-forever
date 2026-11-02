// AllTheThings' Forever database (github.com/ATTWoWAddon/AllTheThings, MIT),
// .contrib/.db/forever/**.lua: every Forever quest with its minimum level,
// targets, chain, faction and class, and every dungeon boss with its drops.
// Updated several times a day; files are cached by content hash (a file that
// didn't change is never downloaded again) and the list is re-read twice a day.
const http = require('./http');

const REPO = 'ATTWoWAddon/AllTheThings';
const DIR = '.contrib/.db/forever/';

async function files() {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const tree = await http.get('https://api.github.com/repos/' + REPO + '/git/trees/master?recursive=1',
    { cache: 'att/_tree.json', maxAgeDays: 0.5, json: true, headers, valid: t => t.includes('"tree"') });
  if (!tree) return [];
  const list = tree.tree.filter(x => x.type === 'blob' && x.path.startsWith(DIR) && x.path.endsWith('.lua') && !/\/(\.config|zzOLD)\//.test(x.path));
  const out = [];
  for (const f of list) {
    const text = await http.get('https://raw.githubusercontent.com/' + REPO + '/master/' + f.path.split('/').map(encodeURIComponent).join('/'),
      { cache: 'att/' + f.sha + '.lua', allowEmpty: true });
    if (text != null) out.push({ path: f.path, text });
  }
  http.prune('att', new Set(list.map(f => f.sha + '.lua').concat('_tree.json')));
  return out;
}

// The body of the "{...}" that starts at text[i] (skips comments and strings).
function block(text, i) {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(i, j + 1);
    else if (c === '-' && text[j + 1] === '-') {
      // Block comment --[[ … ]] or line comment.
      const end = text.startsWith('[[', j + 2) ? text.indexOf(']]', j + 4) + 1 : text.indexOf('\n', j);
      if (end <= 0) break;
      j = end;
    }
    else if (c === '"') { const end = text.indexOf('"', j + 1); if (end < 0) break; j = end; }
  }
  return text.slice(i);
}

const nums = s => (s.match(/\d+/g) || []).map(Number);
const all = (body, re) => body.match(re) || [];

// { quests: { id: { minLevel, creatures, pre, instance, faction, classes } } }
function parse(fileList) {
  // Encounters: which boss drops which item (quest starters like Titan Relic).
  const droppedBy = {};
  for (const f of fileList) {
    const er = /\be\(\d+, \{/g;
    let em;
    while ((em = er.exec(f.text))) {
      const body = block(f.text, em.index + em[0].length - 1);
      const who = all(body, /\bcreatureID = (\d+)/g).map(x => nums(x)[0]).concat(...all(body, /\bcrs = \{[^}]*\}/g).map(nums));
      if (who.length) all(body, /\bi\((\d+)/g).forEach(x => { droppedBy[x.slice(2)] = who; });
    }
  }
  const quests = {};
  for (const f of fileList) {
    const instance = /dungeons & raids/.test(f.path) ? (f.text.match(/inst\(\d+, \{\s*--\s*(.+)/) || [])[1] || null : null;
    const re = /\bq\((\d+), \{/g;
    let m;
    while ((m = re.exec(f.text))) {
      // Leave out nested quests' own fields.
      const body = block(f.text, m.index + m[0].length - 1).replace(/\bq\(\d+, \{[\s\S]*$/, '');
      const creatures = all(body, /\bcr = (\d+)/g).map(x => nums(x)[0])
        .concat(...all(body, /\bcrs = \{[^}]*\}/g).map(nums))
        .concat(all(body, /provider = \{ "n", (\d+) \}/g).map(x => nums(x)[0]));
      // Items to bring (or that start it): whoever drops them.
      all(body, /\bqi = (\d+)/g).concat(all(body, /provider = \{ "i", (\d+) \}/g))
        .forEach(x => (droppedBy[nums(x)[0]] || []).forEach(c => creatures.push(c)));
      const pre = all(body, /\bsourceQuest = (\d+)/g).map(x => nums(x)[0]).concat(...all(body, /\bsourceQuests = \{[^}]*\}/g).map(nums));
      const lvl = (body.match(/\blvl = (\d+)/) || [])[1];
      const cls = body.match(/\bclasses = \{([^}]*)\}/);
      quests[m[1]] = {
        minLevel: lvl ? Number(lvl) : null,
        creatures: [...new Set(creatures)],
        pre,
        instance,
        faction: /\braces = HORDE_ONLY/.test(body) ? 'horde' : /\braces = ALLIANCE_ONLY/.test(body) ? 'alliance' : null,
        classes: cls ? cls[1].match(/[A-Z]+/g) : null
      };
    }
  }
  return { quests };
}

// Fish from the Fishing block of the Craftables module:
// { itemId: { name, where, zones } } ("Can be caught in inland waters…", MAP.LOCH_MODAN…).
const MAP_NAME = k => k.toLowerCase().split('_').map(w => (['of', 'the'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ').replace(/^the /, 'The ');
function fishing(fileList) {
  const out = {};
  for (const f of fileList) {
    const at = f.text.indexOf('prof(FISHING, {');
    if (at < 0) continue;
    const body = block(f.text, f.text.indexOf('{', at));
    const re = /\bi\((\d+), \{\s*--\s*([^\n]+)/g;
    let m;
    while ((m = re.exec(body))) {
      const b = block(body, body.indexOf('{', m.index));
      const where = (b.match(/description = "([^"]*)"/) || [])[1];
      const maps = (b.match(/maps_disp = (\{[^}]*\}|MAP\.\w+)/) || [])[1] || '';
      if (!where && !maps) continue;
      out[m[1]] = { name: m[2].trim(), where: where || null, zones: (maps.match(/MAP\.(\w+)/g) || []).map(x => MAP_NAME(x.slice(4))) };
    }
  }
  return out;
}

// Where each item comes from, by what it sits under in the tree:
// { itemId: [{ type: 'quest', questId, quest, minLevel, faction, zone }
//            | { type: 'boss', npcId, npc, zone } | { type: 'vendor', npcId, npc, zone, faction }
//            | { type: 'drop', npcId, npc, zone, rare }] }
// A quest's reward is an i() in its groups; a boss's loot, in its e() (or a
// creature n() inside a dungeon); a vendor's stock, in an n() under VENDORS.
// Zone drops, treasures and achievements are left out: no one to go to.
const CALL = /\b(q|n|e|inst|m|maproot|instanceroot|o|i|ach|prof|header|objective|filter|cl|r|faction|currency|pvprank)\(([A-Z_.]+|\d+)(\s*,\s*\{|\))/y;
function items(fileList) {
  const out = {};
  const add = (id, s) => {
    const list = out[id] || (out[id] = []);
    if (!list.some(x => JSON.stringify(x) === JSON.stringify(s))) list.push(s);
  };
  for (const f of fileList) {
    const text = f.text;
    const stack = [];
    for (let j = 0; j < text.length; j++) {
      const c = text[j];
      if (c === '-' && text[j + 1] === '-') {
        const end = text.startsWith('[[', j + 2) ? text.indexOf(']]', j + 4) + 1 : text.indexOf('\n', j);
        if (end <= 0) break;
        j = end;
        continue;
      }
      if (c === '"') { j = text.indexOf('"', j + 1); if (j < 0) break; continue; }
      if (c === '{') { stack.push(null); continue; }
      if (c === '}') { stack.pop(); continue; }
      if (!/[a-z]/.test(c) || /\w/.test(text[j - 1] || '')) continue;
      CALL.lastIndex = j;
      const m = CALL.exec(text);
      if (!m) continue;
      const line = text.slice(j, text.indexOf('\n', j));
      const node = { fn: m[1], arg: m[2], at: j, name: ((line.match(/--\s*(.+)/) || [])[1] || '').trim() };
      if (m[1] === 'i' && /^\d+$/.test(m[2])) {
        const s = itemSource(text, stack.filter(Boolean), j);
        // Bought with tokens, a currency or reputation: not a plain purchase.
        const own = m[3].includes('{') ? block(text, CALL.lastIndex - 1) : '';
        const paid = /\bcost = \{\s*\{\s*"[ic]"/.test(own) || /\bminReputation\b/.test(own);
        if (s && !(s.type === 'vendor' && (paid || s.rep))) { delete s.rep; add(m[2], s); }
      }
      if (m[3].includes('{')) { stack.push(node); j = CALL.lastIndex - 1; } else j = CALL.lastIndex - 1;
    }
  }
  return out;
}

// "Lady Anacondra <Fanglord>", "Andrew Hilbert <Trade Supplies> [CATA+] / …": the name alone.
const NPC_NAME = s => (s || '').split(/\s*[<[]/)[0].trim() || null;
const ZONE_OF = anc => {
  for (let k = anc.length - 1; k >= 0; k--) {
    const a = anc[k];
    if (['inst', 'instanceroot'].includes(a.fn) && a.name) return a.name;
    if (['m', 'maproot'].includes(a.fn) && a.arg.startsWith('MAP.')) return MAP_NAME(a.arg.slice(4));
    if (['m', 'maproot'].includes(a.fn) && a.name) return a.name;
  }
  return null;
};
// A node's own fields: the text from its start to its first child.
const own = (text, a, upTo) => text.slice(a.at, upTo).replace(/\bgroups = \{[\s\S]*$/, '');

function itemSource(text, anc, at) {
  if (anc.some(a => ['ach', 'prof', 'pvprank', 'currency'].includes(a.fn) || (a.fn === 'n' && /^(ACHIEVEMENTS|TREASURES|ZONE_DROPS|PROFESSIONS|COMMON_VENDOR_ITEMS|FACTIONS|REWARDS)$/.test(a.arg)))) return null;
  const coordZone = body => { const z = body.match(/\bcoords? = \{[^}]*?MAP\.(\w+)/); return z ? MAP_NAME(z[1]) : null; };
  const zone = ZONE_OF(anc);
  const inInstance = anc.some(a => ['inst', 'instanceroot'].includes(a.fn));
  for (let k = anc.length - 1; k >= 0; k--) {
    const a = anc[k];
    const body = own(text, a, at);
    if (/REMOVED_/.test(body)) return null;
    if (a.fn === 'q') {
      const lvl = body.match(/\blvl = (\d+)/);
      return { type: 'quest', questId: Number(a.arg), quest: a.name || null, minLevel: lvl ? Number(lvl[1]) : null,
        faction: /\braces = HORDE_ONLY/.test(body) ? 'horde' : /\braces = ALLIANCE_ONLY/.test(body) ? 'alliance' : 'both', zone: zone || coordZone(body) };
    }
    if (a.fn === 'e') {
      const cid = body.match(/\bcreatureID = (\d+)/);
      return { type: 'boss', npcId: cid ? Number(cid[1]) : null, npc: NPC_NAME(a.name), zone: zone || coordZone(body) };
    }
    if (a.fn === 'n' && /^\d+$/.test(a.arg)) {
      const under = anc.slice(0, k).map(x => x.arg);
      const faction = /\braces = HORDE_ONLY/.test(body) ? 'horde' : /\braces = ALLIANCE_ONLY/.test(body) ? 'alliance' : 'both';
      const where = zone || coordZone(body);
      // A quartermaster sells by reputation (on each item, or for the whole
      // stock through bubbleDown/bubbleDownClassicRep): not a plain purchase.
      if (a.rep == null) a.rep = /Quartermaster/.test(a.name) || /\bminReputation\b|\bbubbleDown(ClassicRep)?\(/.test(block(text, text.indexOf('{', a.at)));
      if (under.includes('VENDORS')) return { type: 'vendor', npcId: Number(a.arg), npc: NPC_NAME(a.name), zone: where, faction, rep: a.rep || undefined };
      if (under.includes('QUESTS')) return null;
      return { type: inInstance ? 'boss' : 'drop', npcId: Number(a.arg), npc: NPC_NAME(a.name), zone: where, rare: under.includes('RARES') || undefined };
    }
    if (a.fn === 'o' || a.fn === 'objective') return null;
  }
  return null;
}

module.exports = { files, parse, fishing, items };
