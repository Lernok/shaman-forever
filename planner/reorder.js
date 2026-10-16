// Step order inside each guide of a pack, the way good guides do it: at a
// town take everything it offers, do the objectives that are close together
// in one go, and turn in when the area is done instead of walking back and
// forth. The simulator picks the quests well but orders steps coarsely.
//
// Steps between "barriers" (hearthstone, flights, dungeons, level steps,
// anything without a place) are reordered for the least walking, keeping
// accept < objectives < turn-in of each quest, quest chains (pre / next) and
// each quest's minimum level (levels re-estimated from the step titles).
// Then neighbouring steps at one place are merged: the NPCs of a town
// (MERGE_NPC yards, a village) and objectives close together (MERGE_OBJ yards).
//
//   POLESTAR=<checkout> node planner/reorder.js <pack dir>
const fs = require('fs');
const path = require('path');

const packDir = process.argv[2];
if (!packDir) { console.error('usage: node planner/reorder.js <pack dir>'); process.exit(1); }
const polestar = process.env.POLESTAR || path.join(__dirname, '..', '.cache', 'tools', 'polestar-024');
const { compileSources } = require(path.join(polestar, 'tools', 'lib', 'dsl', 'project'));
const { loadData } = require(path.join(polestar, 'tools', 'lib', 'dsl', 'data'));
const { makeProjector, dist } = require(path.join(polestar, 'tools', 'lib', 'route', 'geo'));

const MERGE_NPC = 80;
const MERGE_OBJ = 120;
const QUEST_GOALS = new Set(['accept', 'turnin', 'complete', 'kill', 'collect', 'interact', 'use', 'talk']);

const data = loadData(path.join(polestar, 'data', 'forever'));
const project = makeProjector(data.mapFrames, () => {});
const packId = JSON.parse(fs.readFileSync(path.join(packDir, 'pack.json'), 'utf8')).id;
const guideDir = path.join(packDir, 'guides');
const files = fs.readdirSync(guideDir).filter((f) => f.endsWith('.guide')).sort();
const sources = files.map((f) => ({ file: f, text: fs.readFileSync(path.join(guideDir, f), 'utf8') }));
const { guides } = compileSources(sources, data, undefined, { pack: packId });
const byFile = new Map(guides.map((g) => [g._ast ? g._ast.file : g.source, g]));

const quest = (id) => data.quests[String(id)] || {};
let before = 0, after = 0, merged = 0;
const stats = { planned: 0, plannedSteps: 0, rejected: 0, rejectedSteps: 0 };

