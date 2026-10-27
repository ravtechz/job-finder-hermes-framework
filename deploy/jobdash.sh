#!/usr/bin/env bash
# Comenzi de administrare, rulate ca userul jobdash. Instalat ca /usr/local/sbin/jobdash.
# Folosire: sudo jobdash {seed|seed:clear|backup|restore FILE|status|logs|restart}
set -euo pipefail
APP=/opt/job-dashboard
[ "$(id -u)" = 0 ] || { echo "Rulează cu sudo: sudo jobdash $*"; exit 1; }
cd "$APP"; umask 077
node_run() { runuser -u jobdash -- "$APP/runtime/node" "$APP/node_modules/tsx/dist/cli.mjs" "$@"; }

case "${1:-}" in
  seed)        node_run scripts/seed.ts ;;
  seed:clear)  node_run scripts/seed.ts --clear ;;
  backup)      node_run scripts/backup.ts ;;
  status)      systemctl status job-dashboard job-dashboard-backup.timer --no-pager ;;
  logs)        shift; journalctl -u job-dashboard "${@:--n 50}" --no-pager ;;
  restart)     systemctl restart job-dashboard && systemctl is-active job-dashboard ;;
  restore)
    f="${2:?Folosire: sudo jobdash restore /opt/job-dashboard/backups/jobs-....db}"
    f=$(readlink -f "$f"); [ -f "$f" ] || { echo "Nu există: $f"; exit 1; }
    case "$f" in "$APP"/backups/*) ;; *) echo "Backup-ul trebuie să fie în $APP/backups/"; exit 1;; esac
    # verificăm copia înainte să atingem baza curentă
    runuser -u jobdash -- "$APP/runtime/node" -e '
      try {
        const d = require(process.argv[1] + "/node_modules/better-sqlite3")(process.argv[2], { readonly: true });
        const r = d.pragma("integrity_check", { simple: true });
        if (r !== "ok") throw new Error(r);
        for (const t of ["jobs","evaluations","cv_suggestions","cv","profile"]) d.prepare("select 1 from " + t + " limit 1").get();
      } catch (e) { console.error("Backup invalid sau corupt, baza curentă nu a fost atinsă: " + e.message); process.exit(1) }
    ' "$APP" "$f"
    rm -f "$f-wal" "$f-shm"   # o verificare pe un fișier în mod WAL lasă fișiere-satelit
    ts=$(date +%Y%m%dT%H%M%S)
    systemctl stop job-dashboard
    # snapshot al bazei curente prin API-ul SQLite: un simplu cp ar pierde datele rămase în -wal
    if [ -f data/jobs.db ]; then
      runuser -u jobdash -- "$APP/runtime/node" -e '
        const Database = require(process.argv[1] + "/node_modules/better-sqlite3");
        const d = new Database(process.argv[2]);
        d.backup(process.argv[3]).then(() => { const c = new Database(process.argv[3]); c.pragma("journal_mode = DELETE"); c.close(); d.close() });
      ' "$APP" data/jobs.db "backups/pre-restore-$ts.db"
    fi
    runuser -u jobdash -- cp -p "$f" data/jobs.db
    rm -f data/jobs.db-wal data/jobs.db-shm
    systemctl start job-dashboard
    echo "Restaurat din $f. Baza anterioară: backups/pre-restore-$ts.db"
    ;;
  *) echo "Folosire: sudo jobdash {seed|seed:clear|backup|restore FILE|status|logs|restart}"; exit 1 ;;
esac
