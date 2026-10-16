#!/usr/bin/env bash
# Dungeon set experiments (sim only, early entry SF_BOSS_GAP=3), Polestar 0.2.4 + our patch.
T="/c/Users/el-lo/Desktop/Wow Enh/.cache/tools"
P="$T/polestar-024"
NODE="$T/node24/node-v24.22.0-win-x64/node.exe"
export LUA="C:/Users/el-lo/Desktop/Wow Enh/.cache/lua51/lua5.1.exe"
export SF_CAP=35 SF_BOSS_GAP=3
W="C:/Users/el-lo/Desktop/Wow Enh/planner/weapons-enhancement.json"
WA="C:/Users/el-lo/Desktop/Wow Enh/planner/weapons-enhancement-alliance.json"
WIN="Ragefire Chasm:13-14,Ruins of Lordaeron:17-18,Wailing Caverns:19-20,Shadowfang Keep:22-23,Excavation Site: Wetlands:28-29,City of Dalaran:30-31,Hall of Thanes:13-14,The Deadmines:18-19,The Stockade:26-28,Razorfen Kraul:30-32,Scarlet Monastery: Graveyard:31-33,Gnomeregan:31-33,Blackfathom Deeps:25-27"
mkdir -p "$T/exp"
cd "$P"
exp() { # tag faction race weapons dungeons
  echo "=== $1: $5"
  SF_DUNGEONS="$5" SF_DUNGEON_LEVELS="$WIN" SF_WEAPONS="$4" "$NODE" tools/polestar.js sim run --faction $2 --race $3 --class Shaman --dungeons --workers 3 --paths 300000 2>&1 | sed -n '/^best:/p;/rror/p'
  local lc=$(echo $3 | tr A-Z a-z)
  cp data/sim/results/$2-$lc-shaman-dungeons.json "$T/exp/$1.json"
  SF_DUNGEONS="$5" SF_DUNGEON_LEVELS="$WIN" SF_WEAPONS="$4" "$NODE" "$T/dungeon-levels-024.js" "$T/exp/$1.json" 2>&1 | grep -v NaN
}
H="Ragefire Chasm,Ruins of Lordaeron,Wailing Caverns,Shadowfang Keep,Excavation Site: Wetlands,City of Dalaran"
exp orc-rfk horde Orc "$W" "$H,Razorfen Kraul"
exp orc-smgy horde Orc "$W" "$H,Scarlet Monastery: Graveyard"
exp orc-nowc horde Orc "$W" "Ragefire Chasm,Ruins of Lordaeron,Shadowfang Keep,Excavation Site: Wetlands,City of Dalaran"
exp dwarf-pop alliance Dwarf "$WA" "Hall of Thanes,The Deadmines,The Stockade,Excavation Site: Wetlands,City of Dalaran"
exp dwarf-pop-rol alliance Dwarf "$WA" "Hall of Thanes,The Deadmines,Ruins of Lordaeron,The Stockade,Excavation Site: Wetlands,City of Dalaran"
exp dwarf-pop-gnome alliance Dwarf "$WA" "Hall of Thanes,The Deadmines,The Stockade,Excavation Site: Wetlands,City of Dalaran,Gnomeregan"
exp dwarf-cur-stock alliance Dwarf "$WA" "Hall of Thanes,The Deadmines,Ruins of Lordaeron,Shadowfang Keep,The Stockade,Excavation Site: Wetlands,City of Dalaran"
exp sky-h horde Skyborne "$W" "$H"
exp sky-nowc horde Skyborne "$W" "Ragefire Chasm,Ruins of Lordaeron,Shadowfang Keep,Excavation Site: Wetlands,City of Dalaran"
echo FIN
