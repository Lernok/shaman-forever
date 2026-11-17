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
local function frames() local n = 0 while #queue > 0 do table.remove(queue, 1)(); n = n + 1; if n > 20000 then error("cuadros sin fin, estado de compras: " .. tostring(WritPlanner.Buy and WritPlanner.Buy.state()) .. " " .. WritPlanner.Buy.debug() .. " AH=" .. tostring(AH[tonumber((WritPlanner.Buy.debug()):match("^%d+") or 0)] and #AH[tonumber((WritPlanner.Buy.debug()):match("^%d+"))])) end end return n end
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
-- A fake modern auction house (Forever's): AH[itemID] = { {n, buyout}, ... }.
-- Even item ids stack (bought by quantity), odd ones are single listings.
AH = {}
local clock, money = 0, 1000000
GetTime = function() clock = clock + 0.01 return clock end
GetMoney = function() return money end
hooksecurefunc = function(t, name, fn)
  if type(t) == "string" then t, name, fn = _G, t, name end
  local orig = t[name]
  t[name] = function(...) orig(...); fn(...) end
end
local function stacks(id) return id % 2 == 0 end
local function fire(...) local args = { ... } C_Timer.After(0, function() events.onevent(events, unpack(args)) end) end
local browse = {}
Enum = { ItemCommodityStatus = { Unknown = 0, Item = 1, Commodity = 2 } }
local function units(id)
  local out = {}
  for _, a in ipairs(AH[id] or {}) do out[#out + 1] = { n = a[1], total = a[2], unit = a[2] / a[1], ref = a } end
  table.sort(out, function(x, y) return x.unit < y.unit end)
  return out
end
C_AuctionHouse = {
  IsThrottledMessageSystemReady = function() return true end,
  SendBrowseQuery = function(q)
    local id = tonumber(q.searchString:match("^item(%d+)$"))
    browse = {}
    if id and AH[id] and #AH[id] > 0 then browse[1] = { itemKey = { itemID = id } } end
    fire("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED")
  end,
  GetBrowseResults = function() return browse end,
  HasFullBrowseResults = function() return true end,
  -- The real one takes a bag slot: called with an item id it errors (0.11.0 did).
  GetItemCommodityStatus = function(loc) assert(type(loc) == "table", "GetItemCommodityStatus(item) quiere un ItemLocation") return 0 end,
  GetItemKeyInfo = function(key) return { itemID = key.itemID, isCommodity = stacks(key.itemID) } end,
  SendSearchQuery = function(key)
    if stacks(key.itemID) then fire("COMMODITY_SEARCH_RESULTS_UPDATED", key.itemID) else fire("ITEM_SEARCH_RESULTS_UPDATED", key) end
  end,
  GetNumCommoditySearchResults = function(id) return #units(id) end,
  GetCommoditySearchResultInfo = function(id, i) local u = units(id)[i] return { itemID = id, quantity = u.n, unitPrice = math.ceil(u.unit) } end,
  HasFullCommoditySearchResults = function() return true end,
  GetNumItemSearchResults = function(key) return #units(key.itemID) end,
  GetItemSearchResultInfo = function(key, i) local u = units(key.itemID)[i] return { auctionID = key.itemID * 100 + i, quantity = u.n, buyoutAmount = u.total, itemKey = key } end,
  StartCommoditiesPurchase = function(id, n)
    local left, total = n, 0
    for _, u in ipairs(units(id)) do local t = math.min(u.n, left); total = total + t * math.ceil(u.unit); left = left - t; if left == 0 then break end end
    fire("COMMODITY_PRICE_UPDATED", math.ceil(total / n), total)
  end,
  ConfirmCommoditiesPurchase = function(id, n)
    C_Timer.After(0, function()
      local left, total = n, 0
      for _, u in ipairs(units(id)) do
        local t = math.min(u.n, left)
        total, left = total + t * math.ceil(u.unit), left - t
        u.ref[1], u.ref[2] = u.ref[1] - t, math.ceil(u.unit) * (u.ref[1] - t)
        if left == 0 then break end
      end
      for k = #AH[id], 1, -1 do if AH[id][k][1] == 0 then table.remove(AH[id], k) end end
      money = money - total
      events.onevent(events, "COMMODITY_PURCHASE_SUCCEEDED")
    end)
  end,
  CancelCommoditiesPurchase = function() end,
  PlaceBid = function(auctionID, bid)
    local id, i = math.floor(auctionID / 100), auctionID % 100
    C_Timer.After(0, function()
      local u = units(id)[i]
      for k, a in ipairs(AH[id]) do if a == u.ref then table.remove(AH[id], k) break end end
      money = money - bid
      events.onevent(events, "PLAYER_MONEY")
    end)
  end,
}
dofile("addon/WritPlanner/Data.lua")
dofile("addon/WritPlanner/Planner.lua")
dofile("addon/WritPlanner/Core.lua")
dofile("addon/WritPlanner/UI.lua")
dofile("addon/WritPlanner/Buy.lua")
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
  print(("[%s] rep %s, meta %s, faltan %s, elegido %s, err %s"):format(tostring(R.faction), tostring(R.rep), tostring(R.goal), tostring(R.need), tostring(R.pick), tostring(R.err)))
  for _, k in ipairs({ "mine", "rec", "fast" }) do
    local r = R.raw and R.raw[k]
    if r then print(("    %-4s hoy %d rep, %s"):format(k, r.rep, g(r.cost))) end
  end
  if R.today then
    print(("  hoy: %d rep, %s, %d min%s%s"):format(R.today.rep, g(R.today.cost), R.today.time / 60,
      (R.today.hearthSave or 0) > 0 and (", piedra ahorra " .. math.floor(R.today.hearthSave / 60) .. " min") or "",
      R.today.preBind and (", primero piedra en " .. R.today.preBind.town .. " (ahorra " .. math.floor(R.today.preBind.save / 60) .. " min)") or ""))
    for _, leg in ipairs(R.today.route) do
      print(("    %s %s +%d min %s"):format(WritPlanner_DATA.zones[leg.stop.zone].name, leg.stop.npc, leg.leg / 60, leg.flight and "vuelo" or ""))
      for _, c in ipairs(leg.stop.writs) do print(("        %s %s%s%s"):format(c.w.name, g(c.cost), c.haveItems and " (tiene el objeto)" or "", c.ratio and (" ratio " .. string.format("%.2f", c.ratio)) or "")) end
    end
  end
  if R.presets and R.presets.fast then
    for _, k in ipairs({ "fast", "rec", "cheap" }) do local op = R.presets[k] print(("    %-5s %2d días  %s  (~%s/día)"):format(k, op.days, g(op.total), g(op.total / op.days))) end
  end
end

print("== Friendly, sin presupuesto, tolerancia 1 g")
T0 = os.clock(); show(W.compute())
print("== Honored recomendado")
WritPlannerCharDB.opts.goal = "9000"
T0 = os.clock(); show(W.compute())
print("== Honored recomendado saliendo de Thunder Bluff")
WritPlannerCharDB.opts.pick = "rec"; WritPlannerCharDB.opts.from = "Thunder Bluff"
T0 = os.clock(); show(W.compute())
W.lock(W.compute().today)
for _, st in ipairs(W.steps((W.lockedRoute()))) do print("   " .. st.text) end
WritPlannerCharDB.locked = nil
WritPlannerCharDB.opts.from = "here"
print("== Honored lo más rápido")
WritPlannerCharDB.opts.pick = "fast"
T0 = os.clock(); show(W.compute())
WritPlannerCharDB.opts.pick = "rec"
print("== Honored, máximo 2500 por día")
WritPlannerCharDB.opts.perDay = 2500
T0 = os.clock(); show(W.compute())
WritPlannerCharDB.opts.perDay = nil
print("== +500, solo a pie, Shadow Oil ya entregado hoy, Kzixx sin stock de un writ")
WritPlannerCharDB.opts.goal = "+500"; WritPlannerCharDB.opts.mode = "walk"
done[94264] = true
W.markGone(94241)
T0 = os.clock(); show(W.compute())
print("== la ventana")
SlashCmdList.WRITPLANNER("")
assert(W.UI.isOpen(), "el primer /writs tiene que abrir la ventana")
assert(W.UI.mini and W.UI.mini:IsShown(), "falta el botón del minimapa")
SlashCmdList.WRITPLANNER("icono"); assert(not W.UI.mini:IsShown())
W.UI.go(3); SlashCmdList.WRITPLANNER("icono"); assert(W.UI.mini:IsShown()); W.UI.go(1)
print("  primer /writs abre, botón del minimapa ok")
for i = 1, 3 do W.UI.go(i); local n = frames(); print("  pestaña " .. i .. " ok (" .. n .. " cuadros)") end
-- Follow today's trip.
local R = W.compute()
print(("fuera por peligro: %d"):format(R.skipped.danger))
W.lock(R.today)
local route, doneN, total = W.lockedRoute()
print(("siguiendo: %d paradas, %d de %d entregados"):format(#route, doneN, total))
for _, st in ipairs(W.steps(route)) do print("   " .. st.text) end
W.UI.go(2); frames()
-- Turn in the first stop's writs: the arrow moves on.
for _, c in ipairs(route[1].stop.writs) do done[c.w.q] = true; events.onevent(events, "QUEST_TURNED_IN", c.w.q) end
route, doneN = W.lockedRoute()
print(("después de entregar: %d paradas, %d entregados"):format(#route, doneN))
WritPlannerCharDB.opts.goal = "9000"; W.UI.refresh(); W.UI.go(1); frames()
WritPlannerCharDB.opts.goal = nil; W.UI.go(3); W.UI.go(1); frames()
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

print("== versión por guild")
GetAddOnMetadata = function(_, f) if f == "Version" then return "0.12.0" end end
GetTime = GetTime or os.clock
WritPlannerCharDB.opts.share = false -- the version goes even with sharing off
sent = {}
assert(W.compareVersions("0.11.3", "0.12.0") < 0 and W.compareVersions("0.12.10", "0.12.9") > 0 and W.compareVersions("1.0", "1.0.0") == 0)
W.sendVersion()
assert(#sent == 1 and sent[1][2] == "V1;0.12.0", "manda su versión")
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "V1;0.13.1", "GUILD", "Grunk-RPPvP")
assert(W.newer and W.newer.version == "0.13.1" and W.newer.from == "Grunk", "se entera de la versión nueva")
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "V1;0.13.0", "GUILD", "Zug")
assert(W.newer.version == "0.13.1", "se queda con la más nueva")
sent = {}
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "V1;0.10.0", "GUILD", "Zug")
assert(#sent == 1 and sent[1][2] == "V1;0.12.0", "le contesta al que tiene una vieja")
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "V1;0.10.0", "GUILD", "Mog")
assert(#sent == 1, "contesta como mucho una vez por minuto")
events.onevent(events, "CHAT_MSG_ADDON", "WritPlanner", "V1;<script>", "GUILD", "Mog")
W.UI.go(3); frames()
print("  manda, se entera de la nueva (" .. W.newer.version .. " de " .. W.newer.from .. ") y contesta")
WritPlannerCharDB.opts.share = true

print("== caminar entre zonas sin paso")
local P, D = W.Planner, WritPlanner_DATA
assert(P.hops("Wetlands", "Searing Gorge") == 99 and P.hops("Arathi Highlands", "Wetlands") == 1 and P.hops("Riverglades", "Wetlands") == nil)
-- With every Horde flight of the Eastern Kingdoms known, the Wetlands to
-- Searing Gorge goes by Hammerfall and Thorium Point, not straight on foot.
local known = {}
for id, n in pairs(D.nodes) do if n.cont == 0 and n.side:find("H") then known[id] = true end end
local fly = P.travel({ speed = 9.8, known = known, nodes = D.nodes, paths = D.paths })
local function at(npc) for _, w in ipairs(D.writs) do if w.npc == npc and w.wx then return { x = w.wx, y = w.wy, cont = 0, z = D.zones[w.z].name } end end end
local t, how = fly(at("Kixxle"), at("Lookout Captain Lolo Longstriker"))
assert(how and how.to and D.nodes[how.to].name:find("Thorium"), "vuela a Thorium Point")
print(("  Wetlands -> Searing Gorge: %s a %s, %d min"):format(D.nodes[how.from].name, D.nodes[how.to].name, t / 60))

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

print("== comprar en la subasta")
WritPlannerCharDB.gone = {}
WritPlannerCharDB.stored = { bank = {}, mail = {} }
WritPlannerCharDB.opts.tol = 0.5
local R3 = W.compute()
W.lock(R3.today)
local L = W.locked()
local buy = W.toBuy()
assert(#buy >= 3, "hace falta comprar varias cosas para la prueba")
print(("  ruta elegida: %d writs, %d cosas para comprar, presupuesto %s (margen %s)"):format(#L.q, #buy, W.money(L.budget), W.money(W.headroom())))
-- On sale: the first at the planned price, the second sold out, the third 3x dearer;
-- the rest at the planned price (in stacks of what's needed).
for i, b in ipairs(buy) do
  if i == 2 then AH[b.id] = {}
  elseif i == 3 then AH[b.id] = { { b.n, b.unit * b.n * 3 + 60000 } }
  else AH[b.id] = { { b.n, b.unit * b.n } } end
end
-- Every other writ and item on sale at Auctionator's price (for the swaps).
for _, w in ipairs(WritPlanner_DATA.writs) do
  for _, id in ipairs({ w.w, w.i }) do
    if not AH[id] and prices[id] then AH[id] = { { w.n and id == w.i and w.n or 1, prices[id] * ((id == w.i and w.n) or 1) } } end
  end
end
local secondQ, thirdQ = buy[2].q, buy[3].q
events.onevent(events, "AUCTION_HOUSE_SHOW")
frames()
assert(W.Buy.state() == "ready", "el primero está al precio planeado: " .. tostring(W.Buy.state()))
local firstId, firstN = buy[1].id, buy[1].n
W.Buy.click(); frames()
if W.Buy.state() == "confirm" then W.Buy.click(); frames() end -- stacks: second click confirms the price
assert((WritPlannerCharDB.stored.mail[firstId] or 0) == firstN, "lo comprado cuenta como tuyo (en el correo)")
assert(L.spent == buy[1].unit * buy[1].n, "anota lo gastado")
-- Buy everything else; the sold-out one and the dear one get swapped or skipped.
local clicks = 0
while (W.Buy.state() == "ready" or W.Buy.state() == "confirm") and clicks < 80 do W.Buy.click(); frames(); clicks = clicks + 1 end
assert(W.Buy.state() == "done", "termina de comprar: " .. tostring(W.Buy.state()))
assert(#W.toBuy() == 0, "no queda nada por comprar")
local inTrip = {}
for _, q in ipairs(L.q) do inTrip[q] = true end
assert(not inTrip[secondQ] and not inTrip[thirdQ], "el agotado y el caro salen de la ruta")
assert(#L.changes >= 2)
for _, ch in ipairs(L.changes) do print("  cambio: " .. ch.from .. " -> " .. tostring(ch.to)) end
assert(L.spent <= L.budget, "no se pasa del presupuesto")
print(("  %d compras, gastado %s de %s"):format(clicks + 1, W.money(L.spent), W.money(L.budget)))
-- Closing and opening the window goes back to the chosen trip, which kept what you bought.
W.UI.toggle(); W.UI.toggle(); frames()
local route = W.lockedRoute()
for _, leg in ipairs(route) do for _, c in ipairs(leg.stop.writs) do assert(c.haveWrit and c.haveItems, "la ruta elegida tiene todo comprado: " .. c.w.name) end end
local steps = W.steps(route)
assert(steps[1].kind == "mail", "primero sacar lo comprado del correo")
print("  " .. steps[1].text:sub(1, 100))
-- A new plan prefers what you already have.
local R4 = W.compute()
local free = 0
for _, c in ipairs(R4.today.writs) do if c.cost == 0 then free = free + 1 end end
print(("  plan nuevo: %d de %d writs ya comprados"):format(free, #R4.today.writs))
events.onevent(events, "AUCTION_HOUSE_CLOSED")

print("== sacar writs del plan")
-- You hold some writs with their items; the plan adds more that cost gold.
WritPlannerCharDB.locked = nil
WritPlannerCharDB.stored = { bank = {}, mail = {} }
WritPlannerCharDB.opts.goal = "9000"
local R5 = W.compute()
local mine = {}
for i = 1, 3 do local c = R5.today.writs[i]; mine[c.w.q] = true; WritPlannerCharDB.stored.mail[c.w.w] = 1; WritPlannerCharDB.stored.mail[c.w.i] = c.w.n or 1 end
local R6 = W.compute()
local owned6, paid6 = 0, 0
for _, c in ipairs(R6.today.writs) do if c.cost == 0 then owned6 = owned6 + 1 else paid6 = paid6 + 1 end end
assert(owned6 >= 3 and paid6 > 0, "el plan suma writs para comprar")
-- The choice "Solo lo que ya tengo": every writ you hold, nothing to buy.
assert(R6.raw.mine and #R6.raw.mine.writs >= 3 and R6.raw.mine.cost == 0, "la opción solo lo que tengo")
WritPlannerCharDB.opts.pick = "mine"
W.finishPick(R6)
assert(R6.pick == "mine" and R6.today.cost == 0, "elegir solo lo que tengo")
W.lock(R6.today)
assert(#W.toBuy() == 0, "sin nada que comprar")
print(("  solo lo que tengo: %d writs, %d de reputación gratis"):format(#R6.today.writs, R6.today.rep))
-- Back to recommended, untick every writ that costs something: same as above, by hand.
WritPlannerCharDB.opts.pick = "rec"
for _, c in ipairs(R6.raw.rec.writs) do if c.cost > 0 then W.skip(c.w.q, true) end end
W.finishPick(R6)
assert(R6.today.cost == 0 and #R6.today.out == paid6, "destildar saca sin reemplazar")
for _, leg in ipairs(R6.today.route) do for _, c in ipairs(leg.stop.writs) do assert(c.cost == 0) end end
-- Ticking one again.
W.skip(R6.today.out[1].w.q, false)
W.finishPick(R6)
assert(#R6.today.out == paid6 - 1)
print(("  destildados: %d, ruta %d writs"):format(#R6.today.out, #R6.today.writs))
WritPlannerCharDB.locked = nil
W.UI.open(1); frames()
WritPlannerCharDB.skip, WritPlannerCharDB.locked = {}, nil
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

-- Auction house events change between clients (Forever has the modern one):
-- they're registered with pcall, never with a bare RegisterEvent, so an
-- unknown one can't stop the addon from loading (0.10.0 broke that way).
for line in io.lines("addon/WritPlanner/Core.lua") do
  assert(not line:find('RegisterEvent%("[A-Z_]*AUCTION') and not line:find('RegisterEvent%("COMMODITY') and not line:find('RegisterEvent%("ITEM_SEARCH'),
    "evento de subasta registrado sin pcall: " .. line)
end
print("eventos de subasta ok")
