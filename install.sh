#!/usr/bin/env bash
# Instalează Job Dashboard pe acest server. Rulează din rădăcina proiectului, ca utilizator normal (nu root).
#   ./install.sh               producție: utilizator dedicat "jobdash", cod în /opt/job-dashboard, secrete 600/700,
#                              backup zilnic, parolă bcrypt (cere sudo)
#   ./install.sh --user        rapid, fără sudo: serviciu systemd de utilizator, fără izolare (doar pentru încercări)
#   ./install.sh --no-password nu întreba parola dashboard-ului (o setezi mai târziu, vezi README)
# E sigur să-l rulezi din nou: actualizează codul și repornește serviciul, fără să atingă .env, baza sau backup-urile.
set -euo pipefail

MODE=prod; ASK_PASSWORD=1
for a in "$@"; do
  case "$a" in
    --user) MODE=user ;;
    --no-password) ASK_PASSWORD=0 ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opțiune necunoscută: $a (vezi ./install.sh --help)"; exit 1 ;;
  esac
done

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=/opt/job-dashboard
cd "$DIR"
die() { echo "Eroare: $*" >&2; exit 1; }
# sudo fără parolă merge direct; altfel cerem parola o dată (și o reînnoim înainte de pașii care au nevoie)
ensure_sudo() { sudo -n true 2>/dev/null || sudo -v; }
[ "$(id -u)" != 0 ] || die "rulează ca utilizator normal, nu ca root; scriptul cere sudo singur când are nevoie."

# ---------- verificări ----------
command -v node >/dev/null || die "Node nu e instalat (necesar 20+; recomandat 22). Vezi README, secțiunea „Instalare pe un server nou”."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "Node $(node -v) e prea vechi (necesar 20+)."
command -v npm >/dev/null || die "npm lipsește."
command -v systemctl >/dev/null || die "systemd lipsește. Pornește manual cu: npm run build && npm start"
if [ "$MODE" = prod ]; then
  command -v sudo >/dev/null || die "sudo lipsește (necesar pentru varianta de producție). Folosește --user pentru încercări."
  for c in rsync curl; do command -v "$c" >/dev/null || die "lipsește '$c' (ex. sudo apt install $c)."; done
  echo "==> Cer sudo (creează utilizatorul jobdash și instalează serviciile)"
  ensure_sudo
fi

# ---------- dependențe + build (ca utilizator normal) ----------
echo "==> Instalez dependențele"
if [ -d node_modules ]; then npm install; else npm ci; fi || die "npm install a eșuat. better-sqlite3 poate cere unelte de compilare: sudo apt install build-essential python3"

echo "==> Construiesc frontend-ul"
npm run build

new_key() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# ---------- varianta rapidă (utilizator) ----------
if [ "$MODE" = user ]; then
  [ -f .env ] || { cp .env.example .env; echo "==> Am creat .env din .env.example"; }
  grep -q '^AGENT_KEY=.\+' .env || { sed -i "s|^AGENT_KEY=.*|AGENT_KEY=$(new_key)|" .env; echo "==> Am generat AGENT_KEY în .env"; }
  grep -q '^ORCH_KEY=.\+' .env || { if grep -q '^ORCH_KEY=' .env; then sed -i "s|^ORCH_KEY=.*|ORCH_KEY=$(new_key)|" .env; else echo "ORCH_KEY=$(new_key)" >> .env; fi; echo "==> Am generat ORCH_KEY în .env"; }
  chmod 600 .env
  PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-3333}
  if ss -ltn | grep -q ":$PORT " && ! systemctl --user is-active --quiet job-dashboard; then die "portul $PORT e ocupat."; fi
  echo "==> Configurez serviciul systemd de utilizator"
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/job-dashboard.service" <<UNIT
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
  [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] || loginctl enable-linger "$USER" 2>/dev/null \
    || echo "Atenție: pentru pornire la boot fără login rulează: sudo loginctl enable-linger $USER"
  sleep 3
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
  [ "$code" = 200 ] || [ "$code" = 401 ] || { journalctl --user -u job-dashboard -n 20 --no-pager; die "serviciul nu răspunde (HTTP $code)."; }
  echo "==> Gata (varianta fără izolare). http://127.0.0.1:$PORT"
  echo "    Gestionare: systemctl --user {start|stop|restart|status} job-dashboard"
  echo "    Cheile agenților: grep -E '^(AGENT|ORCH)_KEY' $DIR/.env   (AGENT_KEY: Durian/Vadim/Tzanca, ORCH_KEY: Milchick)"
  exit 0
