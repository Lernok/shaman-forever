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
local function wornValue(slot)
  local best
  for _, inv in ipairs(INV[slot] or {}) do
    local id = readable(GetInventoryItemID("player", inv))
    local v = 0
    if id then v = D.items[id] and value(id) or estimate(readable(GetInventoryItemLink("player", inv)), slot) end
    if best == nil or v < best then best = v end
  end
  return best or 0
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

-- Who gives a quest, in one line; and a waypoint to them.
local function giverText(g)
  if not g then return nil end
  if g.item then return type(g.item) == "string" and string.format(L().startsWith, g.item) or L().startsWithAny end
  if g.inside then return string.format(L().givenInside, g.n) end
  if g.x then return string.format(L().givenAt, g.n, areaName(g.z) or "?", math.floor(g.x + 0.5), math.floor(g.y + 0.5)) end
  return string.format(L().givenBy, g.n)
end
local function waypoint(g, title)
  if not g or not g.x or not g.z then return end
  local map = D.uiMaps[g.z]
  if map and TomTom and TomTom.AddWaypoint then
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
    if ok then say(string.format(L().pinSet, title)) return end
  end
  say(giverText(g))
end

-- Tips -------------------------------------------------------------------------
-- Each one: key (seen/done), item or icon, three lines, giver, order.
local function gainText(g)
  if g.cur <= 0 then return L().gainNew end
  if g.slot == "Weapon" and cdb.spec == "Enhancement" then return string.format(L().gainDps, num(g.v), num(g.cur)) end
  return string.format(L().gainPct, math.floor((g.v / g.cur - 1) * 100 + 0.5))
end

-- Upgrades on your gear path from now to `lead` levels ahead.
local function pathTips(filter)
  local lvl, tips = UnitLevel("player"), {}
  for _, st in ipairs(myPath()) do
    if st.l - cdb.lead <= lvl and lvl < st.u and st.l > lvl - STALE and not Api.questDone(st.q) then
      local g = gain(st.i)
      local key = st.q and ("q" .. st.q .. ":" .. st.i) or ("i" .. st.i)
      if g and not cdb.done[key] and (not filter or filter(st)) then
        local src
        if st.a == "vendor" then src = string.format(L().vendor, st.k or "?") .. " · " .. zoneName(st.z)
        elseif st.a == "class" then src = string.format(L().classQuest, st.qn or "?")
        elseif st.a == "dquest" then src = string.format(L().dquest, st.z, st.qn or "?")
        else src = string.format(L().quest, st.qn or "?") .. " · " .. zoneName(st.z) end
        local head = st.l <= lvl and string.format(L().levelNow, st.l) or string.format(L().levelIn, st.l, st.l - lvl)
        tips[#tips + 1] = { key = key, item = st.i, head = head .. " · " .. Api.itemName(st.i), src = src, gain = gainText(g),
          giver = st.q and D.givers[st.q], title = st.qn, order = st.l }
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
          if target and g and not g.inside and not g.item and not cdb.done[key] and not seenKey[key]
            and (not inZone or (g.z and areaName(g.z) == z)) then
            seenKey[key] = true
            local src = string.format(L().pickup, target.qn or "?")
            if chain and chain ~= target.qn then src = src .. " " .. string.format(L().chainTo, chain) end
            local third = giverText(g)
            if (e.r or 0) > lvl then third = third .. " · " .. string.format(L().fromLevel, e.r) end
            tips[#tips + 1] = { key = key, icon = QUEST_ICON, head = string.format(L().forDungeon, dname, lv[1], lv[2]),
              src = src, gain = third, giver = g, title = target.qn, order = lv[1] }
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
    if not cdb.done[key] then
      local has = Api.onQuest(qid)
      tips[#tips + 1] = { key = key, item = b.q.i, head = Api.itemName(b.q.i), src = string.format(L().quest, b.q.qn)
        .. " · " .. (has and ("|cff40ff40" .. L().haveIt .. "|r") or ("|cffff6060" .. L().missing .. "|r")),
        gain = gainText(b.g), giver = D.givers[qid], title = b.q.qn, order = -b.g.v / math.max(b.g.cur, 1) }
    end
  end
  -- Boss drops you can wear soon.
  for _, dr in ipairs(d.drops) do
    local it = D.items[dr.i]
    local key = "d" .. dr.i
    if it and it.r <= lvl + 3 and not cdb.done[key] then
      local g = gain(dr.i)
      if g then
        tips[#tips + 1] = { key = key, item = dr.i, head = Api.itemName(dr.i), src = string.format(L().boss, dr.b or "?"),
          gain = gainText(g), order = -g.v / math.max(g.cur, 1) }
      end
    end
  end
  table.sort(tips, function(a, b) return a.order < b.order end)
  return tips
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
local frame, rows, logFrame = nil, {}, nil
local ROWS, ROW_H, W = 10, 44, 420

