#!/usr/bin/env bash
# Pornește agentul Tzanca (Hermes) pentru joburile la care utilizatorul a cerut sugestii de CV din dashboard
# (butonul „Marchează APPLY”). Rulat de un timer systemd de utilizator, la fiecare minut. Când nu e nicio cerere,
# face un singur GET și iese: nu pornește agentul și nu consumă tokeni.
#
# Fiecare cerere (job + momentul cererii) e procesată cel mult o dată, ca un eșec să nu se repete în buclă.
# Dacă vrei o nouă încercare, apeși din nou butonul din dashboard (sau „Înapoi” și apoi „Marchează APPLY”).
#
# Variabile (toate opționale):
#   DASH_URL          adresa dashboard-ului                (implicit http://127.0.0.1:3333)
#   TZANCA_PROFILE    profilul Hermes al lui Tzanca        (implicit tzanca)
#   TZANCA_ENV_FILE   fișierul cu AGENT_KEY                (implicit ~/.hermes/profiles/<profil>/.env)
#   HERMES_BIN        comanda hermes                       (implicit hermes)
#   TZANCA_TIMEOUT    secunde maxime per rulare            (implicit 900)
set -u

DASH_URL=${DASH_URL:-http://127.0.0.1:3333}
PROFILE=${TZANCA_PROFILE:-tzanca}
ENV_FILE=${TZANCA_ENV_FILE:-$HOME/.hermes/profiles/$PROFILE/.env}
HERMES_BIN=${HERMES_BIN:-hermes}
TIMEOUT=${TZANCA_TIMEOUT:-900}
STATE=${XDG_STATE_HOME:-$HOME/.local/state}/job-dashboard-tzanca
mkdir -p "$STATE/done"

# o singură instanță: o rulare a lui Tzanca poate dura mai mult de un minut
exec 9>"$STATE/lock"
flock -n 9 || exit 0

KEY=${AGENT_KEY:-}
if [ -z "$KEY" ] && [ -r "$ENV_FILE" ]; then
  KEY=$(grep -m1 '^AGENT_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")
fi
if [ -z "$KEY" ]; then echo "AGENT_KEY lipsește (nici în mediu, nici în $ENV_FILE)" >&2; exit 1; fi

resp=$(curl -sS --max-time 20 -w '\n%{http_code}' -H "X-Agent-Key: $KEY" "$DASH_URL/api/jobs/pending-cv?requested=1&limit=20") || { echo "dashboard-ul nu răspunde ($DASH_URL)" >&2; exit 0; }
code=${resp##*$'\n'}; body=${resp%$'\n'*}
if [ "$code" != 200 ]; then echo "pending-cv?requested=1 a răspuns HTTP $code: $body" >&2; exit 1; fi

printf '%s' "$body" | python3 -c '
import sys, json
for j in json.load(sys.stdin)["jobs"]:
    print(j["job_id"] + "\t" + (j.get("evaluation") or {}).get("cv_requested_at", ""))
' | while IFS=$'\t' read -r id requested_at; do
  [ -n "$id" ] || continue
  marker="$STATE/done/$(printf '%s|%s' "$id" "$requested_at" | sha256sum | cut -c1-32)"
  [ -e "$marker" ] && continue
  : > "$marker"   # înainte de rulare: cel mult o dată
  echo "Tzanca: sugestii de CV pentru job_id=$id (cerut la $requested_at)"
  timeout "$TIMEOUT" "$HERMES_BIN" -p "$PROFILE" -z "Propune modificări de CV pentru job_id=$id conform instrucțiunilor tale. Cererea vine din dashboard: utilizatorul a marcat jobul APPLY. Îl găsești cu GET /api/jobs/pending-cv?requested=1. Trimite sugestiile cu POST /api/cv-suggestions și raportează ce ai trimis." \
    || echo "Tzanca a ieșit cu codul $? pentru job_id=$id" >&2
done
exit 0
