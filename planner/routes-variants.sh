#!/usr/bin/env bash
# Variant routes (dungeons people often skip, or add) merged into each race's
# pack next to its main route; then lint, playtest and install. Run after
# routes-final.sh. Polestar 0.2.4 + our patch, early dungeon entry.

T="/d/Wow Enh/.cache/tools"
R="/d/Wow Enh"
P="$T/polestar-024"
NODE="$T/node24/node-v24.22.0-win-x64/node.exe"
export LUA="D:/Wow Enh/.cache/lua51/lua5.1.exe"
export SF_CAP=35 SF_BOSS_GAP=3
export SF_DUNGEON_LEVELS="Ragefire Chasm:13-14,Ruins of Lordaeron:17-18,Wailing Caverns:19-20,Shadowfang Keep:22-23,Excavation Site: Wetlands:28-29,City of Dalaran:30-31,Hall of Thanes:13-14,The Deadmines:18-19,The Stockade:26-28,Scarlet Monastery: Graveyard:31-33"
W="$R/planner/weapons-enhancement.json"
WA="$R/planner/weapons-enhancement-alliance.json"
mkdir -p "$T/variants"
# race faction weapons packid "title" tag "label" "dungeons" [races]
var() {
  local race=$1 fac=$2 wf=$3 id=$4 title=$5 tag=$6 label=$7 dg=$8 races=$9
  local work="$T/variants/$id-$tag"
  echo "=== $id $tag: $dg"
  cd "$P"
  SF_DUNGEONS="$dg" SF_WEAPONS="$wf" "$NODE" tools/polestar.js sim run --faction $fac --race $race --class Shaman --dungeons --workers 3 --paths 300000 2>&1 | sed -n '/^best:/p;/rror/p'
  local lc=$(echo $race | tr A-Z a-z)
  cp data/sim/results/$fac-$lc-shaman-dungeons.json "$work.json"
  SF_DUNGEONS="$dg" SF_WEAPONS="$wf" "$NODE" "$T/dungeon-levels-024.js" "$work.json" 2>&1 | grep -v NaN
  rm -rf "$work-export" "$work-pack"
  "$NODE" tools/polestar.js sim export --result "$work.json" --out "$work-export" >/dev/null 2>&1
  mkdir -p "$work-pack/guides"
  cd "$R"
  RACES="$races" POLESTAR="$P" node planner/make-pack.js "$work-export" "$work-pack" $id "$title" 2>&1 | tail -1
  node planner/merge-variant.js "$work-pack" "$T/packs/$id-all" $id $tag "$label"
}
check() { # packid
  cd "$T/packs/$1-all"
  "$NODE" "$P/tools/polestar.js" lint 2>&1 | grep -E "error:|lint " || true
  "$NODE" "$P/tools/polestar.js" playtest 2>&1 | grep -E "^fail|playtest" || true
  "$NODE" "$P/tools/polestar.js" install --dest "D:/World of Warcraft/_classic_beta_/Interface/AddOns" 2>&1 | grep -E "built|replaced"
}
fresh() { # packid: the main route, then variants
  rm -rf "$T/packs/$1-all"; cp -r "$T/packs/$1" "$T/packs/$1-all"; rm -rf "$T/packs/$1-all/dist"
}
H="Ragefire Chasm,Ruins of Lordaeron,Wailing Caverns,Shadowfang Keep,Excavation Site: Wetlands,City of Dalaran"
SM="Scarlet Monastery: Graveyard"
for spec in "Tauren|sf-tauren-enh|Shaman: Forever · Tauren Mejora|,$SM|" "Orc|sf-orc-enh|Shaman: Forever · Orco y Troll Mejora|,$SM|Orc, Troll" "Skyborne|sf-sky-enh|Shaman: Forever · Skyborne Mejora||"; do
  IFS='|' read -r race id title extra races <<< "$spec"
  fresh $id
  var $race horde "$W" $id "$title" sin-wc "sin WC" "Ragefire Chasm,Ruins of Lordaeron,Shadowfang Keep,Excavation Site: Wetlands,City of Dalaran$extra" "$races"
  var $race horde "$W" $id "$title" sin-sfk "sin SFK" "Ragefire Chasm,Ruins of Lordaeron,Wailing Caverns,Excavation Site: Wetlands,City of Dalaran$extra" "$races"
  var $race horde "$W" $id "$title" sin-wc-sfk "sin WC ni SFK" "Ragefire Chasm,Ruins of Lordaeron,Excavation Site: Wetlands,City of Dalaran$extra" "$races"
  check $id
done
fresh sf-dwarf-enh
var Dwarf alliance "$WA" sf-dwarf-enh "Shaman: Forever · Enano Mejora" con-rol "con Ruins of Lordaeron" "Hall of Thanes,The Deadmines,Ruins of Lordaeron,The Stockade,Excavation Site: Wetlands,City of Dalaran" ""
var Dwarf alliance "$WA" sf-dwarf-enh "Shaman: Forever · Enano Mejora" sin-stockade "sin Stockade" "Hall of Thanes,The Deadmines,Excavation Site: Wetlands,City of Dalaran" ""
check sf-dwarf-enh
echo FIN
