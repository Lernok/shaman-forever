-- Writ Planner window: goal, budget, how far to stretch for a straighter trip,
-- travel mode and speed; then today's trip stop by stop and the plan in days.
local W = WritPlanner
local D = WritPlanner_DATA
local P = W.Planner
local UI = {}
W.UI = UI

local frame, rows, summary, repText, last, haveBox, goalBox, goalText
local money = W.money

local function o() return WritPlannerCharDB.opts end

local function label(parent, text, x, y)
  local fs = parent:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  fs:SetPoint("TOPLEFT", x, y)
  fs:SetText(text)
  return fs
end

local function button(parent, text, w, x, y, fn)
  local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  b:SetSize(w, 22)
  b:SetPoint("TOPLEFT", x, y)
  b:SetText(text)
  b:SetScript("OnClick", fn)
  return b
end

local function edit(parent, w, x, y, get, set)
  local e = CreateFrame("EditBox", nil, parent, "InputBoxTemplate")
  e:SetSize(w, 20)
  e:SetPoint("TOPLEFT", x, y)
  e:SetAutoFocus(false)
  e:SetText(get() or "")
  e:SetScript("OnEnterPressed", function(self) set(self:GetText()); self:ClearFocus(); UI.refresh() end)
  e:SetScript("OnEditFocusLost", function(self) set(self:GetText()) end)
  e:SetScript("OnEscapePressed", function(self) self:SetText(get() or ""); self:ClearFocus() end)
  return e
end

