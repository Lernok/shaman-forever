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
guides.forEach((g, i) => fs.writeFileSync(path.join(outDir, names[i]), g.join('\n').replace(/\n{3,}/g, '\n\n')));
console.log(`${files.length} guides -> ${outDir} (${visits.reduce((n, v) => n + (v.dungeons || []).length, 0)} dungeon steps, ${added} dungeon quest accepts added)`);
