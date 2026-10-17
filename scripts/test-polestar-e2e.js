// End-to-end: the real Polestar (a checkout, 0.2.4+), our Orc/Troll pack as installed
// and the Shaman: Forever addon, in Polestar's fake client (tests/helpers/lua.js).
//   LUA=<lua5.1> node24 scripts/test-polestar-e2e.js <polestar checkout> [guide id]
const path = require('path');
const P = process.argv[2];
process.chdir(P);
const { runAddon } = require(path.join(P, 'tests/helpers/lua'));
const A = 'D:/World of Warcraft/_classic_beta_/Interface/AddOns';
const guide = process.argv[3] || 'sf-orc-enh/04-silverpine-forest';
const r = runAddon({
  stubs: ['stub_world.lua'],
  before: `
    local w = stub.world
    w.addMap(1421, { name = "Silverpine Forest", c = 1415, left = 3450, right = -750, top = 1800, bottom = -2400 })
    w.addMap(1413, { name = "The Barrens", c = 1414, left = 2622.9, right = -2295.8, top = 1612.5, bottom = -4672.9 })
    w.moveTo(1421, 44, 42)
    w.race, w.raceName, w.class, w.className, w.faction, w.level = "Orc", "Orc", "SHAMAN", "Shaman", "Horde", 15
    GetInstanceInfo = GetInstanceInfo or function() return "Silverpine Forest", "none" end
    GetInventoryItemID = GetInventoryItemID or function() return nil end
    GetContainerNumSlots = GetContainerNumSlots or function() return 0 end
    GetContainerItemID = GetContainerItemID or function() return nil end
    GetRealZoneText = GetRealZoneText or function() return "Silverpine Forest" end
    GetItemInfo = GetItemInfo or function(id) return "Item " .. tostring(id) end`,
  addons: ['Polestar', { name: 'PolestarPack_ShamanForeverOrcoYTrollMejora', dir: A + '/PolestarPack_ShamanForeverOrcoYTrollMejora' },
    { name: 'PolestarPack_ShamanForeverOrcoYTrollElementalYResto', dir: A + '/PolestarPack_ShamanForeverOrcoYTrollElementalYResto' },
    { name: 'ShamanForever', dir: path.join(__dirname, '..', 'addon', 'ShamanForever') }],
  script: `
    local W = stub.world
    stub.login()
    stub.advance(1)
    local E = Polestar.Engine
    print("talents SHAMAN:", Polestar.Talents and Polestar.Talents.Data and Polestar.Talents.Data("SHAMAN") and "ok" or "no")
    print("SetGuide:", E.SetGuide(${JSON.stringify(guide)}))
    stub.advance(1)
    local g = E.GetGuide()
    print("guide:", g and g.id, "next:", g and g.next, "step:", E.GetStepIndex(), "/", E.GetStepCount())
    ShamanForever_Toggle()
    stub.advance(1)
    for i = 1, 6 do E.Next(); stub.advance(0.6) end
    print("after next:", E.GetGuide() and E.GetGuide().id, E.GetStepIndex())
    local f = ShamanForeverFrame or _G.ShamanForeverFrame
    print("frame shown:", f and f:IsShown())
    local function view(label)
      local fr = ShamanForeverFrame
      print("== " .. label .. ": " .. tostring(fr and fr.lastTitle))
      for i, t in ipairs(fr and fr.lastTips or {}) do
        if i > 5 then break end
        print("   " .. (t.head or "") .. " | " .. ((t.src or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")))
      end
    end
    view("after steps")
    ShamanForever_MarkFirst()
    stub.advance(1)
    -- The guide with Ruins of Lordaeron's dungeon step: go to it.
    E.SetGuide("sf-orc-enh/06-tirisfal-glades")
    stub.advance(1)
    local g6 = E.GetGuide()
    for i, st in ipairs(g6.steps) do if (st.title or ""):find("^Dungeon:") then E.Goto(i) break end end
    stub.advance(1.5)
    print("step now:", E.GetStepIndex(), g6.steps[E.GetStepIndex()] and g6.steps[E.GetStepIndex()].title)
    view("dungeon step")
    E.Skip()
    stub.advance(1.5)
    print("step after Skip:", E.GetStepIndex(), g6.steps[E.GetStepIndex() or 1] and g6.steps[E.GetStepIndex() or 1].title)
    view("after the dungeon step")
    -- "/sf skip" before Wailing Caverns: the route without it.
    W.level = 19
    stub.world.moveTo(1413, 52, 30)
    E.SetGuide("sf-orc-enh/09-the-barrens")
    stub.advance(1)
    view("before skipping")
    SlashCmdList.SHAMANFOREVER("skip")
    stub.advance(1.5)
    print("after skip:", E.GetGuide() and E.GetGuide().id)
    view("after skipping")
    -- The first-run setup: Elemental, window yes, open my route.
    SlashCmdList.SHAMANFOREVER("setup")
    local S = ShamanForeverSetup
    print("setup shown:", S and S:IsShown())
    S.buttons[2]:Click()
    S.buttons[1]:Click()
    print("setup page 3:", S.text:GetText())
    S.buttons[1]:Click()
    stub.advance(1)
    print("route after setup:", E.GetGuide() and E.GetGuide().id, "setup shown:", S:IsShown())
    print("DONE")`,
});
console.log(r.stdout.split('\n').filter((l) => !/^@@/.test(l)).slice(-40).join('\n'));
if (r.stderr) console.log('STDERR', r.stderr.slice(0, 3000));
