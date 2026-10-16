// Compares one of our guides with a reference guide in WoW-Pro's text format
// (read locally for analysis only; WoW-Pro is CC BY-NC-ND, nothing of it goes
// into our packs): walking in yards and "revisits" (an objective area left
// for somewhere far and come back to). SHOW=1 lists the revisits.
//   node24 scripts/route-bench.js <polestar checkout> <reference.lua> <our .guide> <pack id>
const fs = require('fs'), path = require('path');
const P = process.argv[2], ref = process.argv[3], ours = process.argv[4], packId = process.argv[5];
const { compileSources } = require(path.join(P, 'tools/lib/dsl/project'));
const { loadData } = require(path.join(P, 'tools/lib/dsl/data'));
const { makeProjector, dist } = require(path.join(P, 'tools/lib/route/geo'));
const d = loadData(path.join(P, 'data/forever'));
const pr = makeProjector(d.mapFrames, () => {});
function walk(pts) { let s = 0, legs = 0; for (let i = 1; i < pts.length; i++) { const x = Math.min(dist(pts[i - 1], pts[i]), 5000); s += x; } return s; }
// Reference: lines "X Name|QID|n|M|x,y|Z|map; Zone|..." ; H = hearth (jump).
const rp = [], rq = new Set(); let rsteps = 0;
for (const l of fs.readFileSync(ref, 'utf8').split('\n')) {
  const m = /^([ACTHRlKf]) [^|]*\|.*?\|M\|([\d.]+),([\d.]+)[^|]*\|(?:CS\|)?Z\|(\d+)/.exec(l);
  if (!m) continue;
  if (m[1] === 'H') { rp.push(null); continue; }
  const q = /\|QID\|(\d+)/.exec(l); if (q && m[1] === 'T') rq.add(q[1]);
  rp.push(pr.point(Number(m[4]), Number(m[2]), Number(m[3]))); rsteps++;
}
function walkJ(pts) { let s = 0; for (let i = 1; i < pts.length; i++) if (pts[i - 1] && pts[i]) s += Math.min(dist(pts[i - 1], pts[i]), 5000); return s; }
// Ours: compiled goals in order; hearth = jump.
const src = [{ file: path.basename(ours), text: fs.readFileSync(ours, 'utf8') }];
const { guides } = compileSources(src, d, undefined, { pack: packId });
const op = [], oq = new Set(); let osteps = 0;
for (const s of guides[0].steps) {
  osteps++;
  for (const g of s.goals || []) {
    if (g.t === 'hearth') { op.push(null); continue; }
    if (g.t === 'turnin') oq.add(String(g.quest));
    if (g.map != null && g.x != null) op.push(pr.point(g.map, g.x, g.y, g.f || null));
  }
}
const common = [...rq].filter((q) => oq.has(q)).length;
console.log(`reference: ${rsteps} steps, ${rq.size} turn-ins, ${Math.round(walkJ(rp))} yd, ${Math.round(walkJ(rp) / rq.size)} yd/turn-in`);
console.log(`ours:      ${osteps} steps, ${oq.size} turn-ins, ${Math.round(walkJ(op))} yd, ${Math.round(walkJ(op) / oq.size)} yd/turn-in; common turn-ins ${common}`);
// Revisits: an objective spot within NEAR yards of an earlier objective spot,
// with a trip farther than FAR yards from it in between (went away, came back).
function revisits(seq) {
  const NEAR = 250, FAR = 700;
  let n = 0;
  for (let i = 0; i < seq.length; i++) {
    if (!seq[i] || seq[i].kind !== 'obj') continue;
    for (let j = i - 1; j >= 0; j--) {
      if (!seq[j] || seq[j].kind !== 'obj' || dist(seq[j].p, seq[i].p) > NEAR) continue;
      let away = false;
      for (let k = j + 1; k < i; k++) if (!seq[k] || dist(seq[k].p, seq[i].p) > FAR) { away = true; break; }
      if (away) { n++; if (process.env.SHOW && seq[i].q) console.log('  vuelve a', seq[j].q, '->', seq[i].q, 'paso', seq[i].step); }
      break;
    }
  }
  return n;
}
const rseq = [], oseq = [];
for (const l of fs.readFileSync(ref, 'utf8').split('\n')) {
  const m = /^([ACTHRlKf]) [^|]*\|.*?\|M\|([\d.]+),([\d.]+)[^|]*\|(?:CS\|)?Z\|(\d+)/.exec(l);
  if (!m) continue;
  if (m[1] === 'H') { rseq.push(null); continue; }
  rseq.push({ kind: m[1] === 'C' || m[1] === 'l' || m[1] === 'K' ? 'obj' : 'npc', p: pr.point(Number(m[4]), Number(m[2]), Number(m[3])) });
}
for (const s of guides[0].steps) for (const g of s.goals || []) {
  if (g.t === 'hearth') { oseq.push(null); continue; }
  if (g.map == null || g.x == null) continue;
  oseq.push({ q: g.quest + ' ' + (g.title || ''), step: s.title, kind: ['kill', 'collect', 'complete', 'interact', 'use'].includes(g.t) ? 'obj' : 'npc', p: pr.point(g.map, g.x, g.y, g.f || null) });
}
console.log(`revisits (left an objective area and came back): reference ${revisits(rseq)}, ours ${revisits(oseq)}`);