local function cycle(parent, w, x, y, list, get, set)
  local b = button(parent, "", w, x, y, nil)
  local function show()
    for _, it in ipairs(list) do if it.key == get() then b:SetText(it.name) end end
  end
  b:SetScript("OnClick", function()
    local i = 1
    for k, it in ipairs(list) do if it.key == get() then i = k end end
    set(list[i % #list + 1].key)
    show()
    UI.refresh()
  end)
  b.show = show
  show()
  return b
end

local MODES = { { key = "fly", name = "Con vuelos" }, { key = "walk", name = "Solo a pie" } }

local function mins(s) return math.max(1, math.floor(s / 60 + 0.5)) end

local function tag(c)
  if not c.ratio then return "" end
  local pct = math.floor((c.ratio - 1) * 100 + 0.5)
  if c.ratio <= 0.7 then return " |cff33dd33" .. pct .. "% barato|r" end
  if c.ratio >= 1.4 then return " |cffff5555+" .. pct .. "% caro|r" end
  return ""
end

-- Rows ---------------------------------------------------------------------------

local ROW_H = 18
local function row(i)
  if rows[i] then return rows[i] end
  local r = CreateFrame("Frame", nil, frame.list)
  r:SetSize(500, ROW_H)
  r:SetPoint("TOPLEFT", 0, -(i - 1) * ROW_H)
  r.text = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  r.text:SetPoint("LEFT", 4, 0)
  r.text:SetWidth(330)
  r.text:SetJustifyH("LEFT")
  r.text:SetWordWrap(false)
  r.cost = r:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  r.cost:SetPoint("LEFT", 336, 0)
  r.cost:SetWidth(70)
  r.cost:SetJustifyH("RIGHT")
  r.btn = CreateFrame("Button", nil, r, "UIPanelButtonTemplate")
  r.btn:SetSize(80, 16)
  r.btn:SetPoint("LEFT", 412, 0)
  rows[i] = r
  return r
end

local function setRows(lines)
  for i, l in ipairs(lines) do
    local r = row(i)
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
  frame.list:SetHeight(math.max(1, #lines * ROW_H))
end

-- Refresh --------------------------------------------------------------------------

local ERR = {
  norep = "Escribí cuánta reputación tenés en \"Tengo\" y a cuánto querés llegar.",
  reached = "Ya llegaste a ese objetivo.",
  noauc = "Necesitás Auctionator instalado y un escaneo de la subasta.",
  noprices = "No hay precios de writs en tu Auctionator: hacé un escaneo completo en la subasta.",
}

function UI.refresh()
  if not frame or not frame:IsShown() then return end
  local R = W.compute()
  last = R
  local lines = {}
  -- Reputation line and the boxes.
  if R.rep then
    local name, into, size = W.level(R.rep)
    local where = R.fromGame and "|cff33dd33leída del juego|r" or "|cffffcc00escrita por vos|r"
    repText:SetText(("%s: |cffffffff%s %d / %d|r  (%s)"):format(R.faction or "Reputación", name, into, size, where))
  else
    repText:SetText("|cffffcc00No pude leer tu reputación: escribila en \"Tengo\".|r")
  end
  if not haveBox:HasFocus() then haveBox:SetText(R.rep and tostring(R.rep) or "") end
  if not goalBox:HasFocus() then goalBox:SetText(o().goal and tostring(o().goal) or (R.goal and tostring(R.goal) or "")) end
  if R.goal then
    local gname, ginto = W.level(R.goal)
    goalText:SetText(("= %s %d%s"):format(gname, ginto, R.need and R.need > 0 and ("   |cffffffffte faltan %d|r"):format(R.need) or ""))
  else
    goalText:SetText("")
  end
  if R.err then
    summary:SetText(ERR[R.err] or R.err)
    setRows({})
    return
  end
  local s = {}
  local plan = R.today
  if R.days == 1 and plan then
    s[#s + 1] = ("Hoy en una tirada: |cffffffff%d|r de reputación por |cffffffff~%s|r (±1 g), ~%d min de viaje."):format(plan.rep, money(plan.cost), mins(plan.time))
    if plan.cost > plan.cheapest then s[#s + 1] = ("Lo más barato era %s, pero el viaje es más largo."):format(money(plan.cheapest)) end
  elseif R.plan then
    local x = R.plan
    s[#s + 1] = ("En |cffffffff%d días|r: ~%s en total (±1 g)%s."):format(x.days, money(x.total), R.overBudget and " |cffff5555(no alcanza tu presupuesto: es lo más barato)|r" or "")
    if plan then s[#s + 1] = ("Hoy: %d de reputación por ~%s, ~%d min de viaje."):format(plan.rep, money(plan.cost), mins(plan.time)) end
    if not R.budget then s[#s + 1] = "|cffaaaaaaEs lo más rápido. Poné un límite de oro y lo reparto en más días, más barato.|r" end
  else
    s[#s + 1] = "No encontré una forma de llegar con los writs que tienen precio y lugar conocido."
  end
  -- A few options in days.
  if R.options and #R.options > 1 then
    local t = {}
    for _, op in ipairs(R.options) do
      if #t < 6 then t[#t + 1] = ("%d d: %s"):format(op.days, money(op.total)) end
    end
    s[#s + 1] = "|cffaaaaaaPor días: " .. table.concat(t, " · ") .. "|r"
  end
  local sk = R.skipped
  if sk and (sk.done + sk.gone + sk.old) > 0 then
    s[#s + 1] = ("|cffaaaaaaFuera de hoy: %d entregados, %d sin stock, %d con precio viejo.|r"):format(sk.done, sk.gone, sk.old)
  end
  if o().mode == "fly" and W.flightCount() == 0 then
    s[#s + 1] = "|cffffcc00Abrí una vez el mapa de vuelos en cada continente para que use tus vuelos.|r"
  end
  summary:SetText(table.concat(s, "\n"))

  if plan then
    for _, leg in ipairs(plan.route) do
      local st = leg.stop
      local z = D.zones[st.zone]
      local how
      if leg.boat then
        how = "barco o zeppelin"
      elseif leg.flight then
        how = ("vuelo %s > %s"):format(D.nodes[leg.flight.from].name:match("^[^,]+"), D.nodes[leg.flight.to].name:match("^[^,]+"))
      elseif leg.leg > 0 then
        how = "a pie"
      else
        how = "empezá acá"
      end
      lines[#lines + 1] = {
        text = ("|cffffd100%s|r  %s (%.0f, %.0f)  |cffaaaaaa+%d min, %s|r"):format(z.name, st.npc or "?", st.x, st.y, leg.leg > 0 and mins(leg.leg) or 0, how),
        btn = "Mapa", click = function() W.pin(st) end,
      }
      for _, c in ipairs(st.writs) do
        local have = (c.haveWrit and c.haveItems) and " |cff33dd33(ya lo tenés)|r" or (c.haveWrit and " |cff33dd33(writ ya comprado)|r" or "")
        local stock = W.stock(c.w.w)
        lines[#lines + 1] = {
          text = ("    %s  |cffaaaaaa%d rep%s|r%s%s"):format(c.w.name, c.w.rep, stock and (", hay " .. stock) or "", have, tag(c)),
          cost = money(c.cost),
          btn = not (c.haveWrit and c.haveItems) and "No hay" or nil,
          click = function() W.markGone(c.w.q); UI.refresh() end,
        }
      end
    end
  end
  if R.deals and #R.deals > 0 then
    lines[#lines + 1] = { text = "|cff33dd33Muy baratos hoy (para comprar y entregar otro día):|r" }
    for i = 1, math.min(5, #R.deals) do
      local c = R.deals[i]
      lines[#lines + 1] = { text = ("    %s (%s)%s"):format(c.w.name, D.zones[c.zone].name, tag(c)), cost = money(c.cost) }
    end
  end
  setRows(lines)
end

-- Window ---------------------------------------------------------------------------

local function build()
  frame = CreateFrame("Frame", "WritPlannerFrame", UIParent, "BasicFrameTemplateWithInset")
  frame:SetSize(560, 580)
  frame:SetPoint("CENTER")
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", frame.StartMoving)
  frame:SetScript("OnDragStop", frame.StopMovingOrSizing)
  frame:SetClampedToScreen(true)
  frame:SetFrameStrata("DIALOG")
  tinsert(UISpecialFrames, "WritPlannerFrame")
  if frame.TitleText then frame.TitleText:SetText("Writ Planner — Azeroth Commerce Authority") end

  repText = label(frame, "", 14, -32)

  label(frame, "Tengo:", 14, -58)
  haveBox = edit(frame, 60, 70, -55, function() return o().manualRep and tostring(o().manualRep) end, function(t)
    local v = tonumber(t)
    local game = W.gameRep()
    -- Typing what the game already says keeps reading it from the game.
    if v and v ~= game then o().manualRep = v elseif not v or v == game then o().manualRep = nil end
  end)
  button(frame, "Del juego", 76, 136, -54, function() o().manualRep = nil; UI.refresh() end)

  label(frame, "Quiero llegar a:", 222, -58)
  goalBox = edit(frame, 60, 330, -55, function() return o().goal and tostring(o().goal) end, function(t)
    t = (t or ""):gsub("^%s+", ""):gsub("%s+$", "")
    o().goal = (t ~= "" and (tonumber(t) or t:match("^%+%s*%d+$"))) and t or nil
  end)
  goalText = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  goalText:SetPoint("TOPLEFT", 396, -58)
  local x = 14
  for _, st in ipairs(W.STANDINGS) do
    local b = button(frame, st.name, 92, x, -78, function() o().goal = tostring(st.value); UI.refresh() end)
    b:SetHeight(18)
    x = x + 96
  end
  label(frame, "o \"+500\"", x + 2, -80)

  label(frame, "Límite de oro (opcional):", 14, -104)
  edit(frame, 50, 180, -101, function() return o().budget and tostring(o().budget) end, function(t) o().budget = tonumber(t) end)
  label(frame, "Me estiro hasta (oro) por una ruta más directa:", 240, -104)
  edit(frame, 34, 494, -101, function() return tostring(o().tol) end, function(t) o().tol = tonumber(t) or 0 end)

  label(frame, "Viaje:", 14, -128)
  cycle(frame, 100, 60, -124, MODES, function() return o().mode end, function(v) o().mode = v end)
  label(frame, "Velocidad:", 172, -128)
  cycle(frame, 120, 250, -124, W.SPEEDS, function() return o().speed end, function(v) o().speed = v end)

  button(frame, "Calcular", 90, 14, -150, function() UI.refresh() end)
  button(frame, "Buscar en la subasta", 160, 110, -150, function() W.search(last and last.today) end)
  button(frame, "Ver todo de nuevo", 130, 276, -150, function()
    WritPlannerCharDB.gone = {}
    UI.refresh()
  end)

  summary = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  summary:SetPoint("TOPLEFT", 14, -178)
  summary:SetWidth(510)
  summary:SetJustifyH("LEFT")
  summary:SetJustifyV("TOP")
  summary:SetHeight(90)

  local scroll = CreateFrame("ScrollFrame", nil, frame, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 10, -272)
  scroll:SetPoint("BOTTOMRIGHT", -30, 12)
  frame.list = CreateFrame("Frame", nil, scroll)
  frame.list:SetSize(500, 1)
  scroll:SetScrollChild(frame.list)
  rows = {}
  frame:SetScript("OnShow", UI.refresh)
end

function UI.toggle()
  if not frame then build() end
  if frame:IsShown() then frame:Hide() else frame:Show() end
end

-- The reputation changed in game (or the reputation window was opened): redo the plan.
function UI.repChanged()
  if frame and frame:IsShown() then UI.refresh() end
end
