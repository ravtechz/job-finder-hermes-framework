#!/usr/bin/env bash
# Trimite în dashboard modelul configurat pentru fiecare agent Hermes (apare în tabul „Agenți”).
# Citește model.default și model.provider din ~/.hermes/profiles/<agent>/config.yaml.
# Serverul nu are acces la home-ul tău, de aceea modelul e raportat de aici.
#
# Variabile (opționale):
#   DASH_URL        adresa dashboard-ului            (implicit http://127.0.0.1:3333)
#   HERMES_PROFILES directorul cu profiluri           (implicit ~/.hermes/profiles)
#   AGENT_KEY       cheia agenților                   (implicit: din .env-ul profilului tzanca)
set -u
DASH_URL=${DASH_URL:-http://127.0.0.1:3333}
PROFILES=${HERMES_PROFILES:-$HOME/.hermes/profiles}
KEY=${AGENT_KEY:-}
[ -z "$KEY" ] && [ -r "$PROFILES/tzanca/.env" ] && KEY=$(grep -m1 '^AGENT_KEY=' "$PROFILES/tzanca/.env" | cut -d= -f2- | tr -d "\"'")
if [ -z "$KEY" ]; then echo "AGENT_KEY lipsește (mediu sau $PROFILES/tzanca/.env)" >&2; exit 1; fi

payload=$(PROFILES="$PROFILES" python3 - <<'PY'
import json, os, re
out = {}
for a in ("durian", "vadim", "tzanca", "milchick"):
    try:
        text = open(os.path.join(os.environ["PROFILES"], a, "config.yaml"), encoding="utf-8").read()
    except OSError:
        continue
    m = re.search(r"^model:\s*\n((?:[ \t]+.*\n?)+)", text, re.M)   # blocul indentat de sub „model:”
    if not m:
        continue
    get = lambda k: (re.search(rf"^[ \t]+{k}:[ \t]*(\S+)", m.group(1), re.M) or [None, None])[1]
    if get("default"):
        out[a] = {"model": get("default").strip("\"'"), "provider": (get("provider") or "").strip("\"'") or None}
print(json.dumps(out))
PY
)
curl -fsS --max-time 20 -X PUT -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' -d "$payload" "$DASH_URL/api/agents/models" && echo " $payload"
