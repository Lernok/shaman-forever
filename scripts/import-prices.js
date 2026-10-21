// Auction house prices from Auctionator's scans (its SavedVariables,
// AUCTIONATOR_PRICE_DATABASE: per realm, CBOR, each item's lowest price per
// unit and the day of the scan) into data/prices.json: the reagents, leathers
// and hides the Leatherworking plan uses, with the realm and the day.
// Prices change a lot (beta, launch week, a month later): the page says
// from when they are and turns them into "how much of a level's quest gold".
//
//   node scripts/import-prices.js [realm] ["<WoW folder>/_classic_beta_"]
// Without a realm: the one scanned last.
const fs = require('fs');
const path = require('path');
const { decode } = require('./lib/cbor');
const { readJSON, writeJSON } = require('./lib/files');

const args = process.argv.slice(2);
const game = args.find(a => /[\\/]/.test(a)) || 'D:/World of Warcraft/_classic_beta_';
const realmWanted = args.find(a => !/[\\/]/.test(a));

// The bytes of AUCTIONATOR_PRICE_DATABASE["<realm>"], a Lua string literal.
function realms(file) {
  const b = fs.readFileSync(file);
  const start = b.indexOf(Buffer.from('AUCTIONATOR_PRICE_DATABASE = {'));
  const end = b.indexOf(Buffer.from('\n}'), start);
  const out = {};
  let i = start;
  for (;;) {
    i = b.indexOf(Buffer.from('["'), i);
    if (i < 0 || i > end) break;
    const close = b.indexOf(Buffer.from('"] = "'), i);
    if (close < 0 || close > end) break;
    const realm = b.slice(i + 2, close).toString('utf8');
    i = close + 6;
    const bytes = [];
    for (;;) {
      const c = b[i++];
      if (c === 0x22) break;
      if (c !== 0x5c) { bytes.push(c); continue; }
      const d = b[i++];
      if (d >= 0x30 && d <= 0x39) {
        let n = d - 0x30;
        for (let k = 0; k < 2 && b[i] >= 0x30 && b[i] <= 0x39; k++) n = n * 10 + (b[i++] - 0x30);
        bytes.push(n);
      } else if (d === 0x6e) bytes.push(10);
      else if (d === 0x72) bytes.push(13);
      else if (d === 0x74) bytes.push(9);
      else if (d === 0x0d && b[i] === 0x0a) { i++; bytes.push(10); }
      else bytes.push(d);
    }
    out[realm] = Buffer.from(bytes);
  }
  return out;
}

const accounts = path.join(game, 'WTF', 'Account');
const all = {};
for (const a of fs.existsSync(accounts) ? fs.readdirSync(accounts) : []) {
  const f = path.join(accounts, a, 'SavedVariables', 'Auctionator.lua');
  if (!fs.existsSync(f)) continue;
  for (const [realm, bytes] of Object.entries(realms(f))) {
    try {
      const db = decode(bytes);
      if (db && typeof db === 'object' && Object.keys(db).length > (all[realm] ? Object.keys(all[realm]).length : 0)) all[realm] = db;
    } catch (e) { /* a realm without data ("version" only) */ }
  }
}
// A realm's last scan day (Auctionator's day: days since 2020-01-01).
const lastDay = db => Math.max(0, ...Object.values(db).map(e => Math.max(0, ...Object.keys((e && e.h) || {}).map(Number))));
const names = Object.keys(all).sort((a, b) => lastDay(all[b]) - lastDay(all[a]));
const realm = realmWanted || names[0];
if (!realm || !all[realm]) { console.error('Sin precios de Auctionator (reinos: ' + (names.join(', ') || 'ninguno') + ')'); process.exit(1); }

// What the Leatherworking plan prices: its reagents, leathers and hides.
const SK = readJSON('data/skinning.json');
const wanted = new Set(SK.skin);
SK.recipes.forEach(r => { wanted.add(r.id); r.mats.forEach(([m]) => wanted.add(m)); });
// And every other crafted piece's reagents (data/crafts.json, scripts/build-reagents.js).
Object.keys(readJSON('data/crafts.json', { items: {} }).items).forEach(id => wanted.add(Number(id)));
// And the Waylaid Crates that give Merchant's Favor, with what fills them (data/favor.json).
readJSON('data/favor.json').crates.forEach(c => { wanted.add(c.crate); c.fills.forEach(f => f.forEach(([m]) => wanted.add(m))); });

const db = all[realm];
const prices = {};
const day = lastDay(db);
for (const id of wanted) {
  const e = db[id];
  if (e && e.m) prices[id] = e.m;
}
const date = new Date(Date.UTC(2020, 0, 1) + day * 86400000).toISOString().slice(0, 10);
writeJSON('data/prices.json', { _readme: 'Written by scripts/import-prices.js from Auctionator scans: lowest price per unit (copper).', realm, date, items: Object.keys(db).length, prices });
console.log('Precios: ' + realm + ' (' + date + '), ' + Object.keys(prices).length + ' de ' + wanted.size + ' ítems de crafteo');
