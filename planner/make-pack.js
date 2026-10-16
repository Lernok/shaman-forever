// A Polestar guide pack from a simulated route (`polestar sim export`): the
// skeleton guides renamed into the pack's own ids and menu folder, plus a
// "Dungeon" step with the entrance where the route runs each dungeon (before
// the first objective or turn-in of its quests in that visit).
//
//   node planner/make-pack.js <export dir> <pack dir> <id prefix> "<folder>"
//   e.g. node planner/make-pack.js .cache/tools/export-tauren-enh .cache/tools/packs/sf-tauren-enh sf-tauren-enh "Shaman: Forever · Tauren Mejora"
//
// <pack dir> is a pack made with `polestar new`; its guides/ folder is
// replaced. Dungeon entrances and quests come from Polestar's
// data/forever/dungeons.json (POLESTAR: the Polestar checkout, default
// .cache/tools/polestar). RACES="Orc, Troll": the races the guides are for
// (default: the simulated one), for races sharing a start.
const fs = require('fs');
const path = require('path');

const [exportDir, packDir, prefix, folder] = process.argv.slice(2);
if (!exportDir || !packDir || !prefix) {
  console.error('usage: node planner/make-pack.js <export dir> <pack dir> <id prefix> "<folder>"');
  process.exit(1);
}
const polestar = process.env.POLESTAR || path.join(__dirname, '..', '.cache', 'tools', 'polestar');
const dungeonsDoc = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'dungeons.json'), 'utf8'));
const dungeons = new Map((dungeonsDoc.dungeons || dungeonsDoc).map((d) => [d.name, d]));
const visits = JSON.parse(fs.readFileSync(path.join(exportDir, 'visits.json'), 'utf8')).visits;

// The skeleton guides, in route order.
const srcRoot = path.join(exportDir, 'sim');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.guide')) files.push(p);
  }
})(srcRoot);
if (files.length !== visits.length) console.warn(`warning: ${files.length} guides for ${visits.length} visits`);

const oldPrefix = (fs.readFileSync(files[0], 'utf8').match(/^guide (\S+)\/[^/\s]+$/m) || [])[1];
const outDir = path.join(packDir, 'guides');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const questIdsOf = (d) => new Set([...(d.quests || []).map((q) => q.id), ...Object.keys(d.chainQuests || {}).map(Number)]);

