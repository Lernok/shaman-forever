-- Writ Planner: game side. Prices from Auctionator (its API, plus its price
-- history for "cheap / dear compared with usual"), your reputation with the
-- Azeroth Commerce Authority, the writs you already turned in today or carry,
-- the flight paths you know (saved when you open a flight map), and where you
-- are. Planner.lua does the math; UI.lua shows it.
WritPlanner = WritPlanner or {}
local W = WritPlanner
local P = W.Planner
local D = WritPlanner_DATA
local CALLER = "Writ Planner"

W.STANDINGS = {
  { key = "friendly", name = "Friendly", value = 3000 },
  { key = "honored", name = "Honored", value = 9000 },
  { key = "revered", name = "Revered", value = 21000 },
  { key = "exalted", name = "Exalted", value = 42000 },
}
local LEVELS = { { 0, "Neutral", 3000 }, { 3000, "Friendly", 9000 }, { 9000, "Honored", 21000 }, { 21000, "Revered", 42000 }, { 42000, "Exalted", 42999 } }
W.SPEEDS = {
  { key = "auto", name = "Automática" },
  { key = "foot", name = "A pie", v = 7 },
  { key = "wolf", name = "Lobo fantasma", v = 9.8 },
  { key = "mount", name = "Montura", v = 11.2 },
  { key = "epic", name = "Montura épica", v = 14 },
}
W.FACTIONS = { 2586, 2587 }

local function chat(msg) DEFAULT_CHAT_FRAME:AddMessage("|cff33bbffWrit Planner:|r " .. msg) end
W.chat = chat

function W.money(c, plain)
  if not c then return "?" end
  local g = c / 10000
  local s
  if c >= 9950 then s = string.format("%.2f g", g) else s = string.format("%d s", math.floor(c / 100 + 0.5)) end
  s = s:gsub("%.", ",")
  return s
end

-- Saved data ------------------------------------------------------------------

local function defaults()
  WritPlannerDB = WritPlannerDB or {}
  local db = WritPlannerDB
  db.hist = db.hist or {}       -- [realm][itemID][auctionatorDay] = lowest price that day
  db.learned = db.learned or {} -- [questID] = where it was turned in (writs without a known place)
  WritPlannerCharDB = WritPlannerCharDB or {}
  local c = WritPlannerCharDB
  c.flights = c.flights or {}   -- [taxi node id] = true
  c.gone = c.gone or {}         -- [questID] = daily reset key: "not on sale" for today
  c.opts = c.opts or {}
  c.stored = c.stored or {}     -- bank / mail = { [itemID] = count }, as last seen there
  c.stored.bank = c.stored.bank or {}
  c.stored.mail = c.stored.mail or {}
  local o = c.opts
  o.target, o.custom = nil, nil -- 0.1.0 settings
  if o.tol == nil then o.tol = 1 end
  if o.mode == nil then o.mode = "fly" end
  if o.speed == nil then o.speed = "auto" end
  if o.maxAge == nil then o.maxAge = 2 end
  if o.danger == nil then o.danger = 2 end
  if o.plan == nil then o.plan = "rec" end
  if o.hearth == nil then o.hearth = true end
  if o.from == nil then o.from = "here" end
  if o.share == nil then o.share = true end
  if o.days == nil then o.days = 7 end -- turn-in spots with mobs up to your level + this
end

local function realm() return GetRealmName and GetRealmName() or "?" end

-- A key that changes at the daily reset.
local function resetKey()
  local left = GetQuestResetTime and GetQuestResetTime() or 0
  return math.floor((time() + left) / 3600 + 0.5)
end
W.resetKey = resetKey

-- Prices ------------------------------------------------------------------------

local function auctionator() return Auctionator and Auctionator.API and Auctionator.API.v1 end
W.hasAuctionator = function() return auctionator() ~= nil end

function W.price(id)
  local api = auctionator()
  if not api then return nil end
  local ok, p = pcall(api.GetAuctionPriceByItemID, CALLER, id)
  if ok and p and p > 0 then return p end
end

function W.age(id)
  local api = auctionator()
  if not api then return nil end
  local ok, a = pcall(api.GetAuctionAgeByItemID, CALLER, id)
  if ok then return a end
end

-- Auctionator keeps the last price it saw even after the item sold out. Its
-- full scan (the "Scan" button, or the automatic one on opening the auction
-- house) records when it ran: an item last seen on an earlier day than that
-- scan wasn't on sale then, so it isn't planned for today.
local function scanDay(t)
  local d0 = Auctionator and Auctionator.Constants and Auctionator.Constants.SCAN_DAY_0
  if not d0 or not t then return nil end
  return math.floor((t - d0) / 86400)
end
function W.lastFullScan()
  local st = Auctionator and Auctionator.SavedState
  if type(st) ~= "table" then return nil end
  local t = math.max(st.TimeOfLastBrowseScan or 0, st.TimeOfLastReplicateScan or 0, st.TimeOfLastGetAllScan or 0)
  if t > 0 then return t end
end
function W.missing(id)
  local full = scanDay(W.lastFullScan())
  local age = W.age(id)
  if not full or not age then return false end
  return scanDay(time()) - age < full
end

