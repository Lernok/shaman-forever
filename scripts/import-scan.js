// What the addon saw at profession trainers and vendors (ShamanForeverDB.scan
// in the SavedVariables, addon 0.24.0+) into data/ingame-scan.json, merged
// with what was there (the newest visit to each NPC wins), and a report of
// where it disagrees with the web recipe data (data/recipes.json): recipes a
// trainer teaches that the web says come from elsewhere, other skill levels,
// patterns a vendor sells.
//
//   node scripts/import-scan.js ["<WoW folder>/_classic_beta_"]
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const game = process.argv[2] || 'D:/World of Warcraft/_classic_beta_';
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
const colorN = Object.values(merged.colors).reduce((n, m) => n + Object.keys(m).length, 0);
console.log('\n' + Object.keys(merged.trainers).length + ' entrenadores, ' + Object.keys(merged.vendors).length + ' vendedores, colores de ' + colorN + ' recetas -> ' + path.relative(root, out));
