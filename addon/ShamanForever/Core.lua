-- Shaman: Forever, the in-game side of https://lernok.github.io/shaman-forever/
-- It warns, it never leads: a few levels before a quest or a vendor gives you
-- an upgrade (the site's gear path, Data.lua), when you walk into a zone that
-- has one or that gives quests for a dungeon coming up, and when you enter a
-- dungeon (what its bosses and quests give that beats what you wear). A tip
-- shows by itself once; "Done" hides it for good. On level up it also says
-- where the talent point goes. It keeps a log of levels, zones, dungeons and
-- quests for the planner's research.
local ADDON, SF = ...
local D = SF.DATA

-- Saved state: account (language) and character (spec, tips seen and done,
-- the log).
local db, cdb
local DEFAULTS = { spec = "Enhancement", lead = 2, quiet = false, talents = true }
local LOG_MAX = 3000
-- Path pieces this many levels behind you aren't worth going back for.
local STALE = 6
local QUEST_ICON = "Interface\\GossipFrame\\AvailableQuestIcon"

local function L() return SF.L[(db and db.lang) or ((GetLocale() or ""):sub(1, 2) == "es" and "es" or "en")] end
local function lang() return L() == SF.L.es and "es" or "en" end
local function say(msg) DEFAULT_CHAT_FRAME:AddMessage("|cff0070ddShaman: Forever|r " .. msg) end
local function num(x)
  local s = string.format("%.1f", x)
  if lang() == "es" then s = s:gsub("%.", ",") end
  return s
end

-- Game API, old or new names. Forever has retail-style combat restrictions:
-- some values come back "secret" and can't be compared; those read as nil.
local Api = {}
local function readable(v)
  if v ~= nil and issecretvalue and issecretvalue(v) then return nil end
  return v
end
function Api.questDone(id)
  if not id then return false end
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then return C_QuestLog.IsQuestFlaggedCompleted(id) and true or false end
  return IsQuestFlaggedCompleted and IsQuestFlaggedCompleted(id) and true or false
end
function Api.onQuest(id)
  if not id then return false end
  if C_QuestLog and C_QuestLog.IsOnQuest then return C_QuestLog.IsOnQuest(id) and true or false end
  if C_QuestLog and C_QuestLog.GetLogIndexForQuestID then return C_QuestLog.GetLogIndexForQuestID(id) ~= nil end
  return GetQuestLogIndexByID and (GetQuestLogIndexByID(id) or 0) > 0 or false
end
function Api.questName(id)
  local f = C_QuestLog and C_QuestLog.GetTitleForQuestID
  local name = f and readable(f(id))
  return name or (D.qnames and D.qnames[id]) or ("#" .. tostring(id))
end
function Api.questXP(id)
  if Api.onQuest(id) and GetQuestLogRewardXP then
    local xp = readable(GetQuestLogRewardXP(id))
    if type(xp) == "number" and xp > 0 then return xp end
  end
  local e = D.qxp and D.qxp[id]
  if not e then return nil end
  local lvl = UnitLevel("player")
  if lvl >= 60 then return 0 end
  local mult = math.max(1, math.min(10, 2 * (e[1] - lvl) + 20))
  local xp = e[2] * mult / 10
  if xp <= 100 then xp = 5 * math.floor((xp + 2) / 5)
  elseif xp <= 500 then xp = 10 * math.floor((xp + 5) / 10)
  elseif xp <= 1000 then xp = 25 * math.floor((xp + 12) / 25)
  else xp = 50 * math.floor((xp + 25) / 50) end
  return xp
end
function Api.count(id)
  if C_Item and C_Item.GetItemCount then return C_Item.GetItemCount(id, true) or 0 end
  return GetItemCount and GetItemCount(id, true) or 0
end
function Api.itemName(id)
  local name = ((C_Item and C_Item.GetItemInfo) or GetItemInfo)(id)
  return name or D.names[id] or ("#" .. id)
end
function Api.icon(id)
  if C_Item and C_Item.GetItemIconByID then return C_Item.GetItemIconByID(id) end
  return GetItemIcon and GetItemIcon(id) or 134400
end
function Api.stats(link)
  local f = (C_Item and C_Item.GetItemStats) or GetItemStats
  return f and f(link) or nil
end
function Api.areaName(id)
  return C_Map and C_Map.GetAreaInfo and C_Map.GetAreaInfo(id) or nil
end
function Api.version()
  local f = (C_AddOns and C_AddOns.GetAddOnMetadata) or GetAddOnMetadata
  return f and f(ADDON, "Version") or "?"
end

-- The spec's index in the data's value lists.
local function specIndex()
  for i, s in ipairs(D.specs) do if s == cdb.spec then return i end end
  return 1
end
local function specName() return L().specs[cdb.spec] or cdb.spec end

-- Race -> the site's race of the path (unknown races: Orc's, same continent).
local RACE = { Orc = "Orc", Troll = "Troll", Tauren = "Tauren", Dwarf = "Dwarf" }
local function myPath()
  local _, token = UnitRace("player")
  local race = RACE[token or ""]
  local low = (token or ""):lower()
  if not race and (low:find("sky") or low:find("wind")) then race = "Skyborne (Windshaper)" end
  if not race then
    if not SF.raceWarned then say(string.format(L().unknownRace, tostring(token))); SF.raceWarned = true end
    race = "Orc"
  end
  return (D.paths[race] or D.paths.Orc)[cdb.spec] or {}
end
local function myFaction() return (UnitFactionGroup("player") or ""):lower() end
-- Your race as the data's letter (Orc, Troll, taUren, Dwarf, Skyborne).
local function raceLetter()
  local _, token = UnitRace("player")
  local low = (token or ""):lower()
  if low:find("sky") or low:find("wind") then return "S" end
  return ({ orc = "O", troll = "T", tauren = "U", dwarf = "D" })[low] or "O"
end

-- Equipment slots of each slot of the path.
local INV = {
  Weapon = { 16 }, Head = { 1 }, Neck = { 2 }, Shoulder = { 3 }, Back = { 15 }, Chest = { 5 }, Wrist = { 9 },
  Hands = { 10 }, Waist = { 6 }, Legs = { 7 }, Feet = { 8 }, Finger = { 11, 12 }, Trinket = { 13, 14 },
  ["Off Hand"] = { 17 }, Relic = { 18 },
}
-- Stat keys of GetItemStats, for pieces the site doesn't know (random
-- "of the Bear" greens): the same weights as the site's gear path.
local STAT = {
  ITEM_MOD_STRENGTH_SHORT = "strength", ITEM_MOD_AGILITY_SHORT = "agility", ITEM_MOD_STAMINA_SHORT = "stamina",
  ITEM_MOD_INTELLECT_SHORT = "intellect", ITEM_MOD_SPIRIT_SHORT = "spirit", ITEM_MOD_ATTACK_POWER_SHORT = "attackPower",
  ITEM_MOD_SPELL_POWER_SHORT = "spellPower", ITEM_MOD_SPELL_DAMAGE_DONE_SHORT = "spellDamage",
  ITEM_MOD_SPELL_HEALING_DONE_SHORT = "healing", ITEM_MOD_MANA_REGENERATION_SHORT = "mp5", ITEM_MOD_POWER_REGEN0_SHORT = "mp5",
  ITEM_MOD_CRIT_RATING_SHORT = "crit", ITEM_MOD_CRIT_MELEE_RATING_SHORT = "crit", ITEM_MOD_HIT_RATING_SHORT = "hit",
  ITEM_MOD_HIT_MELEE_RATING_SHORT = "hit", ITEM_MOD_CRIT_SPELL_RATING_SHORT = "spellCrit", ITEM_MOD_HIT_SPELL_RATING_SHORT = "spellHit",
}
local function estimate(link, slot)
  local st = link and Api.stats(link)
  if not st then return 0 end
  local spec = cdb.spec
  if slot == "Weapon" and spec == "Enhancement" then return st.ITEM_MOD_DAMAGE_PER_SECOND_SHORT or 0 end
  local w, v = D.weights[spec], 0
  for k, n in pairs(st) do
    local s = STAT[k]
    if s and D.cost[s] then v = v + n * D.cost[s] * (w[s] or 0) end
  end
  return v
end

-- Worth of an item to your spec (0 = not for you), and of what you wear in
-- that slot (rings and trinkets: the weaker of the two).
local function value(id)
  local it = D.items[id]
  return it and it.v[specIndex()] or 0
end
-- The best piece per slot in your bags that you can wear now or within your
-- lead (only slots with one place: rings and trinkets go in pairs). Read again
-- when your bags change.
local bagBest
local function bagValue(slot)
  if not bagBest then
    bagBest = {}
    local num = (C_Container and C_Container.GetContainerNumSlots) or GetContainerNumSlots
    local item = (C_Container and C_Container.GetContainerItemID) or GetContainerItemID
    local lvl = UnitLevel("player")
    if num and item then
      for bag = 0, 4 do
        for i = 1, (readable(num(bag)) or 0) do
          local id = readable(item(bag, i))
          local it = id and D.items[id]
          if it and #(INV[it.s] or {}) == 1 and it.r <= lvl + cdb.lead and not (it.m and lvl < 40) then
            local v = value(id)
            if v > (bagBest[it.s] or 0) then bagBest[it.s] = v end
          end
        end
      end
    end
  end
  return bagBest[slot] or 0
end
local function wornValue(slot)
  local best
  for _, inv in ipairs(INV[slot] or {}) do
    local id = readable(GetInventoryItemID("player", inv))
    local v = 0
    if id then v = D.items[id] and value(id) or estimate(readable(GetInventoryItemLink("player", inv)), slot) end
    if best == nil or v < best then best = v end
  end
  return math.max(best or 0, bagValue(slot))
end
local function owned(id) return Api.count(id) > 0 end

-- How much better than what you wear; nil if not an upgrade.
local function gain(id)
  local it = D.items[id]
  if not it then return nil end
  local lvl = UnitLevel("player")
  if it.m and lvl < 40 then return nil end
  local v = value(id)
  if v <= 0 or owned(id) then return nil end
  local cur = wornValue(it.s)
  if cur > 0 and v < cur * D.upgrade then return nil end
  return { v = v, cur = cur, slot = it.s }
end

-- Zones: the data's English names and AreaTable ids, as the game names them
-- in your language.
local zoneNames, areaNames
local function zoneName(z)
  if not zoneNames then
    zoneNames = {}
    for name, id in pairs(D.zones) do zoneNames[name] = Api.areaName(id) or name end
  end
  return zoneNames[z] or z
end
local function areaName(id)
  if not id then return nil end
  if not areaNames then
    areaNames = {}
    for name, zid in pairs(D.zones) do areaNames[zid] = name end
  end
  return Api.areaName(id) or areaNames[id]
end
local function here() return readable(GetRealZoneText()) or "" end
-- A spot's zone name: our zone ids (z), else a map id (map, from Polestar).
local function spotZone(g)
  local n = areaName(g.z)
  if not n and g.map and C_Map and C_Map.GetMapInfo then
    local ok, info = pcall(C_Map.GetMapInfo, g.map)
    n = ok and type(info) == "table" and readable(info.name) or nil
  end
  return n or "?"
end
local CONTINENT_MAPS = { [1414] = 1, [1415] = 0 }
local function myContinent()
  local z = here()
  for name, id in pairs(D.zones) do
    if D.cont[id] and zoneName(name) == z then return D.cont[id] end
  end
  if C_Map and C_Map.GetBestMapForUnit and C_Map.GetMapInfo then
    local map = readable(C_Map.GetBestMapForUnit("player"))
    for _ = 1, 6 do
      if not map then break end
      if CONTINENT_MAPS[map] then return CONTINENT_MAPS[map] end
      local info = C_Map.GetMapInfo(map)
      map = info and info.parentMapID
    end
  end
end

-- A tip marked done ("Listo") or dismissed (the cross): not shown again.
local function off(key) return cdb.done[key] or cdb.gone[key] end

-- Who gives a quest, in one line; and a waypoint to them.
local function giverText(g)
  if not g then return nil end
  if g.item then return type(g.item) == "string" and string.format(L().startsWith, g.item) or L().startsWithAny end
  if g.inside then return string.format(L().givenInside, g.n) end
  if g.entrance and g.x then return string.format(L().entranceAt, spotZone(g), math.floor(g.x + 0.5), math.floor(g.y + 0.5)) end
  if g.x then return string.format(L().givenAt, g.n, spotZone(g), math.floor(g.x + 0.5), math.floor(g.y + 0.5)) end
  return string.format(L().givenBy, g.n)
