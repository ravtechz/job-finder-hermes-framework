#!/usr/bin/env bash
# Instalează sau actualizează Job Dashboard sub utilizatorul de sistem "jobdash" (fără shell de login).
#   npm run build                                  # ca utilizator normal, în directorul sursă
#   sudo NODE_BIN="$(which node)" deploy/deploy.sh # prima instalare sau orice actualizare
# Cod:        /opt/job-dashboard (root, doar citire pentru jobdash)
# Secrete:    /opt/job-dashboard/.env (jobdash, 600), data/ și backups/ (jobdash, 700)
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Rulează cu sudo."; exit 1; }
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP=/opt/job-dashboard
U=jobdash
die() { echo "Eroare: $*" >&2; exit 1; }

[ -f "$SRC/dist/index.html" ] || die "lipsește dist/. Rulează mai întâi 'npm run build' ca utilizator normal."
[ -n "$(find "$SRC/src" "$SRC/server" "$SRC/index.html" -newer "$SRC/dist/index.html" -type f 2>/dev/null | head -1)" ] \
  && die "dist/ e mai vechi decât sursele. Rulează 'npm run build'."
NODE_BIN=$(readlink -f "${NODE_BIN:-$(command -v node || true)}") || true
[ -x "${NODE_BIN:-}" ] || die "nu găsesc Node. Folosește: sudo NODE_BIN=\"\$(which node)\" $0"
[ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "Node 20+ necesar."

echo "==> Utilizator $U"
if ! id "$U" >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$U"
fi

FIRST=0; [ -f "$APP/.env" ] || FIRST=1
if [ "$FIRST" = 1 ] && ss -ltn | grep -q ':3333 ' && ! systemctl is-active --quiet job-dashboard; then
  die "portul 3333 e ocupat. Oprește serviciul vechi: systemctl --user disable --now job-dashboard"
fi

echo "==> Cod în $APP (proprietar root, fără drept de scriere)"
install -d -m 755 -o root -g root "$APP"
rsync -a --delete --chown=root:root --chmod=Dg-w,Fg-w,Do-w,Fo-w \
  --exclude=/data --exclude=/backups --exclude=/.env --exclude=/runtime --exclude=/screenshots --exclude=/.git \
  "$SRC/" "$APP/"

echo "==> Runtime Node propriu (jobdash nu poate citi home-ul altui utilizator)"
install -d -m 755 -o root -g root "$APP/runtime"
cmp -s "$NODE_BIN" "$APP/runtime/node" || install -m 755 -o root -g root "$NODE_BIN" "$APP/runtime/node"

echo "==> Date și secrete (jobdash, 700/600)"
install -d -m 700 -o "$U" -g "$U" "$APP/data" "$APP/backups"
if [ "$FIRST" = 1 ]; then
  if [ -f "$SRC/.env" ]; then cp "$SRC/.env" "$APP/.env"; else cp "$SRC/.env.example" "$APP/.env"; fi
  if [ -f "$SRC/data/jobs.db" ] && [ ! -f "$APP/data/jobs.db" ]; then
    echo "    migrez baza de date din $SRC/data"
    for f in jobs.db jobs.db-wal jobs.db-shm; do [ -f "$SRC/data/$f" ] && cp -p "$SRC/data/$f" "$APP/data/$f"; done
  fi
fi
chown "$U:$U" "$APP/.env"; chmod 600 "$APP/.env"
chown -R "$U:$U" "$APP/data" "$APP/backups"; chmod 700 "$APP/data" "$APP/backups"
find "$APP/data" "$APP/backups" -type f -exec chmod 600 {} +
if ! grep -q '^AGENT_KEY=.\+' "$APP/.env"; then
  echo "    generez AGENT_KEY în .env"
  key=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  if grep -q '^AGENT_KEY=' "$APP/.env"; then sed -i "s|^AGENT_KEY=.*|AGENT_KEY=$key|" "$APP/.env"; else printf 'AGENT_KEY=%s\n' "$key" >> "$APP/.env"; fi
fi

echo "==> Servicii systemd"
install -m 644 "$SRC"/deploy/job-dashboard.service "$SRC"/deploy/job-dashboard-backup.service "$SRC"/deploy/job-dashboard-backup.timer /etc/systemd/system/
install -m 755 -o root -g root "$SRC/deploy/jobdash.sh" /usr/local/sbin/jobdash
systemctl daemon-reload
systemctl enable job-dashboard.service job-dashboard-backup.timer >/dev/null
systemctl restart job-dashboard.service
systemctl start job-dashboard-backup.timer

sleep 3
systemctl is-active --quiet job-dashboard || { journalctl -u job-dashboard -n 20 --no-pager; die "serviciul nu a pornit"; }
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$(grep -E '^PORT=' "$APP/.env" | cut -d= -f2 | grep . || echo 3333)/" || true)
pid=$(systemctl show -p MainPID --value job-dashboard)
echo "==> Gata. Serviciul rulează ca utilizatorul '$(ps -o user= -p "$pid" | tr -d ' ')' (PID $pid), HTTP $code."
echo "    Administrare: sudo jobdash {status|logs|restart|seed|seed:clear|backup|restore FILE}"
