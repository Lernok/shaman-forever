-- Writ Planner as a guildmate would meet it: a fresh install or old saved
-- data, the other faction, no Auctionator, no reputation, no guild... Each
-- case runs in its own Lua with the fake game of test-writs-game.lua.
--   .cache/lua51/lua5.1.exe scripts/test-writs-fresh.lua          (all cases)
--   .cache/lua51/lua5.1.exe scripts/test-writs-fresh.lua alianza  (one)
local CASES = { "alianza", "sin_auctionator", "datos_viejos", "sin_repu", "meta_cumplida", "sin_nada_que_hacer" }
local which = arg and arg[1]

if not which then
  local failed = 0
  for _, c in ipairs(CASES) do
    local ok = os.execute('.cache\\lua51\\lua5.1.exe scripts/test-writs-fresh.lua ' .. c)
    if ok ~= 0 and ok ~= true then failed = failed + 1; print("FALLÓ: " .. c) end
  end
  print(failed == 0 and "TODOS OK" or (failed .. " casos fallaron"))
  os.exit(failed == 0 and 0 or 1)
end

-- The fake game: everything test-writs-game.lua sets up before loading the addon.
local src = io.open("scripts/test-writs-game.lua"):read("*a")
local cut = src:find('dofile("addon/WritPlanner/Data.lua")', 1, true)
local H = assert(loadstring(src:sub(1, cut - 1) .. "\nreturn { frames = frames, events = function() return events end }"))()
local chats = {}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chats[#chats + 1] = m end }
print("== " .. which)

-- The case changes the game before the addon loads.
if which == "alianza" then
  UnitFactionGroup = function() return "Alliance" end
  UnitLevel = function() return 30 end
  UnitClass = function() return "Warrior", "WARRIOR" end
  GetBindLocation = function() return "Ironforge" end
  C_Reputation = { GetFactionDataByID = function(id) if id == 2586 then return { name = "Azeroth Commerce Authority", currentStanding = 500 } end end }
  -- Standing in Ironforge.
  C_Map.GetBestMapForUnit = function() return 1455 end
  C_Map.GetWorldPosFromMapPos = function() return 0, { GetXY = function() return -4900, -950 end } end
elseif which == "sin_auctionator" then
  Auctionator = nil
elseif which == "datos_viejos" then
  -- Saved by 0.9.1: other option names, a trip followed without prices or budget.
  WritPlannerDB = { hist = {}, learned = {} }
  WritPlannerCharDB = { flights = {}, gone = {}, stored = { bank = {}, mail = {} },
    opts = { plan = "gold", budget = 30, maxAge = 3, speed = "foot", days = 4, tol = 1 },
    locked = { key = nil, q = { 94241, 94264 } } }
elseif which == "sin_repu" then
  C_Reputation = { GetFactionDataByID = function() return nil end }
  IsInGuild = function() return false end
elseif which == "meta_cumplida" then
  C_Reputation = { GetFactionDataByID = function(id) if id == 2587 then return { name = "Durotar Supply and Logistics", currentStanding = 42999 } end end }
elseif which == "sin_nada_que_hacer" then
  -- Every writ already turned in today.
  C_QuestLog.IsQuestFlaggedCompleted = function() return true end
end

dofile("addon/WritPlanner/Data.lua")
dofile("addon/WritPlanner/Planner.lua")
dofile("addon/WritPlanner/Core.lua")
dofile("addon/WritPlanner/UI.lua")
dofile("addon/WritPlanner/Buy.lua")
local events = H.events()
local frames = H.frames
events.onevent(events, "ADDON_LOADED", "WritPlanner")
events.onevent(events, "PLAYER_LOGIN")
frames()
local W = WritPlanner
if which == "datos_viejos" then WritPlannerCharDB.locked.key = W.resetKey() end

-- Every tab opens, the plan gets worked out, the auction house opens and closes.
SlashCmdList.WRITPLANNER("")
assert(W.UI.isOpen(), "abre la ventana")
for i = 1, 3 do W.UI.go(i); frames() end
W.UI.go(1); frames()
local R = W.compute()
print(("  err=%s pick=%s hoy=%s"):format(tostring(R.err), tostring(R.pick), R.today and (#R.today.writs .. " writs, " .. W.money(R.today.cost)) or "-"))
events.onevent(events, "AUCTION_HOUSE_SHOW"); frames()
events.onevent(events, "AUCTION_HOUSE_CLOSED"); frames()
SlashCmdList.WRITPLANNER("vuelos")
SlashCmdList.WRITPLANNER("")

if which == "alianza" then
  assert(not R.err and R.today and #R.today.writs > 0, "un plan para la Alianza")
  W.lock(R.today)
  local steps = W.steps((W.lockedRoute()))
  local text = {}
  for _, s in ipairs(steps) do text[#text + 1] = s.text end
  text = table.concat(text, " | ")
  assert(not text:find("zeppelin"), "a la Alianza no le habla de zeppelines: " .. text)
  print("  " .. text:sub(1, 160))
  -- Its auction house panel opens with things to buy.
  events.onevent(events, "AUCTION_HOUSE_SHOW"); frames()
  assert(W.Buy.isOpen())
  W.UI.toggle(); W.UI.toggle(); frames()
elseif which == "sin_auctionator" then
  assert(R.err == "noauc", "sin Auctionator lo avisa")
elseif which == "datos_viejos" then
  assert(not R.err, tostring(R.err))
  assert(WritPlannerCharDB.opts.speed == "auto" and WritPlannerCharDB.opts.pick, "migra las opciones")
  -- The old trip: no planned prices, no budget; the tabs and the panel cope.
  assert(type(W.toBuy()) == "table")
  W.UI.go(2); frames()
  events.onevent(events, "AUCTION_HOUSE_SHOW"); frames()
  events.onevent(events, "AUCTION_HOUSE_CLOSED")
elseif which == "sin_repu" then
  assert(R.err == "norep", "sin reputación lo avisa")
  WritPlannerCharDB.opts.manualRep = 1200
  local R2 = W.compute()
  assert(not R2.err and R2.rep == 1200, "con la reputación escrita a mano calcula")
elseif which == "meta_cumplida" then
  assert(R.err == "reached", "meta cumplida: " .. tostring(R.err))
elseif which == "sin_nada_que_hacer" then
  assert(R.err == "alldone", "nada para hoy: " .. tostring(R.err))
end
for _, m in ipairs(chats) do assert(not m:find("error al calcular"), m) end
print("  ok")
