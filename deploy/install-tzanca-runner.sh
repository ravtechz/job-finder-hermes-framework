#!/usr/bin/env bash
# Instalează timerul care pornește Tzanca când ceri sugestii de CV din dashboard (butonul „Marchează APPLY”).
# Rulează ca utilizatorul sub care rulează Hermes, FĂRĂ sudo:  ./deploy/install-tzanca-runner.sh
# Dezinstalare:  ./deploy/install-tzanca-runner.sh --remove
set -euo pipefail
[ "$(id -u)" -ne 0 ] || { echo "Rulează ca utilizatorul Hermes, nu ca root." >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
BIN="$HOME/.local/bin/job-dashboard-tzanca-runner"
UNITS="$HOME/.config/systemd/user"

if [ "${1:-}" = "--remove" ]; then
  systemctl --user disable --now job-dashboard-tzanca.timer 2>/dev/null || true
  rm -f "$UNITS/job-dashboard-tzanca.service" "$UNITS/job-dashboard-tzanca.timer" "$BIN"
  systemctl --user daemon-reload
  echo "Eliminat."; exit 0
fi

for c in curl flock python3 systemctl; do command -v "$c" >/dev/null || { echo "Lipsește: $c" >&2; exit 1; }; done
command -v hermes >/dev/null || echo "Atenție: 'hermes' nu e în PATH; setează HERMES_BIN în unitatea systemd (vezi README)." >&2

mkdir -p "$HOME/.local/bin" "$UNITS"
install -m 755 "$HERE/tzanca-runner.sh" "$BIN"
# PATH-ul de utilizator din systemd e minimal: hermes e de obicei în ~/.local/bin
cat > "$UNITS/job-dashboard-tzanca.service" <<UNIT
[Unit]
Description=Job Dashboard: pornește Tzanca pentru cererile de sugestii CV

[Service]
Type=oneshot
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$BIN
TimeoutStartSec=1000
UNIT
cat > "$UNITS/job-dashboard-tzanca.timer" <<UNIT
[Unit]
Description=Verifică la fiecare minut dacă ai cerut sugestii de CV din dashboard

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now job-dashboard-tzanca.timer
echo "==> Timer activ. Starea: systemctl --user list-timers job-dashboard-tzanca.timer ; jurnal: journalctl --user -u job-dashboard-tzanca -f"
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != yes ]; then
  echo "Atenție: timerul rulează doar cât ești logat. Ca să meargă și fără sesiune: sudo loginctl enable-linger $USER"
fi