end
local function waypoint(g, title)
  if not g or not g.x or not (g.z or g.map) then return end
  local map = g.map or D.uiMaps[g.z]
  if map and cdb.tomtom and TomTom and TomTom.AddWaypoint then
    TomTom:AddWaypoint(map, g.x / 100, g.y / 100, { title = title, from = "Shaman: Forever" })
    say(string.format(L().arrowSet, title))
    return
  end
  if map and C_Map and C_Map.SetUserWaypoint and UiMapPoint then
    local ok = pcall(function()
      -- Only the pin: super-tracking it is protected on Forever and can be
      -- blocked silently ("Interface action failed because of an AddOn").
      C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(map, g.x / 100, g.y / 100))
    end)
    if ok then
      say(string.format(L().pinSet, title))
      if not InCombatLockdown() then
        pcall(function()
          if OpenWorldMap then OpenWorldMap(map)
          elseif WorldMapFrame then ShowUIPanel(WorldMapFrame); WorldMapFrame:SetMapID(map) end
        end)
      end
      return
    end
  end
  -- No map for that zone: say it in chat.
  if g.x then say(string.format("%s: %s · %s (%d, %d)", title, g.n, spotZone(g), math.floor(g.x + 0.5), math.floor(g.y + 0.5)))
  else say(giverText(g)) end
end

-- Tips -------------------------------------------------------------------------
-- Each one: key (seen/done), item or icon, three lines, giver, order.
-- "+35%", or "much better (x12)" from double up: a white belt with 1 stat
-- against one with 12 is +1100%, true but meaningless.
local function pctText(v, cur, fmt)
  local pct = (v / cur - 1) * 100
  if pct >= 100 then return string.format(L().muchBetter, v / cur) end
  return string.format(fmt, math.floor(pct + 0.5))
end
local function gainText(g)
  if g.cur <= 0 then return L().gainNew end
  if g.slot == "Weapon" and cdb.spec == "Enhancement" then return string.format(L().gainDps, num(g.v), num(g.cur)) end
  return pctText(g.v, g.cur, L().gainPct)
end

-- Your crafting professions: { English name = { name (yours), skill, max } }.
-- Skill line ids; the names of the old API in English and Spanish as backup.
local PROF_IDS = { [164] = "Blacksmithing", [165] = "Leatherworking", [197] = "Tailoring", [202] = "Engineering",
  [171] = "Alchemy", [333] = "Enchanting" }
local PROF_NAMES = { Blacksmithing = "Blacksmithing", Leatherworking = "Leatherworking", Tailoring = "Tailoring",
  Engineering = "Engineering", Alchemy = "Alchemy", Enchanting = "Enchanting", ["Herrería"] = "Blacksmithing",
  ["Peletería"] = "Leatherworking", ["Sastrería"] = "Tailoring", ["Ingeniería"] = "Engineering", Alquimia = "Alchemy",
  Encantamiento = "Enchanting" }
local function myProfessions()
  local out = {}
  if GetProfessions and GetProfessionInfo then
    local a, b = GetProfessions()
    for _, i in ipairs({ readable(a) or 0, readable(b) or 0 }) do
      if i and i > 0 then
        local name, _, skill, max, _, _, line = GetProfessionInfo(i)
        local en = PROF_IDS[readable(line) or 0] or PROF_NAMES[readable(name) or ""]
        if en then out[en] = { name = readable(name) or en, skill = readable(skill) or 0, max = readable(max) or 0 } end
      end
    end
  elseif GetNumSkillLines and GetSkillLineInfo then
    for i = 1, GetNumSkillLines() do
      local name, header, _, skill, _, _, max = GetSkillLineInfo(i)
      local en = not header and PROF_NAMES[name or ""]
      if en then out[en] = { name = name, skill = skill or 0, max = max or 0 } end
    end
  end
  return out
end

-- Every profession you have, gathering and secondary ones too: { English name = true }.
local ALL_PROF_IDS = { [164] = "Blacksmithing", [165] = "Leatherworking", [197] = "Tailoring", [202] = "Engineering",
  [171] = "Alchemy", [333] = "Enchanting", [182] = "Herbalism", [186] = "Mining", [393] = "Skinning", [356] = "Fishing",
  [185] = "Cooking", [129] = "First Aid" }
local ALL_PROF_NAMES = { ["Herbalism"] = "Herbalism", ["Mining"] = "Mining", ["Skinning"] = "Skinning", ["Fishing"] = "Fishing",
  ["Cooking"] = "Cooking", ["First Aid"] = "First Aid", ["Herboristería"] = "Herbalism", ["Minería"] = "Mining",
  ["Desuello"] = "Skinning", ["Pesca"] = "Fishing", ["Cocina"] = "Cooking", ["Primeros auxilios"] = "First Aid" }
local function allProfessions()
  local out = {}
  for en in pairs(myProfessions()) do out[en] = true end
  if GetProfessions and GetProfessionInfo then
    for _, i in ipairs({ GetProfessions() }) do
      i = readable(i)
      if i and i > 0 then
        local name, _, _, _, _, _, line = GetProfessionInfo(i)
        local en = ALL_PROF_IDS[readable(line) or 0] or ALL_PROF_NAMES[readable(name) or ""] or PROF_NAMES[readable(name) or ""]
        if en then out[en] = true end
      end
    end
  elseif GetNumSkillLines and GetSkillLineInfo then
    for i = 1, GetNumSkillLines() do
      local name, header = GetSkillLineInfo(i)
      local en = not header and (ALL_PROF_NAMES[name or ""] or PROF_NAMES[name or ""])
      if en then out[en] = true end
    end
  end
  return out
end