-- Auctionator's per-day history for an item (internal, read with care):
-- { {day=, low=, available=}, ... } newest first.
local function aHistory(id)
  local db = Auctionator and Auctionator.Database
  if not db or not db.GetPriceHistory then return nil end
  local ok, h = pcall(db.GetPriceHistory, db, tostring(id))
  if not ok or type(h) ~= "table" then return nil end
  local out = {}
  for _, e in ipairs(h) do
    local day = tonumber(e.rawDay)
    if day and e.minSeen then out[#out + 1] = { day = day, low = e.minSeen, available = e.available } end
  end
  return out
end

-- Units seen on sale in the latest scan that saw the item (nil: unknown).
function W.stock(id)
  local h = aHistory(id)
  if h and h[1] and (W.age(id) or 99) == 0 then return h[1].available end
end

-- Every writ and item id.
local ALL = {}
for _, w in ipairs(D.writs) do ALL[w.w] = true; ALL[w.i] = true end
W.ALL = ALL

-- Copies Auctionator's daily lows into our own history (it prunes old days;
-- ours keeps 60).
function W.snapshot()
  local hist = WritPlannerDB.hist
  hist[realm()] = hist[realm()] or {}
  local R = hist[realm()]
  local newest = 0
  for id in pairs(ALL) do
    local h = aHistory(id)
    if h then
      R[id] = R[id] or {}
      for _, e in ipairs(h) do
        R[id][e.day] = e.low
        if e.day > newest then newest = e.day end
      end
    end
  end
  if newest > 0 then
    for _, days in pairs(R) do
      for d in pairs(days) do if d < newest - 60 then days[d] = nil end end
    end
  end
end

