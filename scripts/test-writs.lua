-- Runs the Writ Planner's route planner outside the game, with prices from
-- .cache/writs-prices.lua (return { [itemID] = copper }).
--   .cache/lua51/lua5.1.exe scripts/test-writs.lua [rep] [tolerance gold] [budget gold]
dofile("addon/WritPlanner/Data.lua")
dofile("addon/WritPlanner/Planner.lua")
local P, D = WritPlanner.Planner, WritPlanner_DATA
local prices = dofile(".cache/writs-prices.lua")
local need = tonumber(arg[1]) or 750
local tol = (tonumber(arg[2]) or 0) * 10000
local budget = arg[3] and tonumber(arg[3]) * 10000

local cands = {}
for _, w in ipairs(D.writs) do
  local z = w.z and D.zones[w.z]
  local wp, ip = prices[w.w], prices[w.i]
  if z and wp and ip then
    cands[#cands + 1] = { w = w, cost = wp + ip * (w.n or 1), zone = w.z, cont = z.cont }
  end
end
local g = function(c) return string.format("%.2f g", c / 10000) end
local t0 = os.clock()
local U = P.units(need)
local T = P.table(cands, U)
print(("tabla: %d candidatos, tope %d unidades, %.2f s"):format(#cands, U, os.clock() - t0))
-- Horde flight paths a level-41 Horde would know in the Eastern Kingdoms and Kalimdor.
local known = {}
for _, id in ipairs({ 18, 20, 21, 56, 75, 13, 17, 11, 22, 23, 25, 29, 40, 44, 55 }) do known[id] = true end
local mode = os.getenv("MODE") or "fly"
local travel = P.travel({ speed = tonumber(os.getenv("SPEED")) or 9.8, known = mode == "fly" and known or nil, nodes = D.nodes, paths = D.paths })
local start = os.getenv("START") == "gromgol" and { x = D.nodes[20].x, y = D.nodes[20].y, cont = 0 } or nil
local t2 = os.clock()
local plan = P.best(cands, U, tol, start, travel)
if plan then
  print(("Hoy (%s): %d rep por %s en %d zonas, ~%d min, vuelos %s (lo más barato: %s) [%.2f s]"):format(mode, plan.rep, g(plan.cost), plan.zones, plan.time / 60, g(plan.flyCost), g(plan.cheapest), os.clock() - t2))
  for _, leg in ipairs(plan.route) do
    local s = leg.stop
    local how = leg.flight and ("vuelo " .. D.nodes[leg.flight.from].name .. " -> " .. D.nodes[leg.flight.to].name) or "a pie"
    print(("  +%2d min  %-34s %-20s %-26s (%.0f,%.0f)"):format(leg.leg / 60, how, D.zones[s.zone].name, s.npc, s.x, s.y))
    for _, c in ipairs(s.writs) do print(("           %-28s %3d  %s"):format(c.w.name, c.w.rep, g(c.cost))) end
  end
else
  print("No entra en un día.")
end
local t1 = os.clock()
local opts = P.days(T, T, U, tol, 30)
local fast, cheap = P.pickDays(opts, budget)
print(("días: %d opciones, %.2f s"):format(#opts, os.clock() - t1))
for _, o in ipairs(opts) do local t = {} for k, u in ipairs(o.goals) do t[k] = u * P.UNIT end print(("  %2d días  total %s  (%s)"):format(o.days, g(o.total), table.concat(t, ", "))) end
if fast then print("Más rápido dentro del presupuesto: " .. fast.days .. " días, " .. g(fast.total)) end
if cheap then print("Más barato: " .. cheap.days .. " días, " .. g(cheap.total)) end
