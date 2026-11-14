-- Writ Planner window, in steps (tabs): 1 goal, 2 options, 3 today's trip,
-- 4 the plan in days, 5 deals. Opening it only reads your reputation; the
-- route is worked out when you press "Calcular" (or open a result tab after
-- changing something).
local W = WritPlanner
local D = WritPlanner_DATA
local UI = {}
W.UI = UI

local frame, tabs, panels, last, stale = nil, {}, {}, nil, true
local current = 1
local o = function() return WritPlannerCharDB.opts end

local GREY, WHITE, GOLD, GREEN, RED, YELLOW = "|cffa0a0a0", "|cffffffff", "|cffffd100", "|cff40e040", "|cffff5555", "|cffffcc00"

-- Money with coin icons, rounded to the silver.
local function coins(c)
  if not c then return "?" end
  c = math.floor(c / 100 + 0.5) * 100
  if GetCoinTextureString then return GetCoinTextureString(c) end
  return W.money(c)
end
UI.coins = coins

local function mins(s) return math.max(1, math.floor(s / 60 + 0.5)) end

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

-- A scrolling list of rows: { text, cost, icon, btn, click, header }.
local ROW_H = 20
local function list(parent, top, bottom)
  local scroll = CreateFrame("ScrollFrame", nil, parent, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 8, top)
  scroll:SetPoint("BOTTOMRIGHT", -30, bottom)
  local child = CreateFrame("Frame", nil, scroll)
  child:SetSize(520, 1)
  scroll:SetScrollChild(child)
  local rows = {}
  local L = {}
  function L.set(lines)
    for i, l in ipairs(lines) do
      local r = rows[i]
      if not r then
        r = CreateFrame("Frame", nil, child)
        r:SetSize(520, ROW_H)
        r:SetPoint("TOPLEFT", 0, -(i - 1) * ROW_H)
        r.bg = r:CreateTexture(nil, "BACKGROUND")
        r.bg:SetAllPoints()
        r.icon = r:CreateTexture(nil, "ARTWORK")
        r.icon:SetSize(16, 16)
        r.icon:SetPoint("LEFT", 22, 0)
        r.text = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        r.text:SetJustifyH("LEFT")
        r.text:SetWordWrap(false)
        r.cost = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
        r.cost:SetPoint("RIGHT", -92, 0)
        r.cost:SetJustifyH("RIGHT")
        r.btn = CreateFrame("Button", nil, r, "UIPanelButtonTemplate")
        r.btn:SetSize(84, 18)
        r.btn:SetPoint("RIGHT", -4, 0)
        rows[i] = r
      end
      r.text:ClearAllPoints()
      if l.header then
        r.bg:SetColorTexture(1, 0.82, 0, 0.12)
        r.icon:Hide()
        r.text:SetPoint("LEFT", 6, 0)
        r.text:SetFontObject("GameFontNormal")
      else
        r.bg:SetColorTexture(1, 1, 1, (i % 2 == 0) and 0.03 or 0)
        r.text:SetFontObject("GameFontHighlightSmall")
        if l.icon then
          r.icon:SetTexture(l.icon)
          r.icon:Show()
          r.text:SetPoint("LEFT", 44, 0)
        else
          r.icon:Hide()
          r.text:SetPoint("LEFT", 22, 0)
        end
      end
      r.text:SetPoint("RIGHT", r.cost, "LEFT", -6, 0)
      r.text:SetText(l.text or "")
      r.cost:SetText(l.cost or "")
      if l.btn then
        r.btn:SetText(l.btn)
        r.btn:SetScript("OnClick", l.click)
        r.btn:Show()
      else
        r.btn:Hide()
      end
      r:Show()
    end
    for i = #lines + 1, #rows do rows[i]:Hide() end
    child:SetHeight(math.max(1, #lines * ROW_H))
  end
  return L
end

local function icon(id)
  if C_Item and C_Item.GetItemIconByID then return C_Item.GetItemIconByID(id) end
  return GetItemIcon and GetItemIcon(id)
end

local function tag(c)
  if not c.ratio then return "" end
  local pct = math.floor((c.ratio - 1) * 100 + 0.5)
  if c.ratio <= 0.7 then return "  " .. GREEN .. pct .. "% vs. lo normal|r" end
  if c.ratio >= 1.4 then return "  " .. RED .. "+" .. pct .. "% vs. lo normal|r" end
  return ""
end

-- Steps -------------------------------------------------------------------------

local function compute()
  if stale or not last then
    last = W.compute()
    stale = false
  end
  return last
end

local ERR = {
  norep = "Escribí cuánta reputación tenés en el paso 1.",
  reached = "Ya llegaste a ese objetivo: elegí otro en el paso 1.",
  noauc = "Necesitás Auctionator instalado y un escaneo de la subasta.",
  noprices = "No hay precios de writs en tu Auctionator: hacé un escaneo completo en la subasta.",
}

local function stepGoal(p)
  local cur, name, fromGame = W.rep()
  p.faction:SetText(name or "Reputación de los writs")
  if cur then
    local lname, into, size = W.level(cur)
    p.bar:SetMinMaxValues(0, size)
    p.bar:SetValue(into)
    p.barText:SetText(("%s  %d / %d"):format(lname, into, size))
    p.source:SetText(fromGame and (GREEN .. "Leída del juego|r") or (YELLOW .. "La escribiste vos|r  " .. GREY .. "(\"Del juego\" para volver a leerla)|r"))
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
    p.need:SetText(need > 0 and ("Objetivo: %s%s %d|r   ·   Te faltan %s%d|r de reputación."):format(WHITE, gname, ginto, WHITE, need) or (GREEN .. "Ya llegaste a ese objetivo.|r"))
  else
    p.need:SetText("")
  end
end

local function stepOptions(p)
  p.flights:SetText(("Vuelos anotados: %s%d|r en los Reinos del Este, %s%d|r en Kalimdor.  %sSe anotan solos cuando abrís el mapa de vuelos.|r")
    :format(WHITE, W.flightCount(0), WHITE, W.flightCount(1), GREY))
  for _, e in ipairs(p.edits) do e.reload() end
end

local function stepToday(p)
  local R = compute()
  if R.err then p.summary:SetText(ERR[R.err] or R.err); p.list.set({}) return end
  local plan = R.today
  local s = {}
  if not plan then
    s[#s + 1] = "No encontré una ruta con los writs que tienen precio y lugar conocido."
  else
    s[#s + 1] = ("%sHoy:|r %s%d|r de reputación   ·   %s   ·   ~%d min   ·   %d paradas"):format(GOLD, WHITE, plan.rep, coins(plan.cost), mins(plan.time), #plan.route)
    if R.days and R.days > 1 and R.plan then
      local rest = R.plan.days - 1
      local perDay = rest > 0 and (R.plan.total - plan.cost) / rest or 0
      s[#s + 1] = ("Llegás en %s%d días|r: hoy %s y después ~%s por día (total ~%s, ±1 g).  %sDetalle en \"4. Por días\".|r")
        :format(WHITE, R.plan.days, coins(plan.cost), coins(perDay), coins(R.plan.total), GREY)
    end
    if plan.cost > plan.cheapest then
      s[#s + 1] = GREY .. ("La más barata costaba %s pero con un viaje más largo (te estirás hasta %s).|r"):format(coins(plan.cheapest), coins(R.tol))
    end
  end
  local sk = R.skipped
  if sk and (sk.done + sk.gone + sk.old) > 0 then
    s[#s + 1] = GREY .. ("Afuera hoy: %d ya entregados, %d sin stock, %d con precio de hace más de %d días.|r"):format(sk.done, sk.gone, sk.old, o().maxAge)
  end
  s[#s + 1] = GREY .. "Aceptá cada writ recién al salir: según las guías tiene 9 horas de plazo.|r"
  p.summary:SetText(table.concat(s, "\n"))

  local lines = {}
  if plan then
    for i, leg in ipairs(plan.route) do
      local st = leg.stop
      local z = D.zones[st.zone]
      local how
      if leg.boat then how = "barco o zeppelin"
      elseif leg.flight then how = ("vuelo %s > %s"):format(D.nodes[leg.flight.from].name:match("^[^,]+"), D.nodes[leg.flight.to].name:match("^[^,]+"))
      elseif leg.leg > 0 then how = "a pie"
      else how = "primera parada" end
      lines[#lines + 1] = {
        header = true,
        text = ("%d. %s  %s%s (%.0f, %.0f)|r   %s%s|r"):format(i, z.name, WHITE, st.npc or "?", st.x, st.y, GREY, leg.leg > 0 and ("+" .. mins(leg.leg) .. " min, " .. how) or how),
        btn = "Mapa", click = function() W.pin(st) end,
      }
      for _, c in ipairs(st.writs) do
        local have = (c.haveWrit and c.haveItems) and (GREEN .. "  ya lo tenés|r") or (c.haveWrit and (GREEN .. "  writ comprado|r") or "")
        local stock = W.stock(c.w.w)
        lines[#lines + 1] = {
          icon = icon(c.w.i),
          text = ("%s  %s%d rep%s|r%s%s"):format(c.w.name, GREY, c.w.rep, stock and (" · hay " .. stock) or "", have, tag(c)),
          cost = coins(c.cost),
          btn = not (c.haveWrit and c.haveItems) and "No hay" or nil,
          click = function() W.markGone(c.w.q); stale = true; UI.update() end,
        }
      end
    end
  end
  p.list.set(lines)
end

local function stepDays(p)
  local R = compute()
  if R.err then p.summary:SetText(ERR[R.err] or R.err); p.list.set({}) return end
  local x = R.plan
  local lines, s = {}, {}
  if not x and R.today then
    s[#s + 1] = ("Entra en una sola tirada hoy: %s.  %sCon un límite de oro más bajo en \"2. Opciones\" lo reparto en días.|r"):format(coins(R.today.cost), GREY)
  elseif x then
    local rest = x.days - 1
    s[#s + 1] = ("%s%d días|r   ·   ~%s en total (±1 g)%s"):format(WHITE, x.days, coins(x.total),
      R.overBudget and ("   " .. RED .. "no alcanza tu límite: es lo más barato que encontré|r") or "")
    if rest > 0 then s[#s + 1] = ("Hoy %s, después ~%s por día."):format(coins(x.costs[1]), coins((x.total - x.costs[1]) / rest)) end
    if not R.budget then s[#s + 1] = GREY .. "Es lo más rápido. Con un límite de oro en \"2. Opciones\" lo reparto en más días, gastando menos.|r" end
    s[#s + 1] = GREY .. "Supone que cada día hay a la venta writs parecidos a precios parecidos.|r"
    lines[#lines + 1] = { header = true, text = "Día por día" }
    local k = 1
    while k <= #x.goals do
      local j = k
      while k > 1 and j < #x.goals and x.goals[j + 1] == x.goals[k] do j = j + 1 end
      local label = k == 1 and "Hoy" or (j > k and ("Días %d a %d"):format(k, j) or ("Día %d"):format(k))
      if x.goals[k] > 0 then
        lines[#lines + 1] = { text = ("%s%s|r   %d de reputación%s"):format(GOLD, label, x.goals[k] * W.Planner.UNIT, j > k and " por día" or ""), cost = coins(x.costs[k]) .. (j > k and " por día" or "") }
      end
      k = j + 1
    end
  else
    s[#s + 1] = "No encontré un plan en días con estos precios."
  end
  if R.options and #R.options > 1 then
    lines[#lines + 1] = { header = true, text = "Cuánto cuesta según los días" }
    for _, op in ipairs(R.options) do
      if #lines < 60 then
        lines[#lines + 1] = { text = ("%d días   %s~%s por día|r"):format(op.days, GREY, coins(op.total / op.days)), cost = coins(op.total) }
      end
    end
  end
  p.summary:SetText(table.concat(s, "\n"))
  p.list.set(lines)
end

local function stepDeals(p)
  local R = compute()
  if R.err then p.summary:SetText(ERR[R.err] or R.err); p.list.set({}) return end
  p.summary:SetText("Writs mucho más baratos que lo normal en tu servidor, comparado con tus escaneos de los días anteriores.\n" ..
    GREY .. "Sirven para comprar hoy y entregar otro día. Hacen falta al menos 3 días de escaneos para saber qué es lo normal.|r")
  local lines = {}
  for i = 1, math.min(30, #(R.deals or {})) do
    local c = R.deals[i]
    lines[#lines + 1] = { icon = icon(c.w.i), text = ("%s  %s%s · %d rep|r%s"):format(c.w.name, GREY, D.zones[c.zone].name, c.w.rep, tag(c)), cost = coins(c.cost) }
  end
  if #lines == 0 then lines[1] = { text = GREY .. "Nada fuera de lo normal todavía.|r" } end
  p.list.set(lines)
end

local STEPS = {
  { name = "1. Objetivo", show = stepGoal },
  { name = "2. Opciones", show = stepOptions },
  { name = "3. Ruta de hoy", show = stepToday },
  { name = "4. Por días", show = stepDays },
  { name = "Ofertas", show = stepDeals },
}

-- Window ---------------------------------------------------------------------------

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

local function calcButton(p, y)
  button(p, "Calcular la ruta  >", 200, 14, y, function() stale = true; UI.go(3) end, 28)
end

local function buildGoal(p)
  heading(p, "¿A cuánta reputación querés llegar?", -8)
  p.faction = text(p, "GameFontNormal", 14, -42)
  local bar = CreateFrame("StatusBar", nil, p)
  bar:SetPoint("TOPLEFT", 14, -62)
  bar:SetSize(530, 18)
  bar:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")
  bar:SetStatusBarColor(0.1, 0.65, 0.2)
  local bg = bar:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(0, 0, 0, 0.5)
  p.bar = bar
  p.barText = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  p.barText:SetPoint("CENTER")
  p.source = text(p, "GameFontHighlightSmall", 14, -86)

  text(p, "GameFontNormal", 14, -122):SetText("Tengo:")
  p.have = edit(p, 70, 130, -118, function()
    local v = W.rep()
    return v and tostring(v)
  end, function(t)
    local v = tonumber(t)
    local game = W.gameRep()
    if v and v ~= game then o().manualRep = v else o().manualRep = nil end
  end)
  button(p, "Del juego", 90, 216, -117, function() o().manualRep = nil; stale = true; UI.update() end)

  text(p, "GameFontNormal", 14, -154):SetText("Quiero llegar a:")
  p.goalBox = edit(p, 70, 130, -150, function() return o().goal end, function(t)
    t = (t or ""):gsub("^%s+", ""):gsub("%s+$", "")
    o().goal = (t ~= "" and (tonumber(t) or t:match("^%+%s*%d+$"))) and t or nil
  end)
  text(p, "GameFontHighlightSmall", 216, -154):SetText(GREY .. "un número, o \"+500\" para sumar a lo que tenés|r")
  local x = 14
  for _, st in ipairs(W.STANDINGS) do
    button(p, st.name, 100, x, -178, function() o().goal = tostring(st.value); stale = true; UI.update() end)
    x = x + 106
  end
  p.need = text(p, "GameFontHighlight", 14, -214, 530)

  calcButton(p, -250)
  text(p, "GameFontHighlightSmall", 14, -290, 530):SetText(GREY .. "En \"2. Opciones\" podés poner un límite de oro, cuánto te estirás por una ruta más directa y cómo viajás.|r")
end

local AGES = { { key = 1, name = "De hasta 1 día" }, { key = 2, name = "De hasta 2 días" }, { key = 3, name = "De hasta 3 días" }, { key = 7, name = "De hasta 7 días" } }
local MODES = { { key = "fly", name = "Con vuelos" }, { key = "walk", name = "Solo a pie" } }

local function buildOptions(p)
  heading(p, "Opciones", -8)
  p.edits = {}
  text(p, "GameFontNormal", 14, -44):SetText("Límite de oro (opcional)")
  p.edits[1] = edit(p, 60, 14, -64, function() return o().budget and tostring(o().budget) end, function(t) o().budget = tonumber(t) end)
  text(p, "GameFontHighlightSmall", 100, -68, 440):SetText(GREY .. "Vacío = la ruta más rápida. Con un límite reparto la reputación en días para gastar menos.|r")

  text(p, "GameFontNormal", 14, -102):SetText("Me estiro hasta (oro) por una ruta más directa")
  p.edits[2] = edit(p, 60, 14, -122, function() return tostring(o().tol) end, function(t) o().tol = tonumber(t) or 0 end)
  text(p, "GameFontHighlightSmall", 100, -126, 440):SetText(GREY .. "0 = siempre lo más barato. 1 = pago hasta 1 g más si la ruta es más corta.|r")

  text(p, "GameFontNormal", 14, -162):SetText("Viaje")
  cycle(p, 120, 14, -180, MODES, function() return o().mode end, function(v) o().mode = v end)
  text(p, "GameFontNormal", 150, -162):SetText("Velocidad")
  cycle(p, 130, 150, -180, W.SPEEDS, function() return o().speed end, function(v) o().speed = v end)
  text(p, "GameFontNormal", 296, -162):SetText("Precios")
  cycle(p, 140, 296, -180, AGES, function() return o().maxAge end, function(v) o().maxAge = v end)
  p.flights = text(p, "GameFontHighlightSmall", 14, -216, 530)

  calcButton(p, -250)
end

local function buildResult(p, bottom)
  p.summary = text(p, "GameFontHighlight", 14, -8, 540)
  p.summary:SetJustifyV("TOP")
  p.summary:SetHeight(90)
  if p.summary.SetSpacing then p.summary:SetSpacing(3) end
  p.list = list(p, -104, bottom)
end

local function build()
  frame = CreateFrame("Frame", "WritPlannerFrame", UIParent, "BasicFrameTemplateWithInset")
  frame:SetSize(590, 600)
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

  local x = 10
  for i, st in ipairs(STEPS) do
    local w = i == 5 and 86 or 118
    tabs[i] = button(frame, st.name, w, x, -28, function() UI.go(i) end, 24)
    x = x + w + 4
  end
  for i = 1, #STEPS do
    local p = CreateFrame("Frame", nil, frame)
    p:SetPoint("TOPLEFT", 4, -58)
    p:SetPoint("BOTTOMRIGHT", -4, 6)
    p:Hide()
    panels[i] = p
  end
  buildGoal(panels[1])
  buildOptions(panels[2])
  buildResult(panels[3], 42)
  buildResult(panels[4], 8)
  buildResult(panels[5], 8)
  local p3 = panels[3]
  local b1 = CreateFrame("Button", nil, p3, "UIPanelButtonTemplate")
  b1:SetSize(170, 24); b1:SetPoint("BOTTOMLEFT", 10, 10); b1:SetText("Buscar en la subasta")
  b1:SetScript("OnClick", function() W.search(last and last.today) end)
  local b2 = CreateFrame("Button", nil, p3, "UIPanelButtonTemplate")
  b2:SetSize(120, 24); b2:SetPoint("LEFT", b1, "RIGHT", 6, 0); b2:SetText("Recalcular")
  b2:SetScript("OnClick", function() stale = true; UI.update() end)
  local b3 = CreateFrame("Button", nil, p3, "UIPanelButtonTemplate")
  b3:SetSize(200, 24); b3:SetPoint("LEFT", b2, "RIGHT", 6, 0); b3:SetText("Volver a mostrar los \"No hay\"")
  b3:SetScript("OnClick", function() WritPlannerCharDB.gone = {}; stale = true; UI.update() end)
  frame:SetScript("OnShow", function() UI.update() end)
end

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