for (const src of sources) {
  const g = byFile.get(src.file);
  if (!g) continue;
  // Source blocks: header, then one block per step (same order as compiled).
  const lines = src.text.split('\n');
  const head = [];
  const blocks = [];
  for (const l of lines) {
    if (/^step\b/.test(l)) blocks.push([l]);
    else if (blocks.length) blocks[blocks.length - 1].push(l);
    else head.push(l);
  }
  if (blocks.length !== g.steps.length) { console.warn(`${src.file}: ${blocks.length} blocks, ${g.steps.length} steps; left as is`); continue; }
  const steps = blocks.map((b, i) => {
    const goals = g.steps[i].goals || [];
    const lv = /\(level ([\d.]+)\)/.exec(b[0]);
    const pts = goals.filter((x) => x.map != null && x.x != null).map((x) => project.point(x.map, x.x, x.y, x.f || null));
    const barrier = !goals.length || goals.some((x) => !QUEST_GOALS.has(x.t) || x.map == null || x.x == null)
      || /^step (Dungeon|Reach level|Hearthstone|Fly|Grind)/.test(b[0]);
    const kinds = new Set(goals.map((x) => x.t));
    const home = goals.find((x) => x.t === 'sethome' && x.map != null && x.x != null);
    return { i, block: b, goals, level: lv ? Number(lv[1]) : null, pt: pts[0] || null, barrier,
      sethome: home ? project.point(home.map, home.x, home.y, home.f || null) : null,
      hearth: kinds.has('hearth'), fly: kinds.has('fly'),
      npc: [...kinds].every((k) => k === 'accept' || k === 'turnin' || k === 'talk') };
  });
  // Level gained by each step (next step's level - its own), for re-estimating.
  for (let k = 0; k < steps.length; k++) {
    const a = steps[k].level, b = k + 1 < steps.length ? steps[k + 1].level : null;
    steps[k].gain = a != null && b != null ? Math.max(0, b - a) : 0;
  }
  const out = [];
  let k = 0;
  let pos = null;
  let lvl = steps.find((s) => s.level != null) ? steps.find((s) => s.level != null).level : 1;
  const walk = (seq, from) => { let d = 0, p = from; for (const s of seq) { if (p && s.pt) d += Math.min(dist(p, s.pt), 5000); if (s.pt) p = s.pt; } return d; };
  let home = null;
  while (k < steps.length) {
    if (steps[k].barrier) {
      const s = steps[k];
      out.push(s);
      lvl += s.gain;
      // Where the character is after it: the inn it binds at for a
      // hearthstone, unknown after a flight.
      if (s.sethome) home = s.sethome;
      if (s.hearth) pos = home;
      else if (s.fly) pos = null;
      else if (s.pt) pos = s.pt;
      k++;
      continue;
    }
    let e = k;
    while (e < steps.length && !steps[e].barrier) e++;
    const seg = steps.slice(k, e);
    const next = steps[e] && steps[e].pt;
    const order = plan(seg, pos, lvl);
    const cost = (seq) => walk(seq, pos) + (next && seq.length && seq[seq.length - 1].pt ? Math.min(dist(seq[seq.length - 1].pt, next), 5000) : 0);
    before += cost(seg);
    after += cost(order);
    for (const s of order) { out.push(s); lvl += s.gain; if (s.pt) pos = s.pt; }
    k = e;
  }
  // Merge neighbours at one place.
  const final = [];
  for (const s of out) {
    const last = final[final.length - 1];
    if (last && !last.barrier && !s.barrier && last.pt && s.pt && last.npc === s.npc
      && dist(last.pt, s.pt) <= (s.npc ? MERGE_NPC : MERGE_OBJ)) {
      const have = new Set(last.block.map((l) => l.trim()));
      last.block = last.block.filter((l) => l.trim() !== '').concat(s.block.slice(1).filter((l) => l.trim() !== '' && !have.has(l.trim())));
      last.gain += s.gain;
      last.block.push('');
      last.merged = true;
      merged++;
      continue;
    }
    final.push(Object.assign({}, s, { block: s.block.slice() }));
  }
  // Titles of merged steps: what they do.
  for (const s of final) {
    if (!s.merged) continue;
    const body = s.block.slice(1).join('\n');
    const has = (v) => new RegExp(`^\\s+${v} `, 'm').test(body);
    const what = s.npc ? (has('turnin') ? (has('accept') ? 'Turn in and pick up' : 'Turn in') : 'Pick up quests') : 'Objectives';
    s.block[0] = s.block[0].replace(/^step [^(]*/, `step ${what || 'Quests'} `);
  }
  // Titles' levels for the new order.
  let lv2 = final.find((x) => x.level != null) ? final.find((x) => x.level != null).level : null;
  for (const s of final) {
    if (lv2 != null && /\(level [\d.]+\)/.test(s.block[0])) s.block[0] = s.block[0].replace(/\(level [\d.]+\)/, `(level ${lv2.toFixed(1)})`);
    if (lv2 != null) lv2 += s.gain;
  }
  const text = head.join('\n') + '\n' + final.map((s) => s.block.join('\n')).join('\n');
  fs.writeFileSync(path.join(guideDir, src.file), text.replace(/\n{3,}/g, '\n\n').replace(/\r\n/g, '\n'));
}

// A segment's order: nearest available step first (its accepts, objectives
// and pre-quests already placed, its level reached), then moves of one step
// that shorten the walk and keep every rule.
function plan(seg, from, startLevel) {
  const ids = (s, t) => s.goals.filter((x) => x.t === t || (t === 'obj' && ['complete', 'kill', 'collect', 'interact', 'use'].includes(x.t))).map((x) => x.quest).filter(Boolean);
  const here = new Set(seg.flatMap((s) => s.goals.map((x) => x.quest).filter(Boolean)));
  // must[s] = steps that go before s.
  const must = new Map(seg.map((s) => [s, new Set()]));
  for (const s of seg) {
    for (const t of seg) {
      if (s === t) continue;
      const sa = ids(s, 'accept'), so = ids(s, 'obj'), st = ids(s, 'turnin');
      const ta = ids(t, 'accept'), to = ids(t, 'obj'), tt = ids(t, 'turnin');
      const shares = (a, b) => a.some((q) => b.includes(q));
      // t before s when: t accepts what s works on or turns in; t works on what s turns in;
      // t turns in a quest s's accepts need (pre / next).
      const preOf = (q) => { const d = quest(q); return [...(d.pre || []).map(Number)]; };
      const needs = sa.some((q) => preOf(q).some((p) => tt.includes(p))) || tt.some((p) => quest(p).next && sa.includes(Number(quest(p).next)));
      if (shares(ta, so) || shares(ta, st) || shares(to, st) || needs) must.get(s).add(t);
    }
  }
  // Steps that kept their original relative order no matter what: none here.
  const minLevel = (s) => Math.max(0, ...ids(s, 'accept').map((q) => Number(quest(q).minLevel) || 0));
  const ok = (seq) => {
    const seen = new Set();
    let lv = startLevel;
    for (const s of seq) {
      for (const t of must.get(s)) if (!seen.has(t)) return false;
      if (minLevel(s) > lv + 1e-6) return false;
      seen.add(s);
      lv += s.gain;
    }
    return true;
  };
  const cost = (seq) => { let d = 0, p = from; for (const s of seq) { if (p && s.pt) d += Math.min(dist(p, s.pt), 5000); if (s.pt) p = s.pt; } return d; };
  if (!ok(seg)) { stats.rejected++; stats.rejectedSteps += seg.length; return seg; } // something the rules can't express: leave it
  stats.planned++; stats.plannedSteps += seg.length;
  // Greedy.
  const left = new Set(seg);
  const seq = [];
  let p = from;
  let lv = startLevel;
  while (left.size) {
    let best = null, bd = Infinity;
    for (const s of seg) {
      if (!left.has(s)) continue;
      if ([...must.get(s)].some((t) => left.has(t))) continue;
      if (minLevel(s) > lv + 1e-9) continue;
      const d = p && s.pt ? dist(p, s.pt) : 0;
      if (d < bd - 1e-6) { bd = d; best = s; }
    }
    if (!best) { for (const s of seg) if (left.has(s)) { best = s; break; } }
    seq.push(best);
    left.delete(best);
    if (best.pt) p = best.pt;
    lv += best.gain;
  }
  let cur = ok(seq) ? seq : seg.slice();
  // Or-opt: move one step elsewhere while it helps.
  let improved = true, guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    const c0 = cost(cur);
    for (let a = 0; a < cur.length && !improved; a++) {
      for (let b = 0; b < cur.length && !improved; b++) {
        if (a === b) continue;
        const t = cur.slice();
        const [s] = t.splice(a, 1);
        t.splice(b, 0, s);
        if (cost(t) < c0 - 1 && ok(t)) { cur = t; improved = true; }
      }
    }
  }
  return cost(cur) <= cost(seg) ? cur : seg;
}

console.log(JSON.stringify(stats));
console.log(`${packDir}: walking ${Math.round(before)} -> ${Math.round(after)} yards (${before ? Math.round((1 - after / before) * 100) : 0}% less), ${merged} steps merged`);
