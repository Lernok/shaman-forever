-- The route planner: no game calls here, so scripts/test-writs.lua runs it
-- outside the game.
--
-- A candidate is a writ you can turn in today: { w = <Data.lua row>, cost =
-- copper still to spend (writ + items you lack), zone, cont }. Reputation is
-- counted in units of 25 (every writ gives 75, 125 or 200).
--
-- The planner tries every group of up to MAX_ZONES zones on one continent and
-- finds, for each, the cheapest writs that reach the goal (a knapsack). Then it
-- takes the cheapest plan overall, and among the plans that cost at most
-- `tolerance` more, the one with the fewest zones (then fewest stops): a
-- straighter trip for a little more gold.
WritPlanner = WritPlanner or {}
local P = {}
WritPlanner.Planner = P

P.UNIT = 25
P.MAX_ZONES = 4
P.ZONES_PER_CONTINENT = 7
local INF = math.huge

local function units(rep) return math.ceil(rep / P.UNIT) end

-- Long work run inside a coroutine (the game) gives the frame back every so
-- often, so the game doesn't freeze; outside one (tests) it just runs.
local work = 0
function P.tick(n)
  work = work + (n or 1)
  if work >= 20000 then
    work = 0
    if coroutine.running() then coroutine.yield() end
  end
end
local tick = P.tick
P.units = units

-- Groups candidates by continent and zone: { [cont] = { {zone=, list={...}}, ... } }.
local function byZone(cands)
  local conts, seen = {}, {}
  for _, c in ipairs(cands) do
    local key = c.cont .. ":" .. c.zone
    if not seen[key] then
      seen[key] = { zone = c.zone, list = {} }
      conts[c.cont] = conts[c.cont] or {}
      table.insert(conts[c.cont], seen[key])
    end
    table.insert(seen[key].list, c)
  end
  for _, zs in pairs(conts) do
    table.sort(zs, function(a, b) return a.zone < b.zone end)
  end
  return conts
end

-- Cheapest cost to reach at least u units, for every u in 0..cap, using the
-- given items (each at most once). The top cell means "cap or more". Going
-- down from the top, every cell read still holds its value before this item.
local function knapsack(items, cap)
  local dp = {}
  for u = 0, cap do dp[u] = INF end
  dp[0] = 0
  for _, it in ipairs(items) do
    local g, cost = units(it.w.rep), it.cost
    for u = cap, 0, -1 do
      if dp[u] < INF then
        local t = math.min(u + g, cap)
        if dp[u] + cost < dp[t] then dp[t] = dp[u] + cost end
      end
    end
  end
  local best, run = {}, INF
  for u = cap, 0, -1 do
    if dp[u] < run then run = dp[u] end
    best[u] = run
  end
  return best
end

