#!/usr/bin/env bash
# One go: render frames -> sound effects -> (optional) music mix -> MP4 -> spec check + QA contact sheet.
# Usage: bash build.sh <project dir> [--music song.mp3] [--out name.mp4] [--qa t1 t2 ...]
#   --music: an audio file used as background music (overrides MUSIC.file in timeline.js).
#   Other options go to mux.py; --out is relative to the project dir.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: bash build.sh <project dir> [--music song.mp3] [--out x.mp4] [--qa t1 t2 ...]"; exit 2; }
S="$(cd "$(dirname "$0")" && pwd)"
P="$1"; shift
MUSIC_ARGS=(); REST=()
while [ $# -gt 0 ]; do
  if [ "$1" = "--music" ]; then MUSIC_ARGS=(--file "$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"); shift 2
  else REST+=("$1"); shift; fi
done
node "$S/render_frames.js" "$P"
python3 "$S/sfx.py" "$P"
python3 "$S/music.py" "$P" ${MUSIC_ARGS[@]+"${MUSIC_ARGS[@]}"}
python3 "$S/mux.py" "$P" ${REST[@]+"${REST[@]}"}
