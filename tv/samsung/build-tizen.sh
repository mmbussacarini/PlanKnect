#!/bin/bash
# Monta e instala o PlanKnect numa Samsung (Tizen) — app normal, sem trocar o sistema da TV.
# Requer: Tizen Studio CLI (tizen, sdb) + um perfil de certificado (veja tv/README.md).
# Uso: ./build-tizen.sh <perfil-do-certificado> <IP-da-TV>
set -e
PROFILE="${1:?informe o perfil do certificado}"; TV="${2:?informe o IP da TV}"
HERE="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$HERE/../../app" && pwd)"; OUT="$HERE/dist"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$APP"/. "$OUT"/; cp "$HERE/config.xml" "$OUT"/
tizen package -t wgt -s "$PROFILE" -- "$OUT"
sdb connect "$TV"
TARGET="$(sdb devices | awk 'NR==2{print $3}')"
tizen install -n "$OUT"/PlanKnect.wgt -t "$TARGET"
tizen run -p PKnectTV01.PlanKnect -t "$TARGET"
