// Wowhead's public JSON for Forever (the HTML pages refuse scripts):
//   nether.wowhead.com/forever/tooltip/{item,npc,quest}/<id>
//   www.wowhead.com/forever/search/suggestions-template?q=<name>
// All through lib/http.js (cached, paced, retried).
const http = require('./http');

const isJSON = t => { try { JSON.parse(t); return true; } catch (e) { return false; } };

// Item tooltip; a "not found" is asked again after a week (Wowhead keeps
// adding Forever items). env: 'forever' or 'classic'.
function item(env, id) {
  return http.get('https://nether.wowhead.com/' + env + '/tooltip/item/' + id, {
    cache: (env === 'forever' ? 'wowhead' : 'wowhead-classic') + '/item-' + id + '.json',
    valid: isJSON, maxAgeFor: t => (t.includes('"error"') ? 7 : null)
  });
}

// NPC level and rank: "Level 20 Humanoid (Elite)". New Forever bosses show no
// level until Wowhead records it: those are asked again every 3 days.
async function npc(id) {
  const j = await http.get('https://nether.wowhead.com/forever/tooltip/npc/' + id, {
    cache: 'wowhead/npc-' + id + '.json', json: true,
    maxAgeFor: t => (/Level \d/.test(t) ? 60 : 3)
  });
  if (!j || !j.name) return null;
  const text = (j.tooltip || '').replace(/<[^>]+>/g, ' ');
  const lv = text.match(/Level (\d+)(?:\s*-\s*(\d+))?/);
  const rank = /\(Boss\)/.test(text) || /Level \?\?/.test(text) ? 'boss' : /\(Rare Elite\)/.test(text) ? 'rare-elite'
    : /\(Elite\)/.test(text) ? 'elite' : /\(Rare\)/.test(text) ? 'rare' : 'normal';
  return { name: j.name, level: lv ? Number(lv[2] || lv[1]) : null, rank };
}

// An NPC's id by its exact name.
async function npcId(name) {
  const j = await http.get('https://www.wowhead.com/forever/search/suggestions-template?q=' + encodeURIComponent(name), {
    cache: 'wowhead/search-' + name.replace(/[^\w'-]+/g, '_') + '.json', json: true, maxAgeDays: 30
  });
  const hit = ((j && j.results) || []).find(r => r.type === 1 && r.name === name);
  return hit ? hit.id : null;
}

// What a quest's tooltip says: its level, and who it sends you to kill
// ("Requirements: - Rath'mael", "Defeat Charlga Razorflank in Razorfen Kraul").
async function questTargets(id) {
  const j = await http.get('https://nether.wowhead.com/forever/tooltip/quest/' + id, { cache: 'wowhead/quest-' + id + '.json', json: true, maxAgeDays: 7 });
  const html = (j && j.tooltip) || '';
  const text = html.replace(/<[^>]+>/g, ' ');
  const names = ((html.split('Requirements:')[1] || '').match(/- ([^<]+)/g) || []).map(x => x.slice(2).replace(/ x\s*\d+$/, '').trim());
  (text.match(/\b(?:Defeat|Kill|Slay|Destroy|Vanquish)\s+([A-Z][\w'’-]*(?:\s+(?:the\s+)?[A-Z][\w'’-]*)*)/g) || [])
    .forEach(v => names.push(v.replace(/^\w+\s+/, '')));
  const ids = [];
  for (const name of [...new Set(names.filter(Boolean))].slice(0, 5)) {
    const nid = await npcId(name);
    if (nid) ids.push(nid);
  }
  return { ids, level: Number((text.match(/Level (\d+)/) || [])[1]) || null };
}

// A recipe spell's reagents: [{ id, name, count }].
async function reagents(spellId) {
  const j = await http.get('https://nether.wowhead.com/forever/tooltip/spell/' + spellId, { cache: 'wowhead/spell-' + spellId + '.json', json: true, maxAgeDays: 30 });
  const html = (j && j.tooltip) || '';
  const part = (html.split('Reagents:')[1] || '').split('</div>')[0];
  return [...part.matchAll(/<a href="\/forever\/item=(\d+)[^"]*">([^<]+)<\/a>(?:\s*(?:&nbsp;)?\((\d+)\))?/g)]
    .map(m => ({ id: Number(m[1]), name: m[2], count: m[3] ? Number(m[3]) : 1 }));
}

module.exports = { item, npc, npcId, questTargets, reagents, isJSON };