fi

# ---------- varianta de producție ----------
ensure_sudo
HAD_ENV=0; sudo test -f "$APP/.env" && HAD_ENV=1
NODE_BIN="$(readlink -f "$(command -v node)")"
sudo NODE_BIN="$NODE_BIN" "$DIR/deploy/deploy.sh"

# la prima instalare deploy.sh a copiat .env din sursă; copia din home nu mai trebuie să rămână lizibilă
if [ "$HAD_ENV" = 0 ] && [ -f "$DIR/.env" ]; then
  rm -f "$DIR/.env"; echo "==> .env a fost mutat în $APP/.env (copia din $DIR a fost ștearsă)"
fi

# ---------- parola dashboard-ului ----------
HAS_HASH=0; sudo grep -q "^DASH_PASS_HASH=.\+" "$APP/.env" && HAS_HASH=1
if [ "$HAS_HASH" = 0 ] && [ "$ASK_PASSWORD" = 1 ] && [ -t 0 ]; then
  echo
  echo "Dashboard-ul nu are parolă. Fără ea, restricțiile pentru agenți se pot ocoli (vezi README)."
  read -r -p "Setezi acum utilizatorul și parola? [D/n] " ans
  if [[ ! "$ans" =~ ^[nN] ]]; then
    read -r -p "Utilizator [admin]: " user; user=${user:-admin}
    [[ "$user" =~ ^[A-Za-z0-9_.-]+$ ]] || die "utilizator invalid (doar litere, cifre, _ . -)."
    read -r -s -p "Parolă (minim 10 caractere): " p1; echo
    read -r -s -p "Repetă parola: " p2; echo
    [ "$p1" = "$p2" ] || die "parolele nu coincid. Rulează din nou ./install.sh (e sigur)."
    LINE=$(printf '%s' "$p1" | npx --no-install tsx scripts/hash-password.ts) || die "parola nu a fost acceptată."
    unset p1 p2
    sudo env LINE="$LINE" USERNAME="$user" bash -c '
      f=/opt/job-dashboard/.env
      grep -vE "^(DASH_USER|DASH_PASS|DASH_PASS_HASH)=" "$f" > "$f.new" || true
      printf "DASH_USER=%s\n%s\n" "$USERNAME" "$LINE" >> "$f.new"
      chown --reference="$f" "$f.new"; chmod 600 "$f.new"; mv "$f.new" "$f"'
    sudo systemctl restart job-dashboard
    sleep 3
    echo "==> Parola setată (stocată ca hash bcrypt) pentru utilizatorul '$user'."
  fi
fi

# ---------- rezumat ----------
PORT=$(sudo grep -E '^PORT=' "$APP/.env" | cut -d= -f2); PORT=${PORT:-3333}
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "================ Instalare încheiată ================"
echo "Serviciu:      $(systemctl is-active job-dashboard) (rulează ca utilizatorul jobdash)"
echo "Basic Auth:    $(sudo grep -q '^DASH_PASS_HASH=.\+' "$APP/.env" && echo activ || echo 'OPRIT - setează o parolă (README, „Parola dashboard-ului”)')"
echo "Acces:         serverul ascultă doar pe 127.0.0.1:$PORT. Din laptop:"
echo "               ssh -N -L $PORT:127.0.0.1:$PORT $USER@${IP:-<ip-server>}   apoi http://localhost:$PORT"
echo "Cheile agenților: sudo grep -E '^(AGENT|ORCH)_KEY' $APP/.env   (AGENT_KEY pentru Durian/Vadim/Tzanca, ORCH_KEY pentru Milchick)"
echo "Administrare:  sudo jobdash {status|logs|restart|seed|seed:clear|backup|restore FILE}"
echo "Instrucțiuni pentru agenți: $DIR/AGENTS-API.md"
