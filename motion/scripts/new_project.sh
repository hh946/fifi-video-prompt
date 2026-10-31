#!/usr/bin/env bash
# Create a new video project: shared lib.js -> empty skeleton (timeline.js / scene.js / render.js / index.html)
# -> components -> fonts. The project can live anywhere. playwright-core is installed once in motion/.
# Usage: bash scripts/new_project.sh <project dir>
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: bash new_project.sh <project dir>"; exit 2; }
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
DST="$1"
SD="$SKILL/styles/explainer"
[ -e "$DST/index.html" ] && { echo "$DST already has index.html, not overwriting"; exit 1; }
mkdir -p "$DST"
cp -R "$SKILL/template/." "$DST/"
cp -R "$SD/skeleton/." "$DST/"
# components.txt: one path per line, relative to components/ (subfolders kept)
while IFS= read -r c; do
  [ -z "$c" ] && continue
  mkdir -p "$DST/$(dirname "$c")"; cp "$SKILL/components/$c" "$DST/$c"
done < "$SD/components.txt"
cp "$SKILL/components/watermark.js" "$DST/"
FONTS=(); while IFS= read -r f; do [ -n "$f" ] && FONTS+=("$f"); done < "$SD/fonts.txt"
bash "$SKILL/scripts/fetch_fonts.sh" "$DST/fonts" "${FONTS[@]}"
if [ ! -d "$SKILL/node_modules/playwright-core" ]; then
  (cd "$SKILL" && npm i --silent >/dev/null)
fi
printf 'frames/\nbuild/\nqa/\n*.mp4\n' > "$DST/.gitignore"
echo "Project ready: $DST"
echo "Next: put times in timeline.js (T), build shots in scene.js. Component docs: $SKILL/docs/components/"
echo "Preview in a browser: open \"$DST/index.html?play\"   one frame: index.html?t=2.5"
echo "Stills: node $SKILL/scripts/render_frames.js \"$DST\" --stills 1 3.5   Full video: bash $SKILL/scripts/build.sh \"$DST\""
