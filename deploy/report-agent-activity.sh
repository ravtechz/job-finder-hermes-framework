#!/usr/bin/env bash
# Spune dashboard-ului care agenți Hermes rulează ACUM, ca UI-ul să-i pună la birou chiar și când n-au scris încă nimic.
# Citește ~/.hermes/profiles/<agent>/logs/agent.log: o rulare începe la linia „conversation turn:” și se termină la „Turn ended:”.
# Un agent e „activ” dacă are o rulare deschisă sau una terminată în ultimele 75 s (ca să se vadă și rulările scurte).
# Rulat de timerul de utilizator (vezi deploy/install-tzanca-runner.sh), la fiecare minut. Doar citește logurile.
#
#   ./deploy/report-agent-activity.sh --dry-run     arată ce ar trimite, fără să trimită
# Variabile (opționale): DASH_URL (http://127.0.0.1:3333), HERMES_PROFILES (~/.hermes/profiles), AGENT_KEY
set -u
DASH_URL=${DASH_URL:-http://127.0.0.1:3333}
PROFILES=${HERMES_PROFILES:-$HOME/.hermes/profiles}
KEY=${AGENT_KEY:-}
[ -z "$KEY" ] && [ -r "$PROFILES/tzanca/.env" ] && KEY=$(grep -m1 '^AGENT_KEY=' "$PROFILES/tzanca/.env" | cut -d= -f2- | tr -d "\"'")

payload=$(PROFILES="$PROFILES" python3 - <<'PY'
import json, os, re, time
now = float(os.environ.get("REPORT_NOW") or time.time())
RECENT_END = 75          # secunde: o rulare abia terminată încă se arată
MAX_OPEN = 30 * 60       # o rulare „deschisă” mai veche de atât a murit fără „Turn ended”
TAIL = 400_000
ts = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d),\d+ .*?\[([^\]]+)\].*?(conversation turn:|Turn ended:)")
out = {}
for a in ("durian", "vadim", "tzanca", "milchick"):
    path = os.path.join(os.environ["PROFILES"], a, "logs", "agent.log")
    try:
        with open(path, "rb") as f:
            f.seek(0, 2); size = f.tell(); f.seek(max(0, size - TAIL))
            lines = f.read().decode("utf-8", "replace").splitlines()
    except OSError:
        continue
    start, end = {}, {}
    for line in lines:
        m = ts.match(line)
        if not m: continue
        t = time.mktime(time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S"))   # ora locală a mașinii, ca în log
        (start if m.group(3) == "conversation turn:" else end)[m.group(2)] = t
    # evenimentele „din viitor” (ceas dat înapoi, rulări simulate în teste) nu contează
    active = any(0 <= now - e <= RECENT_END for e in end.values()) or any(
        0 <= now - s <= MAX_OPEN and (sid not in end or end[sid] < s or end[sid] > now) for sid, s in start.items())
    out[a] = active
print(json.dumps(out))
PY
)
if [ "${1:-}" = "--dry-run" ]; then echo "$payload"; exit 0; fi
[ -n "$KEY" ] || { echo "AGENT_KEY lipsește (mediu sau $PROFILES/tzanca/.env)" >&2; exit 1; }
curl -fsS --max-time 10 -o /dev/null -X PUT -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' -d "$payload" "$DASH_URL/api/agents/heartbeat" \
  || { echo "dashboard-ul nu a primit starea agenților ($DASH_URL)" >&2; exit 1; }
