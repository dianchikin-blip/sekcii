#!/usr/bin/env bash
# Собирает монтаж (титул → 6 роликов → лист А3) из уже отрендеренных роликов и листа.
# Использование: bash .claude/skills/ahopo/kit/make_montage.sh <папка-проекта> [client]
set -euo pipefail
KIT="$(cd "$(dirname "$0")" && pwd)"; P="$(cd "${1:?папка проекта}" && pwd)"; MODE="${2:-architect}"
SFX=""; [ "$MODE" = "client" ] && SFX="-client"
M="$P/montage-video"; mkdir -p "$M/compositions" "$M/assets"
cp "$KIT/generators/montage/build.mjs" "$M/build.mjs"
cp "$KIT/templates/gsap.min.js" "$M/assets/"; cp "$KIT/templates/hyperframes.json" "$M/"
sed "s/__NAME__/montage-video/" "$KIT/templates/package.json" > "$M/package.json"
printf '{ "id": "montage-video", "name": "montage-video" }\n' > "$M/meta.json"
printf '.hyperframes/\nnode_modules/\n' > "$M/.gitignore"
for d in axo section poche zoning routes shadows; do
  src="$P/$d-video/$d$SFX.mp4"
  if [ ! -f "$src" ]; then   # запасной вариант: любой ролик своей версии
    if [ -n "$SFX" ]; then src="$(ls "$P/$d-video"/*-client.mp4 | head -1)"; else src="$(ls "$P/$d-video"/*.mp4 | grep -v -- '-client' | head -1)"; fi
  fi
  cp "$src" "$M/assets/$d$SFX.mp4"
  ffmpeg -v error -y -sseof -0.05 -i "$src" -frames:v 1 -update 1 "$M/assets/$d$SFX-last.png"
done
python3 -c "
from PIL import Image; im=Image.open('$P/sheet/sheet$SFX.png'); im.resize((1080, round(1080*im.height/im.width)), Image.LANCZOS).save('$M/assets/sheet$SFX.png')"
cd "$M" && AUDIENCE="$MODE" node build.mjs && npx hyperframes check && npx hyperframes render -o "montage$SFX.mp4"
echo "Готово: $M/montage$SFX.mp4"
