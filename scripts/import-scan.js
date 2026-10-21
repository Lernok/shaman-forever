// What the addon saw at profession trainers and vendors (ShamanForeverDB.scan
// in the SavedVariables, addon 0.24.0+) into data/ingame-scan.json, merged
// with what was there (the newest visit to each NPC wins), and a report of
// where it disagrees with the web recipe data (data/recipes.json): recipes a
// trainer teaches that the web says come from elsewhere, other skill levels,
// patterns a vendor sells.
//
//   node scripts/import-scan.js ["<game folder>"]   (default: the one played last, scripts/lib/game.js)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const game = require('./lib/game').folder(process.argv[2]);
const lua = process.env.LUA || path.join(root, '.cache', 'lua51', 'lua5.1.exe');
const out = path.join(root, 'data', 'ingame-scan.json');

const files = [];
const accounts = path.join(game, 'WTF', 'Account');
for (const a of fs.existsSync(accounts) ? fs.readdirSync(accounts) : []) {
  const f = path.join(accounts, a, 'SavedVariables', 'ShamanForever.lua');
  if (fs.existsSync(f)) files.push(f);
}
if (!files.length) { console.error('no ShamanForever.lua under ' + accounts); process.exit(1); }

// Lua writes the scan table as JSON.
const dump = `local f = assert(loadfile(arg[1])); f()
local function enc(v)
  local t = type(v)
  if t == "table" then
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = string.format("%q", tostring(k)) .. ":" .. enc(x) end
    return "{" .. table.concat(parts, ",") .. "}"
  elseif t == "string" then return (string.format("%q", v):gsub("\\\\\\n", "\\\\n"))
  elseif t == "number" then return tostring(v)
  elseif t == "boolean" then return tostring(v) end
  return "null"
end
io.write(enc((ShamanForeverDB or {}).scan or {}))`;
const tmp = path.join(os.tmpdir(), 'sf-scan.lua');
fs.writeFileSync(tmp, dump);

