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
CreateFrame = function() local f = widget(); f.shown = true; events = events or f; return f end
UIParent, UISpecialFrames = widget(), {}
Minimap, GameTooltip = widget(), widget()
Minimap.GetWidth = function() return 140 end
Minimap.GetCenter = function() return 100, 100 end
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
GetBindLocation = function() return "Orgrimmar" end
GetItemCooldown = function() return 0, 0 end
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
local ages = {}
Auctionator = {
  API = { v1 = {
    GetAuctionPriceByItemID = function(_, id) return prices[id] end,
    GetAuctionAgeByItemID = function(_, id) return prices[id] and (ages[id] or 0) or nil end,
    RegisterForDBUpdate = function(_, fn) end,
    ConvertToSearchString = function(_, t) return '"' .. t.searchString .. '";;;;;;;;;;;;;' .. (t.quantity or "") end,
    CreateShoppingList = function(_, name, terms) lastList = { name = name, terms = terms } end,
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
    print(("  hoy: %d rep, %s, %d min%s%s"):format(R.today.rep, g(R.today.cost), R.today.time / 60,
      (R.today.hearthSave or 0) > 0 and (", piedra ahorra " .. math.floor(R.today.hearthSave / 60) .. " min") or "",
      R.today.preBind and (", primero piedra en " .. R.today.preBind.town .. " (ahorra " .. math.floor(R.today.preBind.save / 60) .. " min)") or ""))
    if R.buyNow then print("  comprá hoy: " .. #R.buyNow) end
    for _, leg in ipairs(R.today.route) do
      print(("    %s %s +%d min %s"):format(WritPlanner_DATA.zones[leg.stop.zone].name, leg.stop.npc, leg.leg / 60, leg.flight and "vuelo" or ""))
      for _, c in ipairs(leg.stop.writs) do print(("        %s %s%s%s"):format(c.w.name, g(c.cost), c.haveItems and " (tiene el objeto)" or "", c.ratio and (" ratio " .. string.format("%.2f", c.ratio)) or "")) end
    end
  end
  if R.plan then print(("  plan (%s): %d días, %s"):format(tostring(R.mode), R.plan.days, g(R.plan.total))) end
  if R.presets and R.presets.fast then
    for _, k in ipairs({ "fast", "rec", "cheap" }) do local op = R.presets[k] print(("    %-5s %2d días  %s  (~%s/día)"):format(k, op.days, g(op.total), g(op.total / op.days))) end
  end
  if R.deals then print("  ofertas: " .. #R.deals) end
end

print("== Friendly, sin presupuesto, tolerancia 1 g")
T0 = os.clock(); show(W.compute())
print("== Honored recomendado")
WritPlannerCharDB.opts.goal = "9000"
T0 = os.clock(); show(W.compute())
print("== Honored en 4 días")
WritPlannerCharDB.opts.plan = "days"; WritPlannerCharDB.opts.days = 4
T0 = os.clock(); show(W.compute())
print("== Honored recomendado saliendo de Thunder Bluff")
WritPlannerCharDB.opts.plan = "rec"; WritPlannerCharDB.opts.from = "Thunder Bluff"
T0 = os.clock(); show(W.compute())
W.lock(W.compute().today)
for _, st in ipairs(W.steps((W.lockedRoute()))) do print("   " .. st.text) end
WritPlannerCharDB.locked = nil
WritPlannerCharDB.opts.from = "here"
print("== Honored lo más rápido")
WritPlannerCharDB.opts.plan = "fast"
T0 = os.clock(); show(W.compute())
print("== Honored, máximo 2500 por día")
WritPlannerCharDB.opts.perDay = 2500
T0 = os.clock(); show(W.compute())
WritPlannerCharDB.opts.perDay = nil
print("== Honored con 30 g de presupuesto")
WritPlannerCharDB.opts.goal = "9000"; WritPlannerCharDB.opts.budget = 30; WritPlannerCharDB.opts.plan = "gold"
T0 = os.clock(); show(W.compute())
print("== +500, solo a pie, Shadow Oil ya entregado hoy, Kzixx sin stock de un writ")
WritPlannerCharDB.opts.goal = "+500"; WritPlannerCharDB.opts.budget = nil; WritPlannerCharDB.opts.plan = "rec"; WritPlannerCharDB.opts.mode = "walk"
done[94264] = true
W.markGone(94241)
T0 = os.clock(); show(W.compute())
print("== la ventana")
SlashCmdList.WRITPLANNER("")
assert(W.UI.isOpen(), "el primer /writs tiene que abrir la ventana")
assert(W.UI.mini and W.UI.mini:IsShown(), "falta el botón del minimapa")
SlashCmdList.WRITPLANNER("icono"); assert(not W.UI.mini:IsShown())
W.UI.go(2); SlashCmdList.WRITPLANNER("icono"); assert(W.UI.mini:IsShown()); W.UI.go(1)
print("  primer /writs abre, botón del minimapa ok")
for i = 1, 4 do W.UI.go(i); local n = frames(); print("  pestaña " .. i .. " ok (" .. n .. " cuadros)") end
-- Follow today's trip.
local R = W.compute()
print(("fuera por peligro: %d"):format(R.skipped.danger))
W.lock(R.today)
local route, doneN, total = W.lockedRoute()
print(("siguiendo: %d paradas, %d de %d entregados"):format(#route, doneN, total))
for _, st in ipairs(W.steps(route)) do print("   " .. st.text) end
W.UI.go(4); frames()
-- Turn in the first stop's writs: the arrow moves on.
for _, c in ipairs(route[1].stop.writs) do done[c.w.q] = true; events.onevent(events, "QUEST_TURNED_IN", c.w.q) end
route, doneN = W.lockedRoute()
print(("después de entregar: %d paradas, %d entregados"):format(#route, doneN))
WritPlannerCharDB.opts.budget = 20; WritPlannerCharDB.opts.goal = "9000"; W.UI.refresh(); W.UI.go(3); frames()
WritPlannerCharDB.opts.budget = nil; WritPlannerCharDB.opts.goal = nil; W.UI.go(1); W.UI.go(3); frames()
W.search(W.compute().today)
SlashCmdList.WRITPLANNER("vuelos")
-- Turning in a writ without a known place records it.
local unknown
for _, w in ipairs(WritPlanner_DATA.writs) do if not w.z then unknown = w break end end
events.onevent(events, "QUEST_COMPLETE")
events.onevent(events, "QUEST_TURNED_IN", unknown.q)
print("aprendido: " .. tostring(unknown.z) .. " " .. tostring(unknown.npc))

print("== correo, banco y lista de compras")
local plan = W.compute().today
local c1 = plan.writs[1]
local buys = W.shopping(plan)
assert(#buys > 0)
-- The first writ waits at the mailbox (bought on the auction house), its item at the bank.
GetInboxNumItems = function() return 1 end
GetInboxHeaderInfo = function() return nil, nil, nil, nil, nil, 0 end
GetInboxItem = function(i, a) if a == 1 then return "x", c1.w.w, nil, 1 end end
events.onevent(events, "MAIL_INBOX_UPDATE")
local bankN = c1.w.n or 1
C_Item.GetItemCount = function(id, bank) return (bags[id] or 0) + (bank and id == c1.w.i and bankN or 0) end
events.onevent(events, "BANKFRAME_OPENED")
events.onevent(events, "BANKFRAME_CLOSED")
assert(W.owned(c1.w.w) == 1 and W.pickup(c1.w.w, 1) == "correo", "el writ del correo")
assert(W.pickup(c1.w.i, bankN) == "banco", "el objeto del banco")
local R2 = W.compute()
local found
for _, c in ipairs(R2.today.writs) do if c.w.q == c1.w.q then found = c end end
if found then
  assert(found.haveWrit and found.writAt == "correo" and found.itemAt == "banco", "correo/banco en el plan")
  local steps = W.steps(W.Planner.route(R2.today.writs, W.here(), W.travelFn()))
  assert(steps[1].kind == "mail" and steps[2].kind == "bank", "primero el correo y el banco: " .. steps[1].text)
  print("  " .. steps[1].text .. " / " .. steps[2].text)
end
-- The shopping list leaves out what's at the mailbox and the bank.
W.search(R2.today)
assert(lastList and lastList.name == W.LIST and #lastList.terms > 0, "lista de compras")
for _, t in ipairs(lastList.terms) do assert(not t:find('"item' .. c1.w.w .. '"', 1, true), "compra el writ que ya tenés") end
print(("  lista \"%s\": %d cosas, p. ej. %s"):format(lastList.name, #lastList.terms, lastList.terms[1]))
GetInboxNumItems = nil

print("== compartir con la guild")
local sent = {}
IsInGuild = function() return true end
C_ChatInfo = { SendAddonMessage = function(pre, msg, ch) sent[#sent + 1] = { pre, msg, ch } end }
local learnedQ = unknown.q
W.share(learnedQ)
assert(#sent == 1 and sent[1][1] == "WritPlanner" and sent[1][3] == "GUILD", "manda a la guild")
print("  manda: " .. sent[1][2])
-- A guildmate's addon receives it.
local msg = sent[1][2]
WritPlannerDB.learned[learnedQ] = nil
for _, w in ipairs(WritPlanner_DATA.writs) do if w.q == learnedQ then w.z = nil end end
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", msg, "GUILD", "Grunk-RPPvP")
assert(WritPlannerDB.learned[learnedQ] and WritPlannerDB.learned[learnedQ].from == "Grunk", "aprende lo de la guild")
-- Bad or own messages are ignored.
local other
for _, w in ipairs(WritPlanner_DATA.writs) do if not w.z then other = w break end end
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "L1;" .. other.q .. ";1434;500;1;1;1;0;x;y", "GUILD", "Grunk")
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "L1;" .. other.q .. ";1434;50;50;1;1;0;x;y", "GUILD", "Kzixx")
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "L1;" .. other.q .. ";1434;50;50;1;1;0;x;y", "WHISPER", "Grunk")
assert(not WritPlannerDB.learned[other.q], "ignora mensajes malos, propios o fuera de la guild")
WritPlannerCharDB.opts.share = false; sent = {}; W.share(learnedQ); assert(#sent == 0, "sin compartir no manda")
print("  recibe, valida y respeta la opción")

print("== lo que no estaba en el último escaneo")
-- Today's full scan didn't see the first writ of the plan (last seen yesterday).
WritPlannerCharDB.gone = {}
local before = W.compute().today
local gone = before.writs[1]
Auctionator.Constants = { SCAN_DAY_0 = time() - 2508 * 86400 - 3600 }
Auctionator.SavedState = { TimeOfLastBrowseScan = time() - 60 }
ages[gone.w.w] = 1
local after = W.compute()
for _, c in ipairs(after.today.writs) do assert(c.w.q ~= gone.w.q, "recomienda un writ que no está en la subasta") end
assert(after.skipped.unseen >= 1)
-- Without a scan today (last one yesterday) yesterday's prices still count.
Auctionator.SavedState = { TimeOfLastBrowseScan = time() - 86400 - 60 }
assert(not W.missing(gone.w.w), "sin escaneo de hoy vale el precio de ayer")
ages[gone.w.w] = nil; Auctionator.SavedState = nil
print(("  fuera: %s (%d no estaban en el escaneo)"):format(gone.w.name, after.skipped.unseen))
print("OK")

-- Texture paths need "\\" in Lua strings: a lone "\M" turns into "M" and the
-- texture comes out blank (the minimap button was invisible in 0.8.1).
for _, file in ipairs({ "addon/WritPlanner/UI.lua", "addon/WritPlanner/Core.lua" }) do
  local n = 0
  for line in io.lines(file) do
    n = n + 1
    local s = line:gsub("\\\\", ""):gsub("\\[ntr]", "")
    assert(not s:find("\\%a"), file .. ":" .. n .. " tiene una barra sola: " .. line)
  end
end
print("rutas de texturas ok")
