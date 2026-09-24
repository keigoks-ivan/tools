#!/bin/sh
# Usage: shots.sh <outdir> [query] [shot names...]   (static server on 127.0.0.1:$PORT, default 8766, at the repo root)
OUT=$1; shift; Q=$1; shift
DIR=$(cd "$(dirname "$0")" && pwd)
LIST=""
for s in "$@"; do LIST="$LIST{\"eval\":\"__art.applyShot('$s'); JSON.stringify(__art.measure())\",\"out\":\"$OUT/$s.png\",\"delay\":900},"; done
LIST="[${LIST%,}]"
node "$DIR/shoot.mjs" "http://127.0.0.1:${PORT:-8766}/game/3d-next/march-art-preview.html?clean=1$Q" "$OUT/_" --shots "$LIST" --w ${W:-1280} --h ${H:-720}
