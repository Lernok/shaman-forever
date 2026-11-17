-- Writ Planner at the auction house: once you chose today's trip ("Usar esta
-- ruta"), a panel beside the auction house buys what the trip still needs,
-- one thing at a time. It searches the live auction house itself (Auctionator's
-- prices can be minutes old and the cheap ones go fast) and offers the
-- cheapest buy while the whole trip stays within its budget (the planned cost
-- plus your "Me estiro hasta" gold). When a thing isn't on sale within the
-- budget any more, its writ is swapped for another (or left out): W.replace
-- in Core.lua.
--
-- Forever has the modern auction house: a search by name finds the item's key,
-- then a search of that key lists it. Things that stack ("commodities") are
-- bought by quantity at the cheapest prices: one click asks the game for the
-- exact price, a second click confirms it. The rest are bought one listing per
-- click. The game asks for a click on every purchase.
local W = WritPlanner
local B = {}
W.Buy = B

local GREY, WHITE, GREEN, RED, YELLOW = "|cffa0a0a0", "|cffffffff", "|cff40e040", "|cffff5555", "|cffffcc00"
local SORT_COMMODITY = { { sortOrder = 0, reverseSort = false } } -- unit price
local SORT_ITEM = { { sortOrder = 4, reverseSort = false } }      -- buyout
local panel
local ahOpen = false
-- idle, wait, browse, search, ready, starting (asked the price), confirm, buying, done
local state = "idle"
local cur, offer, note
local sentAt, buyAt
local misses = 0 -- name searches in a row that didn't show the thing
local timerOn = false

local function AH() return C_AuctionHouse end
local function now() return GetTime and GetTime() or 0 end
local function coins(c) return W.UI and W.UI.coins and W.UI.coins(c) or W.money(c) end
local function itemName(id)
  return (C_Item and C_Item.GetItemNameByID and C_Item.GetItemNameByID(id)) or (GetItemInfo and GetItemInfo(id))
end
local function itemIcon(id)
  return (C_Item and C_Item.GetItemIconByID and C_Item.GetItemIconByID(id)) or (GetItemIcon and GetItemIcon(id))
end

local function ready()
  local a = AH()
  if not a then return false end
  return not a.IsThrottledMessageSystemReady or a.IsThrottledMessageSystemReady()
end

-- Stacks (bought by quantity) or not, from the item's key (as Auctionator
-- does); nil while the game is still loading it (asked again in a moment).
-- GetItemCommodityStatus takes a bag slot, not an item id: not used.
local function isCommodity(id, key)
  local a = AH()
  if not (key and a.GetItemKeyInfo) then return nil end
  local ok, info = pcall(a.GetItemKeyInfo, key)
  if ok and info then return info.isCommodity and true or false end
  return nil
end

local show, step, fail

-- Checks again in half a second (one timer at a time).
local function later()
  if timerOn or not C_Timer then return end
  timerOn = true
  C_Timer.After(0.5, function() timerOn = false; step() end)
end

-- Searches for the thing in hand: by name first (to get its key), then its listings.
local function search()
  if not cur then return end
  local a = AH()
  local name = itemName(cur.id)
  if not name or not ready() then state = "wait"; later(); return end
  if not cur.key then
    a.SendBrowseQuery({ searchString = name, sorts = {}, filters = {}, itemClassFilters = {} })
    state = "browse"
  else
    if cur.commodity == nil then cur.commodity = isCommodity(cur.id, cur.key) end
    if cur.commodity == nil then state = "wait"; later(); return end
    if cur.commodity then a.SendSearchQuery(cur.key, SORT_COMMODITY, false)
    else a.SendSearchQuery(cur.key, SORT_ITEM, true) end
    state = "search"
  end
  sentAt = now()
  later()
end

-- What to do now: the next thing to buy, its search, or what's ready.
step = function()
  if not ahOpen or not panel or not panel:IsShown() then return end
  local l = W.locked()
  local list = l and W.toBuy(l) or {}
  if #list == 0 then
    state, cur, offer = "done", nil, nil
    show()
    return
  end
  local first = list[1]
  if not cur or cur.id ~= first.id or cur.n ~= first.n then
    -- Same thing with fewer left to buy: keep what the searches learned about it.
    local same = cur and cur.id == first.id and cur or nil
    cur, offer = first, nil
    if same then cur.key, cur.commodity = same.key, same.commodity else misses = 0 end
    state = "idle"
  end
  local t = now()
  if state == "idle" or state == "wait" then search()
  elseif (state == "browse" or state == "search") and t - (sentAt or 0) > 8 then state = "idle"; search()
  elseif (state == "buying" or state == "starting") and t - (buyAt or 0) > 8 then state = "idle"; search()
  elseif state == "browse" or state == "search" or state == "buying" or state == "starting" then later() end
  show()