files.forEach((file, i) => {
  let text = fs.readFileSync(file, 'utf8').split(oldPrefix + '/').join(prefix + '/');
  const v = visits[i] || {};
  // Header: the menu folder, and a readable title with the levels.
  const lv = (text.match(/^levels (\S+)$/m) || [])[1];
  text = text.replace(/^title (.+)$/m, (m, t) => `title ${String(i + 1).padStart(2, '0')} · ${t}${lv ? ` (${lv})` : ''}`);
  if (folder) text = text.replace(/^(zone .+)$/m, `$1\nfolder ${folder}`);
  if (process.env.RACES) text = text.replace(/^race .+$/m, `race ${process.env.RACES}`);
  for (const run of v.dungeons || []) {
    const d = dungeons.get(run.name);
    if (!d || !d.entrance) { console.warn(`warning: no entrance for ${run.name}`); continue; }
    const ids = questIdsOf(d);
    const lines = text.split('\n');
    // Where: the step holding the first objective or turn-in of its quests.
    // The export's own "Run <dungeon>" note step, if any, is replaced.
    const runAt = lines.findIndex((l) => l === `step Run ${run.name}` || l.startsWith(`step Run ${run.name} (`));
    if (runAt >= 0) {
      let end = runAt + 1;
      while (end < lines.length && !/^step\b/.test(lines[end])) end++;
      lines.splice(runAt, end - runAt);
    }
    let at = runAt >= 0 ? runAt : lines.findIndex((l) => {
      const m = /^\s+(complete|turnin) (\d+)/.exec(l);
      return m && ids.has(Number(m[2]));
    });
    // (A guide holding only the run: its step goes where the run was, at the end.)
    if (runAt < 0) while (at > 0 && !/^step\b/.test(lines[at])) at--;
    if (at < 0) at = lines.length;
    const e = d.entrance;
    const step = [
      `step Dungeon: ${run.name} (level ${Math.floor(run.level)})`,
      `  zone map ${e.map}`,
      `  goto ${e.x},${e.y} "${run.name}" r 30${e.f === 'l' ? ' live' : ''}`,
      `  tip Find a group and clear ${run.name}, with its quests from this route in your log.`,
      '',
    ];
    lines.splice(at, 0, ...step);
    text = lines.join('\n');
  }
  // The simulator's authoring note isn't for players' eyes in a pack.
  fs.writeFileSync(path.join(outDir, path.basename(file)), text.replace(/\n{3,}/g, '\n\n'));
});
// Second pass. The simulator takes dungeon quests on the way (near a giver it
// passes by) without a step of its own, so some turn-ins have no accept:
// the accept goes at the end of the last earlier visit to the giver's zone,
// else just before that dungeon's step. Every dungeon quest goal is optional
// (no group, no blocking the route).
const zonesDoc = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'zones.json'), 'utf8'));
const zoneList = zonesDoc.zones || zonesDoc;
const zoneMap = new Map((Array.isArray(zoneList) ? zoneList : Object.values(zoneList)).map((z) => [z.name, z.id]));
const start = new Map();
const places = new Map(); // quest -> its giver (start) and taker (end), with coordinates
const dungeonOf = new Map();
for (const d of dungeons.values()) {
  for (const q of [...(d.quests || []), ...Object.values(d.chainQuests || {})]) {
    if (q.start) start.set(q.id, q);
    if (q.start || q.end) places.set(q.id, q);
    dungeonOf.set(q.id, d.name);
  }
}
const names = fs.readdirSync(outDir).filter((f) => f.endsWith('.guide')).sort();
const guides = names.map((f) => fs.readFileSync(path.join(outDir, f), 'utf8').split('\n'));
const guideMap = guides.map((g) => zoneMap.get((g.find((l) => /^zone /.test(l)) || '').slice(5)));
const accepted = new Set();
let added = 0;
guides.forEach((lines, gi) => {
  for (let li = 0; li < lines.length; li++) {
    const m = /^(\s+)(accept|complete|turnin) (\d+)(.*)$/.exec(lines[li]);
    if (!m) continue;
    const q = Number(m[3]);
    if (dungeonOf.has(q) && !/\boptional\b/.test(m[4])) lines[li] = lines[li] + ' optional';
    // Forever's new dungeon quests Polestar can't place yet: the dungeon
    // journal's spot for the giver (accept) or the taker (turn-in).
    const pl = m[2] !== 'complete' && places.get(q) && places.get(q)[m[2] === 'turnin' ? 'end' : 'start'];
    if (pl && pl.x != null && !/@/.test(lines[li])) lines[li] = lines[li] + ` map ${pl.map} @${pl.x},${pl.y}${pl.f === 'l' ? ' live' : ''}`;
    if (m[2] === 'accept') { accepted.add(q); continue; }
    if (accepted.has(q) || !start.has(q)) continue;
    accepted.add(q);
    const s = start.get(q);
    const sp = s.start;
    const where = sp && sp.x != null ? ` map ${sp.map} @${sp.x},${sp.y}${sp.f === 'l' ? ' live' : ''}` : '';
    const step = [`step Pick up: ${s.title} (${dungeonOf.get(q)})`, `  accept ${q} optional${where}`, ''];
    let j = -1;
    for (let k = gi - 1; k >= 0; k--) if (guideMap[k] === s.start.map) { j = k; break; }
    if (j >= 0) {
      guides[j].push('', ...step);
    } else {
      // Before the dungeon's step (this guide or an earlier one), else before this step.
      let at = -1, g = gi;
      for (; g >= 0 && at < 0; g--) at = guides[g].findIndex((l) => l === `step Dungeon: ${dungeonOf.get(q)}` || l.startsWith(`step Dungeon: ${dungeonOf.get(q)} (`));
      g++;
      if (at < 0) { g = gi; at = li; while (at > 0 && !/^step\b/.test(lines[at])) at--; }
      guides[g].splice(at, 0, ...step);
      if (g === gi && at <= li) li += step.length;
    }
    added++;
  }
});
// Breadcrumbs. A quest that only sends you to the next one (Mulgore's "The
// Adventurer", a supply bundle for Kaga Wildhoof) has no XP in the data, so
// the simulator never takes it. When the route takes the quest it leads to
// and already stands with its giver earlier (an accept or turn-in there, at
// a step of its level), it's taken there and turned in just before.
const questsAll = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'quests.json'), 'utf8'));
const qAll = questsAll.quests || questsAll;
const racesDoc = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'races.json'), 'utf8'));
const raceBit = (name) => { const r = racesDoc[name.trim()]; const e = r && Object.values(r)[0]; return e ? e.bit : 0; };
const crumbsFor = new Map();
for (const q of Object.values(qAll)) if (q && q.breadcrumbFor) (crumbsFor.get(q.breadcrumbFor) || crumbsFor.set(q.breadcrumbFor, []).get(q.breadcrumbFor)).push(q);
const inRoute = new Set();
guides.forEach((lines) => lines.forEach((l) => { const m = /^\s+(?:accept|turnin|complete) (\d+)/.exec(l); if (m) inRoute.add(Number(m[1])); }));
const npcsOf = (q, side) => ((q && q[side]) || {}).npc || [];
// A breadcrumb the simulator took after the quest it leads to (it's worth
// nothing to it, so it lands anywhere): out of there, placed again below.
const firstAccept = (id) => {
  for (let g = 0; g < guides.length; g++) {
    const k = guides[g].findIndex((l) => new RegExp(`^\\s+accept ${id}\\b`).test(l));
    if (k >= 0) return [g, k];
  }
  return null;
};
for (const [target, list] of crumbsFor) {
  const t = firstAccept(target);
  if (!t) continue;
  for (const b of list) {
    const a = firstAccept(b.id);
    if (!a || a[0] < t[0] || (a[0] === t[0] && a[1] < t[1])) continue;
    for (const L of guides) {
      for (let k = L.length - 1; k >= 0; k--) {
        if (!new RegExp(`^\\s+(accept|turnin) ${b.id}\\b`).test(L[k])) continue;
        L.splice(k, 1);
        // Its step, if nothing is left in it.
        let s = k - 1;
        while (s >= 0 && !/^step\b/.test(L[s])) s--;
        let e = s + 1;
        while (e < L.length && !/^step\b/.test(L[e])) e++;
        if (s >= 0 && !L.slice(s + 1, e).some((l) => /^\s+\S/.test(l))) L.splice(s, e - s);
      }
    }
    inRoute.delete(b.id);
  }
}
let crumbs = 0;
guides.forEach((lines, gi) => {
  const races = ((lines.find((l) => /^race /.test(l)) || '').slice(5)).split(',').filter(Boolean);
  const bits = races.reduce((b, r) => b | raceBit(r), 0);
  for (let li = 0; li < lines.length; li++) {
    const m = /^(\s+)accept (\d+)/.exec(lines[li]);
    if (!m) continue;
    for (const b of crumbsFor.get(Number(m[2])) || []) {
      if (inRoute.has(b.id) || (b.races && bits && !races.every((r) => (Number(b.races) & raceBit(r)) || Number(b.races) >= 2 ** 32 && raceBit(r) >= 2 ** 32))) continue;
      const giver = npcsOf(b, 'start')[0];
      if (!giver) continue;
      // The last earlier goal at its giver, at a step of its level.
      let at = null;
      for (let g = gi; g >= 0 && !at; g--) {
        let lvl = null;
        const L = guides[g];
        const end = g === gi ? li : L.length;
        const hits = [];
        for (let k = 0; k < end; k++) {
          const s = /^step .*\(level ([\d.]+)\)/.exec(L[k]);
          if (/^step\b/.test(L[k])) { lvl = s ? Number(s[1]) : lvl; continue; }
          const x = /^\s+(accept|turnin) (\d+)/.exec(L[k]);
          if (!x || lvl == null || lvl < (Number(b.minLevel) || 0)) continue;
          if (npcsOf(qAll[x[2]], x[1] === 'accept' ? 'start' : 'end').includes(giver)) hits.push(k);
        }
        if (hits.length) at = { g, k: hits[hits.length - 1] };
      }
      if (!at) continue;
      inRoute.add(b.id);
      guides[gi].splice(li, 0, `${m[1]}turnin ${b.id}`);
      li++;
      guides[at.g].splice(at.k + 1, 0, `${m[1]}accept ${b.id}`);
      if (at.g === gi) li++;
      crumbs++;
    }
  }
});
console.log(`${crumbs} breadcrumb quests added`);
// Third pass. The simulator writes "complete <quest>", which Polestar can't
// point the arrow at; its compiler places kill and collect goals tied to a
// quest objective (spots where the mobs or the drops are). So a quest whose
// objectives are all kills or items gets one goal per objective; dungeon
// quests (done inside) and quests with other objectives stay as they are.
const questsDoc = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'quests.json'), 'utf8'));
const questData = questsDoc.quests || questsDoc;
let expanded = 0;
guides.forEach((lines) => {
  for (let li = 0; li < lines.length; li++) {
    const m = /^(\s+)complete (\d+)\s*$/.exec(lines[li]);
    if (!m || dungeonOf.has(Number(m[2]))) continue;
    const objs = (questData[m[2]] || {}).objectives || [];
    if (!objs.length || !objs.every((o) => (o.type === 'item' || o.type === 'kill') && o.id)) continue;
    const goals = objs.map((o, i) => `${m[1]}${o.type === 'item' ? 'collect' : 'kill'} ${o.id}${o.count > 1 ? ` x${o.count}` : ''} quest ${m[2]}.${i + 1}`);
    lines.splice(li, 1, ...goals);
    li += goals.length - 1;
    expanded++;
  }
});
console.log(`${expanded} quest objectives placed (kill/collect)`);
// Fourth pass. The simulator takes a quest as soon as its model reaches the
// quest's level, and a real character can be a bit behind (the Tauren went
// for Call of Earth, level 4, at 3). Before an accept the route reaches with
// less than LEVEL_MARGIN to spare: a "reach level N" step. Polestar ticks it
// by itself when you already are; when you're not, it says so instead of
// sending you to a quest you can't take yet.
const LEVEL_MARGIN = 1;
// Where to get that level: Polestar's mob camps (sim export's loadCamps: 6+
// spawns of a quest mob together), on the map of the quest's giver, mobs one
// or two levels under the one needed, nearer the giver and bigger first.
const camps = require(path.join(polestar, 'tools', 'lib', 'sim', 'export.js')).loadCamps({ dataDir: path.join(polestar, 'data', 'forever') });
const npcData = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'npcs.json'), 'utf8'));
const frames = JSON.parse(fs.readFileSync(path.join(polestar, 'data', 'forever', 'map-frames.json'), 'utf8'));
function grindCamp(q, need) {
  const giver = npcData[String(((q.start || {}).npc || [])[0])];
  const spawn = giver && Object.entries(giver.spawns || {}).find(([, sp]) => sp && Array.isArray(sp.pts) && sp.pts.length);
  if (!spawn) return null;
  const map = Number(spawn[0]);
  const [gx, gy] = spawn[1].pts[0];
  let best = null, bs = 0;
  for (const c of camps) {
    if (c.map !== map || c.level < need - 2 || c.level > need) continue;
    const sc = Math.min(c.size, 15) / (1 + Math.hypot(c.x - gx, c.y - gy) / 10);
    if (sc > bs) { bs = sc; best = c; }
  }
  if (!best) return null;
  const live = !(frames.era || {})[map] && (frames.forever || {})[map];
  return Object.assign({ live }, best);
}
let gates = 0;
guides.forEach((lines) => {
  let stepAt = -1, stepLevel = null;
  const gated = new Set();
  for (let li = 0; li < lines.length; li++) {
    const s = /^step .*\(level ([\d.]+)\)/.exec(lines[li]);
    if (/^step\b/.test(lines[li])) { stepAt = li; stepLevel = s ? Number(s[1]) : null; continue; }
    const m = /^\s+accept (\d+)/.exec(lines[li]);
    if (!m || stepAt < 0 || stepLevel == null || dungeonOf.has(Number(m[1]))) continue;
    const q = questData[m[1]] || {};
    const need = Number(q.minLevel) || 0;
    if (need <= 1 || stepLevel - need >= LEVEL_MARGIN || gated.has(need)) continue;
    gated.add(need);
    const camp = grindCamp(q, need);
    const step = camp
      ? [`step Reach level ${need}`, `  zone map ${camp.map}`, `  goto ${camp.x},${camp.y} "${camp.name} (level ${camp.level})" r 40${camp.live ? ' live' : ''} optional`, `  level ${need}`,
        `  tip If you're not level ${need} yet: kill ${camp.name} here (level ${camp.level}). ${q.title || 'The next quest'} needs level ${need}.`, '']
      : [`step Reach level ${need}`, `  level ${need}`,
        `  tip Kill the mobs on your way until level ${need}: ${q.title || 'the next quest'} needs it.`, ''];
    lines.splice(stepAt, 0, ...step);
    li += step.length;
    stepAt += step.length;
    gates++;
  }
});
console.log(`${gates} level gates`);
guides.forEach((g, i) => fs.writeFileSync(path.join(outDir, names[i]), g.join('\n').replace(/\n{3,}/g, '\n\n')));
console.log(`${files.length} guides -> ${outDir} (${visits.reduce((n, v) => n + (v.dungeons || []).length, 0)} dungeon steps, ${added} dungeon quest accepts added)`);
