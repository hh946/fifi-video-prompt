#!/usr/bin/env bash
# Download open-licence (OFL / Apache) fonts from github.com/google/fonts into a directory; existing files are skipped.
# Usage: bash fetch_fonts.sh <fonts dir> [google/fonts path ...]
#   With no paths it fetches a default set of five display fonts. new_project.sh passes the paths listed in the
#   style's fonts.txt.
set -euo pipefail
DIR="${1:-fonts}"; shift || true; mkdir -p "$DIR"
B=https://github.com/google/fonts/raw/main
LIST=("$@")
[ ${#LIST[@]} -eq 0 ] && LIST=(
  ofl/zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf
  ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf
  ofl/zhimangxing/ZhiMangXing-Regular.ttf
  apache/permanentmarker/PermanentMarker-Regular.ttf
  ofl/anton/Anton-Regular.ttf )
for p in "${LIST[@]}"; do
  [ -z "$p" ] && continue
  f="$DIR/$(basename "$p" | tr -d '[]' | sed 's/,/-/g')"
  [ -s "$f" ] && continue
  curl -fsSL --retry 3 --max-time 300 -o "$f" "$B/$(printf '%s' "$p" | sed 's/\[/%5B/g; s/\]/%5D/g; s/,/%2C/g')" || { echo "Download failed: $p"; rm -f "$f"; exit 1; }
  echo "font $(basename "$f")"
done
