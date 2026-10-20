-- Headless test of the addon (no game): loads it with a stub of the game API
-- and prints what it would show. Run with Lua 5.1:
--   lua5.1 scripts/test-addon.lua [race] [spec] [level] [zone] [instanceId]
local race, spec, level, zone, inst = arg[1] or "Orc", arg[2] or "Enhancement", tonumber(arg[3] or 20), arg[4] or "The Barrens", tonumber(arg[5])
local dir = "addon/ShamanForever/"

-- Anything: every method call returns a stub, so UI code runs.
local function stub()
  local o = {}
  -- Sizes and positions read back from frames act as 0.
  local zero = function() return 0 end
  return setmetatable(o, { __index = function(t, k) return function(self, ...) return stub() end end, __call = function() return stub() end,
    __add = zero, __sub = zero, __mul = zero, __div = zero, __unm = zero, __lt = function() return false end, __le = function() return false end })
end
local shown = {}
local frames = {}
function CreateFrame(kind, name)
  local f = stub()
  local scripts, events = {}, {}
  rawset(f, "SetScript", function(self, k, fn) scripts[k] = fn end)
  rawset(f, "RegisterEvent", function(self, e) events[e] = true end)
  rawset(f, "UnregisterEvent", function(self, e) events[e] = nil end)
  rawset(f, "fire", function(self, e, ...) if scripts.OnEvent then scripts.OnEvent(self, e, ...) end end)
  rawset(f, "IsShown", function() return false end)
  frames[#frames + 1] = f
  return f
end
UIParent, GameTooltip, ItemRefTooltip, DEFAULT_CHAT_FRAME = stub(), stub(), stub(), { AddMessage = function(_, m) print("CHAT", (m:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))) end }
UISpecialFrames, SlashCmdList = {}, {}
function tinsert(t, v) table.insert(t, v) end
function wipe(t) for k in pairs(t) do t[k] = nil end return t end
function GetLocale() return "esES" end
function UnitRace() return race, race end
function UnitLevel() return level end
function UnitFactionGroup() return race == "Dwarf" and "Alliance" or "Horde" end
function GetRealZoneText() return zone end
function GetSubZoneText() return "" end
function GetInstanceInfo() if inst then return "X", "party", 1, "", 5, 0, false, inst end return zone, "none" end
function InCombatLockdown() return false end
function GetInventoryItemID(_, slot) if slot == 16 then return tonumber(os.getenv("WEAPON") or "") end end
function GetInventoryItemLink() return nil end
function GetItemInfo() return nil end
function GetItemCount() return 0 end
-- Unspent talent points (TPTS=<n>).
function UnitCharacterPoints() return tonumber(os.getenv("TPTS") or "0") end
-- Professions (PROFS="165:85:150 164:40:75": skill line, skill, max).
local profs = {}
for line, skill, max in (os.getenv("PROFS") or ""):gmatch("(%d+):(%d+):(%d+)") do profs[#profs + 1] = { tonumber(line), tonumber(skill), tonumber(max) } end
function GetProfessions() return profs[1] and 1 or nil, profs[2] and 2 or nil end
function GetProfessionInfo(i) local p = profs[i] return "Prof" .. p[1], 0, p[2], p[3], 0, 0, p[1] end
-- Bags: four 6-slot bags (BAGS=<slots> to change).
function GetContainerNumSlots(bag) return tonumber(os.getenv("BAGS") or "6") end
-- An item in the first bag slot (INBAG=<item id>).
function GetContainerItemID(bag, slot) if bag == 0 and slot == 1 then return tonumber(os.getenv("INBAG") or "") end end
function GetItemIcon() return 1 end
local completed = {}
for q in (os.getenv("DONE") or ""):gmatch("%d+") do completed[tonumber(q)] = true end
function IsQuestFlaggedCompleted(id) return completed[id] or false end
-- Shift+click on an item (MARK=<item id>): the hook the addon adds.
local clickHooks = {}
function HandleModifiedItemClick(link) for _, fn in ipairs(clickHooks) do fn(link) end end
function hooksecurefunc(name, fn) if name == "HandleModifiedItemClick" then table.insert(clickHooks, fn) end end
function IsShiftKeyDown() return true end
function IsControlKeyDown() return false end
function IsAltKeyDown() return false end
local carrying = {}
for q in (os.getenv("ONQUEST") or ""):gmatch("%d+") do carrying[tonumber(q)] = true end
function GetQuestLogIndexByID(id) return carrying[id] and 1 or 0 end
function GetAddOnMetadata() return "0.1.0" end
function time() return 0 end
C_Timer = { After = function(_, fn) fn() end }
C_Map = { GetAreaInfo = function() return nil end, SetUserWaypoint = function(p) print("PIN", p[1], p[2], p[3]) end }
UiMapPoint = { CreateFromCoordinates = function(m, x, y) return { m, x, y } end }
function OpenWorldMap(m) print("OPENMAP", m) end

-- Polestar open with a guide (POLESTAR="quest ids"), its gear advice on.
-- PDUNGEON="Wailing Caverns:20": a dungeon step in the guide it leads to
-- (PROUTE="quest ids": that guide's quests); PNOW=1: the current step.
if os.getenv("POLESTAR") then
  local goals, goals2 = {}, {}
  for q in os.getenv("POLESTAR"):gmatch("%d+") do goals[#goals + 1] = { t = "accept", quest = tonumber(q) } end
  for q in (os.getenv("PROUTE") or ""):gmatch("%d+") do goals2[#goals2 + 1] = { t = "turnin", quest = tonumber(q) } end
  local g2 = { title = "02 · The Barrens (19-21)", steps = { { title = "Turn in", goals = goals2 } } }
  local g1 = { title = "01 · Test", next = "sf/02", steps = { { title = "Pick up", goals = goals } } }
  local dn, dl = (os.getenv("PDUNGEON") or ""):match("^(.-):(%d+)$")
  if dn then
    local st = { title = "Dungeon: " .. dn .. " (level " .. dl .. ")", goals = { { t = "goto", text = dn, map = 1413, x = 46, y = 36, r = 30 } } }
    if os.getenv("PNOW") then table.insert(g1.steps, 1, st) else table.insert(g2.steps, 1, st) end
  end
  Polestar = { Engine = { GetGuide = function() return g1 end, GetStepIndex = function() return 1 end },
    Guides = { Get = function(id) return id == "sf/02" and g2 or nil end },
    Gear = { IsEnabled = function() return true end }, On = function(msg) print("POLESTAR ON", msg) end }
end
-- A real guide pack (PPACK=<its Guides.lua>), open at guide PGUIDE, step PSTEP.
if os.getenv("PPACK") then
  local byId = {}
  Polestar = { RegisterGuide = function(g) byId[g.id] = g end }
  assert(loadfile(os.getenv("PPACK")))()
  local open, at = byId[os.getenv("PGUIDE")], tonumber(os.getenv("PSTEP") or "1")
  assert(open, "no guide " .. tostring(os.getenv("PGUIDE")))
  Polestar = { Engine = { GetGuide = function() return open end, GetStepIndex = function() return at end,
      SetGuide = function(id) if byId[id] then open, at = byId[id], 1; print("POLESTAR SETGUIDE", id) return true end return false end },
    Guides = { Get = function(id) return byId[id] end,
      List = function()
        local out = {}
        for id, g in pairs(byId) do out[#out + 1] = { id = id, maxLevel = g.maxLevel, minLevel = g.minLevel, folder = g.folder } end
        table.sort(out, function(a, b) return a.id < b.id end)
        return out
      end },
    On = function(msg) print("POLESTAR ON", msg) end }
end
local SF = {}
for _, f in ipairs({ "Data.lua", "Locale.lua", "Core.lua" }) do assert(loadfile(dir .. f))("ShamanForever", SF) end
-- Spells you know: every rank up to level KNOWN (default: your level - 2).
-- The trainer (TRAINER=1) offers the ranks you don't know up to your level,
-- 1 silver each.
local knownLv = tonumber(os.getenv("KNOWN") or "") or level - 2
local knownIds, offer = {}, {}
for name, sp in pairs(SF.DATA.train.spells) do
  for rank, l in ipairs(sp.l) do
    if l > 0 and l <= knownLv then knownIds[sp.id[rank]] = true
    elseif l > 0 and l <= level then offer[#offer + 1] = { name, #sp.l > 1 and ("Rank " .. rank) or "", 100 } end
  end
end
table.sort(offer, function(a, b) return a[1] .. a[2] < b[1] .. b[2] end)
function IsPlayerSpell(id) return knownIds[id] or false end
function GetSpellInfo(id) for name, sp in pairs(SF.DATA.train.spells) do for _, x in ipairs(sp.id) do if x == id then return name end end end end
function UnitClass() return "Shaman", "SHAMAN" end
function GetNumTrainerServices() return #offer end
function GetTrainerServiceInfo(i) return offer[i][1], offer[i][2], "available" end
function GetTrainerServiceCost(i) return offer[i][3] end
function BuyTrainerService(i) print("BUY", offer[i][1], offer[i][2]) end
local ev = frames[1]
ShamanForeverCharDB = { spec = spec }
ev:fire("ADDON_LOADED", "ShamanForever")

local function dump(title, tips)
  print("== " .. title .. " (" .. #tips .. ")")
  for _, t in ipairs(tips) do print("  " .. t.head .. " | " .. (t.src:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) .. " | " .. (t.gain or "") .. "  [" .. t.key .. "]" .. (t.lines and (" " .. table.concat(t.lines, ", ")) or "")) end
end
print(race, spec, "nivel " .. level, zone, inst or "")
dump("Lo que viene", SF.test.upcoming())
if os.getenv("POLESTAR") or os.getenv("PPACK") then local title, tips = SF.test.currentView(); dump("Vista: " .. title, tips) end
-- SKIP="<dungeon>": "skip this dungeon" on the open route.
if os.getenv("SKIP") then
  SF.skipDungeon(os.getenv("SKIP"))
  local title, tips = SF.test.currentView(); dump("Tras saltear: " .. title, tips)
end
dump("En la zona", SF.test.zoneTips())
print("Talento:", SF.test.talentLine(level))
TomTom = { AddWaypoint = function(_, map, x, y, o) print("TOMTOM", map, x, y, o.title) end }
local first = SF.test.zoneTips()[1]
if first and first.giver then SF.test.waypoint(first.giver, first.title or first.head) end
if inst then dump("Dungeon", SF.test.dungeonTips(SF.DATA.instances[inst])) end
-- Popups: the first time shows, the second doesn't.
print("-- entrar a la zona dos veces:")
SF.test.onZone()
zone = "Elsewhere"; SF.test.onZone(); zone = arg[4] or "The Barrens"; SF.test.onZone()
ev:fire("PLAYER_LEVEL_UP", level + 1)
if os.getenv("MARK") then
  print("-- shift+clic en el item " .. os.getenv("MARK") .. ":")
  HandleModifiedItemClick("|cff1eff00|Hitem:" .. os.getenv("MARK") .. "::::::::20:::::|h[x]|h|r")
end
-- Hovering a quest giver (NPC=<id>): the gear its quests give you.
if os.getenv("NPC") then
  for _, q in ipairs(SF.test.npcLines(tonumber(os.getenv("NPC")))) do print("NPC", q[1]); for _, l in ipairs(q[2]) do print("     ", l) end end
end
for _, t in ipairs(SF.test.craftTips()) do print("CRAFT", t.head, "|", (t.src:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")), "|", (t.gain:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))) end
-- Quests you carry (ONQUEST): the "En curso" tab.
for _, t in ipairs(SF.test.inProgress()) do print("EN CURSO", t.head, "|", t.src, "|", (t.gain or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
-- "Listo" on the first tip: it leaves the tips and shows under Listos.
local before = SF.test.upcoming()
if before[1] then
  SF.test.archive(before[1], "done")
  local after = SF.test.upcoming()
  print("-- listo: avisos " .. #before .. " -> " .. #after .. ", listos " .. #SF.test.archived("done") .. " (" .. SF.test.archived("done")[1].head .. ")")
end
-- At the trainer (TRAINER=1): what it offers, what this spec skips, and the
-- "buy what's recommended" button.
if os.getenv("TRAINER") then
  print("-- entrenador:")
  for _, e in ipairs(SF.test.trainerOffer()) do print("  " .. e.name .. " " .. e.rank .. (e.rule and ("  SALTEAR: " .. e.rule.es) or "")) end
  SF.test.buyRecommended()
end
-- At the profession window (TRADE=<profession>, e.g. Leatherworking, with
-- PROFS for its skill): the recipes you know up to your skill, and what the
-- panel says about each.
if os.getenv("TRADE") then
  local p = profs[1] or { 0, 0, 0 }
  local list = {}
  for _, c in ipairs(SF.DATA.crafts[os.getenv("TRADE")] or {}) do
    if c[3] <= p[2] then list[#list + 1] = { id = c[1], kind = (p[2] - c[3] < 10 and "optimal") or (p[2] - c[3] < 25 and "medium") or "trivial" } end
  end
  function GetNumTradeSkills() return #list end
  function GetTradeSkillInfo(i) return "Recipe" .. list[i].id, list[i].kind end
  function GetTradeSkillItemLink(i) return "|Hitem:" .. list[i].id .. ":0|h[x]|h" end
  -- MODERN=1: Forever's window (C_TradeSkillUI), with a recipe you don't know.
  if os.getenv("MODERN") then
    GetNumTradeSkills, GetTradeSkillInfo, GetTradeSkillItemLink = nil, nil, nil
    local DIFF = { optimal = 0, medium = 1, easy = 2, trivial = 3 }
    C_TradeSkillUI = {
      GetAllRecipeIDs = function() local ids = {} for i = 1, #list + 1 do ids[i] = 1000 + i end return ids end,
      GetRecipeInfo = function(rid)
        local e = list[rid - 1000]
        if not e then return { recipeID = rid, name = "Moonglow Boots", learned = false, relativeDifficulty = 0 } end
        return { recipeID = rid, name = "Recipe" .. e.id, learned = true, relativeDifficulty = DIFF[e.kind] }
      end,
      GetRecipeOutputItemData = function(rid) local e = list[rid - 1000] return { itemID = e and e.id or 252427 } end,
      GetRecipeSourceText = function() return "|cFFFFD200Trainer|r: Karolek" end,
      GetChildProfessionInfo = function() return { professionName = "Leatherworking", skillLevel = p[2], maxSkillLevel = p[3] } end,
    }
  end
  local yes, soon, short, no = SF.test.craftReview()
  local function show(head, l) print("  " .. head .. " " .. #l) for _, e in ipairs(l) do print("    " .. e.text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end end
  print("-- profesión (" .. #list .. " recetas):")
  show("SÍ", yes) show("PRONTO", soon) show("NO VALE", short) print("  no mejoran: " .. no)
  ev:fire("TRADE_SKILL_SHOW")
end
-- The recipe scanner (SCAN=1): a Leatherworking trainer with a recipe you
-- can't learn yet hidden by its filter, a vendor selling two patterns and a
-- reagent, and the profession window's colors.
if os.getenv("SCAN") then
  function strsplit(sep, s) local out = {} for p in (s .. sep):gmatch("(.-)%" .. sep) do out[#out + 1] = p end return unpack(out) end
  function UnitGUID() return "Creature-0-1-1-1-3365-00001" end
  function UnitName() return "Karolek" end
  C_Map.GetBestMapForUnit = function() return 1411 end
  C_Map.GetPlayerMapPosition = function() return { GetXY = function() return 0.4123, 0.5678 end } end
  local services = { { "Leatherworking", "", "header" }, { "Light Leather", "", "used", 2318, 1, 0 },
    { "Murloc Scale Shoes", "", "available", 252426, 35, 500 }, { "Medium Leather", "", "unavailable", 2319, 75, 1000 } }
  local filter = { available = true, unavailable = false, used = false }
  local function visible() local out = {} for _, s in ipairs(services) do if s[3] == "header" or filter[s[3]] then out[#out + 1] = s end end return out end
  function IsTradeskillTrainer() return true end
  function GetTrainerServiceTypeFilter(f) return filter[f] end
  function SetTrainerServiceTypeFilter(f, on) assert(type(on) == "boolean", "Missing on/off parameter") filter[f] = on end
  function GetNumTrainerServices() return #visible() end
  function GetTrainerServiceInfo(i) local s = visible()[i] return s[1], s[3], 132539 end
  function GetTrainerServiceItemLink(i) return "|Hitem:" .. visible()[i][4] .. ":0|h[x]|h" end
  function GetTrainerServiceSkillReq(i) return "Leatherworking", visible()[i][5], true end
  function GetTrainerServiceLevelReq() return 10 end
  function GetTrainerServiceCost(i) return visible()[i][6] end
  ev:fire("TRAINER_SHOW")
  print("filtros después:", filter.available, filter.unavailable, filter.used)
  local wares = { { 252425, 9, "Pattern: Dark Leather Boots", 500 }, { 249500, 9, "Pattern: Something", 0, { 30, "Merchant's Favor" } }, { 2320, 7, "Coarse Thread", 10 } }
  function GetMerchantNumItems() return #wares end
  function GetMerchantItemLink(i) return "|Hitem:" .. wares[i][1] .. ":0|h[x]|h" end
  C_Item = { GetItemInfoInstant = function(id) for _, w in ipairs(wares) do if w[1] == id then return id, "", "", "", 0, w[2], 0 end end end }
  function GetMerchantItemInfo(i) return wares[i][3], 0, wares[i][4], 1, -1 end
  function GetMerchantItemCostInfo(i) return wares[i][5] and 1 or 0 end
  function GetMerchantItemCostItem(i) return 0, wares[i][5][1], nil, wares[i][5][2] end
  ev:fire("MERCHANT_SHOW")
  -- A pattern in the bags, and one looted from a creature you target.
  C_Container = { GetContainerNumSlots = function(bag) return bag == 0 and 2 or 0 end,
    GetContainerItemID = function(bag, i) return i == 1 and 252425 or 2589 end }
  function GetItemInfo(id) return id == 252425 and "Pattern: Dark Leather Boots" or "Linen Cloth" end
  ev:fire("BAG_UPDATE_DELAYED")
  function GetNumLootItems() return 2 end
  function GetLootSlotLink(i) return i == 1 and "|Hitem:2406::::|h[Pattern: Fine Leather Boots]|h" or "|Hitem:2589::::|h[Linen Cloth]|h" end
  function GetLootSourceInfo() return "Creature-0-1-1-1-3110-0001", 1 end
  UnitGUID = function(u) return u == "target" and "Creature-0-1-1-1-3110-0001" or "Creature-0-1-1-1-3365-00001" end
  UnitName = function(u) return u == "target" and "Dreadmaw Crocolisk" or "Karolek" end
  ev:fire("LOOT_OPENED")
  GetTradeSkillLine = nil -- Forever: the skill comes from GetProfessionInfo
  ev:fire("TRADE_SKILL_SHOW")
  local function show(t, pad)
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do
      if type(t[k]) == "table" then print(pad .. tostring(k) .. ":") show(t[k], pad .. "  ") else print(pad .. tostring(k) .. " = " .. tostring(t[k])) end
    end
  end
  show(ShamanForeverDB.scan or {}, "SCAN ")
end
-- At a profession trainer (OFFER=<lua file with OFFER_LIST, SKILL=<your
-- skill>): what the panel beside it says.
if os.getenv("OFFER") then
  SKILL = tonumber(os.getenv("SKILL") or "1")
  -- PRICES=1: Auctionator with a scan (each reagent at 1s, Slimy Murloc Scale missing).
  if os.getenv("PRICES") then
    Auctionator = { API = { v1 = { GetAuctionPriceByItemID = function(_, id) return id ~= 5784 and 100 or nil end,
      GetVendorPriceByItemID = function() return nil end } } }
  end
  assert(loadfile(os.getenv("OFFER")))()
  local yes, soon, short, no = SF.test.craftReview(OFFER_LIST)
  local function show(head, l) print("  " .. head .. " " .. #l) for _, e in ipairs(l) do print("    " .. e.text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end end
  print("-- entrenador de profesión (" .. #OFFER_LIST .. " recetas):")
  show("SÍ", yes) show("PRONTO", soon) show("NO VALE", short) print("  no mejoran: " .. no)
end
-- Quest XP the game pays, kept for the route planner (turn-in event).
local money = 1000
function GetMoney() return money end
ev:fire("PLAYER_ENTERING_WORLD")
ev:fire("QUEST_TURNED_IN", 96659, 410, 75)
money = 1075; ev:fire("PLAYER_MONEY")
money = 1000; ev:fire("PLAYER_MONEY")
money = 1030; ev:fire("PLAYER_MONEY")
local inc = (ShamanForeverCharDB.income or {})[UnitLevel("player")] or {}
print("ingresos del nivel: misiones " .. tostring(inc.q) .. ", todo " .. tostring(inc.all))
print("qxp 96659:", ShamanForeverDB.qxp and ShamanForeverDB.qxp[96659] and table.concat(ShamanForeverDB.qxp[96659], " @ nivel "))
SlashCmdList.SHAMANFOREVER("ayuda")
SlashCmdList.SHAMANFOREVER("dondeestoy")
SlashCmdList.SHAMANFOREVER("registro")
print("log:", #ShamanForeverCharDB.log, ShamanForeverCharDB.log[1])
if os.getenv("SCAN") then for _, l in ipairs(ShamanForeverCharDB.log) do if l:find("|scan|") or l:find("|error|") or l:find("|offer|") or l:find("|crafts|") then print("LOG", l) end end end
