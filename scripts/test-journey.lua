-- A character's whole leveling, headless: levels 1 to 30 (or TO) through the
-- usual zones of its race, quests done as it goes, no Polestar route. Prints
-- per level what the addon says in chat and how many rows the window holds,
-- to spot moments that dump too much at once. Run with Lua 5.1:
--   lua5.1 scripts/test-journey.lua [race] [spec]        (TO=40 to go further)
local race, spec = arg[1] or "Tauren", arg[2] or "Enhancement"
local dir = "addon/ShamanForever/"
local level, zone = 1, nil

local function stub()
  local zero = function() return 0 end
  return setmetatable({}, { __index = function() return function() return stub() end end, __call = function() return stub() end,
    __add = zero, __sub = zero, __mul = zero, __div = zero, __unm = zero, __lt = function() return false end, __le = function() return false end })
end
local frames = {}
function CreateFrame()
  local f = stub()
  local scripts = {}
  rawset(f, "SetScript", function(_, k, fn) scripts[k] = fn end)
  rawset(f, "RegisterEvent", function() end)
  rawset(f, "UnregisterEvent", function() end)
  rawset(f, "fire", function(self, e, ...) if scripts.OnEvent then scripts.OnEvent(self, e, ...) end end)
  rawset(f, "IsShown", function() return false end)
  frames[#frames + 1] = f
  return f
end
local chat = {}
UIParent, GameTooltip, ItemRefTooltip = stub(), stub(), stub()
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chat[#chat + 1] = (m:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end }
UISpecialFrames, SlashCmdList = {}, {}
function tinsert(t, v) table.insert(t, v) end
function wipe(t) for k in pairs(t) do t[k] = nil end return t end
function GetLocale() return "esES" end
function UnitRace() return race, race end
function UnitLevel() return level end
function UnitFactionGroup() return race == "Dwarf" and "Alliance" or "Horde" end
function GetRealZoneText() return zone end
function GetSubZoneText() return "" end
function GetInstanceInfo() return zone, "none" end
function InCombatLockdown() return false end
function GetInventoryItemID() return nil end
function GetInventoryItemLink() return nil end
function GetItemInfo() return nil end
-- Totem items the character has (it does each totem quest when it shows up).
local owned = {}
function GetItemCount(id) return owned[id] and 1 or 0 end
function UnitClass() return "Shaman", "SHAMAN" end
function GetProfessions() return nil end
function GetContainerNumSlots() return 6 end
function GetContainerItemID() return nil end
function GetItemIcon() return 1 end
local completed = {}
function IsQuestFlaggedCompleted(id) return completed[id] or false end
function hooksecurefunc() end
function IsShiftKeyDown() return false end
function IsControlKeyDown() return false end
function IsAltKeyDown() return false end
function GetQuestLogIndexByID() return 0 end
function GetAddOnMetadata() return "0" end
function time() return 0 end
C_Timer = { After = function(_, fn) fn() end }
C_Map = { GetAreaInfo = function() return nil end, SetUserWaypoint = function() end }
UiMapPoint = { CreateFromCoordinates = function(m, x, y) return { m, x, y } end }
function OpenWorldMap() end

-- The zones a character of each race usually levels in.
local ROUTES = {
  Tauren = { { 1, "Mulgore" }, { 11, "The Barrens" }, { 16, "Stonetalon Mountains" }, { 20, "The Barrens" }, { 22, "Ashenvale" },
    { 25, "Thousand Needles" }, { 28, "Hillsbrad Foothills" }, { 31, "Arathi Highlands" }, { 35, "Stranglethorn Vale" } },
  Orc = { { 1, "Durotar" }, { 11, "The Barrens" }, { 16, "Stonetalon Mountains" }, { 20, "The Barrens" }, { 22, "Ashenvale" },
    { 25, "Thousand Needles" }, { 28, "Hillsbrad Foothills" }, { 31, "Arathi Highlands" }, { 35, "Stranglethorn Vale" } },
  Dwarf = { { 1, "Dun Morogh" }, { 11, "Loch Modan" }, { 14, "Westfall" }, { 18, "Redridge Mountains" }, { 21, "Wetlands" },
    { 25, "Duskwood" }, { 28, "Hillsbrad Foothills" }, { 31, "Arathi Highlands" }, { 35, "Stranglethorn Vale" } },
}
ROUTES.Troll = ROUTES.Orc
local route = ROUTES[race] or ROUTES.Tauren
local CITY = { Tauren = "Thunder Bluff", Orc = "Orgrimmar", Troll = "Orgrimmar", Dwarf = "Ironforge" }
local function zoneAt(l) local z for _, r in ipairs(route) do if l >= r[1] then z = r[2] end end return z end

local SF = {}
for _, f in ipairs({ "Data.lua", "Locale.lua", "Core.lua" }) do assert(loadfile(dir .. f))("ShamanForever", SF) end
local ev = frames[1]
ShamanForeverCharDB = { spec = spec, setupDone = true }
ev:fire("ADDON_LOADED", "ShamanForever")

local TO = tonumber(os.getenv("TO") or "30")
local worst, total = 0, 0
print(race .. " " .. spec .. ": por nivel, líneas de chat · filas en la ventana")
for l = 1, TO do
  level = l
  wipe(chat)
  if l > 1 then ev:fire("PLAYER_LEVEL_UP", l) end
  local z = zoneAt(l)
  if z ~= zone then zone = z; SF.test.onZone() end
  -- What pops up by itself (on level up, in the zone you're in).
  local function heads(list, n)
    local h = {}
    for i, t in ipairs(list) do if i <= n then h[#h + 1] = (t.head:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end end
    return table.concat(h, " / ")
  end
  local pop = SF.test.zoneTips()
  local tips = SF.test.upcoming()
  print(string.format("%2d %-22s chat %d · ventana %2d   %s", l, zone, #chat, #tips, heads(tips, 4)))
  if #pop > 0 then print("       salta acá: " .. heads(pop, 6)) end
  for _, m in ipairs(chat) do print("       > " .. m) end
  if #chat > worst then worst = #chat end
  total = total + #chat
  -- The player does the quests of the tips at their level as they go, the
  -- totem quests too, and visits the trainer on every even level.
  for _, t in ipairs(tips) do if t.q and (t.order or 99) <= l then completed[t.q] = true end end
  for _, c in ipairs(SF.DATA.classq) do
    for _, t in ipairs(tips) do if t.key == "cq" .. c.e and l >= c.l then owned[c.item] = true end end
  end
  -- Every even level: to the capital to train, and back.
  if l % 2 == 0 and l >= 4 then
    wipe(chat)
    zone = CITY[race] or "Orgrimmar"; SF.test.onZone()
    local here = SF.test.zoneTips()
    print(string.format("   en %s: chat %d · salta: %s", zone, #chat, heads(here, 6)))
    for _, m in ipairs(chat) do print("       > " .. m) end
    for _, t in ipairs(here) do if t.q then completed[t.q] = true end end
    ev:fire("TRAINER_SHOW")
    zone = z; SF.test.onZone()
  end
end
print(string.format("chat: %d líneas en total, máximo %d en un nivel", total, worst))
