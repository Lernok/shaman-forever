-- Loads the whole Writ Planner (Data, Planner, Core, UI) with a fake game and
-- a fake Auctionator (prices from .cache/writs-prices.lua) and runs the window.
--   .cache/lua51/lua5.1.exe scripts/test-writs-game.lua
local prices = dofile(".cache/writs-prices.lua")
local printed = {}
-- Any frame/widget: every method exists and does nothing (some return values).
local function widget()
  local w = { shown = false }
  return setmetatable(w, { __index = function(t, k)
    if k == "IsShown" then return function(self) return self.shown end end
    if k == "Show" then return function(self) self.shown = true; if self.onshow then self.onshow(self) end end end
    if k == "Hide" then return function(self) self.shown = false end end
    if k == "SetShown" then return function(self, v) self.shown = v end end
    if k == "SetScript" then return function(self, n, fn) if n == "OnShow" then self.onshow = fn end; if n == "OnEvent" then self.onevent = fn end end end
    if k == "SetText" then return function(self, s) self.text = s end end
    if k == "GetText" then return function(self) return self.text end end
    if k == "TitleText" then local x = widget(); rawset(t, k, x); return x end
    if k:match("^Create") then return function() return widget() end end
    return function() end
  end })
end
local events
CreateFrame = function() local f = widget(); events = events or f; return f end
UIParent, UISpecialFrames = widget(), {}
tinsert = table.insert
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) print("[chat] " .. m) end }
GetRealmName = function() return "RPPvP" end
GetQuestResetTime = function() return 3600 end
time = os.time
UnitName = function() return "Kzixx" end
UnitClass = function() return "Shaman", "SHAMAN" end
UnitLevel = function() return 41 end
UnitFactionGroup = function() return "Horde" end
IsPlayerSpell = function() return false end
SlashCmdList = {}
local queue = {}
C_Timer = { After = function(_, fn) queue[#queue + 1] = fn end }
-- Runs what the addon left for the next frames (the background planning).
local function frames() local n = 0 while #queue > 0 do table.remove(queue, 1)(); n = n + 1 end return n end
C_Reputation = { GetFactionDataByID = function(id) if id == 2587 then return { name = "Durotar Supply and Logistics", currentStanding = 2250 } end end }
local done = { [94264] = false }
C_QuestLog = { IsQuestFlaggedCompleted = function(q) return done[q] end, IsOnQuest = function() return false end }
local bags = { [6048] = 1 } -- carries a Shadow Protection Potion
C_Item = { GetItemCount = function(id) return bags[id] or 0 end, RequestLoadItemDataByID = function() end, GetItemNameByID = function(id) return "item" .. id end }
C_Map = {
  GetBestMapForUnit = function() return 1434 end,
  GetPlayerMapPosition = function() return { x = 0.32, y = 0.29 } end,
  -- Grom'gol, roughly.
  GetWorldPosFromMapPos = function() return 0, { GetXY = function() return -12400, 200 end } end,
  GetMapInfo = function() return { name = "Stranglethorn Vale" } end,
}
local scanDay = 2508
Auctionator = {
  API = { v1 = {
    GetAuctionPriceByItemID = function(_, id) return prices[id] end,
    GetAuctionAgeByItemID = function(_, id) return prices[id] and 0 or nil end,
    RegisterForDBUpdate = function(_, fn) end,
    MultiSearchExact = function(_, terms) print("[subasta] busca " .. #terms .. " cosas: " .. table.concat(terms, ", "):sub(1, 120)) end,
  } },
  -- Five days of history: the price was 30% higher before today for half the items.
  Database = { GetPriceHistory = function(_, key)
    local id = tonumber(key)
    local p = prices[id]
    if not p then return {} end
    local out = {}
    for d = 0, 4 do
      local old = (id % 2 == 0) and math.floor(p * 1.6) or p
      out[#out + 1] = { rawDay = tostring(scanDay - d), minSeen = d == 0 and p or old, available = 5 }
    end
    return out
  end },
}
dofile("addon/WritPlanner/Data.lua")
dofile("addon/WritPlanner/Planner.lua")
dofile("addon/WritPlanner/Core.lua")
dofile("addon/WritPlanner/UI.lua")
events.onevent(events, "ADDON_LOADED", "WritPlanner")
events.onevent(events, "PLAYER_LOGIN")
frames()
local W = WritPlanner
-- Known flights: open the taxi map at Grom'gol.
GetTaxiMapID = function() return 1415 end
C_TaxiMap = { GetAllTaxiNodes = function() local t = {} for _, id in ipairs({ 18, 20, 21, 56, 75, 13, 17 }) do t[#t + 1] = { nodeID = id, state = 1 } end t[#t + 1] = { nodeID = 74, state = 2 } return t end }
events.onevent(events, "TAXIMAP_OPENED")

local function show(R)
  print(("  [%.2f s]"):format(os.clock() - (T0 or 0)))
  local g = W.money
  print(("[%s] rep %s, meta %s, faltan %s, días %s, err %s"):format(tostring(R.faction), tostring(R.rep), tostring(R.goal), tostring(R.need), tostring(R.days), tostring(R.err)))
  if R.today then
    print(("  hoy: %d rep, %s, %d min"):format(R.today.rep, g(R.today.cost), R.today.time / 60))
    for _, leg in ipairs(R.today.route) do
      print(("    %s %s +%d min %s"):format(WritPlanner_DATA.zones[leg.stop.zone].name, leg.stop.npc, leg.leg / 60, leg.flight and "vuelo" or ""))
      for _, c in ipairs(leg.stop.writs) do print(("        %s %s%s%s"):format(c.w.name, g(c.cost), c.haveItems and " (tiene el objeto)" or "", c.ratio and (" ratio " .. string.format("%.2f", c.ratio)) or "")) end
    end
  end
  if R.plan then print(("  plan: %d días, %s"):format(R.plan.days, g(R.plan.total))) end
  if R.deals then print("  ofertas: " .. #R.deals) end
end

print("== Friendly, sin presupuesto, tolerancia 1 g")
T0 = os.clock(); show(W.compute())
print("== Honored sin límite (lo más rápido)")
WritPlannerCharDB.opts.goal = "9000"
T0 = os.clock(); show(W.compute())
print("== Honored, máximo 2500 por día")
WritPlannerCharDB.opts.perDay = 2500
T0 = os.clock(); show(W.compute())
WritPlannerCharDB.opts.perDay = nil
print("== Honored con 30 g de presupuesto")
WritPlannerCharDB.opts.goal = "9000"; WritPlannerCharDB.opts.budget = 30
T0 = os.clock(); show(W.compute())
print("== +500, solo a pie, Shadow Oil ya entregado hoy, Kzixx sin stock de un writ")
WritPlannerCharDB.opts.goal = "+500"; WritPlannerCharDB.opts.budget = nil; WritPlannerCharDB.opts.mode = "walk"
done[94264] = true
W.markGone(94241)
T0 = os.clock(); show(W.compute())
print("== la ventana")
SlashCmdList.WRITPLANNER("")
for i = 1, 6 do W.UI.go(i); local n = frames(); print("  pestaña " .. i .. " ok (" .. n .. " cuadros)") end
-- Follow today's trip.
local R = W.compute()
print(("fuera por peligro: %d"):format(R.skipped.danger))
W.lock(R.today)
local route, doneN, total = W.lockedRoute()
print(("siguiendo: %d paradas, %d de %d entregados"):format(#route, doneN, total))
for _, st in ipairs(W.steps(route)) do print("   " .. st.text) end
W.UI.go(4)
-- Turn in the first stop's writs: the arrow moves on.
for _, c in ipairs(route[1].stop.writs) do done[c.w.q] = true; events.onevent(events, "QUEST_TURNED_IN", c.w.q) end
route, doneN = W.lockedRoute()
print(("después de entregar: %d paradas, %d entregados"):format(#route, doneN))
WritPlannerCharDB.opts.budget = 20; WritPlannerCharDB.opts.goal = "9000"; W.UI.refresh(); W.UI.go(4)
WritPlannerCharDB.opts.budget = nil; WritPlannerCharDB.opts.goal = nil; W.UI.go(1); W.UI.go(3)
W.search(W.compute().today)
SlashCmdList.WRITPLANNER("vuelos")
-- Turning in a writ without a known place records it.
local unknown
for _, w in ipairs(WritPlanner_DATA.writs) do if not w.z then unknown = w break end end
events.onevent(events, "QUEST_COMPLETE")
events.onevent(events, "QUEST_TURNED_IN", unknown.q)
print("aprendido: " .. tostring(unknown.z) .. " " .. tostring(unknown.npc))
print("OK")
