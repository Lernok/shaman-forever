// Every download in the data pipeline goes through get():
//   - one User-Agent, and a polite pause per host (PACE_MS);
//   - retries with backoff on 5xx, 429 and network errors;
//   - the answer is checked (valid) before it's cached: an error page, an
//     empty body or HTML where JSON was expected is never stored;
//   - cached under .cache/<cache>, with the fetch date in .cache/_fetched.json
//     (file dates don't survive the GitHub Actions cache), and asked again
//     after maxAgeDays (null = never: e.g. client tables of a fixed build);
//   - offline (--offline or SYNC_OFFLINE=1): cache only;
//   - if the network fails, the last good copy is used, however old.
// summary() tells how many requests each host got and how many came from cache.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const cacheDir = path.join(root, '.cache');
const indexFile = path.join(cacheDir, '_fetched.json');
const UA = 'shaman-forever-site (fan reference site; data sync, cached and cited)';
// Milliseconds between two requests to the same host.
const PACE_MS = {
  'foreverchanges.pro': 1000,
  'classicwowforever.com': 1000,
  'nether.wowhead.com': 250,
  'www.wowhead.com': 250,
  'talentsforever.com': 500,
  'wago.tools': 250
};
const OFFLINE = process.argv.includes('--offline') || process.env.SYNC_OFFLINE === '1';
const DAY = 864e5;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let index = null;
function loadIndex() {
  if (!index) index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
  return index;
}
function saveIndex() {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(indexFile, JSON.stringify(loadIndex()));
}

const stats = {};
const count = (host, k) => { stats[host] = stats[host] || { fetched: 0, cached: 0, failed: 0 }; stats[host][k]++; };
const lastHit = {};

async function pace(host) {
  const wait = (lastHit[host] || 0) + (PACE_MS[host] || 0) - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit[host] = Date.now();
}

const JSON_OK = text => { try { JSON.parse(text); return true; } catch (e) { return false; } };

/**
 * get(url, { cache, maxAgeDays, json, valid, headers, maxAgeFor })
 *   cache       path under .cache to store the answer (required)
 *   maxAgeDays  refetch after this many days (null/undefined = keep forever)
 *   maxAgeFor   (text) => days, overrides maxAgeDays per answer (e.g. a
 *               "not found" from Wowhead is asked again sooner)
 *   json        parse and return JSON (and require a JSON answer)
 *   valid       (text) => bool, extra check before caching
 *   allowEmpty  an empty answer is a valid one (e.g. an empty source file)
 * Returns the text (or parsed JSON), or null when there's no good copy.
 */
async function get(url, opts) {
  const o = Object.assign({ maxAgeDays: null, json: false, valid: null, headers: {} }, opts);
  const file = path.join(cacheDir, o.cache);
  const host = new URL(url).host;
  const idx = loadIndex();
  const ok = text => text != null && (o.allowEmpty || text.trim()) && (!o.json || JSON_OK(text)) && (!o.valid || o.valid(text));
  // A cached copy must pass the same checks (an old format or a broken file is fetched again).
  let have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (have != null && !ok(have)) have = null;
  const out = text => (text == null ? null : o.json ? JSON.parse(text) : text);
  if (have != null) {
    // Files cached before the index existed count as fetched today.
    if (!idx[o.cache]) { idx[o.cache] = new Date().toISOString().slice(0, 10); saveIndex(); }
    const maxAge = o.maxAgeFor ? o.maxAgeFor(have) : o.maxAgeDays;
    const age = (Date.now() - Date.parse(idx[o.cache])) / DAY;
    if (OFFLINE || maxAge == null || age < maxAge) { count(host, 'cached'); return out(have); }
  }
  if (OFFLINE) { count(host, 'failed'); return null; }
  for (let attempt = 0; attempt < 3; attempt++) {
    await pace(host);
    try {
      const res = await fetch(url, { headers: Object.assign({ 'User-Agent': UA }, o.headers) });
      const text = await res.text();
      if (res.ok && ok(text)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
        idx[o.cache] = new Date().toISOString().slice(0, 10);
        saveIndex();
        count(host, 'fetched');
        return out(text);
      }
      // 4xx other than 429: asking again won't help.
      if (res.status < 500 && res.status !== 429 && res.ok === false) break;
      if (res.ok) break; // a 200 that failed the check (e.g. a maintenance page)
    } catch (e) { /* network error: retry */ }
    await sleep(2000 * (attempt + 1));
  }
  count(host, 'failed');
  if (have != null) return out(have); // stale but good beats nothing
  return null;
}

// Drop cached files under a folder that aren't in `keep` (relative names).
function prune(dir, keep) {
  const full = path.join(cacheDir, dir);
  if (!fs.existsSync(full)) return;
  const idx = loadIndex();
  fs.readdirSync(full).filter(n => !keep.has(n)).forEach(n => {
    fs.rmSync(path.join(full, n), { recursive: true, force: true });
    delete idx[dir + '/' + n];
  });
  saveIndex();
}

function summary() {
  return Object.entries(stats).map(([h, s]) => h + ': ' + s.fetched + ' descargados, ' + s.cached + ' de caché' + (s.failed ? ', ' + s.failed + ' fallidos' : '')).join(' · ');
}

module.exports = { get, prune, summary, OFFLINE, cacheDir, sleep };