-- Forever's profession tutorial ("Camping 101: <profession>") of each of
-- your professions, at the camp of your start (another start's, if not).
local function campTips()
  local tips, lvl, letter, z = {}, UnitLevel("player"), raceLetter(), here()
  local START = { U = "Mulgore", O = "Durotar", T = "Durotar", D = "Dun Morogh", S = "Zephras Isle" }
  for prof in pairs(allProfessions()) do
    local best
    for _, e in ipairs(D.camp and D.camp[prof] or {}) do
      if not Api.questDone(e.q) and not Api.onQuest(e.q) and (e.l or 1) <= lvl + 1 and (not e.r or e.r:find(letter, 1, true)) then
        -- The camp where you are, else your race's start.
        local gz = areaName((D.givers[e.q] or {}).z)
        local score = (gz == z and 2 or 0) + (gz == START[letter] and 1 or 0)
        if not best or score > best.score then best = { e = e, score = score } end
      end
    end
    if best then
      local e, g = best.e, D.givers[best.e.q]
      local key = "p" .. e.q
      if g and not off(key) then
        tips[#tips + 1] = { key = key, icon = QUEST_ICON, head = string.format(L().campHead, L().profNames[prof] or prof),
          src = string.format(L().pickup, D.qnames[e.q] or "Camping 101"), gain = giverText(g) or "", giver = g,
          title = D.qnames[e.q], order = e.l or lvl, q = e.q, cat = "prof", onRoute = true }
      end
    end
  end
  return tips
end

local routeCache, refresh
local function polestar()
  local P = rawget(_G, "Polestar")
  return type(P) == "table" and P or nil
end
-- Our data's name for a dungeon of Polestar's ("Scarlet Monastery:
-- Graveyard" is our "Scarlet Monastery").
local function ourDungeon(name)
  if D.dungeons[name] or D.dquests[name] then return name end
  local base = name:match("^(.-):")
  if base and (D.dungeons[base] or D.dquests[base]) then return base end
  return name
end
-- A dungeon a route step is about: our packs' "Dungeon: <name> (level N)"
-- steps, else a step doing a dungeon quest's objectives (Polestar's guides).
local function stepDungeon(step)
  local title = type(step.title) == "string" and step.title or ""
  local name, lv = title:match("^Dungeon: (.-) %(level ([%d%.]+)%)")
  if lv then lv = math.floor(tonumber(lv) or 0) end
  if not name then name = title:match("^Dungeon: (.+)$") end
  if name then return name, tonumber(lv), true end
  for _, goal in ipairs(type(step.goals) == "table" and step.goals or {}) do
    local gr = type(goal.group) == "table" and goal.group
    if gr and gr.kind == "dungeon" and type(gr.name) == "string" and goal.t == "complete" then return gr.name end
  end
  return nil
end
-- What's left of your Polestar route: the open guide from its current step,
-- then the guides it leads to (`next`). quests: quest id -> the guide it's
-- in; dungeons: the dungeon steps in order; now: the dungeon of the current
-- step. nil without Polestar (or with it turned off in our options).
local function routeInfo()
  local P = polestar()
  if not P or cdb.polestar == false or not (P.Engine and P.Engine.GetGuide) then return nil end
  local ok, g = pcall(P.Engine.GetGuide)
  if not ok or type(g) ~= "table" or type(g.steps) ~= "table" then return nil end
  local ok2, at = pcall(P.Engine.GetStepIndex or function() return 1 end)
  at = ok2 and tonumber(at) or 1
  if routeCache and routeCache.guide == g and routeCache.at == at then return routeCache end
  local info = { guide = g, at = at, quests = {}, dungeons = {} }
  local seen, seenD, i = {}, {}, at
  while g and not seen[g] do
    seen[g] = true
    for si = math.max(i, 1), #g.steps do
      local step = g.steps[si]
      if type(step) == "table" then
        local dn, lv, ours = stepDungeon(step)
        if dn and g == info.guide and si == at then info.now, info.nowData = dn, ourDungeon(dn) end
        if dn and not seenD[dn] then
          seenD[dn] = true
          local spot
          for _, goal in ipairs(type(step.goals) == "table" and step.goals or {}) do
            if ours and goal.t == "goto" and goal.map and goal.x then spot = { map = goal.map, x = goal.x, y = goal.y, n = dn, entrance = true } break end
          end
          local our = ourDungeon(dn)
          info.dungeons[#info.dungeons + 1] = { name = dn, data = our, level = lv or (D.dlevels[dn] and D.dlevels[dn][1]) or (D.dlevels[our] and D.dlevels[our][1]), guide = g, spot = spot }
        end
        for _, goal in ipairs(type(step.goals) == "table" and step.goals or {}) do
          if type(goal.quest) == "number" and not info.quests[goal.quest] then info.quests[goal.quest] = g end
        end
      end
    end
    local nx = g.next
    if type(nx) == "table" then nx = nx[1]; if type(nx) == "table" then nx = nx.id end end
    local ok3, ng = false, nil
    if type(nx) == "string" and P.Guides and P.Guides.Get then ok3, ng = pcall(P.Guides.Get, nx) end
    g = ok3 and type(ng) == "table" and type(ng.steps) == "table" and ng or nil
    i = 1
  end
  routeCache = info
  return info
end
local function polestarGear()
  local P = polestar()
  if not P or not (P.Gear and P.Gear.IsEnabled) then return false end
  local ok, on = pcall(P.Gear.IsEnabled)
  return ok and on and true or false
end

-- Upgrades on your gear path from now to `lead` levels ahead.
local function pathTips(filter)
  local lvl, tips = UnitLevel("player"), {}
  for _, st in ipairs(myPath()) do
    if st.l - cdb.lead <= lvl and lvl < st.u and st.l > lvl - STALE and not Api.questDone(st.q) then
      local g = gain(st.i)
      local key = st.q and ("q" .. st.q .. ":" .. st.i) or ("i" .. st.i)
      if g and not off(key) and (not filter or filter(st)) then
        local src
        if st.a == "vendor" then src = string.format(L().vendor, st.k or "?") .. " · " .. zoneName(st.z)
        elseif st.a == "class" then src = string.format(L().classQuest, st.qn or "?")
        elseif st.a == "dquest" then src = string.format(L().dquest, st.z, st.qn or "?")
        else src = string.format(L().quest, st.qn or "?") .. " · " .. zoneName(st.z) end
        local head = st.l <= lvl and string.format(L().levelNow, st.l) or string.format(L().levelIn, st.l, st.l - lvl)
        local giver = st.q and D.givers[st.q]
        local where = st.a == "dquest" and D.dcont[st.z] or (D.zones[st.z] and D.cont[D.zones[st.z]]) or (giver and giver.z and D.cont[giver.z])
        tips[#tips + 1] = { key = key, item = st.i, head = head .. " · " .. Api.itemName(st.i), src = src, gain = gainText(g),
          giver = giver, title = st.qn, order = st.l, q = st.q,
          cat = st.a == "dquest" and "dungeon" or "world", where = where, offRoute = st.a == "quest",
          dungeon = st.a == "dquest" and st.z or nil, kind = st.a,
          pct = g.cur > 0 and (g.v / g.cur - 1) or 0.25 }
      end
    end
  end
  return tips
end

-- Dungeon quests to pick up before a dungeon of your level: a few levels
-- before its range up to its end. Quests you can't start yet (a chain) point
-- to where the chain starts. inZone: only those given in the zone you're in.
local function pickupTips(inZone)
  local lvl, faction, tips, seenKey = UnitLevel("player"), myFaction(), {}, {}
  local z = inZone and here()
  for dname, list in pairs(D.dquests) do
    local lv = D.dlevels[dname]
    if lv and lvl >= lv[1] - cdb.lead - 1 and lvl <= lv[2] then
      -- inList: quests of this dungeon; nextOf: the one each quest leads to.
      local inList, nextOf = {}, {}
      for _, e in ipairs(list) do inList[e.q] = true; if e.p then nextOf[e.p] = e end end
      for _, e in ipairs(list) do
        if (not e.f or e.f == faction) and (e.r or 0) <= lvl + cdb.lead and not Api.questDone(e.q) and not Api.onQuest(e.q) then
          local target, chain = e, nil
          if e.p and not Api.questDone(e.p) then
            if inList[e.p] or Api.onQuest(e.p) then target = nil
            else
              local last = e
              while nextOf[last.q] do last = nextOf[last.q] end
              target, chain = { q = e.p, qn = e.pn }, last.qn
            end
          end
          local g = target and D.givers[target.q]
          local key = target and ("k" .. target.q)
          if target and g and not g.inside and not g.item and not off(key) and not seenKey[key]
            and (not inZone or (g.z and areaName(g.z) == z)) then
            seenKey[key] = true
            local src = string.format(L().pickup, target.qn or "?")
            if chain and chain ~= target.qn then src = src .. " " .. string.format(L().chainTo, chain) end
            local third = giverText(g)
            if (e.r or 0) > lvl then third = third .. " · " .. string.format(L().fromLevel, e.r) end
            tips[#tips + 1] = { key = key, icon = QUEST_ICON, head = string.format(L().forDungeon, dname, lv[1], lv[2]),
              src = src, gain = third, giver = g, title = target.qn, order = lv[1], q = target.q,
              cat = "dungeon", where = D.dcont[dname] }
          end
        end
      end
    end
  end
  return tips
end

-- The dungeon you're in: its name in the data, or nil.
local function currentDungeon()
  local name, kind, _, _, _, _, _, id = GetInstanceInfo()
  if kind ~= "party" then return nil end
  if id and D.instances[id] then return D.instances[id] end
  if name and (D.dungeons[name] or D.dquests[name]) then return name end
  return nil
end

local function dungeonTips(name)
  local d, tips, lvl, faction = D.dungeons[name] or { drops = {}, quests = {} }, {}, UnitLevel("player"), myFaction()
  -- Its quests: how many you carry; the missing ones in the row's tooltip.
  -- Steps of a chain (a quest another one of the list needs first) count as
  -- the chain's last quest.
  local have, missing, isPre = 0, {}, {}
  for _, e in ipairs(D.dquests[name] or {}) do if e.p then isPre[e.p] = true end end
  for _, e in ipairs(D.dquests[name] or {}) do
    if (not e.f or e.f == faction) and (e.r or 0) <= lvl and not isPre[e.q] and not Api.questDone(e.q) then
      if Api.onQuest(e.q) then have = have + 1
      else
        local g = D.givers[e.q]
        missing[#missing + 1] = e.qn .. (g and (g.item or g.inside) and (" (" .. giverText(g) .. ")") or "")
      end
    end
  end
  if have + #missing > 0 then
    tips[#tips + 1] = { key = "s" .. name .. ":" .. lvl, icon = QUEST_ICON, head = string.format(L().carrying, have, have + #missing),
      src = #missing > 0 and string.format(L().missingN, #missing) or L().allQuests, gain = "", lines = missing, order = -1e9 }
  end
  -- Quest rewards: the best of each quest for you, whether you carry it.
  local best = {}
  for _, q in ipairs(d.quests) do
    if (not q.f or q.f == faction) and not Api.questDone(q.q) then
      local g = gain(q.i)
      if g and (not best[q.q] or g.v > best[q.q].g.v) then best[q.q] = { q = q, g = g } end
    end
  end
  for qid, b in pairs(best) do
    local key = "q" .. qid .. ":" .. b.q.i
    if not off(key) then
      local has = Api.onQuest(qid)
      tips[#tips + 1] = { key = key, item = b.q.i, head = Api.itemName(b.q.i), src = string.format(L().quest, b.q.qn)
        .. " · " .. (has and ("|cff40ff40" .. L().haveIt .. "|r") or ("|cffff6060" .. L().missing .. "|r")),
        gain = gainText(b.g), giver = D.givers[qid], title = b.q.qn, order = -b.g.v / math.max(b.g.cur, 1), q = qid }
    end
  end
  -- Boss drops you can wear soon.
  for _, dr in ipairs(d.drops) do
    local it = D.items[dr.i]
    local key = "d" .. dr.i
    if it and it.r <= lvl + 3 and not off(key) then
      local g = gain(dr.i)
      if g then
        tips[#tips + 1] = { key = key, item = dr.i, head = Api.itemName(dr.i), src = string.format(L().boss, dr.b or "?"),
          gain = gainText(g), order = -g.v / math.max(g.cur, 1) }
      end
    end
  end
  for _, t in ipairs(tips) do t.cat = "dungeon" end
  table.sort(tips, function(a, b) return a.order < b.order end)
  return tips
end

-- The next dungeon of your Polestar route, in one row at the top: its
-- level, the quests to take there and the upgrades it has for you (all in
-- the row's tooltip). The click marks its entrance.
local function nextDungeonTip(info)
  local nd = info and info.dungeons[1]
  if not nd or nd.name == info.now then nd = info and info.dungeons[nd and 2 or 1] end
  if not nd then return nil end
  local lvl = UnitLevel("player")
  -- Only when it's close: a dungeon ten levels away is no news.
  if nd.level and nd.level - lvl > cdb.lead + 2 then return nil end
  local head = nd.level and string.format(L().nextDungeon, nd.name, nd.level) or string.format(L().nextDungeonNoLevel, nd.name)
  if nd.level and nd.level > lvl then head = head .. " · " .. (nd.level - lvl == 1 and L().levelToGo or string.format(L().levelsToGo, nd.level - lvl)) end
  local src, lines, ups = L().noQuestsYet, {}, 0
  for _, t in ipairs(dungeonTips(nd.data or nd.name)) do
    if t.key:sub(1, 1) == "s" then
      src = t.head
      for _, l in ipairs(t.lines or {}) do lines[#lines + 1] = "· " .. l end
    elseif t.item then
      ups = ups + 1
      lines[#lines + 1] = "+ " .. t.head .. " (" .. t.gain .. ")"
    end
  end
  local where = type(nd.guide.title) == "string" and string.format(L().inGuide, nd.guide.title) or nil
  return { key = "n" .. nd.name, icon = "Interface\\Icons\\INV_Misc_Map_01", head = head, src = src,
    gain = (ups > 0 and string.format(L().upgradesN, ups) or L().noUpgrades) .. (where and (" · " .. where) or ""),
    lines = lines, giver = nd.spot, title = nd.name, order = -1e9, cat = "dungeon", where = D.dcont[nd.name], pinned = true,
    skip = nd.name }
end

-- The routes of a pack: its guides "<pack>/<tag>-NN-zone" by tag (the main
-- route has none; variants like "sin-wc" skip or add dungeons), in order,
-- with the dungeons each route runs.
local function routeTag(rest) return rest:match("^(.-)%-?%d%d%-") end
local function packRoutes(packId)
  local P = polestar()
  if not (P and P.Guides and P.Guides.List and P.Guides.Get) then return nil end
  local ok, list = pcall(P.Guides.List)
  if not ok or type(list) ~= "table" then return nil end
  local routes = {}
  for _, h in ipairs(list) do
    local id = type(h) == "table" and h.id
    if type(id) == "string" and id:sub(1, #packId + 1) == packId .. "/" then
      local rest = id:sub(#packId + 2)
      local tag, nn = rest:match("^(.-)%-?(%d%d)%-")
      if nn then
        local r = routes[tag] or { tag = tag, guides = {}, dungeons = {}, folder = h.folder }
        routes[tag] = r
        r.guides[#r.guides + 1] = { id = id, n = tonumber(nn), min = tonumber(h.minLevel), max = tonumber(h.maxLevel), map = tonumber(h.zone) }
      end
    end
  end
  for _, r in pairs(routes) do
    table.sort(r.guides, function(a, b) return a.n < b.n end)
    for _, gh in ipairs(r.guides) do
      local ok2, g = pcall(P.Guides.Get, gh.id)
      for _, st in ipairs(ok2 and type(g) == "table" and type(g.steps) == "table" and g.steps or {}) do
        local dn = type(st) == "table" and stepDungeon(st)
        if dn then r.dungeons[dn] = true end
      end
    end
  end
  return routes
end

-- "Skip this dungeon": the pack's route without it that keeps most of the
-- rest of yours, opened in Polestar at the guide for your level. Polestar
-- checks off what you already did; our tips follow the new route.
function SF.skipDungeon(name)
  local info, P = routeInfo(), polestar()
  local gid = info and type(info.guide.id) == "string" and info.guide.id
  local packId = gid and gid:match("^([^/]+)/")
  local routes = packId and packRoutes(packId)
  if not routes or not (P.Engine and P.Engine.SetGuide) then say(L().noRoute) return end
  local cur = routes[routeTag(gid:sub(#packId + 2)) or ""] or { dungeons = {} }
  local best, score
  for _, r in pairs(routes) do
    if r ~= cur and not r.dungeons[name] then
      local s = 0
      for d in pairs(cur.dungeons) do if d ~= name then s = s + (r.dungeons[d] and 2 or -2) end end
      for d in pairs(r.dungeons) do if not cur.dungeons[d] then s = s - 1 end end
      if not best or s > score then best, score = r, s end
    end
  end
  if not best then
    -- No route without it: at its step, Polestar's own skip moves on.
    if info.now == name and P.Engine.Skip and pcall(P.Engine.Skip) then
      say(string.format(L().stepSkipped, name))
      routeCache = nil
      refresh()
    else say(string.format(L().noVariant, name)) end
    return
  end
  -- The first guide for your level; one in the zone you're in, if the next
  -- few guides have it.
  local lvl, pick = UnitLevel("player"), nil
  local okMap, z = pcall(function() return C_Map and C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player") end)
  z = okMap and z or nil
  local first
  for i, gh in ipairs(best.guides) do
    if (gh.max or 99) >= lvl then
      first = first or i
      if z and gh.map == z and (gh.min or 0) <= lvl + 1 then pick = gh break end
      if i - first >= 3 then break end
    end
  end
  pick = pick or best.guides[first or #best.guides]
  local ok = pick and pcall(P.Engine.SetGuide, pick.id)
  routeCache = nil
  if not ok then say(L().noRoute) return end
  say(string.format(L().routeSwitched, name, best.folder or pick.id))
  refresh()
end

-- Where this level's talent point goes, in the spec's leveling order.
local function talentLine(lvl)
  local t = D.talents[cdb.spec]
  local p = t and t.at[lvl]
  if not p then return nil end
  return string.format(L().talent, lvl, p[1], p[2], p[3], t.name[lang()] or t.name.en)
end

-- The research log: "time|event|level|zone|detail" lines.
local function log(event, detail)
  local l = cdb.log
  l[#l + 1] = table.concat({ time(), event, UnitLevel("player"), here(), detail or "" }, "|")
  while #l > LOG_MAX do table.remove(l, 1) end
end

-- Window -------------------------------------------------------------------------
local show
local frame, rows, logFrame = nil, {}, nil
-- ROWS: rows made (the most a tall window shows); AUTO: rows of a window
-- you never resized. Size bounds: MIN_W..MAX_W, MIN_H..MAX_H.
local ROWS, AUTO, ROW_H, W, TOP = 16, 10, 44, 420, 80
local MIN_W, MAX_W, MIN_H, MAX_H = 340, 900, TOP + 12 + 2 * ROW_H, TOP + 26 + 16 * ROW_H

-- You carry the quest of a tip, or a step of its chain (set further down).
local carrying = function() return false end

local rewardLines, questWorth
-- Beside the window, on the side with room (people keep it in a corner), so
-- the item and its comparison never cover it.
local function rowTooltip(r)
  local tip = r.tip
  GameTooltip:SetOwner(r, "ANCHOR_NONE")
  GameTooltip:ClearAllPoints()
  local dy = (r:GetTop() or 0) - (frame:GetTop() or 0)
  local x = frame:GetCenter() or 0
  if x < (UIParent:GetWidth() or 0) / 2 then GameTooltip:SetPoint("TOPLEFT", frame, "TOPRIGHT", 6, dy)
  else GameTooltip:SetPoint("TOPRIGHT", frame, "TOPLEFT", -6, dy) end
  if tip.item then GameTooltip:SetItemByID(tip.item) else GameTooltip:SetText(tip.head, 1, 0.82, 0) end
  if tip.q and carrying(tip.q) then GameTooltip:AddLine(L().haveQuestTip, 0.4, 0.8, 1) end
  if tip.q and questWorth then
    local lines = questWorth(tip.q)
    if #lines > 0 then
      GameTooltip:AddLine(" ")
      GameTooltip:AddLine(Api.questName(tip.q), 1, 0.82, 0)
      for _, line in ipairs(lines) do GameTooltip:AddLine("  " .. line, 1, 1, 1) end
    end
  end
  for _, line in ipairs(tip.lines or {}) do GameTooltip:AddLine(line, 1, 1, 1) end
  local gt = giverText(tip.giver)
  if gt then
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine(gt, 0.4, 0.8, 1)
    if tip.giver.x then GameTooltip:AddLine(L().clickArrow, 0.6, 0.6, 0.6) end
  end
  if tip.skip then GameTooltip:AddLine(L().skipHint, 0.6, 0.6, 0.6) end
  GameTooltip:Show()
end

-- A tip marked "Listo" (done) or dismissed (gone) is kept with what it
-- showed, for its tab; older saves only have `true` and stay hidden.
local leadLine, xpText
local function inProgress()
  local tips, seen = {}, {}
  for _, st in ipairs(myPath()) do
    if st.q and not seen[st.q] and not Api.questDone(st.q) and carrying(st.q) then
      seen[st.q] = true
      local key = "q" .. st.q .. ":" .. st.i
      if not off(key) then
        local g = gain(st.i)
        local src = st.a == "class" and string.format(L().classQuest, st.qn or "?") or string.format(L().quest, st.qn or "?")
        local worth = g and gainText(g) or leadLine(st.q) or ("|cffaaaaaa" .. L().noLonger .. "|r")
        local xp = xpText(st.q)
        tips[#tips + 1] = { key = key, item = st.i, head = Api.itemName(st.i), src = src, gain = worth .. (xp and (" · " .. xp) or ""),
          giver = D.givers[st.q], title = st.qn, order = st.l, q = st.q }
      end
    end
  end
  for dname, list in pairs(D.dquests or {}) do
    for _, e in ipairs(list) do
      if not seen[e.q] and Api.onQuest(e.q) then
        seen[e.q] = true
        local key = "k" .. e.q
        if not off(key) then
          local lv = D.dlevels[dname] or { e.l or 0, e.l or 0 }
          tips[#tips + 1] = { key = key, icon = QUEST_ICON, head = string.format(L().forDungeon, dname, lv[1], lv[2]),
            src = Api.questName(e.q), gain = xpText(e.q), giver = D.givers[e.q], title = e.qn, order = lv[1], q = e.q }
        end
      end
    end
  end
  table.sort(tips, function(a, b) return a.order < b.order end)
  return tips
end

-- The gear a quest rewards, as lines: "item: +12% over yours" (your race,
-- faction and spec; nothing for pieces nobody in your spec wears).
local function smallestBag()
  local n = GetContainerNumSlots or (C_Container and C_Container.GetContainerNumSlots)
  if not n then return nil end
  local least
  for bag = 1, 4 do
    local slots = readable(n(bag)) or 0
    least = least and math.min(least, slots) or slots
  end
  return least
end
function rewardLines(qid, onlyUpgrades)
  local out = {}
  for _, b in ipairs(D.qbag and D.qbag[qid] or {}) do
    local least = smallestBag()
    local better = least and b[2] > least
    if better or not onlyUpgrades then
      out[#out + 1] = string.format(better and L().bagBetter or L().bagSame, Api.itemName(b[1]), b[2], least or 0)
    end
  end
  local f, me = myFaction():sub(1, 1), raceLetter()
  for _, id in ipairs(D.qr and D.qr[qid] or {}) do
    local ok = false
    for _, e in ipairs(D.iq[id] or {}) do
      if e[1] == qid and (not e[2] or e[2] == f) and (not e[3] or e[3]:find(me, 1, true)) then ok = true end
    end
    if ok and value(id) > 0 then
      local g = gain(id)
      if g or not onlyUpgrades then
        out[#out + 1] = Api.itemName(id) .. ": " .. (g and gainText(g) or (owned(id) and L().haveIt or L().noUpgrade))
      end
    end
  end
  return out
end
-- Quests a step opens further on that reward gear: { step -> { quest… } }.
local leads
local function leadsOf(q)
  if not leads then
    leads = {}
    for r in pairs(D.qr or {}) do
      local seen, p = {}, D.qpre[r]
      while p and not seen[p] do
        seen[p] = true
        for _, a in ipairs(D.qalt and D.qalt[p] or { p }) do
          leads[a] = leads[a] or {}
          table.insert(leads[a], r)
        end
        p = D.qpre[p]
      end
    end
  end
  return leads[q] or {}
end
-- "Leads to <quest>: <item> +12%" when a later step of its chain is an upgrade.
function leadLine(q)
  for _, r in ipairs(leadsOf(q)) do
    if not Api.questDone(r) then
      local up = rewardLines(r, true)
      if #up > 0 then return string.format(L().leadsTo, Api.questName(r), up[1]) end
    end
  end
end
function xpText(q)
  local xp = Api.questXP(q)
  if not xp or xp <= 0 then return nil end
  return string.format(L().xp, BreakUpLargeNumbers and BreakUpLargeNumbers(xp) or tostring(xp))
end
-- What a quest is worth to you, in lines: its gear (or that none helps you
-- any more), the chain's later upgrade, its XP.
function questWorth(q)
  local lines = rewardLines(q)
  local up = rewardLines(q, true)
  if #lines > 0 and #up == 0 then
    local lead = leadLine(q)
    if lead then lines[#lines + 1] = lead end
  elseif #lines == 0 then
    local lead = leadLine(q)
    if lead then lines[#lines + 1] = lead end
  end
  local xp = xpText(q)
  if xp then lines[#lines + 1] = xp end
  return lines
end
-- Hovering an NPC: its quests for you (not done, your race), with their gear,
-- what they lead to and their XP.
local function npcLines(npcId)
  local out = {}
  local me, lvl = raceLetter(), UnitLevel("player")
  for _, qid in ipairs(D.npcq and D.npcq[npcId] or {}) do
    local r = D.qrace and D.qrace[qid]
    local req = D.qreq and D.qreq[qid]
    -- Quests you can take now or within 5 levels.
    if not Api.questDone(qid) and (not r or r:find(me, 1, true)) and (not req or req <= lvl + 5) then
      local lines = questWorth(qid)
      if #lines > 0 then
        local name = Api.questName(qid) .. (Api.onQuest(qid) and (" · " .. L().haveQuestShort) or "")
          .. (req and req > lvl and (" · " .. string.format(L().fromLevel, req)) or "")
        out[#out + 1] = { name, lines }
      end
    end
  end
  return out
end

local render, archive
function archive(tip, kind)
  cdb[kind][tip.key] = { item = tip.item, icon = tip.icon, head = tip.head, src = tip.src, when = time() }
end
-- Hidden tips, newest first: marked done or dismissed (kind says which).
local function archived()
  local list = {}
  for _, kind in ipairs({ "done", "gone" }) do
    for key, v in pairs(cdb[kind]) do
      if type(v) == "table" then
        list[#list + 1] = { key = key, item = v.item, icon = v.icon, head = v.head or key, when = v.when or 0, kind = kind,
          src = (kind == "done" and L().hiddenDone or L().hiddenGone) .. " · " .. (v.src or "") }
      end
    end
  end
  table.sort(list, function(a, b) return a.when > b.when end)
  return list
end

local function makeRow(i)
  local r = CreateFrame("Button", nil, frame)
  r:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  r:SetHeight(ROW_H)
  r:SetPoint("TOPLEFT", 10, -TOP - (i - 1) * ROW_H)
  r:SetPoint("RIGHT", frame, "RIGHT", -10, 0)
  r.have = r:CreateTexture(nil, "BACKGROUND")
  r.have:SetAllPoints()
  r.have:SetColorTexture(0.15, 0.45, 0.75, 0.25)
  r.have:Hide()
  r.icon = r:CreateTexture(nil, "ARTWORK")
  r.icon:SetSize(32, 32)
  r.icon:SetPoint("LEFT", 0, 0)
  local function line(font, anchor, dy)
    local fs = r:CreateFontString(nil, "OVERLAY", font)
    fs:SetPoint("TOPLEFT", anchor, anchor == r.icon and "TOPRIGHT" or "BOTTOMLEFT", anchor == r.icon and 6 or 0, dy)
    fs:SetPoint("RIGHT", -84, 0)
    fs:SetJustifyH("LEFT")
    if fs.SetWordWrap then fs:SetWordWrap(false) end
    return fs
  end
  r.head = line("GameFontNormal", r.icon, 2)
  r.src = line("GameFontHighlightSmall", r.head, -1)
  r.gain = line("GameFontDisableSmall", r.src, -1)
  r.gain:SetTextColor(0.4, 1, 0.4)
  r.check = CreateFrame("CheckButton", nil, r, "UICheckButtonTemplate")
  r.check:SetSize(24, 24)
  r.check:SetPoint("RIGHT", -54, 0)
  r.checkLabel = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  r.checkLabel:SetPoint("LEFT", r.check, "RIGHT", 0, 0)
  r.check:SetScript("OnClick", function(self)
    GameTooltip:Hide()
    if self:GetChecked() then archive(r.tip, "done") end
    render()
  end)
  r.check:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT"); GameTooltip:SetText(L().doneTip, 1, 1, 1, 1, true); GameTooltip:Show()
  end)
  r.check:SetScript("OnLeave", function() GameTooltip:Hide() end)
  r.dismiss = CreateFrame("Button", nil, r, "UIPanelCloseButton")
  r.dismiss:SetSize(22, 22)
  r.dismiss:SetPoint("RIGHT", 2, 0)
  r.dismiss:SetScript("OnClick", function()
    GameTooltip:Hide()
    if frame.tab == "hidden" then cdb.done[r.tip.key] = nil; cdb.gone[r.tip.key] = nil else archive(r.tip, "gone") end
    render()
  end)
  r.dismiss:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(frame.tab == "hidden" and L().restoreTip or L().dismissTip, 1, 1, 1, 1, true); GameTooltip:Show()
  end)
  r.dismiss:SetScript("OnLeave", function() GameTooltip:Hide() end)
  r:SetScript("OnEnter", rowTooltip)
  r:SetScript("OnLeave", function() GameTooltip:Hide() end)
  -- An item from a quest: the step of its chain you're at (as Shift+click on
  -- any item); anything else: who gives it.
  r:SetScript("OnClick", function(self, button)
    local tip = self.tip
    if button == "RightButton" then
      if tip.skip then SF.skipDungeon(tip.skip) end
      return
    end
    if tip.q and SF.markQuest then SF.markQuest(tip.q, tip.item and Api.itemName(tip.item) or tip.title) return end
    if tip.item and SF.markItem and SF.markItem(tip.item) then return end
    waypoint(tip.giver, tip.title or tip.head)
  end)
  return r
end

local function makeFrame()
  frame = CreateFrame("Frame", "ShamanForeverFrame", UIParent)
  frame:SetSize(cdb.size and cdb.size[1] or W, 100)
  frame:SetResizable(true)
  if frame.SetResizeBounds then frame:SetResizeBounds(MIN_W, MIN_H, MAX_W, MAX_H)
  elseif frame.SetMinResize then frame:SetMinResize(MIN_W, MIN_H); frame:SetMaxResize(MAX_W, MAX_H) end
  local grip = CreateFrame("Button", nil, frame)
  grip:SetSize(16, 16)
  grip:SetPoint("BOTTOMRIGHT", -2, 2)
  grip:SetNormalTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Up")
  grip:SetHighlightTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Highlight")
  grip:SetPushedTexture("Interface\\ChatFrame\\UI-ChatIM-SizeGrabber-Down")
  grip:SetScript("OnMouseDown", function() if cdb.locked then return end frame.sizing = true; frame:StartSizing("BOTTOMRIGHT") end)
  grip:SetScript("OnMouseUp", function()
    frame:StopMovingOrSizing()
    frame.sizing = false
    cdb.size = { math.floor(frame:GetWidth() + 0.5), math.floor(frame:GetHeight() + 0.5) }
    render()
  end)
  grip:SetScript("OnDoubleClick", function() cdb.size = nil; frame:SetWidth(W); render() end)
  grip:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT"); GameTooltip:SetText(L().resizeTip, 1, 1, 1, 1, true); GameTooltip:Show()
  end)
  grip:SetScript("OnLeave", function() GameTooltip:Hide() end)
  -- Lock: neither moving nor resizing (for click-happy hands).
  local lock = CreateFrame("Button", nil, frame)
  lock:SetSize(16, 16)
  lock:SetPoint("RIGHT", grip, "LEFT", -2, 0)
  local function paintLock()
    local tex = cdb.locked and "Interface\\Buttons\\LockButton-Locked-Up" or "Interface\\Buttons\\LockButton-Unlocked-Up"
    lock:SetNormalTexture(tex)
    grip:SetAlpha(cdb.locked and 0.25 or 1)
  end
  lock:SetScript("OnClick", function() cdb.locked = not cdb.locked; paintLock() end)
  lock:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT"); GameTooltip:SetText(cdb.locked and L().unlockTip or L().lockTip, 1, 1, 1, 1, true); GameTooltip:Show()
  end)
  lock:SetScript("OnLeave", function() GameTooltip:Hide() end)
  paintLock()
  -- While dragging the corner: as many rows as fit.
  frame:SetScript("OnSizeChanged", function() if frame.sizing then render() end end)
  -- Per character; a new one starts where you last left it on another.
  local pos = cdb.pos or db.pos
  if pos then frame:SetPoint(pos[1], UIParent, pos[2], pos[3], pos[4]) else frame:SetPoint("TOPRIGHT", -220, -180) end
  -- Under the game's windows (quest and gossip dialogs, bags): you can
  -- still read and accept a quest where the window sits.
  frame:SetFrameStrata("LOW")
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", function(self) if not cdb.locked then self:StartMoving() end end)
  frame:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local point, _, rel, x, y = self:GetPoint()
    cdb.pos = { point, rel, x, y }
    db.pos = cdb.pos
  end)
  local bg = frame:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(0.04, 0.05, 0.08, 0.92)
  local bar = frame:CreateTexture(nil, "BORDER")
  bar:SetPoint("TOPLEFT"); bar:SetPoint("TOPRIGHT"); bar:SetHeight(2)
  bar:SetColorTexture(0, 0.44, 0.87, 1)
  frame.title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  frame.title:SetPoint("TOPLEFT", 10, -10)
  frame.title:SetPoint("RIGHT", -130, 0)
  frame.title:SetJustifyH("LEFT")
  if frame.title.SetWordWrap then frame.title:SetWordWrap(false) end
  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", 2, 2)
  close:SetScript("OnClick", function() frame:Hide(); cdb.shown = false end)
  frame.spec = CreateFrame("Button", nil, frame)
  frame.spec:SetSize(100, 18)
  frame.spec:SetPoint("TOPRIGHT", -28, -10)
  frame.spec.text = frame.spec:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  frame.spec.text:SetPoint("RIGHT")
  frame.spec:SetScript("OnClick", function()
    cdb.spec = D.specs[specIndex() % #D.specs + 1]
    SF.open(true)
  end)
  frame.spec:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT"); GameTooltip:SetText(L().specTip, 1, 1, 1); GameTooltip:Show()
  end)
  frame.spec:SetScript("OnLeave", function() GameTooltip:Hide() end)
  frame.empty = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  frame.empty:SetPoint("TOPLEFT", 10, -TOP - 4)
  frame.empty:SetPoint("RIGHT", -10, 0)
  frame.empty:SetJustifyH("LEFT")
  frame.more = frame:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  -- Tabs: the tips, the ones marked done, the dismissed ones.
  frame.tab = "next"
  frame.tabs = {}
  local x = 10
  for _, kind in ipairs({ "next", "prog", "hidden" }) do
    local b = CreateFrame("Button", nil, frame)
    b:SetHeight(20)
    b:SetPoint("TOPLEFT", x, -32)
    b.text = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    b.text:SetPoint("LEFT", 4, 0)
    b.line = b:CreateTexture(nil, "ARTWORK")
    b.line:SetPoint("BOTTOMLEFT"); b.line:SetPoint("BOTTOMRIGHT"); b.line:SetHeight(2)
    b.line:SetColorTexture(0, 0.44, 0.87, 1)
    b:SetScript("OnClick", function() frame.tab = kind; render() end)
    b:SetWidth(120)
    frame.tabs[kind] = b
    x = x + 124
  end
  frame.cat = "all"
  frame.cats = {}
  for _, cat in ipairs({ "all", "world", "dungeon", "prof" }) do
    local b = CreateFrame("Button", nil, frame)
    b:SetHeight(18)
    b.text = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    b.text:SetPoint("LEFT", 4, 0)
    b.bg = b:CreateTexture(nil, "BACKGROUND")
    b.bg:SetAllPoints()
    b.bg:SetColorTexture(0, 0.44, 0.87, 0.35)
    b:SetScript("OnClick", function() frame.cat = cat; render() end)
    frame.cats[cat] = b
  end
  frame.cats.all:SetPoint("TOPLEFT", 12, -56)
  frame.cats.world:SetPoint("LEFT", frame.cats.all, "RIGHT", 6, 0)
  frame.cats.dungeon:SetPoint("LEFT", frame.cats.world, "RIGHT", 6, 0)
  frame.cats.prof:SetPoint("LEFT", frame.cats.dungeon, "RIGHT", 6, 0)
  for i = 1, ROWS do rows[i] = makeRow(i) end
end

-- Shows a list of tips with a title.
-- The quest log changed: repaint the open window (you just took a quest).
local function repaint()
  if frame and frame:IsShown() then show(frame.lastTitle or "", frame.lastTips or {}, true) end
end
function show(title, tips, keepTab)
  if not frame then makeFrame() end
  frame.lastTitle, frame.lastTips = title, tips
  if not keepTab then frame.tab = "next" end
  render()
end
function render()
  local tab = frame.tab
  local tips = {}
  local prog = inProgress()
  local inCat = { all = 0, world = 0, dungeon = 0, prof = 0 }
  if tab == "next" then
    -- What you already carry is under "En curso".
    for _, t in ipairs(frame.lastTips or {}) do
      if not off(t.key) and not (t.q and carrying(t.q)) then
        local c = t.cat or "world"
        inCat.all, inCat[c] = inCat.all + 1, inCat[c] + 1
        if frame.cat == "all" or frame.cat == c then tips[#tips + 1] = t end
      end
    end
    -- Opened by itself and nothing left (all done or dismissed): it goes
    -- away. Opened by you, it stays.
    if frame.auto and inCat.all == 0 and frame:IsShown() then
      frame.auto = false
      frame:Hide()
      cdb.shown = false
      return
    end
  elseif tab == "prog" then
    tips = prog
  else
    tips = archived()
  end
  local counts = { prog = #prog, hidden = #archived() }
  local labels = { prog = L().tabProg, hidden = L().tabHidden }
  for kind, b in pairs(frame.tabs) do
    local label = kind == "next" and L().tabNext or string.format(labels[kind], counts[kind])
    b.text:SetText(label)
    b:SetWidth(b.text:GetStringWidth() + 10)
    b.line:SetShown(kind == tab)
    b.text:SetTextColor(kind == tab and 1 or 0.6, kind == tab and 0.82 or 0.6, kind == tab and 0 or 0.6)
  end
  frame.tabs.prog:SetPoint("TOPLEFT", frame.tabs.next, "TOPRIGHT", 6, 0)
  frame.tabs.hidden:SetPoint("TOPLEFT", frame.tabs.prog, "TOPRIGHT", 6, 0)
  for cat, b in pairs(frame.cats) do
    b:SetShown(tab == "next")
    b.text:SetText(string.format(L().cats[cat], inCat[cat]))
    b:SetWidth(b.text:GetStringWidth() + 10)
    b.bg:SetShown(cat == frame.cat)
  end
  frame.title:SetText(frame.lastTitle or "")
  frame.spec.text:SetText(string.format(L().spec, specName()))
  local fit = cdb.size and math.max(1, math.min(ROWS, math.floor(((frame.sizing and frame:GetHeight() or cdb.size[2]) - TOP - 26) / ROW_H))) or AUTO
  for i = 1, ROWS do
    local r, tip = rows[i], i <= fit and tips[i] or nil
    r.tip = tip
    if tip then
      r.icon:SetTexture(tip.icon or Api.icon(tip.item))
      r.head:SetText(tip.head)
      r.src:SetText(tip.src)
      local have = tip.q and carrying(tip.q)
      r.have:SetShown(have and true or false)
      r.gain:SetText(have and (L().haveQuest .. (tip.gain and (" · " .. tip.gain) or "")) or tip.gain or "")
      r.check:SetChecked(false)
      r.check:SetShown(tab ~= "hidden")
      r.checkLabel:SetText(tab ~= "hidden" and L().done or "")
      r:SetAlpha((tab == "next" or tab == "prog") and 1 or 0.75)
      r:Show()
    else
      r:Hide()
    end
  end
  local n = math.min(#tips, fit)
  frame.empty:SetText(#tips == 0 and (tab == "next" and L().nothing or tab == "prog" and L().nothingProg or L().nothingHidden) or "")
  frame.more:ClearAllPoints()
  frame.more:SetPoint("TOPLEFT", 10, -TOP - 4 - n * ROW_H)
  frame.more:SetText(#tips > fit and string.format(L().more, #tips - fit) or "")
  if not frame.sizing then
    if cdb.size then frame:SetSize(cdb.size[1], cdb.size[2])
    else frame:SetHeight(#tips == 0 and (TOP + 34) or (TOP + 12 + n * ROW_H + (#tips > fit and 14 or 0))) end
  end
  frame:Show()
  cdb.shown = true
end

-- Tips shown by themselves are marked seen: they don't pop up again.
local pending
-- How much a tip matters now: upgrades on your route and for your level
-- first, by how much they improve.
local function priority(t)
  local lvl = UnitLevel("player")
  local p = 0
  if t.onRoute then p = p + 2 end
  if t.item then p = p + math.min(t.pct or 0.25, 2) end
  if (t.order or 99) <= lvl then p = p + 1 end
  if t.cat == "prof" then p = p + 0.3 end
  return p
end
local POPUP_MAX = 3
local function popup(title, tips)
  local new = {}
  for _, tip in ipairs(tips) do if not cdb.seen[tip.key] and not tip.pinned then new[#new + 1] = tip end end
  if #new == 0 then return end
  for _, tip in ipairs(new) do cdb.seen[tip.key] = true end
  -- Only the few that matter most pop up; the rest wait in /sf.
  local total = #new
  if total > POPUP_MAX then
    table.sort(new, function(a, b) return priority(a) > priority(b) end)
    for i = #new, POPUP_MAX + 1, -1 do table.remove(new, i) end
    table.sort(new, function(a, b) return (a.order or 0) < (b.order or 0) end)
    say(string.format(L().chatNewMore, total, POPUP_MAX))
  else
    say(string.format(L().chatNew, total))
  end
  if cdb.quiet then return end
  -- Never in the middle of a fight: after it.
  if InCombatLockdown() then pending = { title, new } return end
  show(title, new)
  frame.live, frame.auto = false, true
end

local function craftTips()
  local tips, best, lvl, faction = {}, {}, UnitLevel("player"), myFaction()
  for prof, p in pairs(myProfessions()) do
    for _, c in ipairs(D.crafts and D.crafts[prof] or {}) do
      local id, req, skill = c[1], c[2], c[3]
      if skill <= p.max and req <= lvl + cdb.lead and req > lvl - STALE then
        local g = gain(id)
        local key = "c" .. id
        if g and not off(key) then
          local learn = c[4] == "f" and string.format(L().learnFavor, c[5] or 0, (faction == "alliance" and c[7] or c[6]) or "?")
            or L().learnTrainer
          local need = p.skill < skill and (" · |cffff9933" .. string.format(L().skillNeed, skill - p.skill) .. "|r") or ""
          local head = req <= lvl and string.format(L().levelNow, req) or string.format(L().levelIn, req, req - lvl)
          local tip = { key = key, item = id, head = head .. " · " .. Api.itemName(id),
            src = string.format(L().craft, p.name, skill) .. need, gain = gainText(g) .. " · " .. learn,
            order = req, cat = "prof", v = g.v, slot = g.slot, skill = skill }
          -- One per slot: the best one (the easier to make on a tie).
          local cur = best[g.slot]
          if not cur or tip.v > cur.v or (tip.v == cur.v and tip.skill < cur.skill) then best[g.slot] = tip end
        end
      end
    end
  end
  for _, tip in pairs(best) do tips[#tips + 1] = tip end
  table.sort(tips, function(a, b) return a.order < b.order end)
  return tips
end

-- Off the route and worth a detour: OFF without a Polestar route, ROUTE_OFF
-- with one (you follow it; only a big upgrade is worth leaving it).
local FAR, OFF, ROUTE_OFF = 0.35, 0.2, 0.35
local function nearby(tips)
  if cdb.showFar then return tips end
  local mine, out = myContinent(), {}
  for _, t in ipairs(tips) do
    local keep = true
    if mine and t.where and t.where ~= mine then
      keep = (t.pct or 0) >= FAR
      if keep then t.gain = (t.gain or "") .. " · |cffffd100" .. L().worthTrip .. "|r" end
    elseif t.offRoute then
      keep = (t.pct or 0) >= (t.minPct or OFF)
    end
    if keep then out[#out + 1] = t end
  end
  return out
end
local function upcoming()
  local info = routeInfo()
  local tips, inRoute = {}, {}
  for _, d in ipairs(info and info.dungeons or {}) do inRoute[d.name], inRoute[d.data or d.name] = true, true end
  -- With a route, the next dungeon's row says which of its quests you still
  -- need; the pick-up rows (every dungeon in range) are only noise.
  if not info then
    for _, t in ipairs(pickupTips(false)) do tips[#tips + 1] = t end
  end
  for _, t in ipairs(pathTips()) do tips[#tips + 1] = t end
  if info then
    -- Upgrades the route gets you go first, with the guide that does them;
    -- the rest is off the route (shown only when it's worth it).
    for _, t in ipairs(tips) do
      if t.item then
        local g = t.q and info.quests[t.q]
        local label = g and (type(g.title) == "string" and g.title or "?") or (t.dungeon and inRoute[t.dungeon] and t.dungeon)
        if label then
          t.onRoute, t.offRoute, t.where = true, false, nil
          t.src = t.src .. " · |cff40c0ff" .. string.format(L().onRoute, label) .. "|r"
        elseif t.kind == "quest" or t.kind == "route" or t.kind == "dquest" then
          t.minPct = ROUTE_OFF
          -- (Our own route gives way to Polestar's; class quests are in its class guides.)
          t.offRoute = true
          t.order = t.order + 0.5
        end
      end
    end
  end
  tips = nearby(tips)
  if info then
    for _, t in ipairs(tips) do
      if t.offRoute and t.item then t.src = t.src .. " · |cff999999" .. L().offRouteTag .. "|r" end
    end
    local nd = nextDungeonTip(info)
    if nd then tips[#tips + 1] = nd end
    -- Your spec and the route's: Enhancement routes ("-enh") count on its
    -- weapons; Elemental and Restoration have their own ("-cast").
    local gid = type(info.guide.id) == "string" and info.guide.id or ""
    local pack = gid:match("^(sf%-[%a]+%-)")
    local caster = cdb.spec == "Elemental" or cdb.spec == "Restoration"
    if pack and ((caster and gid:find("^sf%-%a+%-enh/")) or (not caster and gid:find("^sf%-%a+%-cast/"))) then
      tips[#tips + 1] = { key = "r" .. pack .. cdb.spec, icon = "Interface\\Icons\\INV_Misc_Map_01", pinned = true,
        head = caster and L().routeForCaster or L().routeForEnh, src = L().routeSwitchHow, gain = "", order = -2e9, cat = "world" }
    end
  end
  for _, t in ipairs(craftTips()) do tips[#tips + 1] = t end
  for _, t in ipairs(campTips()) do tips[#tips + 1] = t end
  table.sort(tips, function(a, b) return a.order < b.order end)
  return tips
end

-- What the window shows: the dungeon you're in, the dungeon your Polestar
-- route has you run now, or everything coming up.
local function currentView()
  local dname = currentDungeon()
  if dname then return string.format(L().inDungeon, dname), dungeonTips(dname) end
  local info = routeInfo()
  if info and info.now then
    local tips = dungeonTips(info.nowData or info.now)
    if tips[1] and tips[1].key:sub(1, 1) == "s" then tips[1].skip = info.now end
    return string.format(L().routeStep, info.now), tips
  end
  return string.format(L().upcoming, UnitLevel("player")), upcoming()
end

-- "/sf": open or close the window.
function SF.open(keep)
  if frame and frame:IsShown() and not keep then frame:Hide(); cdb.shown = false return end
  local title, tips = currentView()
  show(title, tips)
  frame.live, frame.auto = true, false
end

-- Recompute what the window shows (a moment later, once; not in combat),
-- keeping the tab if it's still the same view.
local refreshPending
function refresh()
  if refreshPending then return end
  refreshPending = true
  C_Timer.After(0.5, function()
    refreshPending = false
    if frame and frame:IsShown() and not InCombatLockdown() then
      local title, tips = currentView()
      show(title, tips, title == frame.lastTitle)
      frame.live = true
    end
  end)
end

-- Polestar moved to another step or guide: the window follows (a moment
-- later, once; not in combat).
local polestarHooked
local function followPolestar()
  local P = polestar()
  if polestarHooked or not P or type(P.On) ~= "function" then return end
  polestarHooked = true
  local function again() routeCache = nil; refresh() end
  pcall(P.On, "STEP_CHANGED", again)
  pcall(P.On, "GUIDE_CHANGED", again)
end

-- Minimap button: click shows or hides the window; drag it around the edge.
local mmButton
local function placeMinimapButton()
  local a = math.rad(cdb.mmAngle or db.mmAngle or 200)
  local r = (Minimap:GetWidth() or 140) / 2 + 8
  mmButton:ClearAllPoints()
  mmButton:SetPoint("CENTER", Minimap, "CENTER", math.cos(a) * r, math.sin(a) * r)
end
local function makeMinimapButton()
  if mmButton or not Minimap then return end
  local b = CreateFrame("Button", "ShamanForeverMinimapButton", Minimap)
  mmButton = b
  b:SetSize(31, 31)
  b:SetFrameStrata("MEDIUM")
  b:SetFrameLevel(8)
  b:RegisterForClicks("AnyUp")
  b:RegisterForDrag("LeftButton")
  b:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetSize(20, 20)
  bg:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
  bg:SetPoint("TOPLEFT", 7, -5)
  local icon = b:CreateTexture(nil, "ARTWORK")
  icon:SetSize(17, 17)
  icon:SetTexture("Interface\\Icons\\Spell_Nature_LightningShield")
  icon:SetPoint("TOPLEFT", 7, -6)
  local border = b:CreateTexture(nil, "OVERLAY")
  border:SetSize(53, 53)
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  border:SetPoint("TOPLEFT")
  b:SetScript("OnClick", function(_, button) if button == "RightButton" then SF.options() else SF.open() end end)
  b:SetScript("OnDragStart", function(self)
    self:SetScript("OnUpdate", function()
      local mx, my = Minimap:GetCenter()
      local px, py = GetCursorPosition()
      local scale = Minimap:GetEffectiveScale()
      cdb.mmAngle = math.deg(math.atan2(py / scale - my, px / scale - mx))
      placeMinimapButton()
    end)
  end)
  b:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
  b:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:SetText("Shaman: Forever", 1, 0.82, 0)
    GameTooltip:AddLine(L().mmTip, 1, 1, 1, true)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  placeMinimapButton()
  b:SetShown(not cdb.mmHide)
end
-- The minimap's addon list (Addon Compartment), named in the .toc, and the
-- key bindings (Bindings.xml; Esc > Options > Keybindings > AddOns).
function ShamanForever_Toggle() SF.open() end
function ShamanForever_MarkFirst()
  if not frame or not frame.lastTips then SF.open(true) end
  for _, t in ipairs(frame and frame.lastTips or {}) do
    if not off(t.key) and not (t.q and carrying(t.q)) and not t.pinned then
      if t.q and SF.markQuest then SF.markQuest(t.q, t.item and Api.itemName(t.item) or t.title)
      elseif t.item and SF.markItem and SF.markItem(t.item) then
      else waypoint(t.giver, t.title or t.head) end
      return
    end
  end
  say(L().nothing)
end
BINDING_HEADER_SHAMANFOREVER = "Shaman: Forever"
BINDING_NAME_SHAMANFOREVER_TOGGLE = (GetLocale() or ""):sub(1, 2) == "es" and "Mostrar u ocultar la ventana" or "Show or hide the window"
BINDING_NAME_SHAMANFOREVER_MARK = (GetLocale() or ""):sub(1, 2) == "es" and "Marcar en el mapa el primer aviso" or "Mark the first tip on the map"

-- Events -------------------------------------------------------------------------
local function zoneTips()
  local z = here()
  -- With a Polestar route it already walks you through the zone: only the
  -- upgrades of this zone the route gets you (or big ones off it).
  if routeInfo() then
    local tips = {}
    for _, t in ipairs(upcoming()) do
      if t.item and t.giver and areaName(t.giver.z) == z and (t.onRoute or (t.pct or 0) >= ROUTE_OFF) then tips[#tips + 1] = t end
    end
    return tips
  end
  local tips = pickupTips(true)
  for _, t in ipairs(pathTips(function(st) return st.a ~= "dquest" and st.a ~= "class" and zoneName(st.z) == z end)) do tips[#tips + 1] = t end
  return tips
end

local lastZone, lastDungeon
local function onZone()
  local dname = currentDungeon()
  if dname ~= lastDungeon then
    if lastDungeon then log("out", lastDungeon) end
    if dname then log("in", dname) end
    lastDungeon = dname
  end
  if dname then
    popup(string.format(L().inDungeon, dname), dungeonTips(dname))
    return
  end
  local z = here()
  if z ~= lastZone then
    lastZone = z
    log("zone")
    popup(string.format(L().inZone, z), zoneTips())
  end
end

-- Polestar (0.2.4+) has our Shaman plan and reminds you of talent points.
local function polestarTalents()
  local P = polestar()
  local T = P and P.Talents
  if type(T) ~= "table" or not (T.Data and T.Get) then return false end
  local ok, on = pcall(function() return T.Data("SHAMAN") and T.Get("enabled") ~= false and T.Get("reminder") ~= false end)
  return ok and on and true or false
end

local function onLevel(lvl)
  log("level")
  if cdb.talents and not polestarTalents() then
    local t = talentLine(lvl)
    if t then say(t) end
  end
  popup(string.format(L().upcoming, lvl), upcoming())
end

-- Quest XP as the game pays it, for the route planner: the data lacks it
-- for some of Forever's new quests (scripts/import-quest-xp.js reads it from
-- the SavedVariables). Account-wide: { [quest id] = { xp, your level } };
-- the reward window and the turn-in both tell.
local function noteXp(id, xp)
  id, xp = readable(id), readable(xp)
  if type(id) ~= "number" or id <= 0 or type(xp) ~= "number" or xp <= 0 then return end
  db.qxp = db.qxp or {}
  db.qxp[id] = { xp, UnitLevel("player") }
end
local function noteRewardXp()
  local id = GetQuestID and GetQuestID()
  local xp = GetRewardXP and GetRewardXP()
  pcall(noteXp, id, xp)
end

local ev = CreateFrame("Frame")
ev:RegisterEvent("ADDON_LOADED")
ev:SetScript("OnEvent", function(self, event, ...)
  if event == "ADDON_LOADED" then
    if ... ~= ADDON then return end
    ShamanForeverDB = ShamanForeverDB or {}
    ShamanForeverCharDB = ShamanForeverCharDB or {}
    db, cdb = ShamanForeverDB, ShamanForeverCharDB
    for k, v in pairs(DEFAULTS) do if cdb[k] == nil then cdb[k] = v end end
    cdb.seen, cdb.done, cdb.gone, cdb.log = cdb.seen or {}, cdb.done or {}, cdb.gone or {}, cdb.log or {}
    self:UnregisterEvent("ADDON_LOADED")
    pcall(makeOptions)
    self:RegisterEvent("PLAYER_ENTERING_WORLD")
    self:RegisterEvent("ZONE_CHANGED_NEW_AREA")
    self:RegisterEvent("PLAYER_LEVEL_UP")
    self:RegisterEvent("PLAYER_REGEN_ENABLED")
    self:RegisterEvent("PLAYER_REGEN_DISABLED")
    self:RegisterEvent("QUEST_TURNED_IN")
    self:RegisterEvent("QUEST_ACCEPTED")
    self:RegisterEvent("QUEST_REMOVED")
    self:RegisterEvent("QUEST_DETAIL")
    self:RegisterEvent("QUEST_COMPLETE")
    self:RegisterEvent("SKILL_LINES_CHANGED")
    self:RegisterEvent("BAG_UPDATE_DELAYED")
  elseif event == "PLAYER_ENTERING_WORLD" or event == "ZONE_CHANGED_NEW_AREA" then
    -- The zone's name settles a moment after a loading screen.
    C_Timer.After(2, onZone)
    followPolestar()
    if event == "PLAYER_ENTERING_WORLD" and not mmButton then
      makeMinimapButton()
      -- Open again if you left it open (also after /reload).
      if cdb.shown then C_Timer.After(2.5, function() if not (frame and frame:IsShown()) and not InCombatLockdown() then SF.open(true) end end) end
      -- First time on this character: the setup.
      if not cdb.setupDone then C_Timer.After(4, function() if not cdb.setupDone and not InCombatLockdown() then SF.setup() end end) end
    end
  elseif event == "PLAYER_LEVEL_UP" then
    local lvl = ...
    -- UnitLevel catches up a moment later.
    C_Timer.After(1, function() onLevel(tonumber(lvl) or UnitLevel("player")) end)
  elseif event == "QUEST_DETAIL" or event == "QUEST_COMPLETE" then
    noteRewardXp()
  elseif event == "QUEST_TURNED_IN" then
    local id, xp = ...
    pcall(noteXp, id, xp)
    log("quest", tostring(id))
    if frame and frame.live then refresh() else C_Timer.After(0.5, repaint) end
  elseif event == "BAG_UPDATE_DELAYED" then
    bagBest = nil
  elseif event == "SKILL_LINES_CHANGED" then
    C_Timer.After(1, function()
      if frame and frame.live then refresh() end
    end)
  elseif event == "QUEST_REMOVED" then
    if frame and frame.live then refresh() else C_Timer.After(0.5, repaint) end
  elseif event == "QUEST_ACCEPTED" then
    -- QUEST_ACCEPTED gives (index, id) on old clients, (id) on new ones.
    local a, b = ...
    log("accept", tostring(b or a))
    if frame and frame.live then refresh() else C_Timer.After(0.5, repaint) end
  elseif event == "PLAYER_REGEN_DISABLED" then
    if cdb.hideCombat and frame and frame:IsShown() then frame:Hide(); frame.hiddenByCombat = true end
  elseif event == "PLAYER_REGEN_ENABLED" and frame and frame.hiddenByCombat and not pending then
    frame.hiddenByCombat = nil
    frame:Show()
  elseif event == "PLAYER_REGEN_ENABLED" and pending then
    local p = pending
    pending = nil
    show(p[1], p[2])
    frame.live, frame.auto = false, true
  end
end)

-- Item tooltips: better or worse than what you wear, for your spec.
local function onTooltip(tt, id)
  if not cdb or not id or not D.items[id] then return end
  if polestarGear() and not cdb.tipAlways then
    if D.iq and D.iq[id] then tt:AddLine(L().markHint, 0.5, 0.75, 1) end
    return
  end
  local v = value(id)
  if v <= 0 then return end
  local cur = wornValue(D.items[id].s)
  local text, r, g, b
  if cur <= 0 then text, r, g, b = string.format(L().tipEmpty, specName()), 0.4, 1, 0.4
  elseif v >= cur then text, r, g, b = pctText(v, cur, L().tipBetter) .. " (" .. specName() .. ")", 0.4, 1, 0.4
  else text, r, g, b = string.format(L().tipWorse, math.floor((1 - v / cur) * 100 + 0.5), specName()), 0.6, 0.6, 0.6 end
  tt:AddLine("Shaman: Forever: " .. text, r, g, b)
  if D.iq and D.iq[id] then tt:AddLine(L().markHint, 0.5, 0.75, 1) end
  for prof, p in pairs(myProfessions()) do
    for _, c in ipairs(D.crafts and D.crafts[prof] or {}) do
      if c[1] == id then
        tt:AddLine(string.format(L().youCraft, p.name, c[3]) .. (p.skill < c[3] and (" · " .. string.format(L().skillNeed, c[3] - p.skill)) or ""), 1, 0.6, 0.2)
      end
    end
  end
end

-- Shift+click on an item: a mark on the map where to pick up the quest that
-- rewards it, at the step of its chain you're at (or where to turn it in, if
-- you already carry that step).
-- Which quest that rewards an item is yours: one whose chain you started,
-- else one outside another race's starting zone, else any (all not done);
-- (quest, true) when you already did one.
local stepOf
local function questOf(id)
  local f, me = myFaction():sub(1, 1), raceLetter()
  local started, near, any, did
  for _, e in ipairs(D.iq[id] or {}) do
    if (not e[2] or e[2] == f) and (not e[3] or e[3]:find(me, 1, true)) then
      if Api.questDone(e[1]) then did = did or e[1]
      else
        local _, state, n = stepOf(e[1])
        if state == "turnin" or n > 1 then started = started or e[1] end
        if not e[4] or e[4]:find(me, 1, true) then near = near or e[1] end
        any = any or e[1]
      end
    end
  end
  -- Got the item from one of them already: nothing else to suggest.
  if did then return did, true end
  return started or near or any
end
-- A chain, first step first; a step with alternatives (any of them opens the
-- next) counts as done or carried when any of them is.
local function chainOf(qid)
  local list, seen = {}, {}
  while qid and not seen[qid] do
    seen[qid] = true
    table.insert(list, 1, qid)
    qid = D.qpre[qid]
  end
  return list
end
local function anyOf(q, test)
  for _, a in ipairs(D.qalt and D.qalt[q] or { q }) do if test(a) then return a end end
end
-- The step of qid's chain you're at: (quest, "turnin" | "pickup" | "done", n, total).
function stepOf(qid)
  local chain = chainOf(qid)
  for i = #chain, 1, -1 do
    local q = chain[i]
    local on = anyOf(q, Api.onQuest)
    if on then return on, "turnin", i, #chain end
    if anyOf(q, Api.questDone) then
      if i == #chain then return q, "done", i, #chain end
      return chain[i + 1], "pickup", i + 1, #chain
    end
  end
  -- Not started: of the ways in, the one given in your zone, else the first.
  local first = chain[1]
  local z = here()
  local pick = anyOf(first, function(a) local g = D.givers[a] return g and g.z and areaName(g.z) == z end)
  return pick or first, "pickup", 1, #chain
end
carrying = function(q) return q and stepOf(q) and select(2, stepOf(q)) == "turnin" end
-- Marks on the map the step of a quest's chain you're at. `label`: what it's for.
function SF.markQuest(qid, label)
  local step, state, n, total = stepOf(qid)
  local name = Api.questName(step)
  if state == "done" then say(string.format(L().markDone, label or name)) return true end
  if total > 1 then say(string.format(L().markInfo, label or name, name, n, total)) end
  local g = state == "turnin" and D.enders[step] or D.givers[step]
  if g then waypoint(g, string.format(state == "turnin" and L().markTurnIn or L().pickup, name))
  else say(string.format(L().markNoWhere, name)) end
  return true
end
function SF.markItem(id, linkName)
  if not cdb or not D.iq or not D.iq[id] then return false end
  local qid, done = questOf(id)
  if not qid then return false end
  local item = linkName or Api.itemName(id)
  if done then say(string.format(L().markDone, item)) return true end
  return SF.markQuest(qid, item)
end
-- Shift+click anywhere items are (bags, chat links, loot lists, quest
-- rewards) goes through HandleModifiedItemClick; with the chat box open it's
-- linking the item, so it's left alone.
if hooksecurefunc and HandleModifiedItemClick then
  hooksecurefunc("HandleModifiedItemClick", function(link)
    if not cdb or not IsShiftKeyDown() or IsControlKeyDown() or IsAltKeyDown() then return end
    if ChatEdit_GetActiveWindow and ChatEdit_GetActiveWindow() then return end
    link = readable(link)
    local id = type(link) == "string" and tonumber(link:match("item:(%d+)"))
    if id then pcall(SF.markItem, id, link:match("|h%[(.-)%]|h")) end
  end)
end
local function safeTooltip(tt, id)
  id = readable(id)
  if id then pcall(onTooltip, tt, id) end
end
if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tt, data)
    if tt == GameTooltip or tt == ItemRefTooltip then safeTooltip(tt, data and data.id) end
  end)
else
  GameTooltip:HookScript("OnTooltipSetItem", function(tt)
    local _, link = tt:GetItem()
    link = readable(link)
    safeTooltip(tt, link and tonumber(link:match("item:(%d+)")))
  end)
end

-- Quest givers: the gear their quests reward, for you.
local function onUnitTooltip(tt, guid)
  if not cdb or cdb.npcTips == false or type(guid) ~= "string" then return end
  local kind, _, _, _, _, id = strsplit("-", guid)
  if kind ~= "Creature" then return end
  local list = npcLines(tonumber(id))
  if #list == 0 then return end
  tt:AddLine(" ")
  tt:AddLine("Shaman: Forever", 0, 0.44, 0.87)
  for i, q in ipairs(list) do
    if i > 3 then break end
    tt:AddLine(q[1], 1, 0.82, 0)
    for _, line in ipairs(q[2]) do tt:AddLine("  " .. line, 1, 1, 1) end
  end
  tt:Show()
end
if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType and Enum.TooltipDataType.Unit then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Unit, function(tt, data)
    if tt == GameTooltip then pcall(onUnitTooltip, tt, readable(data and data.guid)) end
  end)
elseif GameTooltip.HookScript then
  GameTooltip:HookScript("OnTooltipSetUnit", function(tt)
    local _, unit = tt:GetUnit()
    pcall(onUnitTooltip, tt, unit and readable(UnitGUID(unit)))
  end)
end

-- The log, in a box to copy from.
local function showLog()
  if not logFrame then
    logFrame = CreateFrame("Frame", "ShamanForeverLog", UIParent)
    logFrame:SetSize(520, 320)
    logFrame:SetPoint("CENTER")
    logFrame:SetFrameStrata("DIALOG")
    local bg = logFrame:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0.04, 0.05, 0.08, 0.95)
    local t = logFrame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    t:SetPoint("TOPLEFT", 10, -10)
    logFrame.title = t
    local close = CreateFrame("Button", nil, logFrame, "UIPanelCloseButton")
    close:SetPoint("TOPRIGHT", 2, 2)
    local scroll = CreateFrame("ScrollFrame", nil, logFrame, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 10, -32)
    scroll:SetPoint("BOTTOMRIGHT", -30, 10)
    local box = CreateFrame("EditBox", nil, scroll)
    box:SetMultiLine(true)
    box:SetFontObject(ChatFontNormal)
    box:SetWidth(470)
    box:SetAutoFocus(false)
    box:SetScript("OnEscapePressed", function() logFrame:Hide() end)
    scroll:SetScrollChild(box)
    logFrame.box = box
    tinsert(UISpecialFrames, "ShamanForeverLog")
  end
  logFrame.title:SetText(L().logTitle)
  local _, race = UnitRace("player")
  local text = "SF1|" .. tostring(race) .. "|" .. cdb.spec .. "|" .. Api.version() .. "\n" .. table.concat(cdb.log, "\n")
  logFrame.box:SetText(text)
  logFrame:Show()
  logFrame.box:SetFocus()
  logFrame.box:HighlightText()
end

-- Options -------------------------------------------------------------------------
local panel
local function makeOptions()
  if panel then return end
  panel = CreateFrame("Frame", "ShamanForeverOptions")
  panel.name = "Shaman: Forever"
  local y = -16
  local function text(str, font, x)
    local fs = panel:CreateFontString(nil, "ARTWORK", font or "GameFontHighlight")
    fs:SetPoint("TOPLEFT", x or 16, y)
    fs:SetJustifyH("LEFT")
    fs:SetText(str)
    return fs
  end
  local title = text("Shaman: Forever " .. Api.version(), "GameFontNormalLarge")
  y = y - 26
  local sub = text("", "GameFontHighlightSmall")
  sub:SetWidth(560)
  y = y - 34
  panel.widgets = {}
  -- Spec: three buttons.
  panel.specLabel = text("", "GameFontNormal")
  y = y - 22
  local x = 16
  panel.specButtons = {}
  for _, spec in ipairs(D.specs) do
    local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    b:SetSize(130, 22)
    b:SetPoint("TOPLEFT", x, y)
    b:SetScript("OnClick", function() cdb.spec = spec; panel.refresh(); if frame and frame:IsShown() then SF.open(true) end end)
    panel.specButtons[spec] = b
    x = x + 136
  end
  y = y - 36
  -- Checkboxes: { label key, get, set }.
  local function check(key, get, set)
    local c = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
    c:SetSize(26, 26)
    c:SetPoint("TOPLEFT", 12, y)
    c.label = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
    c.label:SetPoint("LEFT", c, "RIGHT", 4, 0)
    c:SetScript("OnClick", function(self) set(self:GetChecked() and true or false); panel.refresh() end)
    c.refresh = function() c:SetChecked(get() and true or false); c.label:SetText(L().opt[key]) end
    panel.widgets[#panel.widgets + 1] = c
    y = y - 30
  end
  check("popup", function() return not cdb.quiet end, function(v) cdb.quiet = not v end)
  check("talents", function() return cdb.talents end, function(v) cdb.talents = v end)
  check("npcTips", function() return cdb.npcTips ~= false end, function(v) cdb.npcTips = v end)
  check("minimap", function() return not cdb.mmHide end, function(v)
    cdb.mmHide = not v
    if mmButton then mmButton:SetShown(v) end
  end)
  check("tomtom", function() return cdb.tomtom end, function(v) cdb.tomtom = v end)
  check("showFar", function() return cdb.showFar end, function(v) cdb.showFar = v end)
  check("hideCombat", function() return cdb.hideCombat end, function(v) cdb.hideCombat = v end)
  check("polestar", function() return cdb.polestar ~= false end, function(v) cdb.polestar = v; routeCache = nil end)
  check("tipAlways", function() return cdb.tipAlways end, function(v) cdb.tipAlways = v end)
  -- Lead: how many levels ahead.
  y = y - 8
  panel.leadLabel = text("", "GameFontHighlight")
  local minus = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  minus:SetSize(26, 22); minus:SetPoint("TOPLEFT", 330, y + 4); minus:SetText("-")
  minus:SetScript("OnClick", function() cdb.lead = math.max(0, cdb.lead - 1); panel.refresh() end)
  local plus = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  plus:SetSize(26, 22); plus:SetPoint("LEFT", minus, "RIGHT", 4, 0); plus:SetText("+")
  plus:SetScript("OnClick", function() cdb.lead = math.min(5, cdb.lead + 1); panel.refresh() end)
  y = y - 34
  -- Language.
  panel.langLabel = text("", "GameFontHighlight")
  x = 330
  for _, lang in ipairs({ "es", "en" }) do
    local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    b:SetSize(70, 22); b:SetPoint("TOPLEFT", x, y + 4); b:SetText(lang == "es" and "Español" or "English")
    b:SetScript("OnClick", function() db.lang = lang; zoneNames = nil; panel.refresh(); if frame and frame:IsShown() then SF.open(true) end end)
    x = x + 76
  end
  y = y - 44
  -- Actions.
  local function action(labelKey, fn, ax)
    local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    b:SetSize(170, 24); b:SetPoint("TOPLEFT", ax, y)
    b:SetScript("OnClick", fn)
    b.refresh = function() b:SetText(L().opt[labelKey]) end
    panel.widgets[#panel.widgets + 1] = b
  end
  action("open", function() SF.open(true) end, 16)
  action("log", function() showLog() end, 192)
  y = y - 30
  action("size", function() cdb.size = nil; if frame then frame:SetWidth(W); if frame:IsShown() then render() end end end, 16)
  y = y + 30
  action("reset", function() wipe(cdb.seen); wipe(cdb.done); wipe(cdb.gone); say(L().reset); if frame and frame:IsShown() then render() end end, 368)
  panel.refresh = function()
    title:SetText("Shaman: Forever " .. Api.version())
    sub:SetText(L().opt.intro)
    panel.specLabel:SetText(L().opt.spec)
    for spec, b in pairs(panel.specButtons) do
      b:SetText((spec == cdb.spec and "> " or "") .. (L().specs[spec] or spec) .. (spec == cdb.spec and " <" or ""))
    end
    for _, w in ipairs(panel.widgets) do w.refresh() end
    panel.leadLabel:SetText(string.format(L().opt.lead, cdb.lead))
    panel.langLabel:SetText(L().opt.lang)
  end
  panel:SetScript("OnShow", panel.refresh)
  if Settings and Settings.RegisterCanvasLayoutCategory then
    local cat = Settings.RegisterCanvasLayoutCategory(panel, panel.name)
    Settings.RegisterAddOnCategory(cat)
    panel.category = cat
  elseif InterfaceOptions_AddCategory then
    InterfaceOptions_AddCategory(panel)
  end
end
function SF.options()
  makeOptions()
  if InCombatLockdown() then return end
  if Settings and Settings.OpenToCategory and panel.category then
    Settings.OpenToCategory(panel.category:GetID())
  elseif InterfaceOptionsFrame_OpenToCategory then
    InterfaceOptionsFrame_OpenToCategory(panel)
    InterfaceOptionsFrame_OpenToCategory(panel)
  end
end

-- Slash commands -----------------------------------------------------------------
-- First-run setup (once per character; /sf setup brings it back): your
-- spec, whether the window may open by itself, and your route in Polestar.
local PACK_OF_RACE = { U = "sf-tauren", O = "sf-orc", T = "sf-orc", S = "sf-sky", D = "sf-dwarf" }
local function myRouteStart()
  local P = polestar()
  if not (P and P.Guides and P.Guides.List and P.Engine and P.Engine.SetGuide) then return nil end
  local kind = (cdb.spec == "Elemental" or cdb.spec == "Restoration") and "cast" or "enh"
  local prefix = (PACK_OF_RACE[raceLetter()] or "sf-orc") .. "-" .. kind .. "/"
  local ok, list = pcall(P.Guides.List)
  if not ok or type(list) ~= "table" then return nil end
  -- The main route's guide for your level (variants have a tag before the
  -- number): the first one that doesn't end below you.
  local lvl, best, bestN = UnitLevel("player"), nil, nil
  for _, h in ipairs(list) do
    local id = type(h) == "table" and h.id
    local n = type(id) == "string" and id:sub(1, #prefix) == prefix and tonumber(id:sub(#prefix + 1):match("^(%d%d)%-"))
    if n and (tonumber(h.maxLevel) or 99) >= lvl and (not bestN or n < bestN) then best, bestN = id, n end
  end
  return best
end
local setupFrame
function SF.setup()
  if InCombatLockdown() then return end
  if not setupFrame then
    local f = CreateFrame("Frame", "ShamanForeverSetup", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
    setupFrame = f
    f:SetSize(380, 230)
    f:SetPoint("CENTER", 0, 80)
    f:SetFrameStrata("DIALOG")
    f:EnableMouse(true)
    f:SetMovable(true)
    f:RegisterForDrag("LeftButton")
    f:SetScript("OnDragStart", f.StartMoving)
    f:SetScript("OnDragStop", f.StopMovingOrSizing)
    if f.SetBackdrop then
      f:SetBackdrop({ bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background", edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
        tile = true, tileSize = 32, edgeSize = 32, insets = { left = 11, right = 12, top = 12, bottom = 11 } })
    end
    f.icon = f:CreateTexture(nil, "ARTWORK")
    f.icon:SetSize(32, 32)
    f.icon:SetPoint("TOPLEFT", 20, -18)
    f.icon:SetTexture("Interface\\Icons\\Spell_Nature_LightningShield")
    f.title = f:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
    f.title:SetPoint("LEFT", f.icon, "RIGHT", 10, 0)
    f.title:SetText("Shaman: Forever")
    f.step = f:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    f.step:SetPoint("TOPRIGHT", -22, -24)
    f.text = f:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    f.text:SetPoint("TOPLEFT", 22, -64)
    f.text:SetPoint("RIGHT", -22, 0)
    f.text:SetJustifyH("LEFT")
    f.buttons = {}
    for i = 1, 3 do
      local b = CreateFrame("Button", nil, f, "UIPanelButtonTemplate")
      b:SetSize(108, 26)
      b:SetPoint("BOTTOMLEFT", 22 + (i - 1) * 114, 20)
      f.buttons[i] = b
    end
    f.close = CreateFrame("Button", nil, f, "UIPanelCloseButton")
    f.close:SetPoint("TOPRIGHT", -4, -4)
    f.close:SetScript("OnClick", function() cdb.setupDone = true; f:Hide() end)
  end
  local f = setupFrame
  local function page(n, text, buttons)
    f.step:SetText(string.format(L().setupStep, n, 3))
    f.text:SetText(text)
    for i, b in ipairs(f.buttons) do
      local spec = buttons[i]
      b:SetShown(spec ~= nil)
      if spec then b:SetText(spec[1]); b:SetScript("OnClick", spec[2]) end
    end
  end
  local pages = {}
  pages[1] = function()
    local function pick(spec) return function() cdb.spec = spec; routeCache = nil; pages[2]() end end
    page(1, L().setupSpec, { { L().specs.Enhancement, pick("Enhancement") }, { L().specs.Elemental, pick("Elemental") },
      { L().specs.Restoration, pick("Restoration") } })
  end
  pages[2] = function()
    local function pick(quiet) return function() cdb.quiet = quiet; pages[3]() end end
    page(2, L().setupPopups, { { L().yes, pick(false) }, { L().no, pick(true) } })
  end
  pages[3] = function()
    local start = myRouteStart()
    local done = function() cdb.setupDone = true; f:Hide(); SF.open(true) end
    if start then
      page(3, string.format(L().setupRoute, L().specs[cdb.spec] or cdb.spec), {
        { L().setupOpen, function() pcall(polestar().Engine.SetGuide, start); routeCache = nil; done() end },
        { L().setupLater, done } })
    else
      page(3, polestar() and L().setupNoPack or L().setupNoPolestar, { { L().setupFinish, done } })
    end
  end
  pages[1]()
  f:Show()
end

local SPEC_WORDS = { mejora = "Enhancement", enh = "Enhancement", enhancement = "Enhancement", ele = "Elemental", elemental = "Elemental",
  resto = "Restoration", restauracion = "Restoration", ["restauración"] = "Restoration", restoration = "Restoration" }
local function onOff(b) return b and L().on or L().off end

SLASH_SHAMANFOREVER1 = "/sf"
SLASH_SHAMANFOREVER2 = "/shamanforever"
SlashCmdList.SHAMANFOREVER = function(msg)
  local cmd, arg = (msg or ""):lower():match("^%s*(%S*)%s*(.-)%s*$")
  if cmd == "" then SF.open()
  elseif cmd == "spec" and SPEC_WORDS[arg] then
    cdb.spec = SPEC_WORDS[arg]
    say(string.format(L().specSet, specName()))
  elseif (cmd == "anticipo" or cmd == "lead") and tonumber(arg) then
    cdb.lead = math.max(0, math.min(5, math.floor(tonumber(arg))))
    say(string.format(L().leadSet, cdb.lead))
  elseif cmd == "silencio" or cmd == "quiet" then
    cdb.quiet = not cdb.quiet
    say(L().help[4]:format(onOff(cdb.quiet)))
  elseif cmd == "talentos" or cmd == "talents" then
    cdb.talents = not cdb.talents
    say(L().help[5]:format(onOff(cdb.talents)))
    local t = talentLine(UnitLevel("player"))
    if cdb.talents and t then say(t) end
  elseif cmd == "reiniciar" or cmd == "reset" then
    wipe(cdb.seen); wipe(cdb.done); wipe(cdb.gone)
    say(L().reset)
  elseif cmd == "registro" or cmd == "log" then showLog()
  elseif cmd == "setup" or cmd == "inicio" then SF.setup()
  elseif cmd == "config" or cmd == "opciones" or cmd == "options" then SF.options()
  elseif cmd == "flecha" or cmd == "arrow" then
    cdb.tomtom = not cdb.tomtom
    say(string.format(L().arrowMode, onOff(cdb.tomtom)))
  elseif cmd == "minimapa" or cmd == "minimap" then
    cdb.mmHide = not cdb.mmHide
    makeMinimapButton()
    if mmButton then mmButton:SetShown(not cdb.mmHide) end
  elseif cmd == "saltear" or cmd == "skip" then
    local info = routeInfo()
    local nd = info and (info.now or (info.dungeons[1] and info.dungeons[1].name))
    if nd then SF.skipDungeon(nd) else say(L().noRoute) end
  elseif cmd == "dondeestoy" or cmd == "whereami" then
    local name, kind, _, _, _, _, _, id = GetInstanceInfo()
    local map = C_Map and C_Map.GetBestMapForUnit and readable(C_Map.GetBestMapForUnit("player"))
    say(string.format("zona=%s subzona=%s mapa=%s instancia=%s (%s, %s) -> %s", here(), readable(GetSubZoneText()) or "", tostring(map),
      tostring(name), tostring(kind), tostring(id), tostring(currentDungeon())))
  elseif (cmd == "idioma" or cmd == "lang") and SF.L[arg] then
    db.lang = arg
    zoneNames = nil
  else
    for i, line in ipairs(L().help) do
      if i == 3 then line = line:format(cdb.lead)
      elseif i == 4 then line = line:format(onOff(cdb.quiet))
      elseif i == 5 then line = line:format(onOff(cdb.talents)) end
      say(line)
    end
  end
end

-- For the headless test (scripts/test-addon.lua).
SF.test = { pathTips = pathTips, pickupTips = pickupTips, dungeonTips = dungeonTips, zoneTips = zoneTips, upcoming = upcoming,
  gain = gain, onZone = onZone, onLevel = onLevel, talentLine = talentLine, giverText = giverText, waypoint = waypoint,
  archive = function(tip, kind) archive(tip, kind) end, inProgress = function() return inProgress() end, archived = function() return archived() end,
  npcLines = function(id) return npcLines(id) end, craftTips = function() return craftTips() end,
  currentView = function() return currentView() end }
