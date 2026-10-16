#!/usr/bin/env bash
# Rebuild the four race packs (main route + variants) from the routes already
# simulated (exports in .cache/tools), after a change to make-pack.js; lint,
# playtest, install.
T="/c/Users/el-lo/Desktop/Wow Enh/.cache/tools"
R="/c/Users/el-lo/Desktop/Wow Enh"
P="$T/polestar-024"
NODE="$T/node24/node-v24.22.0-win-x64/node.exe"
export LUA="C:/Users/el-lo/Desktop/Wow Enh/.cache/lua51/lua5.1.exe"
pack() { # export dir, pack dir, id, title, races
  rm -rf "$2/guides"; mkdir -p "$2/guides"
  cd "$R"; RACES="$5" POLESTAR="$P" node planner/make-pack.js "$1" "$2" $3 "$4" 2>&1 | tail -1
  [ -f "$2/pack.json" ] || cp "$T/packs/$3/pack.json" "$2/"
  POLESTAR="$P" "$NODE" planner/reorder.js "$2" 2>&1 | tail -1
}
for spec in "sf-tauren-enh|Shaman: Forever · Tauren Mejora|" "sf-orc-enh|Shaman: Forever · Orco y Troll Mejora|Orc, Troll" "sf-sky-enh|Shaman: Forever · Skyborne Mejora|" "sf-dwarf-enh|Shaman: Forever · Enano Mejora|"; do
  IFS='|' read -r id title races <<< "$spec"
  echo "=== $id"
  pack "$T/export-$id" "$T/packs/$id" $id "$title" "$races"
  rm -rf "$T/packs/$id-all"; cp -r "$T/packs/$id" "$T/packs/$id-all"; rm -rf "$T/packs/$id-all/dist"
  for v in "$T/variants/$id-"*-export; do
    tag=$(basename "$v" -export); tag=${tag#$id-}
    pack "$v" "$T/variants/$id-$tag-pack" $id "$title" "$races"
    case $tag in sin-wc) l="sin WC";; sin-sfk) l="sin SFK";; sin-wc-sfk) l="sin WC ni SFK";; con-rol) l="con Ruins of Lordaeron";; sin-stockade) l="sin Stockade";; *) l=$tag;; esac
    cd "$R"; node planner/merge-variant.js "$T/variants/$id-$tag-pack" "$T/packs/$id-all" $id $tag "$l"
  done
  cd "$T/packs/$id-all"
  "$NODE" "$P/tools/polestar.js" lint 2>&1 | grep -E "error:|lint " | head -5
  "$NODE" "$P/tools/polestar.js" playtest 2>&1 | grep -E "^fail|playtest" | head -5
  "$NODE" "$P/tools/polestar.js" install --dest "D:/World of Warcraft/_classic_beta_/Interface/AddOns" 2>&1 | grep -E "built|replaced"
done
echo FIN