end
B.poke = function() if state == "wait" then step() end end

-- The name search came back: the thing's key, or it isn't on sale.
function B.browseResults()
  if state ~= "browse" or not cur then return end
  local a = AH()
  for _, r in ipairs(a.GetBrowseResults() or {}) do
    if r.itemKey and r.itemKey.itemID == cur.id then
      cur.key = r.itemKey
      state = "idle"
      search()
      show()
      return
    end
  end
  if a.HasFullBrowseResults and not a.HasFullBrowseResults() and a.RequestMoreBrowseResults then
    a.RequestMoreBrowseResults()
    return
  end
  -- Not in the results. Twice in a row, so another addon's search isn't mistaken for ours.
  misses = misses + 1
  if misses < 2 then state = "idle"; later(); return end
  fail(nil)
end

-- Listings of a thing that stacks: what buying the quantity you need costs.
function B.commodityResults(id)
  if state ~= "search" or not cur or not cur.commodity or id ~= cur.id then return end
  local a = AH()
  local need, total = cur.n, 0
  for i = 1, a.GetNumCommoditySearchResults(id) do
    local r = a.GetCommoditySearchResultInfo(id, i)
    local q = r and ((r.quantity or 0) - (r.numOwnerItems or 0)) or 0
    if q > 0 then
      local take = math.min(q, need)
      total, need = total + take * r.unitPrice, need - take
      if need == 0 then break end
    end
  end
  -- Not enough in what came so far: ask for the rest of the listings (if that works, wait for them).
  if need > 0 and a.HasFullCommoditySearchResults and not a.HasFullCommoditySearchResults(id)
    and a.RequestMoreCommoditySearchResults and pcall(a.RequestMoreCommoditySearchResults, id) then
    return
  end
  local got = cur.n - need
  if need > 0 then fail(got > 0 and total / got or nil) return end
  if total - cur.unit * cur.n <= W.headroom() then
    offer, state = { commodity = true, n = cur.n, total = total }, "ready"
    show()
  else
    fail(total / cur.n)
  end
end

-- Listings of a thing that doesn't stack: the cheapest listing that keeps the
-- trip within budget (a bigger stack than you need counts only for what you need).
function B.itemResults(key)
  if state ~= "search" or not cur or cur.commodity or not key or key.itemID ~= cur.id then return end
  local a = AH()
  local room = W.headroom()
  local best, bestEff, lowEff
  for i = 1, a.GetNumItemSearchResults(key) do
    local r = a.GetItemSearchResultInfo(key, i)
    if r and r.buyoutAmount and r.buyoutAmount > 0 and not r.containsOwnerItem then
      local n = r.quantity or 1
      local useful = math.min(n, cur.n)
      local eff = r.buyoutAmount / useful
      if not lowEff or eff < lowEff then lowEff = eff end
      if r.buyoutAmount - cur.unit * useful <= room and (not bestEff or eff < bestEff) then
        best, bestEff = { auctionID = r.auctionID, n = n, total = r.buyoutAmount }, eff
      end
    end
  end
  if best then
    offer, state = best, "ready"
    show()
  else
    fail(lowEff)
  end
end

-- Not on sale within the budget: swap its writ for another, or leave it out.
fail = function(low)
  local r = W.replace(cur)
  if r then
    local why = low and ("solo había a " .. coins(low) .. " c/u, planeado " .. coins(cur.unit)) or "no quedaba ninguno"
    note = r.to and (("%s: %s. Lo cambié por %s%s|r."):format(r.from.name, why, WHITE, r.to.name))
      or (("%s: %s. Sin reemplazo dentro de tu margen: hoy lo salteo (%d de reputación menos)."):format(r.from.name, why, r.from.rep))
  end
  cur, offer, state = nil, nil, "idle"
  step()
end

-- The purchase button (the game requires a click for every purchase).
local function click()
  local a = AH()
  if state == "ready" and offer then
    if GetMoney and GetMoney() < offer.total then note = RED .. "No te alcanza el oro.|r"; show() return end
    buyAt = now()
    if offer.commodity then
      state = "starting"
      a.StartCommoditiesPurchase(cur.id, offer.n)
    else
      state = "buying"
      a.PlaceBid(offer.auctionID, offer.total)
    end
    show()
    later()
  elseif state == "confirm" and offer then
    state, buyAt = "buying", now()
    a.ConfirmCommoditiesPurchase(cur.id, offer.n)
    show()
    later()
  else
    step()
  end