const merged = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { trainers: {}, vendors: {}, colors: {}, sources: {} };
merged.sources = merged.sources || {};
merged.recipes = merged.recipes || {};
merged.bags = merged.bags || {};
merged.drops = merged.drops || {};
merged.goods = merged.goods || {};
merged.skins = merged.skins || {};
merged.kills = merged.kills || {};
// Lua arrays come as {"1": a, "2": b}.
const arr = o => (o && typeof o === 'object' ? Object.keys(o).sort((a, b) => a - b).map(k => o[k]) : o);
for (const f of files) {
  const scan = JSON.parse(execFileSync(lua, [tmp, f], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  for (const kind of ['trainers', 'vendors']) {
    for (const [id, v] of Object.entries(scan[kind] || {})) {
      // 0.24.1 read Forever's trainer columns (name, kind, icon) as (name, rank, kind).
      if (kind === 'trainers') {
        const list = {};
        for (const [name, e] of Object.entries(v.list || {})) {
          if (typeof e.kind === 'number' && e.sub) { e.kind = e.sub; delete e.sub; list[name.replace(/ \((available|unavailable|used)\)$/, '')] = e; } else list[name] = e;
        }
        v.list = list;
      }
      if (kind === 'vendors') Object.values(v.list || {}).forEach(e => { if (e.cost) e.cost = arr(e.cost).map(arr); });
      if (!merged[kind][id] || (merged[kind][id].t || 0) <= (v.t || 0)) merged[kind][id] = v;
    }
  }
  // Every recipe the profession window lists (learned or not).
  for (const [prof, items] of Object.entries(scan.recipes || {})) merged.recipes[prof] = Object.assign(merged.recipes[prof] || {}, items);
  if (scan.fields) merged.fields = scan.fields;
  // Recipes seen in your bags (first time), and looted (from whom, how many).
  for (const [item, e] of Object.entries(scan.bags || {})) if (!merged.bags[item]) merged.bags[item] = e;
  // Skins by beast level (the save keeps running totals per account: the newest file wins).
  for (const [lvl, e] of Object.entries(scan.skins || {})) {
    const m = merged.skins[lvl];
    if (!m || (e.n || 0) >= (m.n || 0)) merged.skins[lvl] = { n: e.n, items: e.items };
  }
  // Leather beasts dropped when killed (not skinned), the same way.
  for (const [lvl, e] of Object.entries(scan.kills || {})) {
    const m = merged.kills[lvl];
    if (!m || (e.n || 0) >= (m.n || 0)) merged.kills[lvl] = { n: e.n, items: e.items };
  }
  // Skill-ups per craft: by profession, item and the skill you had (running totals: the biggest wins).
  merged.ups = merged.ups || {};
  for (const [prof, items] of Object.entries(scan.ups || {})) {
    const mp = merged.ups[prof] = merged.ups[prof] || {};
    for (const [item, ranks] of Object.entries(items)) {
      const mi = mp[item] = mp[item] || {};
      for (const [rank, r] of Object.entries(ranks)) if (!mi[rank] || (r.n || 0) >= (mi[rank].n || 0)) mi[rank] = r;
    }
  }
  // Crafting materials vendors sell (the newest visit to each NPC wins).
  for (const [id, v] of Object.entries(scan.goods || {})) if (!merged.goods[id] || (merged.goods[id].t || 0) <= (v.t || 0)) merged.goods[id] = v;
  for (const [item, d] of Object.entries(scan.drops || {})) {
    const m = merged.drops[item] = merged.drops[item] || { name: d.name, from: {} };
    for (const [k, f] of Object.entries(d.from || {})) m.from[k] = f; // the save keeps the running count
  }
  // How the game says to learn recipes you don't know (profession window).
  for (const [prof, items] of Object.entries(scan.sources || {})) merged.sources[prof] = Object.assign(merged.sources[prof] || {}, items);
  for (const [prof, items] of Object.entries(scan.colors || {})) {
    const m = merged.colors[prof] = merged.colors[prof] || {};
    for (const [item, kinds] of Object.entries(items)) {
      const mi = m[item] = m[item] || {};
      for (const [k, r] of Object.entries(kinds)) {
        const [lo, hi] = arr(r);
        mi[k] = mi[k] ? [Math.min(mi[k][0], lo), Math.max(mi[k][1], hi)] : [lo, hi];
      }
    }
  }
}
fs.writeFileSync(out, JSON.stringify(merged, null, 1) + '\n');

// The report.
const web = JSON.parse(fs.readFileSync(path.join(root, 'data', 'recipes.json'), 'utf8')).professions;
const byItem = new Map(), byName = new Map();
for (const [prof, list] of Object.entries(web)) {
  for (const r of Object.values(list)) {
    const e = Object.assign({ prof }, r);
    if (r.itemId) byItem.set(r.itemId, e);
    const k = r.name.toLowerCase();
    byName.set(k, (byName.get(k) || []).concat([e]));
  }
}
const coin = c => ((c >= 10000 ? Math.floor(c / 10000) + 'g ' : '') + (c % 10000 >= 100 ? Math.floor(c % 10000 / 100) + 's ' : '') + (c % 100 ? c % 100 + 'c' : '')).trim() || '0';
const where = v => v.n + ' (' + [v.z, v.x != null ? v.x + ', ' + v.y : null, v.f].filter(Boolean).join(' · ') + ')';
for (const [id, v] of Object.entries(merged.trainers)) {
  const list = Object.entries(v.list || {});
  console.log('\nENTRENADOR ' + where(v) + ' #' + id + ': ' + list.length);
  for (const [name, e] of list.sort((a, b) => (a[1].skill || 0) - (b[1].skill || 0))) {
    const w = e.item && byItem.get(e.item) || (byName.get(name.toLowerCase()) || [])[0];
    const notes = [];
    if (!w) notes.push('NO ESTÁ en los datos web');
    else {
      if (!/^Trainer|Known from the start/.test(w.source)) notes.push('la web dice: ' + w.source);
      if (e.skill != null && w.skill && w.skill[0] !== e.skill) notes.push('web: habilidad ' + w.skill[0]);
    }
    console.log('  ' + String(e.skill ?? '?').padStart(3) + '  ' + name + ' · ' + coin(e.cost || 0) + ' · ' + ({ used: 'aprendida', available: 'disponible', unavailable: 'te falta habilidad' }[e.kind] || e.kind) + (notes.length ? '   <-- ' + notes.join('; ') : ''));
  }
}
for (const [id, v] of Object.entries(merged.vendors)) {
  console.log('\nVENDEDOR ' + where(v) + ' #' + id);
  for (const [item, e] of Object.entries(v.list || {})) {
    const taught = byName.get(String(e.name || '').replace(/^[^:]+:\s*/, '').toLowerCase()) || [];
    const price = [e.price ? coin(e.price) : null].concat((e.cost || []).map(([n, what]) => n + ' ' + what)).filter(Boolean).join(' + ');
    console.log('  ' + e.name + ' #' + item + ' · ' + (price || 'gratis') + (e.stock ? ' · stock ' + e.stock : '') +
      (taught.length ? '   (web: ' + taught.map(r => r.prof + ' ' + r.skill[0] + ', ' + r.source).join(' | ') + ')' : '   <-- NO ESTÁ en los datos web'));
  }
}
for (const [prof, items] of Object.entries(merged.sources)) {
  console.log('\nSIN APRENDER (' + prof + ', según el juego)');
  for (const [item, e] of Object.entries(items)) {
    const w = byItem.get(Number(item));
    console.log('  ' + e.name + ' #' + item + ' · ' + e.source + (w && w.source !== e.source ? '   (web: ' + w.source + ')' : ''));
  }
}
// The window's full list against the web data: missing ones, other grey levels.
for (const [prof, items] of Object.entries(merged.recipes)) {
  const webList = Object.values(web[prof.toLowerCase()] || {});
  const webIds = new Set(webList.map(r => r.itemId));
  const missing = [], grey = [];
  for (const [item, e] of Object.entries(items)) {
    const w = webIds.has(Number(item)) && byItem.get(Number(item));
    if (!w) missing.push(e.name + ' #' + item + (e.grey ? ' (gris ' + e.grey + ')' : ''));
    else if (e.grey && w.skill[3] != null && e.grey !== w.skill[3]) grey.push(e.name + ': juego ' + e.grey + ', web ' + w.skill[3]);
  }
  const notInGame = webList.filter(r => r.itemId && !items[r.itemId]).map(r => r.name + ' (' + r.skill[0] + ', ' + r.source + ')');
  console.log('\nVENTANA DE ' + prof + ': ' + Object.keys(items).length + ' recetas en el juego, ' + webList.length + ' en la web');
  console.log('  en el juego y no en la web (' + missing.length + '): ' + missing.slice(0, 60).join(', '));
  console.log('  gris distinto (' + grey.length + '): ' + grey.slice(0, 40).join(' · '));
  console.log('  en la web y no en el juego (' + notInGame.length + '): ' + notInGame.slice(0, 60).join(', '));
}
const allRecipes = Object.values(web).flatMap(l => Object.values(l));
const taughtBy = name => allRecipes.filter(r => r.name.toLowerCase() === String(name || '').replace(/^[^:]+:\s*/, '').toLowerCase());
const webOf = name => taughtBy(name).map(r => r.skill[0] + ', ' + r.source).join(' | ') || 'NO ESTÁ en los datos web';
if (Object.keys(merged.bags).length) console.log('\nEN TUS BOLSAS');
for (const [item, e] of Object.entries(merged.bags)) console.log('  ' + e.name + ' #' + item + ' · visto en ' + e.z + ' (nivel ' + e.l + ')   web: ' + webOf(e.name));
if (Object.keys(merged.drops).length) console.log('\nLOOTEADAS');
for (const [item, d] of Object.entries(merged.drops)) {
  console.log('  ' + d.name + ' #' + item + ' de ' + Object.entries(d.from).map(([k, f]) => (f.n || k) + ' (' + f.z + ', ' + f.c + 'x)').join(', ') + '   web: ' + webOf(d.name));
}
// Vendors of scarce materials (data/scarce.json): what the game says they cost.
const scarce = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scarce.json'), 'utf8')).items;
for (const [id, v] of Object.entries(merged.goods)) {
  const hits = Object.entries(v.list || {}).filter(([item]) => scarce[item]);
  if (!hits.length) continue;
  console.log('\nMATERIALES ESCASOS en ' + where(v) + ' #' + id);
  hits.forEach(([item, e]) => {
    const kept = scarce[item].price;
    console.log('  ' + e.name + ' #' + item + ' · ' + coin(e.price || 0) + (e.stock ? ' · stock ' + e.stock : '') +
      (kept !== e.price ? '   <-- data/scarce.json dice ' + (kept == null ? 'sin precio' : coin(kept)) : ''));
  });
}
// What a skin gives in Forever, by beast level, against the site's (Classic's) yields.
if (Object.keys(merged.skins).length) {
  const SKD = JSON.parse(fs.readFileSync(path.join(root, 'data', 'skinning.json'), 'utf8'));
  const nm = id => SKD.names[id] || '#' + id;
  console.log('\nPIELES (lo que deja cada piel, por nivel del bicho; entre paréntesis, lo que usa el sitio)');
  Object.entries(merged.skins).sort((a, b) => a[0] - b[0]).forEach(([lvl, e]) => {
    const site = SKD.yields[Number(lvl) - 1] || {};
    const ids = [...new Set(Object.keys(e.items).concat(Object.keys(site)))];
    console.log('  nv ' + (lvl === '0' ? ' ?' : String(lvl).padStart(2)) + ' · ' + e.n + ' pieles: ' + ids.map(id => nm(id) + ' ' + ((e.items[id] || 0) / e.n).toFixed(2) + ' (' + (site[id] || 0).toFixed(2) + ')').join(', '));
  });
  if (Object.keys(merged.kills).length) {
    console.log('\nCUERO EN EL BOTÍN AL MATAR (sin despellejar; ventanas de botín con cuero, por nivel del bicho)');
    Object.entries(merged.kills).sort((a, b) => a[0] - b[0]).forEach(([lvl, e]) => console.log('  nv ' + (lvl === '0' ? ' ?' : String(lvl).padStart(2)) + ' · ' + e.n + ' veces: ' +
      Object.entries(e.items).map(([id, n]) => n + ' ' + nm(id)).join(', ')));
  }
}
// Skill-ups: how often each color raised the skill, against the site's
// model (orange always; yellow and green fall off toward grey).
const ups = merged.ups || {};
if (Object.keys(ups).length) {
  const SKR = new Map(JSON.parse(fs.readFileSync(path.join(root, 'data', 'skinning.json'), 'utf8')).recipes.map(r => [String(r.id), r]));
  console.log('\nSUBIDAS DE HABILIDAD (crafteos que subieron / hechos, por color; entre paréntesis, lo que supone el sitio)');
  for (const [prof, items] of Object.entries(ups)) {
    const byKind = {};
    for (const [item, ranks] of Object.entries(items)) {
      const r = SKR.get(item);
      for (const [rank, e] of Object.entries(ranks)) {
        const k = byKind[e.kind] = byKind[e.kind] || { n: 0, up: 0, model: 0 };
        k.n += e.n; k.up += e.up;
        // The site's chance at that skill (js/lw-plan.js chance()).
        const s = Number(rank);
        const p = !r ? null : s < r.skill[0] ? 0 : s < r.skill[1] ? 1 : s >= r.skill[3] ? 0 : (r.skill[3] - s) / (r.skill[3] - r.skill[1]);
        k.model += p == null ? NaN : p * e.n;
      }
    }
    console.log('  ' + prof + ': ' + Object.entries(byKind).map(([kind, k]) => kind + ' ' + k.up + '/' + k.n +
      ' = ' + Math.round(k.up / k.n * 100) + '%' + (isNaN(k.model) ? '' : ' (' + Math.round(k.model / k.n * 100) + '%)')).join(' · '));
  }
}
// Per character: experience and gold per level, quests against everything.
const chars = [];
for (const a of fs.existsSync(accounts) ? fs.readdirSync(accounts) : []) {
  const dir = path.join(accounts, a);
  for (const realm of fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isDirectory() && n !== 'SavedVariables')) {
    for (const ch of fs.readdirSync(path.join(dir, realm))) {
      const f = path.join(dir, realm, ch, 'SavedVariables', 'ShamanForever.lua');
      if (fs.existsSync(f)) chars.push({ who: ch + ' (' + realm + ')', f });
    }
  }
}
const charDump = dump.replace('io.write(enc((ShamanForeverDB or {}).scan or {}))', 'io.write(enc({ xp = (ShamanForeverCharDB or {}).xp, income = (ShamanForeverCharDB or {}).income }))');
const charTmp = path.join(os.tmpdir(), 'sf-char.lua');
fs.writeFileSync(charTmp, charDump);
for (const c of chars) {
  let d;
  try { d = JSON.parse(execFileSync(lua, [charTmp, c.f], { encoding: 'utf8', maxBuffer: 64 << 20 })); } catch (e) { continue; }
  const levels = [...new Set(Object.keys(d.xp || {}).concat(Object.keys(d.income || {})))].map(Number).sort((a, b) => a - b);
  if (!levels.length) continue;
  console.log('\nNIVELES DE ' + c.who + ' (experiencia: de misiones / total · oro: de misiones / todo lo que entró)');
  for (const l of levels) {
    const x = (d.xp || {})[l] || {}, g = (d.income || {})[l] || {};
    console.log('  nv ' + String(l).padStart(2) + ' · xp ' + (x.q || 0) + ' / ' + (x.all || 0) + (x.all ? ' (' + Math.round((x.q || 0) / x.all * 100) + '% misiones)' : '') +
      ' · oro ' + coin(g.q || 0) + ' / ' + coin(g.all || 0));
  }
}
if (merged.fields) console.log('\nCampos de una receta: ' + merged.fields);
const colorN = Object.values(merged.colors).reduce((n, m) => n + Object.keys(m).length, 0);
console.log('\n' + Object.keys(merged.trainers).length + ' entrenadores, ' + Object.keys(merged.vendors).length + ' vendedores, colores de ' + colorN + ' recetas -> ' + path.relative(root, out));
