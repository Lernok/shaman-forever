-- Writ Planner window, three tabs: "Hoy" (what to do today: only what you
-- already have, recommended or fastest, and the trip with a tick on every
-- writ), "En camino" (what's still to buy, then step by step) and "Ajustes"
-- (your goal and how routes are made). The route is worked out in the
-- background when "Hoy" opens. Rows grow to fit their text: a line in white
-- and the details under it in grey.
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
        r.check = CreateFrame("CheckButton", nil, r, "UICheckButtonTemplate")
        r.check:SetSize(24, 24)
        r.radio = CreateFrame("CheckButton", nil, r, "UIRadioButtonTemplate")
        r.radio:SetSize(18, 18)
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
      r.check:Hide()
      r.radio:Hide()
      if l.check ~= nil then
        r.check:ClearAllPoints()
        r.check:SetPoint("TOPLEFT", left - 4, -1)
        r.check:SetChecked(l.check)
        r.check:SetScript("OnClick", l.toggle)
        r.check:Show()
        left = left + 22
      elseif l.radio ~= nil then
        r.radio:ClearAllPoints()
        r.radio:SetPoint("TOPLEFT", left, -5)
        r.radio:SetChecked(l.radio)
        r.radio:SetEnabled(not l.disabled)
        r.radio:SetScript("OnClick", l.toggle)
        r.radio:Show()
        left = left + 24
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
      r:EnableMouse(l.radio ~= nil)
      r:SetScript("OnMouseUp", l.radio ~= nil and l.toggle or nil)
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
  if c.haveWrit and c.haveItems then -- the price column says "lo tenés"
  elseif c.haveWrit then t[#t + 1] = GREEN .. "writ ya comprado" .. GREY end
  if c.writAt then t[#t + 1] = YELLOW .. "el writ está en el " .. c.writAt .. GREY end
  if c.itemAt then t[#t + 1] = YELLOW .. "el objeto está en el " .. c.itemAt .. GREY end
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
  norep = "No pude leer tu reputación: escribila en \"Ajustes\" (Tengo).",
  reached = "Ya llegaste a tu meta: elegí otra en \"Ajustes\".",
  noauc = "Necesitás Auctionator instalado y un escaneo de la subasta.",
  bug = "Algo falló al calcular (te dejé el error en el chat; pasáselo a quien te dio el addon).",
  noprices = "No hay precios de writs en tu Auctionator: hacé un escaneo completo en la subasta.",
  alldone = "Hoy ya entregaste todos los writs que se pueden (o los que quedan no tienen precio de hoy). Mañana hay más.",
}

local MODES = { { key = "fly", name = "Con vuelos" }, { key = "walk", name = "Solo a pie" } }
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

-- The reputation bar at the top of "Hoy" and "Ajustes".
local function repBar(p, y)
  p.faction = text(p, "GameFontNormal", 14, y)
  local bar = CreateFrame("StatusBar", nil, p)
  bar:SetPoint("TOPLEFT", 14, y - 18)
  bar:SetSize(WIDTH - 50, 16)
  bar:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")
  bar:SetStatusBarColor(0.1, 0.65, 0.2)
  local bg = bar:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(0, 0, 0, 0.5)
  p.bar = bar
  p.barText = bar:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  p.barText:SetPoint("CENTER")
  p.need = text(p, "GameFontHighlight", 14, y - 40, WIDTH - 50)
end
local function showRep(p)
  local cur, name = W.rep()
  p.faction:SetText(name or "Reputación de los writs")
  if cur then
    local lname, into, size = W.level(cur)
    p.bar:SetMinMaxValues(0, size)
    p.bar:SetValue(into)
    p.barText:SetText(("%s  %d / %d"):format(lname, into, size))
  else
    p.bar:SetMinMaxValues(0, 1)
    p.bar:SetValue(0)
    p.barText:SetText("?")
  end
  local goal = W.goal(cur)
  if goal and cur then
    local gname, ginto = W.level(goal)
    local need = goal - cur
    p.need:SetText(need > 0 and ("Meta: %s%s %d|r   ·   te faltan %s%d|r   %s(cambiala en Ajustes)|r"):format(WHITE, gname, ginto, WHITE, need, GREY) or (GREEN .. "Ya llegaste a tu meta: elegí otra en Ajustes.|r"))
  else
    p.need:SetText(YELLOW .. "No pude leer tu reputación: escribila en Ajustes.|r")
  end
end

-- Hoy -------------------------------------------------------------------------------

local CHOICES = {
  { key = "mine", name = "Solo lo que ya tengo" },
  { key = "rec", name = "Recomendado" },
  { key = "fast", name = "Lo más rápido" },
}

local function writLine(c, ticked)
  return {
    icon = icon(c.w.i), text = ticked and c.w.name or (GREY .. c.w.name .. "|r"), sub = writSub(c),
    cost = c.cost > 0 and coins(c.cost) or (GREEN .. "lo tenés|r"),
    check = ticked, toggle = function() W.skip(c.w.q, ticked); if last and last.raw then W.finishPick(last) end; UI.update() end,
  }
end

local function showToday(p)
  showRep(p)
  local R = compute()
  if not R then p.list.set({ { text = GOLD .. "Calculando…|r" } }); p.start:Disable() return end
  if R.err then p.list.set({ { text = ERR[R.err] or R.err } }); p.start:Disable() return end
  local lines = {}
  if W.locked() then
    lines[#lines + 1] = { text = YELLOW .. "Ya empezaste la ruta de hoy: la seguís en \"En camino\".|r", sub = "\"Empezar esta ruta\" la cambia por la de abajo." }
  end
  -- The three choices, each with what it costs and gives today.
  lines[#lines + 1] = { kind = "section", text = "¿Qué hago hoy?" }
  local pr = R.presets or {}
  local same = R.raw and R.raw.fast and R.raw.fast == R.raw.rec
  if same and R.pick == "fast" then R.pick = "rec" end
  for _, ch in ipairs(CHOICES) do
    local raw = R.raw and R.raw[ch.key]
    local sub
    if same and ch.key == "fast" then raw = nil end
    if ch.key == "mine" then
      sub = raw and (("%d writs que ya compraste  ·  %d de reputación  ·  sin gastar"):format(#raw.writs, raw.rep)) or "no tenés writs comprados con su objeto"
    elseif raw then
      local op = pr[ch.key]
      sub = ("hoy %d de reputación  ·  meta en %s, ~%s en total"):format(raw.rep, days(op.days), coins(op.total))
      if same then sub = sub .. "  ·  también es lo más rápido" end
    else
      sub = "no encontré writs con precio para esto"
    end
    if not (same and ch.key == "fast") then lines[#lines + 1] = {
      radio = R.pick == ch.key, disabled = not raw,
      text = (R.pick == ch.key and GREEN or (raw and WHITE or GREY)) .. ch.name .. "|r", sub = sub,
      cost = raw and (raw.cost > 0 and coins(raw.cost) or (GREEN .. "gratis|r")) or nil,
      toggle = function() if raw then o().pick = ch.key; W.finishPick(R) end; UI.update() end,
    } end
  end
  -- Today's trip: the writs with a tick; untick what you don't want (it isn't replaced).
  local plan = R.today
  if plan then
    lines[#lines + 1] = { kind = "section", text = ("Ruta de hoy: %d writs · %d de reputación · ~%d min · %d paradas"):format(#plan.writs, plan.rep, mins(plan.time), #plan.route), cost = plan.cost > 0 and coins(plan.cost) or (GREEN .. "gratis|r") }
    lines[#lines + 1] = { text = GREY .. "Destildá lo que no quieras hacer hoy: no lo reemplazo por otro, solo hacés menos reputación.|r" }
    if plan.out then
      local rep = 0
      for _, c in ipairs(plan.out) do rep = rep + c.w.rep end
      lines[#lines + 1] = { text = YELLOW .. ("Destildaste %d: %d de reputación menos hoy.|r"):format(#plan.out, rep) }
    end
    if plan.hearthSave and plan.hearthSave > 0 then
      lines[#lines + 1] = { text = GREY .. ("Usa la piedra de hogar una vez: ahorra ~%d min.|r"):format(mins(plan.hearthSave)) }
    end
    if plan.preBind then
      local pb = plan.preBind
      lines[#lines + 1] = {
        kind = "stop",
        text = ("0. Antes de empezar: piedra de hogar en %s%s|r"):format(WHITE, pb.town),
        sub = ("%s+%d min  ·  andá a la posada (%s) y ponela ahí: toda la ruta te sale ~%d min más corta"):format(R.fromTown and ("saliendo de " .. R.fromTown .. ", ") or "", mins(pb.go), pb.npc, mins(pb.save)),
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
      for _, c in ipairs(st.writs) do lines[#lines + 1] = writLine(c, true) end
    end
    if plan.out then
      lines[#lines + 1] = { kind = "stop", text = "Sin tildar (hoy no van)" }
      for _, c in ipairs(plan.out) do lines[#lines + 1] = writLine(c, false) end
    end
  end
  -- What was left out and why.
  local sk = R.skipped
  if sk and (sk.done + sk.gone + sk.old + sk.danger + (sk.unseen or 0)) > 0 then
    local t = {}
    if sk.done > 0 then t[#t + 1] = sk.done .. " ya entregados hoy" end
    if sk.danger > 0 then t[#t + 1] = sk.danger .. " en zonas peligrosas" end
    if sk.gone > 0 then t[#t + 1] = sk.gone .. " que no estaban en la subasta" end
    if (sk.unseen or 0) > 0 then t[#t + 1] = sk.unseen .. " que no estaban en tu último escaneo" end
    if sk.old > 0 then t[#t + 1] = sk.old .. " con precio viejo" end
    lines[#lines + 1] = { text = GREY .. "Ni los consideré: " .. table.concat(t, ", ") .. ".|r" }
  end
  p.list.set(lines)
  p.start:SetEnabled(plan ~= nil and #plan.writs > 0)
end

local function buildToday(p)
  repBar(p, -8)
  p.list = list(p, -72, 50)
  p.start = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  p.start:SetSize(220, 30); p.start:SetPoint("BOTTOMRIGHT", -14, 12); p.start:SetText("Empezar esta ruta  >")
  p.start:SetScript("OnClick", function()
    if last and last.today and #last.today.writs > 0 then
      W.lock(last.today)
      UI.go(2)
      if W.Buy then W.Buy.start() end
    end
  end)
  p.start:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_TOP")
    GameTooltip:AddLine("Empezar esta ruta")
    GameTooltip:AddLine("Queda guardada hasta el reinicio diario (aunque cierres la ventana o hagas /reload). Si falta comprar algo, en la subasta se abre un panel que te lo compra con el precio real del momento: si algo se fue o subió más que tu margen, cambia ese writ por otro parecido o lo saltea.", 1, 1, 1, true)
    GameTooltip:Show()
  end)
  p.start:SetScript("OnLeave", function() GameTooltip:Hide() end)
end

-- En camino --------------------------------------------------------------------------

local function showGuide(p)
  local route, done, total = W.lockedRoute()
  if not route then
    p.summary:SetText("Todavía no empezaste la ruta de hoy.\n" .. GREY .. "En \"Hoy\" elegí qué hacer y tocá \"Empezar esta ruta\": te compro lo que falte en la subasta y te guío parada por parada.|r")
    p.list.set({})
    return
  end
  if #route == 0 then
    p.summary:SetText(GREEN .. ("¡Listo! Entregaste los %d writs de hoy.|r"):format(total))
    p.list.set({})
    return
  end
  local l = W.locked()
  local buy = W.toBuy(l)
  if #buy > 0 then
    p.summary:SetText(("%s1. Comprá lo que falta|r en la subasta: se abre un panel que te lo compra.\n%s2. Después, la ruta:|r %d paradas.")
      :format(GOLD, WHITE, #route))
  else
    p.summary:SetText(("%sEntregaste %d de %d.|r   Próxima: %s%s|r en %s\n%sAceptá cada writ recién al salir (según las guías tiene 9 horas de plazo). Se recalcula desde donde estás.|r")
      :format(WHITE, done, total, GOLD, route[1].stop.npc or "?", D.zones[route[1].stop.zone].name, GREY))
  end
  local lines = {}
  if #buy > 0 then
    lines[#lines + 1] = { kind = "section", text = ("Falta comprar (%d)"):format(#buy), cost = coins(W.plannedLeft(l)) }
    lines[#lines + 1] = { text = GREY .. ("Con el precio real del momento; margen para pagar de más: %s.|r"):format(coins(math.max(0, W.headroom(l)))) }
    for _, b in ipairs(buy) do
      lines[#lines + 1] = { icon = icon(b.id), text = ("%d × %s"):format(b.n, (C_Item and C_Item.GetItemNameByID and C_Item.GetItemNameByID(b.id)) or ("#" .. b.id)), sub = "para " .. b.w.name, cost = coins(b.unit * b.n) }
    end
  end
  if l and l.changes and #l.changes > 0 then
    lines[#lines + 1] = { kind = "section", text = "Cambios en la subasta" }
    for _, ch in ipairs(l.changes) do
      lines[#lines + 1] = { text = ch.to and (("%s → %s"):format(ch.from, ch.to)) or (ch.from .. ": salteado"),
        sub = ch.to and (ch.extra > 0 and ("+" .. coins(ch.extra)) or "mismo precio o menos") or (ch.rep .. " de reputación menos hoy") }
    end
  end
  lines[#lines + 1] = { kind = "section", text = "La ruta" }
  local first = route[1].stop
  local steps = W.steps(route)
  for i, st in ipairs(steps) do
    if st.kind == "go" then
      local turn = steps[i + 1] and steps[i + 1].kind == "turnin" and steps[i + 1].text or nil
      lines[#lines + 1] = {
        kind = "stop",
        text = (st.stop == first and (GREEN .. "Ahora:  |r") or "") .. st.text,
        sub = turn,
        btn = "Mapa", click = function() W.pin(st.stop) end,
      }
    elseif st.kind == "pass" then
      lines[#lines + 1] = { text = YELLOW .. st.text .. "|r" }
    elseif st.kind ~= "turnin" then
      lines[#lines + 1] = { text = st.text, btn = st.node and "Mapa" or nil, click = st.node and function() W.pinNode(st.node) end or nil }
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
  g1:SetScript("OnClick", function() W.pinNext() end)
  local g2 = CreateFrame("Button", nil, p, "UIPanelButtonTemplate")
  g2:SetSize(150, 26); g2:SetPoint("BOTTOMRIGHT", -14, 12); g2:SetText("Dejar de seguirla")
  g2:SetScript("OnClick", function() WritPlannerCharDB.locked = nil; UI.update() end)
end

-- Ajustes ----------------------------------------------------------------------------

-- One option per row: name, control, and a grey explanation beside it.
local function row(p, y, title, helpText)
  text(p, "GameFontNormal", 14, y - 3, 150):SetText(title)
  if helpText then text(p, "GameFontHighlightSmall", 318, y - 1, 280):SetText(GREY .. helpText .. "|r") end
  return y
end

local function showSettings(p)
  showRep(p)
  local cur, _, fromGame = W.rep()
  p.source:SetText(cur and (fromGame and (GREEN .. "leída del juego|r") or (YELLOW .. "la escribiste vos|r")) or (YELLOW .. "no pude leerla del juego|r"))
  p.have.reload()
  local goal = W.goal(cur)
  if not p.goalBox:HasFocus() then p.goalBox:SetText(o().goal or (goal and tostring(goal)) or "") end
  p.tol.reload()
  p.flights:SetText(("Vuelos anotados: %s%d|r en los Reinos del Este y %s%d|r en Kalimdor.  %sSe anotan solos cuando abrís el mapa de vuelos.|r")
    :format(WHITE, W.flightCount(0), WHITE, W.flightCount(1), GREY))
  p.mini:SetChecked(not (WritPlannerDB.minimap and WritPlannerDB.minimap.hide))
  p.share:SetChecked(o().share)
  local n = W.newer
  p.version:SetText(("Versión %s"):format(W.myVersion() or "?") .. (n and (YELLOW .. ("   ·   hay una más nueva: %s (la tiene %s, pedísela)"):format(n.version, n.from) .. "|r") or ""))
end

local function buildSettings(p)
  repBar(p, -8)
  heading(p, "Tu meta", -72)
  local y = -106
  text(p, "GameFontNormal", 14, y - 3, 150):SetText("Tengo")
  p.have = edit(p, 70, 164, y, function()
    local v = W.rep()
    return v and tostring(v)
  end, function(t)
    local v = tonumber(t)
    local game = W.gameRep()
    if v and v ~= game then o().manualRep = v else o().manualRep = nil end
  end)
  button(p, "Del juego", 90, 250, y + 1, function() o().manualRep = nil; stale = true; UI.update() end)
  p.source = text(p, "GameFontHighlightSmall", 350, y - 4, 240)
  y = y - 30
  text(p, "GameFontNormal", 14, y - 3, 150):SetText("Quiero llegar a")
  p.goalBox = edit(p, 70, 164, y, function() return o().goal end, function(t)
    t = (t or ""):gsub("^%s+", ""):gsub("%s+$", "")
    o().goal = (t ~= "" and (tonumber(t) or t:match("^%+%s*%d+$"))) and t or nil
  end)
  text(p, "GameFontHighlightSmall", 250, y - 4, 340):SetText(GREY .. "un número, o \"+500\" para sumar a lo que tenés|r")
  y = y - 26
  local x = 164
  for _, st in ipairs(W.STANDINGS) do
    button(p, st.name, 100, x, y, function() o().goal = tostring(st.value); stale = true; UI.update() end)
    x = x + 104
  end

  heading(p, "Cómo armo las rutas", -196)
  y = row(p, -230, "Me estiro hasta (oro)", "Pago hasta esto de más por una ruta más corta, y es el margen al comprar si los precios suben. 0 = siempre lo más barato.")
  p.tol = edit(p, 60, 164, y, function() return tostring(o().tol) end, function(t) o().tol = tonumber(t) or 0 end)
  y = row(p, -270, "Viaje", "Con vuelos usa los que tenés anotados. La velocidad es automática (montura, Ghost Wolf o a pie).")
  cycle(p, 140, 164, y, MODES, function() return o().mode end, function(v) o().mode = v end)
  y = row(p, -310, "Zonas peligrosas", "Saca los writs que se entregan entre bichos de más nivel que esto (salvo los que ya tenés).")
  cycle(p, 140, 164, y, DANGERS, function() return o().danger end, function(v) o().danger = v end)
  y = row(p, -350, "Reputación por día", "Sin máximo = lo más rápido. Con un máximo, días más cortos y más días.")
  cycle(p, 140, 164, y, PERDAY, function() return o().perDay end, function(v) o().perDay = v end)
  y = row(p, -390, "Piedra de hogar", "La uso una vez si ahorra tiempo; si conviene ponerla en otra posada antes de salir, te lo digo.")
  cycle(p, 140, 164, y, HEARTH, function() return o().hearth end, function(v) o().hearth = v end)
  y = row(p, -430, "Salgo desde", "Donde comprás los writs: la ruta se calcula desde ahí.")
  cycle(p, 140, 164, y, STARTS(), function() return o().from end, function(v) o().from = v end)
  p.flights = text(p, "GameFontHighlightSmall", 14, -474, WIDTH - 50)
  p.mini = CreateFrame("CheckButton", nil, p, "UICheckButtonTemplate")
  p.mini:SetSize(24, 24)
  p.mini:SetPoint("TOPLEFT", 10, -500)
  text(p, "GameFontHighlightSmall", 38, -505, 250):SetText("Icono en el minimapa  " .. GREY .. "(sin él: /writs)|r")
  p.share = CreateFrame("CheckButton", nil, p, "UICheckButtonTemplate")
  p.share:SetSize(24, 24)
  p.share:SetPoint("TOPLEFT", 300, -500)
  text(p, "GameFontHighlightSmall", 328, -505, WIDTH - 350):SetText("Compartir con la guild  " .. GREY .. "(dónde se entregan)|r")
  p.share:SetScript("OnClick", function(self) o().share = self:GetChecked() and true or false end)
  p.version = text(p, "GameFontHighlightSmall", 14, -534, WIDTH - 50)
  p.mini:SetScript("OnClick", function(self)
    local want = self:GetChecked() and true or false
    if UI.toggleMinimap() ~= want then UI.toggleMinimap() end
  end)
end

-- Window ---------------------------------------------------------------------------

local STEPS = {
  { name = "Hoy", build = buildToday, show = showToday },
  { name = "En camino", build = buildGuide, show = showGuide },
  { name = "Ajustes", build = buildSettings, show = showSettings },
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

-- Opening goes to "En camino" once today's trip has started, else to "Hoy".
function UI.toggle()
  if not frame then build() end
  if frame:IsShown() then frame:Hide() else current = W.locked() and 2 or 1; frame:Show() end
end

function UI.open(i)
  if not frame then build() end
  current = i
  if frame:IsShown() then UI.update() else frame:Show() end
end

-- New prices or a turned-in writ: results get worked out again (now, if one is open).
function UI.refresh()
  stale = true
  if frame and frame:IsShown() and current <= 2 then UI.update() end
end

-- The reputation changed: step 1 shows it; results get redone when opened.
function UI.repChanged()
  stale = true
  if frame and frame:IsShown() and current ~= 2 then UI.update() end
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
  if frame and frame:IsShown() and current == 3 then UI.update() end
  return not db.minimap.hide
end