local function rowTooltip(r)
  local tip = r.tip
  GameTooltip:SetOwner(r, "ANCHOR_LEFT")
  if tip.item then GameTooltip:SetItemByID(tip.item) else GameTooltip:SetText(tip.head, 1, 0.82, 0) end
  for _, line in ipairs(tip.lines or {}) do GameTooltip:AddLine(line, 1, 1, 1) end
  local gt = giverText(tip.giver)
  if gt then
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine(gt, 0.4, 0.8, 1)
    if tip.giver.x then GameTooltip:AddLine(L().clickArrow, 0.6, 0.6, 0.6) end
  end
  GameTooltip:Show()
end

local function makeRow(i)
  local r = CreateFrame("Button", nil, frame)
  r:SetSize(W - 20, ROW_H)
  r:SetPoint("TOPLEFT", 10, -36 - (i - 1) * ROW_H)
  r.icon = r:CreateTexture(nil, "ARTWORK")
  r.icon:SetSize(32, 32)
  r.icon:SetPoint("LEFT", 0, 0)
  local function line(font, anchor, dy)
    local fs = r:CreateFontString(nil, "OVERLAY", font)
    fs:SetPoint("TOPLEFT", anchor, anchor == r.icon and "TOPRIGHT" or "BOTTOMLEFT", anchor == r.icon and 6 or 0, dy)
    fs:SetPoint("RIGHT", -64, 0)
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
  r.check:SetPoint("RIGHT", -34, 0)
  r.checkLabel = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  r.checkLabel:SetPoint("LEFT", r.check, "RIGHT", 0, 0)
  r.check:SetScript("OnClick", function(self)
    cdb.done[r.tip.key] = self:GetChecked() and true or nil
    r:SetAlpha(self:GetChecked() and 0.4 or 1)
  end)
  r.check:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT"); GameTooltip:SetText(L().doneTip, 1, 1, 1, 1, true); GameTooltip:Show()
  end)
  r.check:SetScript("OnLeave", function() GameTooltip:Hide() end)
  r:SetScript("OnEnter", rowTooltip)
  r:SetScript("OnLeave", function() GameTooltip:Hide() end)
  r:SetScript("OnClick", function(self) waypoint(self.tip.giver, self.tip.title or self.tip.head) end)
  return r
end

local function makeFrame()
  frame = CreateFrame("Frame", "ShamanForeverFrame", UIParent)
  frame:SetSize(W, 100)
  frame:SetPoint("TOPRIGHT", -220, -180)
  frame:SetFrameStrata("HIGH")
  frame:SetClampedToScreen(true)
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
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
  frame.empty:SetPoint("TOPLEFT", 10, -40)
  frame.empty:SetPoint("RIGHT", -10, 0)
  frame.empty:SetJustifyH("LEFT")
  frame.more = frame:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  tinsert(UISpecialFrames, "ShamanForeverFrame") -- Escape closes it
  for i = 1, ROWS do rows[i] = makeRow(i) end
end

