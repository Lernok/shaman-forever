#!/usr/bin/env bash
# The addon against every guide of every Shaman: Forever pack (first, middle and last step).
# The packs are on standby (out of the game since 2026-10-17): PACKS=<folder> to point elsewhere.
cd "/d/Wow Enh"
L=.cache/lua51/lua5.1.exe
A="${PACKS:-.cache/tools/backup-packs-installed}"
fails=0 runs=0
for pack in "$A"/PolestarPack_ShamanForever*; do
  G="$pack/Guides.lua"
  race=Orc; case "$pack" in *Tauren*) race=Tauren;; *Enano*) race=Dwarf;; *Skyborne*) race=Skyborne;; esac
  ids=$(grep -o 'id = "sf-[^"]*/[^"]*"' "$G" | sed 's/id = "//;s/"//')
  for id in $ids; do
    lv=$(awk -v id="$id" '$0 ~ "id = \""id"\"" {f=1} f && /minLevel = / {gsub(/[^0-9]/,""); print; exit}' "$G")
    for st in 1 8 999; do
      out=$(PPACK="$G" PGUIDE="$id" PSTEP=$st $L scripts/test-addon.lua $race Enhancement ${lv:-10} 2>&1)
      runs=$((runs+1))
      if echo "$out" | grep -qi "traceback\|attempt to\|stack"; then fails=$((fails+1)); echo "FALLA $id paso $st"; echo "$out" | grep -i -m3 "attempt\|error"; fi
    done
  done
  echo "$(basename "$pack"): ok"
done
echo "corridas $runs, fallas $fails"
