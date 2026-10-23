// The Shaman talent plan built by Polestar's `talents build` (Builds.lua)
// turned into a file of our addon: when Polestar (0.2.4 or later, with its
// Talents module) is loaded, it registers the plan, so Polestar's talent
// frame marks and reminders work for Shamans too. Without Polestar it does
// nothing.
//
//   node planner/polestar-talents-to-addon.js <Builds.lua> addon/ShamanForeverGuide/PolestarTalents.lua
const fs = require('fs');
const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error('usage: node planner/polestar-talents-to-addon.js <Builds.lua> <out.lua>'); process.exit(1); }
let text = fs.readFileSync(src, 'utf8');
const body = text.slice(text.indexOf('T.Register('));
if (!/class = "SHAMAN"/.test(body)) throw new Error('not a Shaman plan: ' + src);
text = '-- Shaman talent plan for Polestar\'s Talents module (Polestar 0.2.4+), from\n'
  + '-- the site\'s leveling orders (talentsforever.com, CC BY 4.0) checked by\n'
  + '-- Polestar\'s `talents build` against the client\'s trait tables. Generated\n'
  + '-- by planner/polestar-talents-to-addon.js: do not edit.\n'
  + 'local P = rawget(_G, "Polestar")\n'
  + 'local T = type(P) == "table" and P.Talents\n'
  + 'if not (type(T) == "table" and T.Register and not (T.Data and T.Data("SHAMAN"))) then return end\n'
  + 'pcall(T.Register, ' + body.slice('T.Register('.length).replace(/\)\s*$/, '') + ')\n';
fs.writeFileSync(dst, text.replace(/\r\n/g, '\n'));
console.log('wrote ' + dst);