-- The usual price: the median of the daily lows before the latest day seen
-- (needs 3 days).
function W.usual(id)
  local R = WritPlannerDB.hist[realm()]
  local days = R and R[id]
  if not days then return nil end
  local list, newest = {}, 0
  for d in pairs(days) do if d > newest then newest = d end end
  for d, p in pairs(days) do if d ~= newest then list[#list + 1] = p end end
  if #list < 3 then return nil end
  table.sort(list)
  local m = #list
  if m % 2 == 1 then return list[(m + 1) / 2] end
  return math.floor((list[m / 2] + list[m / 2 + 1]) / 2)
end

-- Reputation --------------------------------------------------------------------

-- Your reputation for the writs: Horde earns it with Durotar Supply and
-- Logistics (2587), Alliance with the Azeroth Commerce Authority (2586).
-- Returns value, faction name, read from the game (true) or typed by you.
local function factionData(id)
  if C_Reputation and C_Reputation.GetFactionDataByID then
    local d = C_Reputation.GetFactionDataByID(id)
    if d and d.name then return d.name, d.currentStanding end
  end
  if GetFactionInfoByID then
    local n, _, _, _, _, v = GetFactionInfoByID(id)
    if n then return n, v end
  end
end

function W.gameRep()
  local mine = UnitFactionGroup("player") == "Alliance" and 2586 or 2587
  local name, value = factionData(mine)
  if not value then
    local other = mine == 2586 and 2587 or 2586
    name, value = factionData(other)
  end
  return value, name
end

function W.rep()
  local o = WritPlannerCharDB.opts
  local value, name = W.gameRep()
  if o.manualRep then return o.manualRep, name, false end
  if value then return value, name, true end
end

-- The goal as an absolute value: what you typed ("+500" adds to what you
-- have), or else the next standing.
function W.goal(cur)
  local o = WritPlannerCharDB.opts
  local t = o.goal and tostring(o.goal) or ""
  local plus = tonumber(t:match("^%s*%+%s*(%d+)"))
  if plus and cur then return cur + plus end
  local abs = tonumber(t)
  if abs then return abs end
  if cur then
    for _, s in ipairs(W.STANDINGS) do if s.value > cur then return s.value end end
  end
end

function W.level(value)
  for i = #LEVELS, 1, -1 do
    local l = LEVELS[i]
    if value >= l[1] then return l[2], value - l[1], l[3] - l[1] end
  end
end

-- What you have and did -------------------------------------------------------

local function count(id)
  if C_Item and C_Item.GetItemCount then return C_Item.GetItemCount(id) or 0 end
  return GetItemCount and GetItemCount(id) or 0
end
-- What's waiting at the bank or the mailbox (as last seen there).
local function stored(id)
  local s = WritPlannerCharDB.stored
  return (s.bank[id] or 0) + (s.mail[id] or 0)
end
local function owned(id) return count(id) + stored(id) end
-- Where to pick it up when the bags don't have enough: "correo", "banco" or nil.
local function pickup(id, need)
  if count(id) >= need then return nil end
  local s = WritPlannerCharDB.stored
  if (s.mail[id] or 0) > 0 then return "correo" end
  if (s.bank[id] or 0) > 0 then return "banco" end
end
W.owned, W.pickup = owned, pickup

-- The bank: what it holds of each writ and item (counted while it's open).
local bankOpen = false
function W.scanBank()
  if not bankOpen then return end
  local bank = {}
  for id in pairs(ALL) do
    local all = (C_Item and C_Item.GetItemCount and C_Item.GetItemCount(id, true)) or (GetItemCount and GetItemCount(id, true)) or 0
    local n = all - count(id)
    if n > 0 then bank[id] = n end
  end
  WritPlannerCharDB.stored.bank = bank
end

-- The mailbox: attachments of every letter (auction purchases land here).
function W.scanMail()
  if not GetInboxNumItems then return end
  local mail = {}
  for i = 1, GetInboxNumItems() do
    local cod = select(6, GetInboxHeaderInfo(i)) or 0
    if cod == 0 then
      for a = 1, ATTACHMENTS_MAX_RECEIVE or 16 do
        local _, id, _, n = GetInboxItem(i, a)
        if id and ALL[id] then mail[id] = (mail[id] or 0) + (n or 1) end
      end
    end
  end
  WritPlannerCharDB.stored.mail = mail
end

local function doneToday(q)
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then return C_QuestLog.IsQuestFlaggedCompleted(q) end
  return IsQuestFlaggedCompleted and IsQuestFlaggedCompleted(q)
end
local function onQuest(q)
  if C_QuestLog and C_QuestLog.IsOnQuest then return C_QuestLog.IsOnQuest(q) end
  return false
end

-- Writs whose place we learned in game join the data (zone = -uiMapID).
function W.mergeLearned()
  for q, l in pairs(WritPlannerDB.learned) do
    for _, w in ipairs(D.writs) do
      if w.q == q and not w.z then
        w.npc, w.z, w.x, w.y, w.wx, w.wy, w.learned = l.npc, -l.map, l.x, l.y, l.wx, l.wy, true
        D.zones[-l.map] = D.zones[-l.map] or { name = l.zone, map = l.map, cont = l.cont }
      end
    end
  end
end

-- The writs you can turn in (today = what's left today, what you carry is
-- free; later = every writ at its price). Each: { w, cost, zone, cont, ... }.
function W.candidates(today)
  local o = WritPlannerCharDB.opts
  local key = resetKey()
  local out, skipped = {}, { done = 0, noPrice = 0, gone = 0, old = 0, danger = 0, unseen = 0 }
  local side = UnitFactionGroup("player") == "Alliance" and "dA" or "dH"
  local maxDanger = o.danger and o.danger < 99 and ((UnitLevel("player") or 60) + o.danger) or nil
  for _, w in ipairs(D.writs) do
    local z = w.z and D.zones[w.z]
    if z then
      local c = { w = w, zone = w.z, cont = z.cont }
      local ok = true
      if today and doneToday(w.q) then ok = false; skipped.done = skipped.done + 1 end
      if ok and today and WritPlannerCharDB.gone[w.q] == key then ok = false; skipped.gone = skipped.gone + 1 end
      c.danger = w[side]
      if ok and maxDanger and c.danger and c.danger > maxDanger then ok = false; skipped.danger = skipped.danger + 1 end
      if ok then
        local need = w.n or 1
        local haveWrit = today and (owned(w.w) > 0 or onQuest(w.q))
        local haveItems = today and math.min(owned(w.i), need) or 0
        local wp, ip = W.price(w.w), W.price(w.i)
        local fresh = function(id) local a = W.age(id); return a ~= nil and a <= o.maxAge end
        if not haveWrit and (not wp or not fresh(w.w)) then ok = false end
        if haveItems < need and (not ip or not fresh(w.i)) then ok = false end
        -- Today: not in your last full scan = not on sale (another day it may be back).
        if ok and today and ((not haveWrit and W.missing(w.w)) or (haveItems < need and W.missing(w.i))) then
          ok = false; skipped.unseen = skipped.unseen + 1
        elseif not ok then
          if (wp and not fresh(w.w)) or (ip and not fresh(w.i)) then skipped.old = skipped.old + 1 else skipped.noPrice = skipped.noPrice + 1 end
        else
          c.writCost = haveWrit and 0 or wp
          c.itemCost = (need - haveItems) * (ip or 0)
          c.cost = c.writCost + c.itemCost
          c.haveWrit, c.haveItems = haveWrit, haveItems >= need
          if today then
            c.writAt = haveWrit and not onQuest(w.q) and pickup(w.w, 1) or nil
            c.itemAt = haveItems > 0 and pickup(w.i, need) or nil
          end
          local uw, ui = W.usual(w.w), W.usual(w.i)
          if uw and ui and wp and ip then
            c.usual = uw + ui * need
            c.ratio = (wp + ip * need) / c.usual
            -- Another day: today's price only if you buy it today and it's a
            -- deal; otherwise count on the usual price, not on today's luck.
            if not today then
              c.buyNow = c.ratio <= 0.85
              c.cost = c.buyNow and (wp + ip * need) or c.usual
            end
          end
          out[#out + 1] = c
        end
      end
    end
  end
  return out, skipped
end

-- Flight paths ------------------------------------------------------------------

local nodeByName = {}
for id, n in pairs(D.nodes) do nodeByName[n.name] = nodeByName[n.name] or {}; table.insert(nodeByName[n.name], id) end

function W.saveFlights()
  local f = WritPlannerCharDB.flights
  local added = 0
  local function add(id)
    if D.nodes[id] and not f[id] then f[id] = true; added = added + 1 end
  end
  if C_TaxiMap and C_TaxiMap.GetAllTaxiNodes and GetTaxiMapID then
    local map = GetTaxiMapID()
    local ok, nodes = pcall(C_TaxiMap.GetAllTaxiNodes, map)
    if ok and nodes then
      local unreachable = Enum and Enum.FlightPathState and Enum.FlightPathState.Unreachable or 2
      for _, n in ipairs(nodes) do
        if n.state ~= unreachable then
          if D.nodes[n.nodeID] then add(n.nodeID)
          elseif n.name and nodeByName[n.name] then for _, id in ipairs(nodeByName[n.name]) do add(id) end end
        end
      end
    end
  elseif NumTaxiNodes then
    local faction = UnitFactionGroup("player") == "Horde" and "H" or "A"
    for i = 1, NumTaxiNodes() do
      local kind = TaxiNodeGetType(i)
      if kind == "CURRENT" or kind == "REACHABLE" then
        for _, id in ipairs(nodeByName[TaxiNodeName(i)] or {}) do
          if D.nodes[id].side:find(faction) then add(id) end
        end
      end
    end
  end
  if added > 0 then chat(("anoté %d vuelos nuevos."):format(added)) end
end

function W.flightCount(cont)
  local n = 0
  for id in pairs(WritPlannerCharDB.flights) do if D.nodes[id] and (cont == nil or D.nodes[id].cont == cont) then n = n + 1 end end
  return n
end

-- Where you are, in world yards.
function W.here()
  if not (C_Map and C_Map.GetBestMapForUnit) then return nil end
  local map = C_Map.GetBestMapForUnit("player")
  local pos = map and C_Map.GetPlayerMapPosition(map, "player")
  if not pos then return nil end
  local cont, world = C_Map.GetWorldPosFromMapPos(map, pos)
  if not cont or not world then return nil end
  local x, y = world:GetXY()
  return { x = x, y = y, cont = cont }
end

function W.speed()
  local o = WritPlannerCharDB.opts
  for _, s in ipairs(W.SPEEDS) do if s.key == o.speed and s.v then return s.v end end
  -- Automatic: riding if you have it, Ghost Wolf for a Shaman from 20, else on foot.
  local function known(id) return IsPlayerSpell and IsPlayerSpell(id) end
  if known(33391) or known(34090) or known(34091) then return 14 end
  if known(33388) then return 11.2 end
  local _, class = UnitClass("player")
  if class == "SHAMAN" and (UnitLevel("player") or 1) >= 20 then return 9.8 end
  return 7
end

-- Where your hearthstone is set: saved when you set it (HEARTHSTONE_BOUND),
-- or the flight master of the town it names. Returns pos, name.
local function nodeOfTown(town)
  if not town then return nil end
  for id, n in pairs(D.nodes) do
    if n.name:match("^[^,]+") == town then
      local faction = UnitFactionGroup("player") == "Alliance" and "A" or "H"
      if n.side:find(faction) then return { x = n.x, y = n.y, cont = n.cont } end
    end
  end
end
W.nodeOfTown = nodeOfTown
function W.bind()
  local town = GetBindLocation and GetBindLocation()
  local h = WritPlannerCharDB.hearth
  if h and h.town == town then return { x = h.x, y = h.y, cont = h.cont }, town end
  local inn = W.innOf and W.innOf(town)
  if inn then return { x = inn.x, y = inn.y, cont = inn.cont }, town end
  return nodeOfTown(town), town
end

-- Where the trip starts: where you are, or a town you pick (its inn), since
-- you usually buy the writs in a city first.
local function innOf(town)
  for _, inn in ipairs(D.inns or {}) do if inn.town == town then return inn end end
end
function W.startPos()
  local from = WritPlannerCharDB.opts.from
  if from and from ~= "here" then
    local inn = innOf(from)
    if inn then return { x = inn.x, y = inn.y, cont = inn.cont }, from end
  end
  return W.here(), nil
end

local function near(a, b) return a and b and a.cont == b.cont and math.abs(a.x - b.x) + math.abs(a.y - b.y) < 300 end

-- The hearthstone on today's trip (if the option is on): used once where it
-- saves the most from where it's set; and, if going first to another inn to
-- set it there and starting from it makes the whole trip 5 minutes shorter
-- or more, the plan does that (plan.preBind) with the route from that inn.
function W.hearthPlan(plan, travel, start)
  local o = WritPlannerCharDB.opts
  if not plan or not plan.route or not o.hearth then return end
  local bind, town = W.bind()
  plan.hearthSave = P.useHearth(plan.route, travel, bind, town)
  plan.time = plan.time - plan.hearthSave
  if not start then return end
  local faction = UnitFactionGroup("player") == "Alliance" and "A" or "H"
  local conts = {}
  for _, c in ipairs(plan.writs) do conts[c.cont] = true end
  local best, bestTime
  for _, inn in ipairs(D.inns or {}) do
    local here = { x = inn.x, y = inn.y, cont = inn.cont }
    if inn.side:find(faction) and conts[inn.cont] and not near(here, bind) then
      P.tick(#plan.writs * #plan.writs * 30)
      local go, how = travel(start, here)
      local r, t = P.route(plan.writs, here, travel)
      local _, save = P.hearthBest(r, travel, here)
      local total = go + t - (save or 0)
      if total + 300 < plan.time and (not bestTime or total < bestTime) then
        best, bestTime = { inn = inn, go = go, how = how, route = r }, total
      end
    end
  end
  if best then
    P.useHearth(best.route, travel, { x = best.inn.x, y = best.inn.y, cont = best.inn.cont }, best.inn.town)
    plan.preBind = { town = best.inn.town, npc = best.inn.npc, x = best.inn.x, y = best.inn.y, cont = best.inn.cont, go = best.go, how = best.how, save = plan.time - bestTime }
    plan.route, plan.time = best.route, bestTime
  end
end
W.innOf = innOf

function W.travelFn()
  local o = WritPlannerCharDB.opts
  return P.travel({ speed = W.speed(), known = o.mode == "fly" and WritPlannerCharDB.flights or nil, nodes = D.nodes, paths = D.paths })
end

-- The plan --------------------------------------------------------------------

-- Works out today's trip and, when the goal or the budget asks for it, the
-- plan in days. Returns a table UI.lua shows.
function W.compute()
  local o = WritPlannerCharDB.opts
  local R = { }
  local cur, fname, fromGame = W.rep()
  R.rep, R.faction, R.fromGame = cur, fname, fromGame
  local goal = W.goal(cur)
  R.goal = goal
  local need = cur and goal and (goal - cur) or nil
  R.need = need
  if not need then R.err = "norep" return R end
  if need <= 0 then R.err = "reached" return R end
  if not W.hasAuctionator() then R.err = "noauc" return R end

  local today, skipped = W.candidates(true)
  local later = W.candidates(false)
  R.skipped = skipped
  if #today == 0 and #later == 0 then R.err = "noprices" return R end

  local tol = (tonumber(o.tol) or 0) * 10000
  local mode = o.plan or "rec"
  local budget = mode == "gold" and tonumber(o.budget) and tonumber(o.budget) * 10000 or nil
  local travel = W.travelFn()
  local start, fromTown = W.startPos()
  R.fromTown = fromTown
  R.budget, R.tol = budget, tol
  local U = P.units(need)
  local perDay = tonumber(o.perDay)

  -- The cheapest split for each number of days (a day can take every writ
  -- there is, unless you set a most per day), then the plan you asked for:
  -- recommended, fastest, within N days, or within a gold limit.
  local cap = math.min(U, perDay and P.units(perDay) or U)
  local Tt, Tl = P.dayTable(today, cap), P.dayTable(later, cap)
  local opts = P.days(Tt, Tl, U, tol, 30)
  R.options, R.presets, R.mode = opts, P.presets(opts), mode
  local chosen
  if mode == "fast" then chosen = R.presets.fast
  elseif mode == "days" then
    R.wantDays = math.max(1, math.floor(tonumber(o.days) or 7))
    chosen = P.within(opts, R.wantDays)
    if not chosen then chosen = R.presets.fast; R.tooFew = true end
  elseif mode == "gold" then
    local fastest, cheapest = P.pickDays(opts, budget)
    chosen = fastest or cheapest
    R.overBudget = budget and chosen and chosen.total > budget
  else chosen = R.presets.rec end
  if chosen then
    R.plan, R.days = chosen, chosen.days
    if chosen.goals[1] and chosen.goals[1] > 0 then
      R.today = P.best(today, chosen.days == 1 and U or chosen.goals[1], tol, start, travel)
      W.hearthPlan(R.today, travel, start)
    end
    -- What the next days would use that is cheaper today than usual: buy it now.
    if chosen.days > 1 and chosen.goals[2] and chosen.goals[2] > 0 then
      local nextDay = P.choose(Tl, chosen.goals[2], 0)
      local buy = {}
      for _, c in ipairs(nextDay and nextDay.writs or {}) do if c.buyNow then buy[#buy + 1] = c end end
      R.buyNow = buy
    end
  end
  -- Deals: writs well under their usual price (worth buying for later days).
  local deals = {}
  for _, c in ipairs(later) do if c.ratio and c.ratio <= 0.7 then deals[#deals + 1] = c end end
  table.sort(deals, function(a, b) return a.ratio < b.ratio end)
  R.deals = deals
  return R
end

-- Following a trip ----------------------------------------------------------------

-- "Use this trip": the writs of a plan stay as today's trip, whatever new
-- prices say, until the daily reset.
function W.lock(plan)
  local qs = {}
  for _, c in ipairs(plan.writs) do qs[#qs + 1] = c.w.q end
  WritPlannerCharDB.locked = { key = resetKey(), q = qs, preBind = plan.preBind }
end

function W.locked()
  local l = WritPlannerCharDB.locked
  return l and l.key == resetKey() and l or nil
end

-- The locked trip from where you are now: the writs not turned in yet, in
-- order. Returns route (P.route legs) and how many are already done.
function W.lockedRoute()
  local l = W.locked()
  if not l then return nil end
  local left, done = {}, 0
  local byQ = {}
  for _, w in ipairs(D.writs) do byQ[w.q] = w end
  for _, q in ipairs(l.q) do
    local w = byQ[q]
    if w and doneToday(q) then done = done + 1
    elseif w and w.z and D.zones[w.z] then
      left[#left + 1] = { w = w, zone = w.z, cont = D.zones[w.z].cont, cost = 0, haveWrit = owned(w.w) > 0 or onQuest(q), haveItems = owned(w.i) >= (w.n or 1),
        writAt = not onQuest(q) and pickup(w.w, 1) or nil, itemAt = pickup(w.i, w.n or 1) }
    end
  end
  if #left == 0 then return {}, done, #l.q end
  local travel = W.travelFn()
  local here = W.here()
  local bind, town = W.bind()
  local pre = l.preBind
  if pre and near(bind, { x = pre.x, y = pre.y, cont = pre.cont }) then pre = nil end
  -- Still to set the hearthstone at the planned inn: the trip starts there.
  local from = pre and { x = pre.x, y = pre.y, cont = pre.cont } or here
  local route = P.route(left, from, travel)
  if WritPlannerCharDB.opts.hearth then
    local cd = GetItemCooldown and select(2, GetItemCooldown(6948)) or 0
    if pre then P.useHearth(route, travel, from, pre.town)
    elseif (cd or 0) == 0 then P.useHearth(route, travel, bind, town) end
  end
  if pre and here then
    local go, how = travel(here, from)
    route.preBind = { town = pre.town, npc = pre.npc, pos = from, go = go, how = how, from = here }
  end
  return route, done, #l.q
end

local DIRS = { "norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste" }
-- Compass direction from a to b (world: +x north, +y west).
function W.dir(a, b)
  local n, e = b.x - a.x, -(b.y - a.y)
  local ang = math.deg(math.atan2(e, n)) -- 0 = north, 90 = east
  if ang < 0 then ang = ang + 360 end
  return DIRS[math.floor((ang + 22.5) / 45) % 8 + 1]
end

local function yards(a, b)
  local dx, dy = a.x - b.x, a.y - b.y
  return math.sqrt(dx * dx + dy * dy)
end

-- Step-by-step directions for a route: { {kind, text, stop?} }.
function W.steps(route)
  local out = {}
  local horde = UnitFactionGroup("player") ~= "Alliance"
  local function add(kind, text, stop) out[#out + 1] = { kind = kind, text = text, stop = stop } end
  -- Writs and items waiting at the mailbox or the bank: pick them up first.
  local at, seen = { correo = {}, banco = {} }, {}
  for _, leg in ipairs(route) do
    for _, c in ipairs(leg.stop.writs) do
      for _, x in ipairs({ { c.w.w, c.writAt }, { c.w.i, c.itemAt } }) do
        if x[2] and not seen[x[1]] then
          seen[x[1]] = true
          local name = (C_Item and C_Item.GetItemNameByID and C_Item.GetItemNameByID(x[1])) or (GetItemInfo and GetItemInfo(x[1])) or ("#" .. x[1])
          table.insert(at[x[2]], name)
        end
      end
    end
  end
  if #at.correo > 0 then add("mail", "Sacá del correo: " .. table.concat(at.correo, ", ") .. ".") end
  if #at.banco > 0 then add("bank", "Sacá del banco: " .. table.concat(at.banco, ", ") .. ".") end
  local pb = route.preBind
  if pb then
    if pb.how and pb.how.flight == nil and pb.how.from then
      add("walk", ("Andá al maestro de vuelo de %s."):format(D.nodes[pb.how.from].name))
      add("fly", ("Volá a %s."):format(D.nodes[pb.how.to].name))
    elseif pb.how and pb.how.boat then
      add("boat", "Cruzá de continente en barco o zeppelin.")
    end
    add("bind", ("Andá a la posada de %s y poné la piedra de hogar con %s."):format(pb.town, pb.npc or "el posadero"))
  end
  for _, leg in ipairs(route) do
    local st = leg.stop
    local z = D.zones[st.zone]
    local from = leg.from
    if leg.hearth then
      add("hearth", ("Usá la piedra de hogar (te lleva a %s)."):format(leg.hearthTo or "donde la pusiste"))
    end
    if leg.boat then
      local to = z.cont == 1 and "Kalimdor" or "los Reinos del Este"
      if horde then
        add("boat", ("Cruzá a %s: zeppelin %s."):format(to, z.cont == 1 and "de Grom'gol o Undercity a Orgrimmar" or "de Orgrimmar a Grom'gol (Stranglethorn) o a Undercity"))
      else
        add("boat", ("Cruzá a %s: barco %s."):format(to, z.cont == 1 and "de Menethil a Theramore, o de Booty Bay a Ratchet" or "de Theramore a Menethil, o de Ratchet a Booty Bay"))
      end
    elseif leg.flight then
      local a, b = D.nodes[leg.flight.from], D.nodes[leg.flight.to]
      if from then add("walk", ("Andá al maestro de vuelo de %s (al %s)."):format(a.name, W.dir(from, a))) end
      add("fly", ("Volá a %s."):format(b.name))
      from = { x = b.x, y = b.y }
    end
    local target = st.pos
    local how = ""
    if from and target and not leg.boat then
      local d = yards(from, target)
      how = d < 60 and " (está ahí nomás)" or (" (al %s, ~%d yardas)"):format(W.dir(from, target), math.floor(d / 10 + 0.5) * 10)
    end
    add("go", ("Andá a %s en %s, %.0f, %.0f%s."):format(st.npc or "?", z.name, st.x, st.y, how), st)
    local names = {}
    for _, c in ipairs(st.writs) do names[#names + 1] = c.w.name end
    add("turnin", "Entregá: " .. table.concat(names, ", ") .. ".", st)
  end
  return out
end

-- What today's trip still needs from the auction house: { {id, name, n} }.
-- Each item once, with the total over every writ minus what you own
-- (bags, bank and mail).
local function itemName(id)
  return (C_Item and C_Item.GetItemNameByID and C_Item.GetItemNameByID(id)) or (GetItemInfo and GetItemInfo(id))
end
function W.shopping(plan)
  local out, items, order = {}, {}, {}
  for _, c in ipairs(plan.writs) do
    if not c.haveWrit then out[#out + 1] = { id = c.w.w, name = itemName(c.w.w), n = 1 } end
    local id = c.w.i
    if not items[id] then items[id] = 0; order[#order + 1] = id end
    items[id] = items[id] + (c.w.n or 1)
  end
  for _, id in ipairs(order) do
    local n = items[id] - owned(id)
    if n > 0 then out[#out + 1] = { id = id, name = itemName(id), n = n } end
  end
  return out
end

W.LIST = "Writ Planner (hoy)"
-- An Auctionator shopping list with today's buys and how many of each; at
-- the auction house it starts searching right away.
function W.search(plan)
  local api = auctionator()
  if not api then chat("necesitás Auctionator.") return end
  if not plan then chat("primero calculá un plan.") return end
  local items = W.shopping(plan)
  if #items == 0 then chat("ya tenés todo lo de hoy (contando el correo y el banco).") return end
  local terms, missing = {}, 0
  for _, it in ipairs(items) do
    if not it.name then missing = missing + 1
    elseif api.ConvertToSearchString then
      local ok, t = pcall(api.ConvertToSearchString, CALLER, { searchString = it.name, isExact = true, quantity = it.n })
      terms[#terms + 1] = ok and t or it.name
    else terms[#terms + 1] = it.name end
  end
  if api.CreateShoppingList and pcall(api.CreateShoppingList, CALLER, W.LIST, terms) then
    chat(("armé la lista de compras \"%s\" en Auctionator: %d cosas, con cuántas de cada una. En la subasta, pestaña Shopping."):format(W.LIST, #terms))
  elseif not pcall(api.MultiSearchExact, CALLER, terms) then
    chat("abrí la casa de subastas y probá de nuevo.")
  end
  if missing > 0 then chat(missing .. " cosas todavía no tienen el nombre cargado: probá de nuevo en unos segundos.") end
end

-- Map pin (TomTom's arrow if you have it).
function W.pin(stop)
  local z = D.zones[stop.zone]
  if not z or not stop.x then return end
  local title = (stop.npc or "?") .. " (" .. z.name .. ")"
  if TomTom and TomTom.AddWaypoint then
    TomTom:AddWaypoint(z.map, stop.x / 100, stop.y / 100, { title = title, from = "Writ Planner" })
  elseif C_Map and C_Map.SetUserWaypoint and UiMapPoint then
    C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(z.map, stop.x / 100, stop.y / 100))
    if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then C_SuperTrack.SetSuperTrackedUserWaypoint(true) end
  end
  chat("marca puesta: " .. title .. string.format(" %.0f, %.0f", stop.x, stop.y))
end

function W.markGone(q)
  WritPlannerCharDB.gone[q] = resetKey()
end

-- Guild sharing -----------------------------------------------------------------
-- Where writs without a known place are turned in: whoever turns one in tells
-- the guild, and the addons of everyone online learn it. At login each one
-- tells what it knows (one message a second), so latecomers catch up.

local PREFIX = "WritPlanner"
if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then C_ChatInfo.RegisterAddonMessagePrefix(PREFIX) end
local unplaced = {} -- writs the data has no place for: the only ones that can be learned
for _, w in ipairs(D.writs) do if not w.z then unplaced[w.q] = w end end

local function clean(v) return (tostring(v or "?"):gsub("[;|]", ""):sub(1, 40)) end
local function split(msg)
  local t = {}
  for part in (msg .. ";"):gmatch("([^;]*);") do t[#t + 1] = part end
  return t
end
local function send(msg)
  if not (WritPlannerCharDB.opts.share and IsInGuild and IsInGuild()) then return end
  if C_ChatInfo and C_ChatInfo.SendAddonMessage then C_ChatInfo.SendAddonMessage(PREFIX, msg, "GUILD") end
end

function W.share(q)
  local l = WritPlannerDB.learned[q]
  if not l or not l.map then return end
  local r = function(v) return math.floor((tonumber(v) or 0) + 0.5) end
  send(("L1;%d;%d;%.1f;%.1f;%d;%d;%d;%s;%s"):format(q, l.map, l.x, l.y, r(l.wx), r(l.wy), l.cont or 0, clean(l.npc), clean(l.zone)))
end

function W.shareAll()
  local qs = {}
  for q in pairs(WritPlannerDB.learned) do qs[#qs + 1] = q end
  local i = 0
  local function nextOne()
    i = i + 1
    if qs[i] then W.share(qs[i]); C_Timer.After(1, nextOne) end
  end
  nextOne()
end

-- A guildmate's message: checked before it's kept (a writ we don't know the
-- place of, a map, coordinates on it, a continent).
function W.received(msg, sender)
  local me = UnitName("player")
  if not sender or sender == me or sender:match("^[^-]+") == me then return end
  local t = split(msg)
  if t[1] ~= "L1" then return end
  local q, map, x, y, wx, wy, cont = tonumber(t[2]), tonumber(t[3]), tonumber(t[4]), tonumber(t[5]), tonumber(t[6]), tonumber(t[7]), tonumber(t[8])
  local w = q and unplaced[q]
  if not w or WritPlannerDB.learned[q] then return end
  if not (map and map > 0 and x and y and x >= 0 and x <= 100 and y >= 0 and y <= 100 and wx and wy
    and math.abs(wx) < 30000 and math.abs(wy) < 30000 and (cont == 0 or cont == 1)) then return end
  local who = sender:match("^[^-]+")
  WritPlannerDB.learned[q] = { npc = clean(t[9]), map = map, x = x, y = y, wx = wx, wy = wy, cont = cont, zone = clean(t[10]), from = who }
  W.mergeLearned()
  chat(("%s (de tu guild) te pasó dónde se entrega %s: %s, %s."):format(who, w.name, clean(t[9]), clean(t[10])))
  if W.UI and W.UI.refresh then W.UI.refresh() end
end

-- Events ------------------------------------------------------------------------

local writByQuest = {}
for _, w in ipairs(D.writs) do writByQuest[w.q] = w end

local f = CreateFrame("Frame")
f:RegisterEvent("ADDON_LOADED")
f:RegisterEvent("PLAYER_LOGIN")
f:RegisterEvent("TAXIMAP_OPENED")
f:RegisterEvent("QUEST_TURNED_IN")
f:RegisterEvent("QUEST_COMPLETE")
f:RegisterEvent("UPDATE_FACTION")
f:RegisterEvent("HEARTHSTONE_BOUND")
f:RegisterEvent("BANKFRAME_OPENED")
f:RegisterEvent("BANKFRAME_CLOSED")
f:RegisterEvent("PLAYERBANKSLOTS_CHANGED")
f:RegisterEvent("BAG_UPDATE_DELAYED")
f:RegisterEvent("MAIL_SHOW")
f:RegisterEvent("MAIL_INBOX_UPDATE")
f:RegisterEvent("CHAT_MSG_ADDON")
local lastNpc
f:SetScript("OnEvent", function(_, event, a1, a2, a3, a4)
  if event == "ADDON_LOADED" and a1 == "WritPlanner" then
    defaults()
    W.mergeLearned()
  elseif event == "PLAYER_LOGIN" then
    for id in pairs(ALL) do
      if C_Item and C_Item.RequestLoadItemDataByID then C_Item.RequestLoadItemDataByID(id) end
    end
    local api = auctionator()
    if api and api.RegisterForDBUpdate then
      pcall(api.RegisterForDBUpdate, CALLER, function()
        W.snapshot()
        if W.UI and W.UI.refresh then W.UI.refresh() end
      end)
    end
    if C_Timer then C_Timer.After(5, W.snapshot) else W.snapshot() end
    if W.UI and W.UI.minimap then W.UI.minimap() end
    if C_Timer then C_Timer.After(30, W.shareAll) end
  elseif event == "CHAT_MSG_ADDON" then
    if a1 == PREFIX and a3 == "GUILD" then W.received(a2, a4) end
  elseif event == "BANKFRAME_OPENED" then
    bankOpen = true
    W.scanBank()
    if W.UI and W.UI.refresh then W.UI.refresh() end
  elseif event == "BANKFRAME_CLOSED" then
    bankOpen = false
  elseif event == "PLAYERBANKSLOTS_CHANGED" or event == "BAG_UPDATE_DELAYED" then
    if bankOpen then W.scanBank() end
  elseif event == "MAIL_SHOW" or event == "MAIL_INBOX_UPDATE" then
    W.scanMail()
    if W.UI and W.UI.refresh then W.UI.refresh() end
  elseif event == "HEARTHSTONE_BOUND" then
    local here = W.here()
    if here then
      WritPlannerCharDB.hearth = { x = here.x, y = here.y, cont = here.cont, town = GetBindLocation and GetBindLocation() }
      chat("anoté dónde pusiste la piedra de hogar.")
    end
  elseif event == "UPDATE_FACTION" then
    if W.UI and W.UI.repChanged then W.UI.repChanged() end
  elseif event == "TAXIMAP_OPENED" then
    W.saveFlights()
  elseif event == "QUEST_COMPLETE" then
    lastNpc = UnitName("npc")
  elseif event == "QUEST_TURNED_IN" then
    local w = writByQuest[a1]
    if w and not w.z then
      local map = C_Map and C_Map.GetBestMapForUnit("player")
      local pos = map and C_Map.GetPlayerMapPosition(map, "player")
      if pos then
        local cont, world = C_Map.GetWorldPosFromMapPos(map, pos)
        local info = C_Map.GetMapInfo(map)
        local wx, wy = world:GetXY()
        WritPlannerDB.learned[a1] = { npc = lastNpc or "?", map = map, x = pos.x * 100, y = pos.y * 100, wx = wx, wy = wy, cont = cont, zone = info and info.name or "?" }
        W.mergeLearned()
        chat(("anoté dónde se entrega %s (%s)."):format(w.name, info and info.name or "?"))
        W.share(a1)
      end
    end
    if W.UI and W.UI.refresh then W.UI.refresh() end
    -- Following a trip: the arrow moves to the next stop once a stop is done.
    if writByQuest[a1] and W.locked() and WritPlannerCharDB.opts.autoPin ~= false then
      local route = W.lockedRoute()
      if route and route[1] then
        local first = route[1].stop
        local same = false
        for _, c in ipairs(first.writs) do if c.w.npc == writByQuest[a1].npc then same = true end end
        if not same then W.pin(first) end
      elseif route then
        chat("¡terminaste la ruta de hoy!")
      end
    end
  end
end)

SLASH_WRITPLANNER1 = "/writs"
SLASH_WRITPLANNER2 = "/writ"
SlashCmdList.WRITPLANNER = function(msg)
  msg = (msg or ""):lower()
  local o = WritPlannerCharDB.opts
  local n = tonumber(msg:match("^dias%s+(%d+)") or msg:match("^días%s+(%d+)"))
  if n then o.maxAge = n; chat(("uso precios de hasta %d días."):format(n)) return end
  local r = tonumber(msg:match("^repu%s+(%d+)"))
  if r then o.manualRep = r; chat(("tomo %d de reputación (\"/writs repu juego\" para volver a leerla del juego)."):format(r)) return end
  if msg == "repu juego" then o.manualRep = nil; chat("leo la reputación del juego.") return end
  if msg == "vuelos" then
    chat(("tenés anotados %d vuelos (%d en los Reinos del Este, %d en Kalimdor)."):format(W.flightCount(), W.flightCount(0), W.flightCount(1)))
    return
  end
  if msg == "icono" or msg == "minimapa" then
    chat(W.UI.toggleMinimap() and "muestro el botón del minimapa." or "escondí el botón del minimapa (\"/writs icono\" para volver a verlo).")
    return
  end
  W.UI.toggle()
end

function WritPlanner_Toggle() W.UI.toggle() end
