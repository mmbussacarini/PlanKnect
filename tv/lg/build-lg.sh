#!/bin/bash
# Monta e instala o PlanKnect numa LG (webOS) pelo Developer Mode.
# Requer: webOS CLI (npm i -g @webos-tools/cli) e a TV registrada: ares-setup-device
# Uso: ./build-lg.sh <nome-da-TV-no-ares>
set -e
TVNAME="${1:-tv}"
HERE="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$HERE/../../app" && pwd)"; OUT="$HERE/dist"
rm -rf "$OUT"; mkdir -p "$OUT/app"
cp -R "$APP"/. "$OUT/app"/; cp "$HERE/appinfo.json" "$OUT/app"/
cp -R "$HERE/service" "$OUT/service"
ares-package "$OUT/app" "$OUT/service" -o "$OUT"
ares-install -d "$TVNAME" "$OUT"/com.planknect.tv_*.ipk
ares-launch -d "$TVNAME" com.planknect.tv
