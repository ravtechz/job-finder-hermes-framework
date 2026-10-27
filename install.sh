#!/usr/bin/env bash
# Instalează Job Dashboard ca serviciu systemd de UTILIZATOR (fără izolare; pentru încercări rapide).
# Pentru producție, cu utilizator dedicat și secrete protejate, folosește: sudo deploy/deploy.sh (vezi README).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

command -v node >/dev/null || { echo "Eroare: Node nu e instalat (necesar 20+)."; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { echo "Eroare: Node $NODE_MAJOR e prea vechi (necesar 20+)."; exit 1; }
command -v systemctl >/dev/null || { echo "Eroare: systemd lipsește. Pornește manual cu: npm start"; exit 1; }

echo "==> Instalez dependențele"
npm install

[ -f .env ] || { cp .env.example .env; echo "==> Am creat .env din .env.example (editează-l dacă vrei alt port / Basic Auth)"; }

echo "==> Construiesc frontend-ul"
npm run build

echo "==> Configurez serviciul systemd (utilizator)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/job-dashboard.service" <<UNIT
[Unit]
Description=Job Dashboard (Hermes agents)
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$(command -v node) $DIR/node_modules/tsx/dist/cli.mjs server/index.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable job-dashboard
systemctl --user restart job-dashboard

if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  loginctl enable-linger "$USER" 2>/dev/null \
    || echo "Atenție: nu am putut activa linger. Pentru pornire la boot fără login rulează: sudo loginctl enable-linger $USER"
fi

PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-3333}
sleep 2
if curl -fs "http://127.0.0.1:$PORT/api/stats" >/dev/null 2>&1 || curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/stats" | grep -q 401; then
  echo "==> Gata. Dashboard pornit pe http://127.0.0.1:$PORT"
else
  echo "Serviciul nu răspunde încă. Verifică: journalctl --user -u job-dashboard -n 30"; exit 1
fi
echo "Gestionare: systemctl --user {start|stop|restart|status} job-dashboard"
