#!/usr/bin/env bash
# DEMO (pentru filmări): pune agenții la „lucru” pe rând, ca să se vadă animațiile din dashboard.
# Nu rulează niciun agent și nu scrie joburi: doar trimite „heartbeat” (ca raportorul real), apoi îl oprește.
# Milchick rămâne activ cât timp delegă, iar ceilalți trei lucrează pe rând, fiecare câteva secunde.
#
#   ./deploy/demo-agents.sh            o rundă (≈ 1 minut)
#   ./deploy/demo-agents.sh 3          trei runde
#   SECS=20 ./deploy/demo-agents.sh    fiecare agent lucrează 20 s (implicit 12)
#
# Cheia AGENT_KEY e citită din /opt/job-dashboard/.env (are nevoie de sudo) sau din mediu.
# Variabile: DASH_URL (implicit http://127.0.0.1:PORT din .env), AGENT_KEY, DASH_ENV, SECS
set -u
ROUNDS=${1:-1}
SECS=${SECS:-12}
ENV_FILE=${DASH_ENV:-/opt/job-dashboard/.env}
[ -f "$ENV_FILE" ] || ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

getenv() { # citește o variabilă din .env, cu sudo dacă fișierul nu e lizibil
  local v
  if [ -r "$ENV_FILE" ]; then v=$(grep -m1 "^$1=" "$ENV_FILE" || true); else v=$(sudo grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null || true); fi
  printf '%s' "${v#*=}" | tr -d "\"'"
}

KEY=${AGENT_KEY:-$(getenv AGENT_KEY)}
PORT=$(getenv PORT); PORT=${PORT:-3333}
DASH_URL=${DASH_URL:-http://127.0.0.1:$PORT}
[ -n "$KEY" ] || { echo "Nu găsesc AGENT_KEY (în $ENV_FILE). Dă-l ca AGENT_KEY=... ./deploy/demo-agents.sh" >&2; exit 1; }

beat() { # beat agent true|false
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$DASH_URL/api/agents/heartbeat" \
    -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' -d "{\"$1\": $2}")
  [ "$code" = 200 ] || { echo "Eroare $code de la $DASH_URL (cheia greșită sau dashboard-ul nu e pornit?)" >&2; exit 1; }
}

off() { for a in milchick durian vadim tzanca; do beat $a false; done; }
trap 'off; echo; echo "Oprit, agenții sunt înapoi la bancă."; exit 0' INT TERM

echo "Demo pe $DASH_URL: $ROUNDS rundă/runde, $SECS s per agent. Ctrl+C oprește."
for r in $(seq "$ROUNDS"); do
  echo "• Milchick preia treaba"; beat milchick true; sleep "$SECS"
  for a in durian vadim tzanca; do
    echo "• $a lucrează"; beat "$a" true; sleep "$SECS"; beat "$a" false; sleep 2
  done
  echo "• Milchick termină"; beat milchick false; sleep 4
done
off
echo "Gata, agenții sunt înapoi la bancă."
