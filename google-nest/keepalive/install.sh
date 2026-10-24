#!/bin/bash
# Mantém o PlanKnect na tela do Google Nest Hub — roda num Mac (ou Linux) ligado na rede de casa.
# A cada 2 minutos, entre HORA_INI e HORA_FIM, abre o PlanKnect se o Hub estiver ocioso (tela inicial
# ou moldura de fotos). Nunca interrompe música, YouTube ou chamadas.
#
# Uso:   ./install.sh "Kitchen Display"            (nome do Hub no app Google Home)
#        ./install.sh --uninstall
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"
LABEL="com.planknect.nesthub"; PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
VENV="$HOME/.planknect/castenv"; HUB="${1:-Kitchen Display}"
URL="${PK_HUB_URL:-https://mmbussacarini.github.io/PlanKnect/app/nest-hub.html}"; HORA_INI="${PK_FROM:-6}"; HORA_FIM="${PK_TO:-22}"

if [ "$1" = "--uninstall" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true; rm -f "$PLIST" "$HOME/.planknect/keepalive.sh"
  echo "Removido. O Hub não será mais aberto automaticamente."; exit 0
fi

mkdir -p "$HOME/.planknect"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" -q install pychromecast
cp "$ROOT/cast_hub.py" "$HOME/.planknect/cast_hub.py"

cat > "$HOME/.planknect/keepalive.sh" <<SH
#!/bin/bash
H=\$(date +%H); H=\$((10#\$H))
if [ \$H -ge $HORA_INI ] && [ \$H -lt $HORA_FIM ]; then
  "$VENV/bin/python" "$HOME/.planknect/cast_hub.py" "$HUB" "$URL" >> "$HOME/.planknect/nesthub.log" 2>&1
fi
SH
chmod +x "$HOME/.planknect/keepalive.sh"

if [ "$(uname)" = "Darwin" ]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$HOME/.planknect/keepalive.sh</string></array>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
PL
  launchctl unload "$PLIST" 2>/dev/null || true; launchctl load "$PLIST"
  echo "Pronto: o Mac vai manter \"$HUB\" no PlanKnect das ${HORA_INI}h às ${HORA_FIM}h."
else
  ( crontab -l 2>/dev/null | grep -v planknect; echo "*/2 * * * * $HOME/.planknect/keepalive.sh # planknect" ) | crontab -
  echo "Pronto (cron): \"$HUB\" no PlanKnect das ${HORA_INI}h às ${HORA_FIM}h."
fi
echo "Log: $HOME/.planknect/nesthub.log · Para desligar: ./install.sh --uninstall"
