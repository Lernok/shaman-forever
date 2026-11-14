-- Writ Planner window, four steps: 1 goal, 2 options (then "Calcular"),
-- 3 the plan (how to get there, today's trip, the next days, deals), 4 step
-- by step. Opening it only reads your reputation; the route is worked out in
-- the background when you ask for it. Rows grow to fit their text: a line in
-- white and the details under it in grey.
local W = WritPlanner
local D = WritPlanner_DATA
local UI = {}
W.UI = UI

local frame, tabs, panels, last, stale = nil, {}, {}, nil, true
local current = 1
local o = function() return WritPlannerCharDB.opts end

local GREY, WHITE, GOLD, GREEN, RED, YELLOW = "|cffa0a0a0", "|cffffffff", "|cffffd100", "|cff40e040", "|cffff5555", "|cffffcc00"
local WIDTH = 620

-- Money with coin icons, rounded to the silver.
local function coins(c)
  if not c then return "?" end
  c = math.floor(c / 100 + 0.5) * 100
  if GetCoinTextureString then return GetCoinTextureString(c) end
  return W.money(c)
end
UI.coins = coins

local function mins(s) return math.max(1, math.floor(s / 60 + 0.5)) end
local function days(n) return n == 1 and "1 día" or (n .. " días") end

-- Widgets ---------------------------------------------------------------------

local function text(parent, font, x, y, w)
  local fs = parent:CreateFontString(nil, "OVERLAY", font or "GameFontHighlight")
  fs:SetPoint("TOPLEFT", x, y)
  if w then fs:SetWidth(w) end
  fs:SetJustifyH("LEFT")
  return fs
end

local function button(parent, label, w, x, y, fn, h)
  local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  b:SetSize(w, h or 22)
  b:SetPoint("TOPLEFT", x, y)
  b:SetText(label)
  b:SetScript("OnClick", fn)
  return b
end

local function edit(parent, w, x, y, get, set)
  local e = CreateFrame("EditBox", nil, parent, "InputBoxTemplate")
  e:SetSize(w, 20)
  e:SetPoint("TOPLEFT", x + 6, y)
  e:SetAutoFocus(false)
  e:SetText(get() or "")
  local function commit(self) set(self:GetText()); stale = true end
  e:SetScript("OnEnterPressed", function(self) commit(self); self:ClearFocus(); UI.update() end)
  e:SetScript("OnEditFocusLost", commit)
  e:SetScript("OnEscapePressed", function(self) self:SetText(get() or ""); self:ClearFocus() end)
  e.reload = function() if not e:HasFocus() then e:SetText(get() or "") end end
  return e
end

local function cycle(parent, w, x, y, items, get, set)
  local b = button(parent, "", w, x, y, nil)
  local function show()
    for _, it in ipairs(items) do if it.key == get() then b:SetText(it.name) end end
  end
  b:SetScript("OnClick", function()
    local i = 1
    for k, it in ipairs(items) do if it.key == get() then i = k end end
    set(items[i % #items + 1].key)
    show()
    stale = true
    UI.update()
  end)
  show()
  return b
end

local function heading(parent, label, y)
  local fs = text(parent, "GameFontNormalLarge", 14, y)
  fs:SetText(label)
  local t = parent:CreateTexture(nil, "ARTWORK")
  t:SetColorTexture(1, 0.82, 0, 0.25)
  t:SetPoint("TOPLEFT", 12, y - 22)
  t:SetPoint("TOPRIGHT", -12, y - 22)
  t:SetHeight(1)
  return fs
end

-- A label, a control under it, and a grey explanation beside the control.
local function field(parent, y, title, helpText)
  text(parent, "GameFontNormal", 14, y):SetText(title)
  if helpText then text(parent, "GameFontHighlightSmall", 170, y - 22, 420):SetText(GREY .. helpText .. "|r") end
  return y - 18
end

-- A scrolling list. Each line: { text, sub, cost, icon, btn, click, kind =
-- "section" | "stop" | nil }. Rows are as tall as their text.
local function list(parent, top, bottom, under)
  local scroll = CreateFrame("ScrollFrame", nil, parent, "UIPanelScrollFrameTemplate")
  if under then scroll:SetPoint("TOPLEFT", under, "BOTTOMLEFT", -6, -10) else scroll:SetPoint("TOPLEFT", 8, top) end
  scroll:SetPoint("BOTTOMRIGHT", -30, bottom)
  local inner = WIDTH - 60
  local child = CreateFrame("Frame", nil, scroll)
  child:SetSize(inner, 1)
  scroll:SetScrollChild(child)
  local rows = {}
  local L = {}
  function L.set(lines)
    local y = 0
    for i, l in ipairs(lines) do
      local r = rows[i]
      if not r then
        r = CreateFrame("Frame", nil, child)
        r:SetWidth(inner)
        r.bg = r:CreateTexture(nil, "BACKGROUND")
        r.bg:SetAllPoints()
        r.icon = r:CreateTexture(nil, "ARTWORK")
        r.icon:SetSize(18, 18)
        r.main = r:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
        r.main:SetJustifyH("LEFT")
        r.sub = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        r.sub:SetJustifyH("LEFT")
        r.cost = r:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
        r.cost:SetJustifyH("RIGHT")
        r.btn = CreateFrame("Button", nil, r, "UIPanelButtonTemplate")
        r.btn:SetSize(74, 20)
        r.btn:SetPoint("TOPRIGHT", -4, -3)
        rows[i] = r
      end
      local left = 8
      if l.kind == "section" then
        r.bg:SetColorTexture(1, 0.82, 0, 0.16)
        r.main:SetFontObject("GameFontNormal")
      elseif l.kind == "stop" then
        r.bg:SetColorTexture(1, 1, 1, 0.07)
        r.main:SetFontObject("GameFontNormal")
      else
        r.bg:SetColorTexture(0, 0, 0, 0)
        r.main:SetFontObject("GameFontHighlight")
        left = 22
      end
      if l.icon then
        r.icon:SetTexture(l.icon)
        r.icon:ClearAllPoints()
        r.icon:SetPoint("TOPLEFT", left, -4)
        r.icon:Show()
        left = left + 24
      else
        r.icon:Hide()
      end
      local right = (l.btn and 82 or 6) + (l.cost and 86 or 0)
      local w = inner - left - right
      r.main:ClearAllPoints()
      r.main:SetPoint("TOPLEFT", left, -5)
      r.main:SetWidth(w)
      r.main:SetText(l.text or "")
      r.sub:ClearAllPoints()
      r.sub:SetPoint("TOPLEFT", r.main, "BOTTOMLEFT", 0, -2)
      r.sub:SetWidth(w)
      r.sub:SetText(l.sub and (GREY .. l.sub .. "|r") or "")
      r.cost:ClearAllPoints()
      r.cost:SetPoint("TOPRIGHT", -(l.btn and 82 or 6), -6)
      r.cost:SetWidth(84)
      r.cost:SetText(l.cost or "")
      if l.btn then
        r.btn:SetText(l.btn)
        r.btn:SetScript("OnClick", l.click)
        r.btn:Show()
      else
        r.btn:Hide()
      end
      local h = 10 + (r.main:GetStringHeight() or 14) + (l.sub and ((r.sub:GetStringHeight() or 12) + 2) or 0)
      if l.btn and h < 26 then h = 26 end
      if l.kind == "section" and i > 1 then y = y + 8 end
      r:SetHeight(h)
      r:ClearAllPoints()
      r:SetPoint("TOPLEFT", 0, -y)
      y = y + h + 1
      r:Show()
    end
    for i = #lines + 1, #rows do rows[i]:Hide() end
    child:SetHeight(math.max(1, y))
  end
  return L
end

local function icon(id)
  if C_Item and C_Item.GetItemIconByID then return C_Item.GetItemIconByID(id) end
  return GetItemIcon and GetItemIcon(id)
end

-- The details of a writ in a few words.
local function writSub(c)
  local t = { c.w.rep .. " de reputación" }
  local stock = W.stock(c.w.w)
  if stock then t[#t + 1] = "hay " .. stock .. " a la venta" end
  if c.haveWrit and c.haveItems then t[#t + 1] = GREEN .. "ya lo tenés todo" .. GREY
  elseif c.haveWrit then t[#t + 1] = GREEN .. "writ ya comprado" .. GREY end
  if c.ratio and c.ratio <= 0.7 then t[#t + 1] = GREEN .. math.floor((1 - c.ratio) * 100 + 0.5) .. "% más barato que lo normal" .. GREY
  elseif c.ratio and c.ratio >= 1.4 then t[#t + 1] = RED .. math.floor((c.ratio - 1) * 100 + 0.5) .. "% más caro que lo normal" .. GREY end
  return table.concat(t, "  ·  ")
end

local function dangerText(d)
  if not d or d == 0 then return nil end
  local lvl = UnitLevel("player") or 60
  local color = d > lvl + 1 and RED or (d >= lvl - 2 and YELLOW or GREY)
  return color .. "zona con bichos nivel ~" .. d .. GREY
end

local function legText(leg)
  if leg.hearth then
    local after = leg.flight and (", después vuelo a " .. D.nodes[leg.flight.to].name:match("^[^,]+")) or (leg.boat and ", después barco o zeppelin" or "")
    return "piedra de hogar a " .. (leg.hearthTo or "tu posada") .. after
  end
  if leg.boat then return "barco o zeppelin"
  elseif leg.flight then return ("vuelo de %s a %s"):format(D.nodes[leg.flight.from].name:match("^[^,]+"), D.nodes[leg.flight.to].name:match("^[^,]+"))
  elseif leg.leg > 0 then return "a pie" end
  return "primera parada"
end

-- Planning ----------------------------------------------------------------------

-- Works the plan out in the background (a little each frame) and shows the
-- open tab again when it's ready. Returns the plan, or nil while working.
local job
local function compute()
  if not stale and last then return last end
  if not job then
    job = coroutine.create(W.compute)
    local ticker
    ticker = function()
      local ok, res = coroutine.resume(job)
      if not ok then
        job, stale = nil, false
        last = { err = "bug" }
        W.chat("error al calcular: " .. tostring(res))
        UI.update()
      elseif coroutine.status(job) == "dead" then
        job, stale, last = nil, false, res
        UI.update()
      else
        C_Timer.After(0, ticker)
      end
    end
    C_Timer.After(0, ticker)
  end
  return nil
end

local ERR = {
  norep = "Escribí cuánta reputación tenés en \"1. Objetivo\".",
  reached = "Ya llegaste a ese objetivo: elegí otro en \"1. Objetivo\".",
  noauc = "Necesitás Auctionator instalado y un escaneo de la subasta.",
  bug = "Algo falló al calcular (te dejé el error en el chat; pasáselo a quien te dio el addon).",
  noprices = "No hay precios de writs en tu Auctionator: hacé un escaneo completo en la subasta.",
}

local PLANS = {
  { key = "rec", name = "Recomendado" },
  { key = "fast", name = "Lo más rápido" },
  { key = "days", name = "En X días" },
  { key = "gold", name = "Con X de oro" },
}
local PLAN_HELP = {
  rec = "Los menos días posibles (una semana como mucho) costando casi lo mismo que hacerlo en dos semanas.",
  fast = "En los menos días posibles, aunque cueste más (rutas largas).",
  days = "Lo más barato que entra en esa cantidad de días.",
  gold = "Lo más rápido que entra en ese oro, repartido en días.",
}
local MODES = { { key = "fly", name = "Con vuelos" }, { key = "walk", name = "Solo a pie" } }
local AGES = { { key = 1, name = "De hasta 1 día" }, { key = 2, name = "De hasta 2 días" }, { key = 3, name = "De hasta 3 días" }, { key = 7, name = "De hasta 7 días" } }
local DANGERS = { { key = 0, name = "Hasta mi nivel" }, { key = 2, name = "Mi nivel +2" }, { key = 4, name = "Mi nivel +4" }, { key = 99, name = "Sin límite" } }
-- Towns with an auction house to start from (your side's capitals and the goblin towns).
local function STARTS()
  local list = { { key = "here", name = "Donde estoy" } }
  local towns = UnitFactionGroup("player") == "Alliance" and { "Stormwind", "Ironforge", "Darnassus" } or { "Orgrimmar", "Thunder Bluff", "Undercity" }
  for _, t in ipairs({ "Booty Bay", "Gadgetzan", "Everlook" }) do towns[#towns + 1] = t end
  for _, t in ipairs(towns) do if W.innOf(t) then list[#list + 1] = { key = t, name = t } end end
  return list
end
local HEARTH = { { key = true, name = "Usarla" }, { key = false, name = "No usarla" } }
local PERDAY = { { key = nil, name = "Sin máximo" }, { key = 750, name = "Hasta 750" }, { key = 1500, name = "Hasta 1500" }, { key = 2500, name = "Hasta 2500" }, { key = 4000, name = "Hasta 4000" } }

-- Step 1: goal ----------------------------------------------------------------------

local function showGoal(p)
  local cur, name, fromGame = W.rep()
  p.faction:SetText(name or "Reputación de los writs")
  if cur then
    local lname, into, size = W.level(cur)
    p.bar:SetMinMaxValues(0, size)
    p.bar:SetValue(into)
    p.barText:SetText(("%s  %d / %d"):format(lname, into, size))
    p.source:SetText(fromGame and (GREEN .. "Leída del juego|r") or (YELLOW .. "La escribiste vos|r  " .. GREY .. "(\"Del juego\" vuelve a leerla)|r"))
  else
    p.bar:SetMinMaxValues(0, 1)
    p.bar:SetValue(0)
    p.barText:SetText("?")
    p.source:SetText(YELLOW .. "No pude leerla del juego: escribila en \"Tengo\".|r")
  end
  p.have.reload()
  local goal = W.goal(cur)
  if not p.goalBox:HasFocus() then p.goalBox:SetText(o().goal or (goal and tostring(goal)) or "") end
  if goal and cur then
    local gname, ginto = W.level(goal)
    local need = goal - cur
    p.need:SetText(need > 0 and ("Objetivo: %s%s %d|r   ·   te faltan %s%d|r"):format(WHITE, gname, ginto, WHITE, need) or (GREEN .. "Ya llegaste a ese objetivo.|r"))
  else
    p.need:SetText("")
  end
  p.showAmount()
end

local function buildGoal(p)
  heading(p, "¿A dónde querés llegar?", -8)
  p.faction = text(p, "GameFontNormal", 14, -42)
  local bar = CreateFrame("StatusBar", nil, p)
  bar:SetPoint("TOPLEFT", 14, -62)
  bar:SetSize(WIDTH - 50, 18)
  bar:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")
  bar:SetStatusBarColor(0.1, 0.65, 0.2)
  local bg = bar:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(0, 0, 0, 0.5)
  p.bar = bar
  p.barText = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  p.barText:SetPoint("CENTER")
  p.source = text(p, "GameFontHighlightSmall", 14, -86)

  text(p, "GameFontNormal", 14, -122):SetText("Tengo")
  p.have = edit(p, 70, 130, -118, function()
    local v = W.rep()
    return v and tostring(v)
  end, function(t)
    local v = tonumber(t)
    local game = W.gameRep()
    if v and v ~= game then o().manualRep = v else o().manualRep = nil end
  end)
  button(p, "Del juego", 90, 216, -117, function() o().manualRep = nil; stale = true; UI.update() end)

  text(p, "GameFontNormal", 14, -154):SetText("Quiero llegar a")
  p.goalBox = edit(p, 70, 130, -150, function() return o().goal end, function(t)
    t = (t or ""):gsub("^%s+", ""):gsub("%s+$", "")
    o().goal = (t ~= "" and (tonumber(t) or t:match("^%+%s*%d+$"))) and t or nil
  end)
  text(p, "GameFontHighlightSmall", 216, -154, 380):SetText(GREY .. "un número, o \"+500\" para sumar a lo que tenés|r")
  local x = 14
  for _, st in ipairs(W.STANDINGS) do
    button(p, st.name, 100, x, -178, function() o().goal = tostring(st.value); stale = true; UI.update() end)
    x = x + 106
  end
  p.need = text(p, "GameFontHighlight", 14, -210, WIDTH - 50)

  heading(p, "¿En cuánto tiempo?", -244)
  local amount, unit, help
  p.showAmount = function()
    local m = o().plan
    amount:SetShown(m == "days" or m == "gold")
    unit:SetText((m == "days" and "días") or (m == "gold" and "de oro como máximo") or "")
    help:SetText(GREY .. (PLAN_HELP[m] or "") .. "|r")
    amount.reload()
  end
  cycle(p, 150, 14, -278, PLANS, function() return o().plan end, function(v) o().plan = v; p.showAmount() end)
  amount = edit(p, 44, 170, -279, function()
    local m = o().plan
    local v = (m == "days" and o().days) or (m == "gold" and o().budget) or nil
    return v and tostring(v)
  end, function(t)
    local v = tonumber(t)
    if o().plan == "days" then o().days = v and math.max(1, math.floor(v)) or 7 elseif o().plan == "gold" then o().budget = v end
  end)
  unit = text(p, "GameFontHighlight", 226, -282)
  help = text(p, "GameFontHighlightSmall", 14, -308, WIDTH - 50)

  local nxt = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  nxt:SetSize(160, 28); nxt:SetPoint("BOTTOMRIGHT", -14, 14); nxt:SetText("Siguiente  >")
  nxt:SetScript("OnClick", function() UI.go(2) end)
end

-- Step 2: options -------------------------------------------------------------------

local function showOptions(p)
  p.flights:SetText(("Vuelos anotados: %s%d|r en los Reinos del Este y %s%d|r en Kalimdor.  %sSe anotan solos cuando abrís el mapa de vuelos.|r")
    :format(WHITE, W.flightCount(0), WHITE, W.flightCount(1), GREY))
  p.tol.reload()
end

local function buildOptions(p)
  heading(p, "¿Cómo armo las rutas?", -8)
  local y = field(p, -42, "Me estiro hasta (oro)", "por una ruta más corta. 0 = siempre lo más barato; 1 = pago hasta 1 g más si me ahorra viaje.")
  p.tol = edit(p, 60, 14, y, function() return tostring(o().tol) end, function(t) o().tol = tonumber(t) or 0 end)
  y = field(p, -92, "Viaje", "Con vuelos usa los que tenés anotados; la velocidad automática mira si tenés montura o Ghost Wolf.")
  cycle(p, 140, 14, y, MODES, function() return o().mode end, function(v) o().mode = v end)
  y = field(p, -142, "Velocidad", nil)
  cycle(p, 140, 14, y, W.SPEEDS, function() return o().speed end, function(v) o().speed = v end)
  y = field(p, -192, "Zonas peligrosas", "Saca los writs que se entregan entre bichos de más nivel que esto.")
  cycle(p, 140, 14, y, DANGERS, function() return o().danger end, function(v) o().danger = v end)
  y = field(p, -242, "Reputación por día", "Sin máximo = lo más rápido (rutas largas). Con un máximo, días más cortos y más días.")
  cycle(p, 140, 14, y, PERDAY, function() return o().perDay end, function(v) o().perDay = v end)
  y = field(p, -292, "Precios", "Qué tan viejos pueden ser los precios de tu Auctionator.")
  cycle(p, 140, 14, y, AGES, function() return o().maxAge end, function(v) o().maxAge = v end)
  y = field(p, -342, "Piedra de hogar", "La uso una vez si ahorra tiempo, y si conviene ponerla en otra posada antes de salir, te lo digo.")
  cycle(p, 140, 14, y, HEARTH, function() return o().hearth end, function(v) o().hearth = v end)
  y = field(p, -392, "Salgo desde", "Donde comprás los writs: la ruta (y dónde poner la piedra) se calcula desde ahí.")
  cycle(p, 140, 14, y, STARTS(), function() return o().from end, function(v) o().from = v end)
  p.flights = text(p, "GameFontHighlightSmall", 14, -446, WIDTH - 50)

  local back = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  back:SetSize(110, 28); back:SetPoint("BOTTOMLEFT", 14, 14); back:SetText("<  Volver")
  back:SetScript("OnClick", function() UI.go(1) end)
  local calc = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  calc:SetSize(180, 28); calc:SetPoint("BOTTOMRIGHT", -14, 14); calc:SetText("Calcular la ruta  >")
  calc:SetScript("OnClick", function() stale = true; UI.go(3) end)
end

-- Step 3: the plan ----------------------------------------------------------------

local function showPlan(p)
  local R = compute()
  if not R then p.summary:SetText(GOLD .. "Calculando…|r"); p.list.set({}) return end
  if R.err then p.summary:SetText(ERR[R.err] or R.err); p.list.set({}) return end
  local x, plan = R.plan, R.today
  local s = {}
  if x then
    local gname = R.goal and W.level(R.goal) or "?"
    local line = ("%sLlegás a %s en %s|r   ·   ~%s en total"):format(WHITE, gname, days(x.days), coins(x.days == 1 and plan and plan.cost or x.total))
    if x.days > 1 then line = line .. ("   ·   hoy %s, después ~%s por día"):format(coins(x.costs[1]), coins((x.total - x.costs[1]) / (x.days - 1))) end
    s[#s + 1] = line
    if R.overBudget then s[#s + 1] = RED .. "No alcanza tu límite de oro: es lo más barato que encontré.|r" end
    if R.tooFew then s[#s + 1] = RED .. ("No entra en %s: es lo más rápido que encontré.|r"):format(days(R.wantDays)) end
  else
    s[#s + 1] = "No encontré un plan con los writs que tienen precio y lugar conocido."
  end
  local sk = R.skipped
  if sk and (sk.done + sk.gone + sk.old + sk.danger) > 0 then
    local t = {}
    if sk.done > 0 then t[#t + 1] = sk.done .. " ya entregados hoy" end
    if sk.danger > 0 then t[#t + 1] = sk.danger .. " en zonas peligrosas" end
    if sk.gone > 0 then t[#t + 1] = sk.gone .. " sin stock" end
    if sk.old > 0 then t[#t + 1] = sk.old .. " con precio viejo" end
    s[#s + 1] = GREY .. "Dejé afuera: " .. table.concat(t, ", ") .. ".|r"
  end
  p.summary:SetText(table.concat(s, "\n"))

  local lines = {}
  -- How to get there.
  local pr = R.presets or {}
  if pr.fast then
    lines[#lines + 1] = { kind = "section", text = "Cómo llegar" }
    local function row(label, op, key, d)
      if not op then return end
      local mine = R.plan == op and R.mode == key
      lines[#lines + 1] = {
        text = (mine and GREEN or WHITE) .. label .. "|r",
        sub = ("%s   ·   ~%s por día%s"):format(days(op.days), coins(op.total / op.days), mine and "   ·   tu plan" or ""),
        cost = coins(op.total),
        btn = not mine and "Elegir" or nil,
        click = function() o().plan = key; if d then o().days = d end; stale = true; UI.update() end,
      }
    end
    row("Lo más rápido", pr.fast, "fast")
    row("Recomendado", pr.rec, "rec")
    row(("Económico (hasta %d días)"):format(W.Planner.ECONOMY_DAYS), pr.cheap, "days", pr.cheap.days)
  end
  -- Today's trip.
  if plan then
    lines[#lines + 1] = { kind = "section", text = ("Hoy: %d de reputación, ~%d min de viaje, %d paradas"):format(plan.rep, mins(plan.time), #plan.route), cost = coins(plan.cost) }
    if plan.cost > plan.cheapest then
      lines[#lines + 1] = { text = GREY .. ("La más barata costaba %s pero con un viaje más largo.|r"):format(coins(plan.cheapest)) }
    end
    if plan.hearthSave and plan.hearthSave > 0 then
      lines[#lines + 1] = { text = GREY .. ("Usa la piedra de hogar una vez: ahorra ~%d min.|r"):format(mins(plan.hearthSave)) }
    end
    if plan.preBind then
      local pb = plan.preBind
      lines[#lines + 1] = {
        kind = "stop",
        text = ("0. Antes de empezar: piedra de hogar en %s%s|r"):format(WHITE, pb.town),
        sub = ("%s%s  ·  andá a la posada (%s) y ponela ahí: toda la ruta te sale ~%d min más corta"):format(R.fromTown and ("saliendo de " .. R.fromTown .. ", ") or "", "+" .. mins(pb.go) .. " min", pb.npc, mins(pb.save)),
      }
    end
    for i, leg in ipairs(plan.route) do
      local st = leg.stop
      local z = D.zones[st.zone]
      local sub = { (leg.leg > 0 and ("+" .. mins(leg.leg) .. " min, ") or "") .. legText(leg) }
      local d = dangerText(st.writs[1].danger)
      if d then sub[#sub + 1] = d end
      lines[#lines + 1] = {
        kind = "stop",
        text = ("%d. %s  ·  %s%s|r  (%.0f, %.0f)"):format(i, z.name, WHITE, st.npc or "?", st.x, st.y),
        sub = table.concat(sub, "   ·   "),
        btn = "Mapa", click = function() W.pin(st) end,
      }
      for _, c in ipairs(st.writs) do
        lines[#lines + 1] = {
          icon = icon(c.w.i), text = c.w.name, sub = writSub(c), cost = coins(c.cost),
          btn = not (c.haveWrit and c.haveItems) and "No hay" or nil,
          click = function() W.markGone(c.w.q); stale = true; UI.update() end,
        }
      end
    end
  end
  -- The next days.
  if x and x.days > 1 then
    lines[#lines + 1] = { kind = "section", text = "Los días siguientes" }
    local k = 2
    while k <= #x.goals do
      local j = k
      while j < #x.goals and x.goals[j + 1] == x.goals[k] do j = j + 1 end
      if x.goals[k] > 0 then
        lines[#lines + 1] = {
          text = j > k and ("Días %d a %d"):format(k, j) or ("Día %d"):format(k),
          sub = ("%d de reputación%s"):format(x.goals[k] * W.Planner.UNIT, j > k and " por día" or ""),
          cost = coins(x.costs[k]) .. (j > k and "/día" or ""),
        }
      end
      k = j + 1
    end
    if R.buyNow and #R.buyNow > 0 then
      local names = {}
      for i = 1, math.min(6, #R.buyNow) do names[#names + 1] = R.buyNow[i].w.name end
      lines[#lines + 1] = { text = GREEN .. "Comprá hoy para mañana|r", sub = table.concat(names, ", ") .. "  ·  hoy están más baratos que lo normal" }
    end
    lines[#lines + 1] = { text = GREY .. "Para los días siguientes cuento con los precios normales de tu servidor (o los de hoy si están más baratos y los comprás hoy). Cada día te armo la ruta con los precios de ese día.|r" }
  end
  p.list.set(lines)
end

local function buildPlan(p)
  p.summary = text(p, "GameFontHighlight", 14, -8, WIDTH - 40)
  if p.summary.SetSpacing then p.summary:SetSpacing(3) end
  p.list = list(p, nil, 46, p.summary)
  local b1 = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  b1:SetSize(170, 26); b1:SetPoint("BOTTOMLEFT", 10, 12); b1:SetText("Buscar en la subasta")
  b1:SetScript("OnClick", function() W.search(last and last.today) end)
  local b3 = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  b3:SetSize(150, 26); b3:SetPoint("LEFT", b1, "RIGHT", 6, 0); b3:SetText("Mostrar los \"No hay\"")
  b3:SetScript("OnClick", function() WritPlannerCharDB.gone = {}; stale = true; UI.update() end)
  local b2 = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  b2:SetSize(180, 26); b2:SetPoint("BOTTOMRIGHT", -14, 12); b2:SetText("Usar esta ruta  >")
  b2:SetScript("OnClick", function()
    if last and last.today then W.lock(last.today); UI.go(4) end
  end)
end

-- Step 4: step by step ------------------------------------------------------------

local function showGuide(p)
  local route, done, total = W.lockedRoute()
  if not route then
    p.summary:SetText("Todavía no elegiste la ruta de hoy.\n" .. GREY .. "En \"3. Plan\" tocá \"Usar esta ruta\": te guío parada por parada y la flecha pasa sola a la siguiente cuando entregás.|r")
    p.list.set({})
    return
  end
  if #route == 0 then
    p.summary:SetText(GREEN .. ("¡Listo! Entregaste los %d writs de hoy.|r"):format(total))
    p.list.set({})
    return
  end
  p.summary:SetText(("%sEntregaste %d de %d.|r   Próxima: %s%s|r en %s\n%sAceptá cada writ recién al salir (según las guías tiene 9 horas de plazo). Se recalcula desde donde estás.|r")
    :format(WHITE, done, total, GOLD, route[1].stop.npc or "?", D.zones[route[1].stop.zone].name, GREY))
  local lines = {}
  local first = route[1].stop
  local n = 0
  local steps = W.steps(route)
  for i, st in ipairs(steps) do
    local now = st.stop == first
    if st.kind == "go" then
      n = n + 1
      local turn = steps[i + 1] and steps[i + 1].kind == "turnin" and steps[i + 1].text or nil
      lines[#lines + 1] = {
        kind = "stop",
        text = (now and (GREEN .. "Ahora:  |r") or "") .. st.text,
        sub = turn,
        btn = "Mapa", click = function() W.pin(st.stop) end,
      }
    elseif st.kind ~= "turnin" then
      lines[#lines + 1] = { text = st.text }
    end
  end
  p.list.set(lines)
end

local function buildGuide(p)
  p.summary = text(p, "GameFontHighlight", 14, -8, WIDTH - 40)
  if p.summary.SetSpacing then p.summary:SetSpacing(3) end
  p.list = list(p, nil, 46, p.summary)
  local g1 = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  g1:SetSize(200, 26); g1:SetPoint("BOTTOMLEFT", 10, 12); g1:SetText("Flecha a la próxima parada")
  g1:SetScript("OnClick", function() local r = W.lockedRoute(); if r and r[1] then W.pin(r[1].stop) end end)
  local g2 = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  g2:SetSize(150, 26); g2:SetPoint("BOTTOMRIGHT", -14, 12); g2:SetText("Dejar de seguirla")
  g2:SetScript("OnClick", function() WritPlannerCharDB.locked = nil; UI.update() end)
end

-- Window ---------------------------------------------------------------------------

local STEPS = {
  { name = "1. Objetivo", build = buildGoal, show = showGoal },
  { name = "2. Opciones", build = buildOptions, show = showOptions },
  { name = "3. Plan", build = buildPlan, show = showPlan },
  { name = "4. Paso a paso", build = buildGuide, show = showGuide },
}

function UI.update()
  if not frame or not frame:IsShown() then return end
  for i, t in ipairs(tabs) do
    if i == current then t:LockHighlight(); panels[i]:Show() else t:UnlockHighlight(); panels[i]:Hide() end
  end
  STEPS[current].show(panels[current])
end

function UI.go(i)
  current = i
  UI.update()
end

local function build()
  frame = CreateFrame("Frame", "WritPlannerFrame", UIParent, "BasicFrameTemplateWithInset")
  frame:SetSize(WIDTH, 620)
  frame:SetPoint("CENTER")
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
  frame:SetClampedToScreen(true)
  frame:SetFrameStrata("DIALOG")
  tinsert(UISpecialFrames, "WritPlannerFrame")
  if frame.TitleText then frame.TitleText:SetText("Writ Planner") end

  local w = math.floor((WIDTH - 20 - 3 * 4) / #STEPS)
  for i, st in ipairs(STEPS) do
    tabs[i] = button(frame, st.name, w, 10 + (i - 1) * (w + 4), -28, function() UI.go(i) end, 26)
  end
  for i, st in ipairs(STEPS) do
    local p = CreateFrame("Frame", nil, frame)
    p:SetPoint("TOPLEFT", 4, -62)
    p:SetPoint("BOTTOMRIGHT", -4, 4)
    p:Hide()
    panels[i] = p
    st.build(p)
  end
  frame:SetScript("OnShow", function() UI.update() end)
  -- New frames start shown: hidden here, so the first /writs opens it instead of closing it.
  frame:Hide()
end

function UI.isOpen() return frame ~= nil and frame:IsShown() end

function UI.toggle()
  if not frame then build() end
  if frame:IsShown() then frame:Hide() else current = 1; frame:Show() end
end

-- New prices or a turned-in writ: results get worked out again (now, if one is open).
function UI.refresh()
  stale = true
  if frame and frame:IsShown() and current >= 3 then UI.update() end
end

-- The reputation changed: step 1 shows it; results get redone when opened.
function UI.repChanged()
  stale = true
  if frame and frame:IsShown() and current == 1 then UI.update() end
end

-- Minimap button: click opens or closes the window; drag it around the minimap.
-- "/writs icono" hides or shows it.
function UI.minimap()
  if not Minimap or UI.mini then return end
  local db = WritPlannerDB
  db.minimap = db.minimap or { angle = 200 }
  local b = CreateFrame("Button", "WritPlannerMinimapButton", Minimap)
  UI.mini = b
  b:SetSize(31, 31)
  b:SetFrameStrata("MEDIUM")
  b:SetFrameLevel(8)
  b:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  b:RegisterForDrag("LeftButton")
  b:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
  bg:SetSize(20, 20)
  bg:SetPoint("TOPLEFT", 7, -5)
  local icon = b:CreateTexture(nil, "ARTWORK")
  icon:SetTexture("Interface\\Icons\\INV_Scroll_03")
  icon:SetSize(17, 17)
  icon:SetPoint("TOPLEFT", 7, -6)
  icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  local border = b:CreateTexture(nil, "OVERLAY")
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  border:SetSize(53, 53)
  border:SetPoint("TOPLEFT")
  local function place()
    local a = math.rad(db.minimap.angle)
    local r = (Minimap:GetWidth() / 2) + 5
    b:ClearAllPoints()
    b:SetPoint("CENTER", Minimap, "CENTER", math.cos(a) * r, math.sin(a) * r)
  end
  local function drag()
    local mx, my = Minimap:GetCenter()
    local x, y = GetCursorPosition()
    local s = Minimap:GetEffectiveScale()
    local atan2 = math.atan2 or atan2
    db.minimap.angle = math.deg(atan2(y / s - my, x / s - mx))
    place()
  end
  b:SetScript("OnDragStart", function(self) self:SetScript("OnUpdate", drag) end)
  b:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
  b:SetScript("OnClick", function() UI.toggle() end)
  b:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine("Writ Planner")
    GameTooltip:AddLine("Clic: abrir o cerrar", 1, 1, 1)
    GameTooltip:AddLine("Arrastrar: moverlo", 1, 1, 1)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  place()
  b:SetShown(not db.minimap.hide)
end

function UI.toggleMinimap()
  local db = WritPlannerDB
  db.minimap = db.minimap or { angle = 200 }
  db.minimap.hide = not db.minimap.hide
  UI.minimap()
  if UI.mini then UI.mini:SetShown(not db.minimap.hide) end
  return not db.minimap.hide
end