-- The cheapest writs among `items` that reach `need` units, and their cost.
local function pick(items, need)
  local prev, take = {}, {}
  for u = 0, need do prev[u] = INF end
  prev[0] = 0
  for i, it in ipairs(items) do
    local g, cost = units(it.w.rep), it.cost
    local cur, row = {}, {}
    for u = 0, need do cur[u] = prev[u] end
    for u = 0, need do
      if prev[u] < INF then
        local t = math.min(u + g, need)
        if prev[u] + cost < cur[t] then cur[t] = prev[u] + cost; row[t] = u end
      end
    end
    take[i], prev = row, cur
  end
  if prev[need] == INF then return nil end
  local chosen, u = {}, need
  for i = #items, 1, -1 do
    local from = take[i][u]
    if from then chosen[#chosen + 1] = items[i]; u = from end
  end
  return chosen, prev[need]
end

local function combos(n, k, fn)
  local idx = {}
  local function rec(start, depth)
    if depth > k then fn(idx, k) return end
    for i = start, n do
      idx[depth] = i
      rec(i + 1, depth + 1)
    end
  end
  rec(1, 1)
end

-- Builds the table of best plans for every goal 0..cap units:
-- T.byK[k][u] = { cost, zones = {zone groups}, cont } for plans with exactly k zones.
function P.table(cands, cap)
  local T = { cap = cap, byK = {}, maxUnits = 0 }
  local conts = byZone(cands)
  for cont, zs in pairs(conts) do
    local total = 0
    for _, z in ipairs(zs) do for _, c in ipairs(z.list) do total = total + units(c.w.rep) end end
    if total > T.maxUnits then T.maxUnits = total end
    for k = 1, math.min(P.MAX_ZONES, #zs) do
      T.byK[k] = T.byK[k] or {}
      local row = T.byK[k]
      combos(#zs, k, function(idx)
        local items, groups = {}, {}
        for j = 1, k do
          local z = zs[idx[j]]
          groups[j] = z
          for _, c in ipairs(z.list) do items[#items + 1] = c end
        end
        local best = knapsack(items, cap)
        for u = 1, cap do
          local c = best[u]
          if c < INF and (not row[u] or c < row[u].cost) then
            local g = {}
            for j = 1, k do g[j] = groups[j] end
            row[u] = { cost = c, zones = g, cont = cont }
          end
        end
      end)
    end
  end
  return T
end

-- The plan for `need` units from a table: cheapest overall, or the plan with
-- the fewest zones within `tolerance` copper of it.
function P.choose(T, need, tolerance)
  if need <= 0 then return { cost = 0, writs = {}, units = 0 } end
  if need > T.cap then return nil end
  local cheapest = INF
  for _, row in pairs(T.byK) do
    if row[need] and row[need].cost < cheapest then cheapest = row[need].cost end
  end
  if cheapest == INF then return nil end
  local limit = cheapest + (tolerance or 0)
  local ks = {}
  for k in pairs(T.byK) do ks[#ks + 1] = k end
  table.sort(ks)
  for _, k in ipairs(ks) do
    local e = T.byK[k][need]
    if e and e.cost <= limit then
      local items = {}
      for _, z in ipairs(e.zones) do for _, c in ipairs(z.list) do items[#items + 1] = c end end
      local chosen, cost = pick(items, need)
      local got = 0
      for _, c in ipairs(chosen) do got = got + c.w.rep end
      return { cost = cost, writs = chosen, zones = k, cont = e.cont, rep = got, cheapest = cheapest }
    end
  end
end

-- A table for the plan in days: the cheapest writs for each goal, wherever
-- they are (each day's trip is worked out on the day).
function P.dayTable(cands, cap)
  local T = { cap = cap, byK = { [1] = {} } }
  local all = { zone = 0, list = cands }
  local best = knapsack(cands, cap)
  for u = 1, cap do
    if best[u] < INF then T.byK[1][u] = { cost = best[u], zones = { all }, cont = 0 } end
  end
  return T
end

-- The cost of a day for every goal 1..cap units (route tolerance applied).
function P.dayCosts(T, tolerance)
  local f = {}
  for u = 1, T.cap do
    local e = T.byK[1] and T.byK[1][u]
    f[u] = e and e.cost or INF
  end
  -- Reaching more never needs to cost more than the cheapest plan that reaches more.
  for u = T.cap - 1, 1, -1 do if f[u + 1] < f[u] then f[u] = f[u + 1] end end
  return f
end

-- Plans over several days for `need` units: today from `todayT` (what you can
-- turn in now, what you already own costs nothing), the other days from
-- `laterT` (every writ at today's price; each writ once a day). For every
-- number of days 1..maxDays that can make it, the cheapest split: { days,
-- total, goals = {units per day} }.
function P.days(todayT, laterT, need, tolerance, maxDays)
  maxDays = maxDays or 30
  local f1, f = P.dayCosts(todayT, tolerance), P.dayCosts(laterT, tolerance)
  -- G[n]: cheapest cost to get n units in the days counted so far (n == need: need or more).
  local G, how = {}, {}
  for n = 0, need do G[n] = INF end
  G[0] = 0
  local out = {}
  for d = 1, maxDays do
    local cost = d == 1 and f1 or f
    local cap = d == 1 and todayT.cap or laterT.cap
    local H, row = {}, {}
    for n = 0, need do H[n] = G[n]; row[n] = 0 end
    tick(need * cap)
    for n = 0, need - 1 do
      if G[n] < INF then
        for u = 1, math.min(cap, need - n) do
          local c = cost[u]
          if c < INF and G[n] + c < H[n + u] then H[n + u] = G[n] + c; row[n + u] = u end
        end
      end
    end
    how[d], G = row, H
    if G[need] < INF and (#out == 0 or G[need] < out[#out].total) then
      local goals, costs, n = {}, {}, need
      for k = d, 1, -1 do
        local u = how[k][n]
        goals[k] = u
        costs[k] = u > 0 and (k == 1 and f1 or f)[u] or 0
        n = n - u
      end
      out[#out + 1] = { days = d, total = G[need], goals = goals, costs = costs }
    end
  end
  return out
end

-- The cheapest plan that takes at most n days (nil: none can).
function P.within(opts, n)
  local best
  for _, o in ipairs(opts) do if o.days <= n and (not best or o.total < best.total) then best = o end end
  return best
end

-- Three plans to compare: the fastest; the cheapest within ECONOMY_DAYS;
-- and the recommended one: the fewest days that cost at most
-- RECOMMEND_MARGIN more than that cheapest (a week at most).
P.ECONOMY_DAYS = 14
P.RECOMMEND_MARGIN = 0.15
function P.presets(opts)
  if #opts == 0 then return {} end
  local fast = opts[1]
  local cheap = P.within(opts, P.ECONOMY_DAYS) or opts[#opts]
  local rec
  for d = fast.days, math.max(fast.days, 7) do
    local o = P.within(opts, d)
    if o and o.total <= cheap.total * (1 + P.RECOMMEND_MARGIN) then rec = o break end
  end
  rec = rec or P.within(opts, 7) or fast
  return { fast = fast, rec = rec, cheap = cheap }
end

-- From the day options: the fastest that fits the budget (nil budget: the
-- fastest of all), and the cheapest (the fewest days within 50 silver of it).
function P.pickDays(opts, budget)
  local fastest, low
  for _, o in ipairs(opts) do
    if (not budget or o.total <= budget) and not fastest then fastest = o end
    if not low or o.total < low then low = o.total end
  end
  local cheapest
  for _, o in ipairs(opts) do
    if not cheapest and low and o.total <= low + 5000 then cheapest = o end
  end
  return fastest, cheapest
end

-- Travel: how long a trip takes on foot or with the flight paths you know.
-- Positions are world yards {x, y, cont} (Data.lua: wx/wy for the writs, x/y
-- for the flight masters). Straight lines are stretched for roads and hills.
P.WALK_DETOUR = 1.3
P.FLY_DETOUR = 1.2
P.FLY_SPEED = 30      -- yards a second on a flight path
P.FLY_OVERHEAD = 20   -- seconds to talk to the flight master, take off and land
P.OTHER_CONTINENT = 900 -- seconds to cross to the other continent (boat or zeppelin, and getting to it)

local function dist(a, b)
  local dx, dy = a.x - b.x, a.y - b.y
  return math.sqrt(dx * dx + dy * dy)
end

-- opts: { speed = yards a second on foot, known = { [nodeID] = true } or nil
-- (no flying), nodes = Data.lua nodes, paths = Data.lua paths }.
-- Returns travel(a, b) -> seconds, flight { from, to, cost } or nil.
function P.travel(opts)
  local speed = opts.speed or 7
  local byCont, F = {}, {}
  if opts.known then
    local adj = {}
    for id in pairs(opts.known) do
      local n = opts.nodes[id]
      if n then
        byCont[n.cont] = byCont[n.cont] or {}
        table.insert(byCont[n.cont], id)
        adj[id] = {}
      end
    end
    for _, p in ipairs(opts.paths) do
      local a, b = p[1], p[2]
      if adj[a] and adj[b] then
        local t = dist(opts.nodes[a], opts.nodes[b]) * P.FLY_DETOUR / P.FLY_SPEED
        adj[a][b] = { t = t, cost = p[3] }
      end
    end
    -- Quickest flight between every two known flight masters (Dijkstra; small graphs).
    for src in pairs(adj) do
      local T, C, done = { [src] = 0 }, { [src] = 0 }, {}
      while true do
        local u, best = nil, INF
        for v, t in pairs(T) do if not done[v] and t < best then u, best = v, t end end
        if not u then break end
        done[u] = true
        for v, e in pairs(adj[u]) do
          if not T[v] or T[u] + e.t < T[v] then T[v], C[v] = T[u] + e.t, C[u] + e.cost end
        end
      end
      F[src] = { t = T, cost = C }
    end
  end
  local function walk(a, b) return dist(a, b) * P.WALK_DETOUR / speed end
  local memo = {}
  return function(a, b)
    if a.cont ~= b.cont then return P.OTHER_CONTINENT, { boat = true } end
    local key = a.x .. "," .. a.y .. ">" .. b.x .. "," .. b.y
    local m = memo[key]
    if m then return m[1], m[2] end
    local t, how = (function()
    local best, how = walk(a, b), nil
    local list = byCont[a.cont]
    if list then
      for _, n1 in ipairs(list) do
        local w1 = walk(a, opts.nodes[n1])
        if w1 + P.FLY_OVERHEAD < best then
          local f = F[n1]
          for _, n2 in ipairs(list) do
            local ft = f.t[n2]
            if ft and n2 ~= n1 then
              local t = w1 + ft + P.FLY_OVERHEAD + walk(opts.nodes[n2], b)
              if t < best then best, how = t, { from = n1, to = n2, cost = f.cost[n2] } end
            end
          end
        end
      end
    end
    return best, how
    end)()
    memo[key] = { t, how }
    return t, how
  end
end

local function wpos(c) return c.w.wx and { x = c.w.wx, y = c.w.wy, cont = c.cont } or nil end
P.wpos = wpos

-- Puts the writs' stops in order with the travel function (nearest by time
-- first, from `start` or, without it, from the stop that makes the trip
-- shortest) and times the trip. Returns route (stops with .leg = seconds and
-- .flight), total seconds, flight cost in copper.
function P.route(writs, start, travel)
  local stops, byKey = {}, {}
  for _, c in ipairs(writs) do
    local key = (c.w.npc or "?") .. ":" .. (c.w.wx or 0) .. ":" .. (c.w.wy or 0)
    if not byKey[key] then
      byKey[key] = { npc = c.w.npc, x = c.w.x, y = c.w.y, zone = c.zone, pos = wpos(c), writs = {} }
      stops[#stops + 1] = byKey[key]
    end
    table.insert(byKey[key].writs, c)
  end
  local function run(first)
    local left, out, total, fly = {}, {}, 0, 0
    for i, s in ipairs(stops) do left[i] = s end
    local here = start
    if not here then
      here = table.remove(left, first).pos
      out[1] = { stop = stops[first], leg = 0 }
    end
    while #left > 0 do
      local bi, bt, bf = 1, INF, nil
      for i, s in ipairs(left) do
        local t, f = travel(here, s.pos)
        if t < bt then bi, bt, bf = i, t, f end
      end
      local s = table.remove(left, bi)
      local leg = { stop = s, leg = bt, from = here }
      if bf and bf.boat then leg.boat = true elseif bf then leg.flight = bf; fly = fly + bf.cost end
      out[#out + 1] = leg
      total = total + bt
      here = s.pos
    end
    return out, total, fly
  end
  if start then return run() end
  local best, bt, bf
  for i = 1, #stops do
    local r, t, f = run(i)
    if not best or t < bt then best, bt, bf = r, t, f end
  end
  return best, bt, bf
end

-- Today's plan with travel: tries every group of up to MAX_ZONES zones (both
-- continents), keeps the plans that cost at most `tolerance` more than the
-- cheapest, and returns the quickest trip among them (ties: cheaper).
function P.best(cands, need, tolerance, start, travel)
  -- Every zone of both continents in one pool: a trip may cross (the travel
  -- function charges the boat or zeppelin).
  -- To stay quick, only the ZONES_PER_CONTINENT zones with the cheapest
  -- reputation on each continent (by their cheapest writ per point).
  local conts = byZone(cands)
  local pool = {}
  for _, zs in pairs(conts) do
    for _, z in ipairs(zs) do
      z.score = INF
      for _, c in ipairs(z.list) do z.score = math.min(z.score, c.cost / c.w.rep) end
    end
    table.sort(zs, function(a, b) return a.score < b.score end)
    for i = 1, math.min(P.ZONES_PER_CONTINENT, #zs) do pool[#pool + 1] = zs[i] end
  end
  table.sort(pool, function(a, b) return a.zone < b.zone end)
  conts = { all = pool }
  local found = {}
  local cheapest = INF
  for cont, zs in pairs(conts) do
    for k = 1, math.min(P.MAX_ZONES, #zs) do
      combos(#zs, k, function(idx)
        local items = {}
        for j = 1, k do for _, c in ipairs(zs[idx[j]].list) do items[#items + 1] = c end end
        tick(#items * need)
        local chosen, cost = pick(items, need)
        if chosen then
          -- Only plans that use every zone in the group (the smaller group covers the rest).
          local used = {}
          for _, c in ipairs(chosen) do used[c.zone] = true end
          local n = 0
          for _ in pairs(used) do n = n + 1 end
          if n == k then
            found[#found + 1] = { writs = chosen, cost = cost, cont = cont, zones = k }
            if cost < cheapest then cheapest = cost end
          end
        end
      end)
    end
  end
  -- The cheapest writs wherever they are (any number of zones) is a plan too:
  -- the only one for a big goal, and the bar the tolerance is measured from.
  local chosen, cost = pick(cands, need)
  if chosen then
    local z, n = {}, 0
    for _, c in ipairs(chosen) do if not z[c.zone] then z[c.zone] = true; n = n + 1 end end
    found[#found + 1] = { writs = chosen, cost = cost, zones = n }
    if cost < cheapest then cheapest = cost end
  end
  if cheapest == INF then return nil end
  table.sort(found, function(a, b) return a.cost < b.cost end)
  local best
  for i, p in ipairs(found) do
    if i > 400 then break end
    if p.cost <= cheapest + (tolerance or 0) then
      tick(#p.writs * #p.writs * 20)
      p.route, p.time, p.flyCost = P.route(p.writs, start, travel)
      if not best or p.time < best.time - 1 or (math.abs(p.time - best.time) <= 1 and p.cost < best.cost) then best = p end
    end
  end
  local rep = 0
  for _, c in ipairs(best.writs) do rep = rep + c.w.rep end
  best.rep, best.cheapest = rep, cheapest
  return best
end
