#!/usr/bin/env bash
# Caster routes (Elemental and Restoration): no Enhancement weapon model (they fight with spells), same dungeons, early entry; packs reordered and installed on Polestar 0.2.4 + our patch, packs linted and playtested.
set -e
T="/c/Users/el-lo/Desktop/Wow Enh/.cache/tools"
P="$T/polestar-024"
NODE="$T/node24/node-v24.22.0-win-x64/node.exe"
export LUA="C:/Users/el-lo/Desktop/Wow Enh/.cache/lua51/lua5.1.exe"
export SF_CAP=35
R_="C:/Users/el-lo/Desktop/Wow Enh"
HD="Ragefire Chasm,Ruins of Lordaeron,Wailing Caverns,Shadowfang Keep,Excavation Site: Wetlands,City of Dalaran"
HN="Ragefire Chasm:13-16,Ruins of Lordaeron:16-19,Wailing Caverns:19-23,Shadowfang Keep:22-27,Excavation Site: Wetlands:28-32,City of Dalaran:30-34"
HE="Ragefire Chasm:13-14,Ruins of Lordaeron:17-18,Wailing Caverns:19-20,Shadowfang Keep:22-23,Excavation Site: Wetlands:28-29,City of Dalaran:30-31"
AD="Hall of Thanes,The Deadmines,Ruins of Lordaeron,Shadowfang Keep,Excavation Site: Wetlands,City of Dalaran"
AN="Hall of Thanes:14-17,The Deadmines:19-23,Ruins of Lordaeron:18-21,Wailing Caverns:20-23,Shadowfang Keep:23-27,Excavation Site: Wetlands:29-32,City of Dalaran:31-34"
AE="Hall of Thanes:13-14,The Deadmines:18-19,Ruins of Lordaeron:17-18,Wailing Caverns:19-20,Shadowfang Keep:22-23,Excavation Site: Wetlands:28-29,City of Dalaran:30-31"
mkdir -p "$T/early"
one() { # tag faction race gap dungeons windows weapons packid title [races]
  local tag=$1 fac=$2 race=$3 gap=$4 dg=$5 win=$6 wf=$7 id=$8 title=$9 races=${10}
  echo "=== $tag"
  cd "$P"
  SF_BOSS_GAP=$gap SF_DUNGEONS="$dg" SF_DUNGEON_LEVELS="$win" SF_WEAPONS="$wf" "$NODE" tools/polestar.js sim run --faction $fac --race $race --class Shaman --dungeons --workers 3 --paths 300000 2>&1 | sed -n '/^best:/,/^time to/p;/rror/p'
  local lc=$(echo $race | tr A-Z a-z)
  cp data/sim/results/$fac-$lc-shaman-dungeons.json "$T/early/$tag.json"
  SF_BOSS_GAP=$gap SF_DUNGEONS="$dg" SF_DUNGEON_LEVELS="$win" SF_WEAPONS="$wf" "$NODE" "$T/dungeon-levels-024.js" "$T/early/$tag.json" 2>&1 | grep -v NaN
  rm -rf "$T/export-$tag" "$T/packs/$tag"
  "$NODE" tools/polestar.js sim export --result "$T/early/$tag.json" --out "$T/export-$tag" >/dev/null 2>&1
  cd "$T/packs"; "$NODE" "$P/tools/polestar.js" new $tag --id $id --title "$title" --author Lernok --license CC-BY-4.0 --yes >/dev/null 2>&1; rm -f $tag/guides/example.guide
  cd "/c/Users/el-lo/Desktop/Wow Enh"; RACES="$races" POLESTAR="$P" node planner/make-pack.js "$T/export-$tag" "$T/packs/$tag" $id "$title" 2>&1 | tail -1
  POLESTAR="$P" "$NODE" "$R_/planner/reorder.js" "$T/packs/$tag" 2>&1 | tail -1
  cd "$T/packs/$tag"; "$NODE" "$P/tools/polestar.js" lint 2>&1 | grep -E "error:|lint " || true; "$NODE" "$P/tools/polestar.js" playtest 2>&1 | grep -E "^fail|playtest" || true
  "$NODE" "$P/tools/polestar.js" install --dest "D:/World of Warcraft/_classic_beta_/Interface/AddOns" 2>&1 | grep -E "built|replaced"
}
HD="$HD,Scarlet Monastery: Graveyard"
HE="$HE,Scarlet Monastery: Graveyard:31-33"
AD="Hall of Thanes,The Deadmines,The Stockade,Excavation Site: Wetlands,City of Dalaran"
AE="Hall of Thanes:13-14,The Deadmines:18-19,The Stockade:26-28,Excavation Site: Wetlands:28-29,City of Dalaran:30-31"
one sf-tauren-cast horde Tauren 3 "$HD" "$HE" "" sf-tauren-cast "Shaman: Forever · Tauren Elemental y Resto"
one sf-orc-cast horde Orc 3 "$HD" "$HE" "" sf-orc-cast "Shaman: Forever · Orco y Troll Elemental y Resto" "Orc, Troll"
one sf-sky-cast horde Skyborne 3 "${HD%,Scarlet Monastery: Graveyard}" "$HE" "" sf-sky-cast "Shaman: Forever · Skyborne Elemental y Resto"
one sf-dwarf-cast alliance Dwarf 3 "$AD" "$AE" "" sf-dwarf-cast "Shaman: Forever · Enano Elemental y Resto"
echo FIN
