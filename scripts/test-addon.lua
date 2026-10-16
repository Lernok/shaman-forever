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
-- Bags: four 6-slot bags (BAGS=<slots> to change).
function GetContainerNumSlots(bag) return tonumber(os.getenv("BAGS") or "6") end
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

local SF = {}
for _, f in ipairs({ "Data.lua", "Locale.lua", "Core.lua" }) do assert(loadfile(dir .. f))("ShamanForever", SF) end
local ev = frames[1]
ShamanForeverCharDB = { spec = spec }
ev:fire("ADDON_LOADED", "ShamanForever")

local function dump(title, tips)
  print("== " .. title .. " (" .. #tips .. ")")
  for _, t in ipairs(tips) do print("  " .. t.head .. " | " .. (t.src:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) .. " | " .. (t.gain or "") .. "  [" .. t.key .. "]" .. (t.lines and (" " .. table.concat(t.lines, ", ")) or "")) end
end
print(race, spec, "nivel " .. level, zone, inst or "")
dump("Lo que viene", SF.test.upcoming())
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
-- Quests you carry (ONQUEST): the "En curso" tab.
for _, t in ipairs(SF.test.inProgress()) do print("EN CURSO", t.head, "|", t.src, "|", (t.gain or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
-- "Listo" on the first tip: it leaves the tips and shows under Listos.
local before = SF.test.upcoming()
if before[1] then
  SF.test.archive(before[1], "done")
  local after = SF.test.upcoming()
  print("-- listo: avisos " .. #before .. " -> " .. #after .. ", listos " .. #SF.test.archived("done") .. " (" .. SF.test.archived("done")[1].head .. ")")
end
SlashCmdList.SHAMANFOREVER("ayuda")
SlashCmdList.SHAMANFOREVER("dondeestoy")
SlashCmdList.SHAMANFOREVER("registro")
print("log:", #ShamanForeverCharDB.log, ShamanForeverCharDB.log[1])
