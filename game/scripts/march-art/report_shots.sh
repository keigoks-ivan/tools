#!/bin/sh
# Regenerates game/design/march-art/*.png: gameplay-camera shots per segment, beauty angles,
# graybox before/after pairs and a 10-oni budget shot. Needs a static server at the repo root
# on 127.0.0.1:$PORT (default 8766):  python3 -m http.server 8766 --bind 127.0.0.1
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "$DIR/../../design" && pwd)/march-art
mkdir -p "$OUT" "$OUT/graybox"
GAME="seg1-game seg1-game-b seg2-game seg2-game-b seg3-game seg3-game-b seg4-game seg4-game-back"
"$DIR/shots.sh" "$OUT" "" $GAME | grep eval > "$OUT/budget-per-shot.txt"
"$DIR/shots.sh" "$OUT" "&open=1&far=250" beauty-market beauty-market-back beauty-plaza beauty-stairs beauty-gate beauty-gate-wide > /dev/null
"$DIR/shots.sh" "$OUT" "&open=1&far=250&fog=0" overview > /dev/null
"$DIR/shots.sh" "$OUT/graybox" "&graybox=1" seg1-game seg2-game seg3-game seg4-game > /dev/null
"$DIR/shots.sh" "$OUT/graybox" "&graybox=1&open=1&far=250&fog=0" overview > /dev/null
PORT=${PORT:-8766}
# pickups: close-up, gameplay camera, plaza, collect burst (hero steps next to the 魂晶)
P="http://127.0.0.1:$PORT/game/3d-next/march-art-preview.html?clean=1"
node "$DIR/shoot.mjs" "$P&shot=pickups-close" "$OUT/_" --shots "[{\"eval\":\"1\",\"delay\":1500,\"out\":\"$OUT/pickups-closeup.png\"}]" > /dev/null
node "$DIR/shoot.mjs" "$P&shot=pickups-game-far" "$OUT/_" --shots "[{\"eval\":\"1\",\"delay\":1500,\"out\":\"$OUT/pickups-gameplay-plaza.png\"}]" > /dev/null
node "$DIR/shoot.mjs" "$P&shot=pickups-game" "$OUT/_" --shots "[{\"eval\":\"1\",\"delay\":1500,\"out\":\"$OUT/pickups-gameplay.png\"},{\"eval\":\"const m=__art.march; Object.assign(m.arena.hero,{x:670,y:344}); m.update(1/60,{x:0,y:0}); 1\",\"delay\":120,\"out\":\"$OUT/pickups-collect.png\"}]" > /dev/null
node "$DIR/shoot.mjs" "http://127.0.0.1:$PORT/game/3d-next/march-art-preview.html?clean=1&enemies=10" "$OUT/_" --shots "[{\"eval\":\"__art.applyShot('seg1-game'); JSON.stringify(__art.measure())\",\"out\":\"$OUT/budget-10-oni.png\",\"delay\":1500}]" | grep eval >> "$OUT/budget-per-shot.txt"
python3 - "$OUT" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]
f = ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', 26, index=6)
for name in ('seg1-game', 'seg2-game', 'seg3-game', 'seg4-game', 'overview'):
    a = Image.open(f'{out}/graybox/{name}.png').convert('RGB')
    b = Image.open(f'{out}/{name}.png').convert('RGB')
    w, h = a.size
    canvas = Image.new('RGB', (w * 2 + 12, h), (10, 10, 18))
    canvas.paste(a, (0, 0)); canvas.paste(b, (w + 12, 0))
    d = ImageDraw.Draw(canvas)
    for x, label in ((16, 'BEFORE  graybox'), (w + 28, 'AFTER  march-art.js')):
        d.rectangle((x - 6, 12, x + 250, 50), fill=(0, 0, 0))
        d.text((x, 16), label, font=f, fill=(255, 255, 255))
    canvas.save(f'{out}/before-after-{name}.png')
print('composed')
PY