end

-- Core.lua passes on the game's answers.
function B.priceUpdated(unit, total)
  if state ~= "starting" or not offer then return end
  if total and total - cur.unit * offer.n <= W.headroom() then
    if total > offer.total * 1.001 then note = YELLOW .. "El precio subió un poco desde la búsqueda (entra en tu margen): fijate antes de confirmar.|r" end
    offer.total, state = total, "confirm"
  else
    -- Went up past the budget while asking: search again (it gets swapped if it's still dear).
    AH().CancelCommoditiesPurchase()
    offer, state = nil, "idle"
    step()
    return
  end
  show()
end
function B.priceUnavailable()
  if state ~= "starting" then return end
  offer, state = nil, "idle"
  step()
end
function B.bought(p)
  if not panel or not panel:IsShown() then return end
  note = GREEN .. ("Comprado: %d × %s por %s.|r"):format(p.n, itemName(p.id) or "?", coins(p.paid))
  offer, state = nil, "idle"
  -- Let the auction house refresh before the next search.
  if C_Timer then C_Timer.After(0.5, step) else step() end
end
function B.failed(msg)
  if not panel or not panel:IsShown() or (state ~= "buying" and state ~= "starting") then return end
  note = YELLOW .. "No se pudo comprar (" .. tostring(msg) .. "): busco de nuevo.|r"
  offer, state = nil, "idle"
  step()
end

-- The panel ---------------------------------------------------------------------

local function build()
  panel = CreateFrame("Frame", "WritPlannerBuyFrame", UIParent, "BasicFrameTemplateWithInset")
  panel:SetSize(320, 330)
  panel:SetFrameStrata("HIGH")
  panel:SetMovable(true)
  panel:EnableMouse(true)
  panel:RegisterForDrag("LeftButton")
  panel:SetScript("OnDragStart", panel.StartMoving)
  panel:SetScript("OnDragStop", panel.StopMovingOrSizing)
  panel:SetClampedToScreen(true)
  if panel.TitleText then panel.TitleText:SetText("Writ Planner: compras de hoy") end
  local function fs(font, y, w)
    local t = panel:CreateFontString(nil, "OVERLAY", font)
    t:SetPoint("TOPLEFT", 14, y)
    t:SetWidth(w or 292)
    t:SetJustifyH("LEFT")
    return t
  end
  panel.info = fs("GameFontHighlightSmall", -32)
  panel.icon = panel:CreateTexture(nil, "ARTWORK")
  panel.icon:SetSize(28, 28)
  panel.icon:SetPoint("TOPLEFT", 14, -52)
  panel.name = panel:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  panel.name:SetPoint("TOPLEFT", 48, -52)
  panel.name:SetWidth(258)
  panel.name:SetJustifyH("LEFT")
  panel.need = panel:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  panel.need:SetPoint("TOPLEFT", 48, -68)
  panel.need:SetWidth(258)
  panel.need:SetJustifyH("LEFT")
  panel.status = fs("GameFontHighlight", -90)
  panel.buy = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  panel.buy:SetSize(292, 28)
  panel.buy:SetPoint("TOPLEFT", 14, -126)
  panel.buy:SetScript("OnClick", click)
  panel.again = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  panel.again:SetSize(140, 22)
  panel.again:SetPoint("TOPLEFT", 14, -158)
  panel.again:SetText("Buscar de nuevo")
  panel.again:SetScript("OnClick", function()
    if state == "confirm" or state == "starting" then AH().CancelCommoditiesPurchase() end
    offer, state = nil, "idle"
    if cur then cur.key, cur.commodity, misses = nil, nil, 0 end
    step()
  end)
  panel.note = fs("GameFontHighlightSmall", -188)
  panel.rest = fs("GameFontHighlightSmall", -236)
  panel:SetScript("OnHide", function()
    if (state == "confirm" or state == "starting") and AH() then AH().CancelCommoditiesPurchase() end
    offer = nil
    if state ~= "done" then state = "idle" end
  end)
  panel:Hide()
end

show = function()
  if not panel then return end
  local l = W.locked()
  local list = l and W.toBuy(l) or {}
  local room = W.headroom(l)
  panel.info:SetText(#list > 0 and (("%sFaltan %d cosas|r  ·  margen para pagar de más: %s"):format(WHITE, #list, coins(math.max(0, room)))) or "")
  panel.note:SetText(note or "")
  if state == "done" or not cur then
    panel.icon:Hide()
    panel.name:SetText(state == "done" and (GREEN .. "Ya tenés todo lo de la ruta de hoy.|r") or "")
    panel.need:SetText(state == "done" and (GREY .. "Lo comprado llega al correo: el paso a paso te dice que lo saques primero.|r") or "")
    panel.status:SetText("")
    panel.buy:SetText("Ver el paso a paso")
    panel.buy:SetEnabled(true)
    panel.buy:SetScript("OnClick", function() if W.UI and W.UI.open then W.UI.open(2) end end)
    panel.again:Hide()
    panel.rest:SetText("")
    return
  end
  panel.buy:SetScript("OnClick", click)
  panel.again:Show()
  panel.icon:SetTexture(itemIcon(cur.id))
  panel.icon:Show()
  panel.name:SetText((itemName(cur.id) or ("#" .. cur.id)) .. (cur.kind == "writ" and (GREY .. "  (el writ)|r") or ""))
  panel.need:SetText(("Necesitás %s%d|r  ·  planeado %s c/u  ·  para %s"):format(WHITE, cur.n, coins(cur.unit), cur.w.name))
  if (state == "ready" or state == "confirm" or state == "starting") and offer then
    local unit = offer.total / math.min(offer.n, cur.n)
    local s = ("Lo más barato que entra: %s%d|r por %s (%s c/u)"):format(WHITE, offer.n, coins(offer.total), coins(unit))
    if offer.n > cur.n then s = s .. GREY .. ("  (te sobran %d)"):format(offer.n - cur.n) .. "|r" end
    if unit > cur.unit * 1.05 then s = s .. "\n" .. YELLOW .. "Subió desde que armaste la ruta, pero entra en tu margen.|r" end
    panel.status:SetText(s)
    if state == "ready" then
      panel.buy:SetText(offer.commodity and ("Comprar %d (te muestro el precio final)"):format(offer.n) or ("Comprar %d por %s"):format(offer.n, coins(offer.total)))
      panel.buy:SetEnabled(true)
    elseif state == "starting" then
      panel.buy:SetText("Pidiendo el precio…")
      panel.buy:SetEnabled(false)
    else
      panel.buy:SetText(("Confirmar: %d por %s"):format(offer.n, coins(offer.total)))
      panel.buy:SetEnabled(true)
    end
  elseif state == "buying" then
    panel.status:SetText(GREY .. "Comprando…|r")
    panel.buy:SetText("Comprando…")
    panel.buy:SetEnabled(false)
  else
    panel.status:SetText(GREY .. (state == "wait" and "Esperando a la subasta…" or "Buscando en la subasta…") .. "|r")
    panel.buy:SetText("Buscando…")
    panel.buy:SetEnabled(false)
  end
  local rest = {}
  for i = 2, math.min(7, #list) do
    local b = list[i]
    rest[#rest + 1] = ("%d × %s  %s(%s c/u)|r"):format(b.n, itemName(b.id) or ("#" .. b.id), GREY, coins(b.unit))
  end
  if #list > 7 then rest[#rest + 1] = GREY .. ("y %d más…|r"):format(#list - 7) end
  panel.rest:SetText(#rest > 0 and (GREY .. "Después:|r\n" .. table.concat(rest, "\n")) or "")
end

-- The auction house opened: the panel shows up if today's trip has something to buy.
function B.open()
  ahOpen = true
  local l = W.locked()
  if not l or #W.toBuy(l) == 0 or not AH() then return end
  if not panel then build() end
  panel:ClearAllPoints()
  local ah = AuctionHouseFrame or AuctionFrame
  if ah then panel:SetPoint("TOPLEFT", ah, "TOPRIGHT", 4, -12) else panel:SetPoint("RIGHT", UIParent, "RIGHT", -40, 0) end
  note, cur, offer, state, misses = nil, nil, nil, "idle", 0
  panel:Show()
  step()
end

function B.close()
  ahOpen = false
  if panel then panel:Hide() end
end

-- "Usar esta ruta" while at the auction house: start buying right away.
function B.start()
  if ahOpen then B.open() end
end

B.isOpen = function() return ahOpen end
B.click = click -- for the tests
B.state = function() return state end
B.debug = function() return cur and (cur.id .. " n=" .. cur.n .. " com=" .. tostring(cur.commodity) .. " key=" .. tostring(cur.key and cur.key.itemID)) or "nil" end