-- Shows a list of tips with a title.
local function show(title, tips)
  if not frame then makeFrame() end
  frame.title:SetText(title)
  frame.spec.text:SetText(string.format(L().spec, specName()))
  for i = 1, ROWS do
    local r, tip = rows[i], tips[i]
    r.tip = tip
    if tip then
      r.icon:SetTexture(tip.icon or Api.icon(tip.item))
      r.head:SetText(tip.head)
      r.src:SetText(tip.src)
      r.gain:SetText(tip.gain or "")
      r.check:SetChecked(cdb.done[tip.key] and true or false)
      r.checkLabel:SetText(L().done)
      r:SetAlpha(1)
      r:Show()
    else
      r:Hide()
    end
  end
  local n = math.min(#tips, ROWS)
  frame.empty:SetText(#tips == 0 and L().nothing or "")
  frame.more:ClearAllPoints()
  frame.more:SetPoint("TOPLEFT", 10, -40 - n * ROW_H)
  frame.more:SetText(#tips > ROWS and string.format(L().more, #tips - ROWS) or "")
  frame:SetHeight(#tips == 0 and 70 or (48 + n * ROW_H + (#tips > ROWS and 14 or 0)))
  frame:Show()
end

-- Tips shown by themselves are marked seen: they don't pop up again.
local pending
local function popup(title, tips)
  local new = {}
  for _, tip in ipairs(tips) do if not cdb.seen[tip.key] then new[#new + 1] = tip end end
  if #new == 0 then return end
  for _, tip in ipairs(new) do cdb.seen[tip.key] = true end
  say(string.format(L().chatNew, #new))
  if cdb.quiet then return end
  -- Never in the middle of a fight: after it.
  if InCombatLockdown() then pending = { title, new } return end
  show(title, new)
end

local function upcoming()
  local tips = pickupTips(false)
  for _, t in ipairs(pathTips()) do tips[#tips + 1] = t end
  table.sort(tips, function(a, b) return a.order < b.order end)
  return tips
end

-- "/sf": the dungeon you're in, or everything coming up.
function SF.open(keep)
  if frame and frame:IsShown() and not keep then frame:Hide() return end
  local dname = currentDungeon()
  if dname then show(string.format(L().inDungeon, dname), dungeonTips(dname))
  else show(string.format(L().upcoming, UnitLevel("player")), upcoming()) end
end

-- Events -------------------------------------------------------------------------
local function zoneTips()
  local z = here()
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

local function onLevel(lvl)
  log("level")
  if cdb.talents then
    local t = talentLine(lvl)
    if t then say(t) end
  end
  popup(string.format(L().upcoming, lvl), upcoming())
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
    cdb.seen, cdb.done, cdb.log = cdb.seen or {}, cdb.done or {}, cdb.log or {}
    self:UnregisterEvent("ADDON_LOADED")
    self:RegisterEvent("PLAYER_ENTERING_WORLD")
    self:RegisterEvent("ZONE_CHANGED_NEW_AREA")
    self:RegisterEvent("PLAYER_LEVEL_UP")
    self:RegisterEvent("PLAYER_REGEN_ENABLED")
    self:RegisterEvent("QUEST_TURNED_IN")
    self:RegisterEvent("QUEST_ACCEPTED")
  elseif event == "PLAYER_ENTERING_WORLD" or event == "ZONE_CHANGED_NEW_AREA" then
    -- The zone's name settles a moment after a loading screen.
    C_Timer.After(2, onZone)
  elseif event == "PLAYER_LEVEL_UP" then
    local lvl = ...
    -- UnitLevel catches up a moment later.
    C_Timer.After(1, function() onLevel(tonumber(lvl) or UnitLevel("player")) end)
  elseif event == "QUEST_TURNED_IN" then
    log("quest", tostring((...)))
  elseif event == "QUEST_ACCEPTED" then
    -- QUEST_ACCEPTED gives (index, id) on old clients, (id) on new ones.
    local a, b = ...
    log("accept", tostring(b or a))
  elseif event == "PLAYER_REGEN_ENABLED" and pending then
    local p = pending
    pending = nil
    show(p[1], p[2])
  end
end)

-- Item tooltips: better or worse than what you wear, for your spec.
local function onTooltip(tt, id)
  if not cdb or not id or not D.items[id] then return end
  local v = value(id)
  if v <= 0 then return end
  local cur = wornValue(D.items[id].s)
  local text, r, g, b
  if cur <= 0 then text, r, g, b = string.format(L().tipEmpty, specName()), 0.4, 1, 0.4
  elseif v >= cur then text, r, g, b = string.format(L().tipBetter, math.floor((v / cur - 1) * 100 + 0.5), specName()), 0.4, 1, 0.4
  else text, r, g, b = string.format(L().tipWorse, math.floor((1 - v / cur) * 100 + 0.5), specName()), 0.6, 0.6, 0.6 end
  tt:AddLine("Shaman: Forever: " .. text, r, g, b)
  if D.iq and D.iq[id] then tt:AddLine(L().markHint, 0.5, 0.75, 1) end
end

-- Shift+click on an item: a mark on the map where to pick up the quest that
-- rewards it, at the step of its chain you're at (or where to turn it in, if
-- you already carry that step).
local function questOf(id)
  local f = myFaction():sub(1, 1)
  local mine
  for _, e in ipairs(D.iq[id] or {}) do
    if not e[2] or e[2] == f then
      if not Api.questDone(e[1]) then return e[1] end
      mine = mine or e[1]
    end
  end
  return mine, mine ~= nil
end
local function chainOf(qid)
  local list, seen = {}, {}
  while qid and not seen[qid] do
    seen[qid] = true
    table.insert(list, 1, qid)
    qid = D.qpre[qid]
  end
  return list
end
function SF.markItem(id, linkName)
  if not cdb or not D.iq or not D.iq[id] then return false end
  local qid, done = questOf(id)
  if not qid then return false end
  local item = linkName or Api.itemName(id)
  if done then say(string.format(L().markDone, item)) return true end
  local chain = chainOf(qid)
  local step, n = qid, #chain
  for i, q in ipairs(chain) do
    if not Api.questDone(q) then step, n = q, i break end
  end
  local name = D.qnames[step] or ("#" .. step)
  say(string.format(L().markInfo, item, name, n, #chain))
  if Api.onQuest(step) then
    local e = D.enders[step]
    if e then waypoint(e, string.format(L().markTurnIn, name)) else say(string.format(L().markNoWhere, name)) end
  else
    local g = D.givers[step]
    if g then waypoint(g, string.format(L().pickup, name)) else say(string.format(L().markNoWhere, name)) end
  end
  return true
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

-- Slash commands -----------------------------------------------------------------
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
    wipe(cdb.seen); wipe(cdb.done)
    say(L().reset)
  elseif cmd == "registro" or cmd == "log" then showLog()
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
  gain = gain, onZone = onZone, onLevel = onLevel, talentLine = talentLine, giverText = giverText, waypoint = waypoint }
