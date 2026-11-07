#!/usr/bin/env bash
# Создаёт папку проекта ахопо: шесть роликов HyperFrames + лист А3. plan.json кладётся в корень проекта.
# Использование: bash .claude/skills/ahopo/kit/new_project.sh <папка-проекта>
set -euo pipefail
KIT="$(cd "$(dirname "$0")" && pwd)"
DST="${1:?укажи папку проекта}"
mkdir -p "$DST/sheet"
# id композиции в каждом ролике должен совпадать с id таймлайна в генераторе
declare -A CID=([axo]=axo [section]=cut [routes]=routes [poche]=poche [zoning]=zoning [shadows]=shadows)
for d in axo section routes poche zoning shadows; do
  P="$DST/$d-video"; mkdir -p "$P/compositions" "$P/assets"
  cp "$KIT/generators/$d/build.mjs" "$P/build.mjs"
  cp "$KIT/templates/gsap.min.js" "$P/assets/"
  cp "$KIT/templates/hyperframes.json" "$P/"
  sed "s/__ID__/${CID[$d]}/g" "$KIT/templates/index.html" > "$P/index.html"
  sed "s/__NAME__/$d-video/" "$KIT/templates/package.json" > "$P/package.json"
  printf '{ "id": "%s-video", "name": "%s-video" }\n' "$d" "$d" > "$P/meta.json"
  printf '.hyperframes/\nnode_modules/\n' > "$P/.gitignore"
done
cp "$KIT/build_sheet.mjs" "$DST/sheet/build_sheet.mjs"
cp "$KIT/render_plan.py" "$DST/render_plan.py"
echo "Готово: $DST. Положи plan.json в $DST и собирай по шагам из SKILL.md."
