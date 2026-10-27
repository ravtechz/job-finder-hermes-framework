# Job Dashboard

Dashboard pentru agenții Hermes (Durian, Vadim, Tzanca). Un singur proces Node: API Express + SQLite + build React.

## Instalare (producție: utilizator dedicat `jobdash`)
Aplicația rulează ca utilizatorul de sistem `jobdash` (fără shell de login, parola blocată), nu ca utilizatorul tău:

| Ce | Unde | Proprietar / permisiuni |
|---|---|---|
| Cod, `node_modules`, `runtime/node` | `/opt/job-dashboard` | `root`, doar citire |
| `.env` (secrete) | `/opt/job-dashboard/.env` | `jobdash`, `600` |
| Baza SQLite | `/opt/job-dashboard/data/` | `jobdash`, `700` (fișierele `600`) |
| Backup-uri | `/opt/job-dashboard/backups/` | `jobdash`, `700` |

Directorul sursă (`~/job-dashboard`) rămâne locul în care lucrezi; nu conține secrete și nu rulează.
```bash
cd ~/job-dashboard
npm install && npm run build
sudo NODE_BIN="$(which node)" deploy/deploy.sh   # prima instalare SAU orice actualizare de cod
```
`deploy.sh` e idempotent: creează userul, sincronizează codul în `/opt`, copiază runtime-ul Node (`jobdash` nu poate citi home-ul altui utilizator), pune permisiunile, instalează serviciile systemd și le repornește. La prima rulare migrează `.env` și baza din directorul sursă (apoi ștergi tu copiile vechi). Dacă `AGENT_KEY` lipsește, o generează.

Pe un server nou funcționează la fel. `install.sh` (serviciu systemd de utilizator, fără izolare) rămâne pentru încercări rapide; nu-l rula pe aceeași mașină cu varianta de producție (ambele vor portul 3333).

## Configurare (.env)
| Variabilă | Implicit | Rol |
|---|---|---|
| `PORT` | `3333` | port |
| `HOST` | `127.0.0.1` | interfața de ascultare (nu o schimba dacă nu ai nevoie) |
| `DASH_USER` / `DASH_PASS_HASH` | gol | Basic Auth pentru UI, activ doar dacă ambele sunt setate; se aplică și pe `/api`. Parola se stochează ca hash bcrypt (vezi mai jos). `DASH_PASS` în clar încă funcționează, dar e depășit și pornește cu avertisment |
| `AGENT_KEY` | gol | cheia agenților Hermes, trimisă ca header `X-Agent-Key` (vezi „Acces pentru agenți”). Generează una: `openssl rand -hex 24` |
| `APP_TZ` | `Europe/Bucharest` | fusul orar pentru „azi” |
| `DB_PATH` | `./data/jobs.db` | fișierul SQLite |
| `BACKUP_DIR` / `BACKUP_KEEP` | `./backups` / `14` | unde se scriu backup-urile și câte se păstrează |

## Parola dashboard-ului (Basic Auth)
Parola nu se stochează în clar. Generezi un hash bcrypt (parola se tastează ascuns, minim 10 caractere):
```bash
cd ~/job-dashboard && npm run hash-password
# => DASH_PASS_HASH='$2b$10$....'
sudoedit /opt/job-dashboard/.env      # adaugi DASH_USER=... și linia DASH_PASS_HASH='...' (ghilimele simple obligatorii)
sudo jobdash restart
```
Hash-ul invalid (de ex. mutilat de un shell) oprește pornirea serverului, ca să nu rămâi fără parolă fără să știi. Agenții NU primesc această parolă, doar `AGENT_KEY`.

## Administrare (serviciu systemd de sistem)
```bash
sudo jobdash status | logs | restart   # logs acceptă opțiuni journalctl, ex: sudo jobdash logs -f
systemctl status job-dashboard         # starea o poți vedea și fără sudo
sudo jobdash seed | seed:clear         # date de test (comenzile npm nu mai merg pe baza din /opt)
sudo jobdash backup | restore FILE
sudoedit /opt/job-dashboard/.env       # după orice schimbare: sudo jobdash restart
```
Dezvoltare (în `~/job-dashboard`, pe altă bază, nu pe cea de producție): `PORT=3400 DB_PATH=/tmp/dev.db npm run dev:server` + `npm run dev` (Vite pe 5173, proxy către API; ajustează portul în `vite.config.ts` dacă nu e 3333).

## CV
Din dashboard: tab-ul **CV** (încarcă PDF cu text selectabil, DOCX, TXT sau MD, ori lipește textul). Se păstrează un singur CV, cel mai recent. Serverul extrage textul (`unpdf` pentru PDF, `mammoth` pentru DOCX), iar agenții îl citesc cu `GET /api/cv?format=text`. Originalul și textul sunt în `data/jobs.db`, deci intră în backup. CV-ul e protejat de Basic Auth, dacă e activ.
Din linia de comandă:
```bash
curl -X POST --data-binary @cv.pdf -H 'Content-Type: application/pdf' "http://127.0.0.1:3333/api/cv?filename=cv.pdf"
```

## Profil, evaluări și reevaluare
- **Profil** (tab-ul Profil): stack, experiență, senioritate țintă, salariu minim, locații, mod de lucru, limbi, condiții de excludere, preferințe. Un singur profil, salvat în SQLite. Agenții îl citesc cu `GET /api/profile?format=text` (JSON fără `format`); 404 `profile_not_found` dacă nu există.
- **Evaluările** (Vadim) vin cu `score_breakdown` (5 componente + knockout), validat de server. Detaliile sunt în `AGENTS-API.md`. UI-ul le arată ca bare mici și, la knockout, un badge roșu cu motivul.
- **Versiuni.** La fiecare evaluare sau sugestie CV, serverul reține singur data CV-ului și a profilului folosite. Dacă între timp le schimbi, jobul primește badge-ul „evaluat pe CV/profil vechi”. Salvarea profilului fără nicio modificare nu schimbă data.
- **Reevaluare.** Butonul „Reevaluează” de pe un job șterge evaluarea și sugestiile CV ale acelui job. Butonul din tab-ul CV face același lucru pentru joburile active (status Nou sau Văzut; Aplicat și Ignorat rămân neatinse). Joburile reapar în `GET /api/jobs/pending-evaluation`.
- **Descrierea anunțului** (`description`, max 10000 caractere) se trimite la `POST /api/jobs` și apare doar în detaliul jobului și în endpoint-urile `pending-*`, nu în lista `GET /api/jobs`.

## Verificare vizuală
```bash
npx playwright install chromium            # o singură dată
sudo jobdash seed && npm run screenshots   # capturi din instanța pornită (desktop + mobil, light + dark)
sudo jobdash seed:clear
```
Scriptul de capturi nu trimite parolă: rulează-l cât Basic Auth e oprit sau pe o instanță de dezvoltare.

## Date de test
```bash
sudo jobdash seed          # 8 joburi (source = "seed")
sudo jobdash seed:clear    # șterge doar joburile cu source="seed" (cu evaluările și sugestiile lor); CV-ul și profilul rămân neatinse
```

## Backup SQLite
Baza conține CV-ul și profilul tău, deci backup-urile sunt tot ale lui `jobdash` (`600`, în `backups/` cu `700`).
- **Automat:** timerul `job-dashboard-backup.timer` rulează zilnic la 03:15 (±10 min, recuperează dacă serverul era oprit) și păstrează ultimele 14 copii (`BACKUP_KEEP`). Verifică: `systemctl list-timers job-dashboard-backup.timer`.
- **Manual:** `sudo jobdash backup`. Folosește API-ul de backup SQLite (consistent și cât scriu agenții), trece copia pe un singur fișier și îi rulează `integrity_check`; o copie invalidă se șterge.
- **Restaurare:** `sudo jobdash restore /opt/job-dashboard/backups/jobs-AAAALLZZTHHMMSSZ.db`. Verifică backup-ul înainte să atingă baza, oprește serviciul, salvează baza curentă ca `backups/pre-restore-*.db`, o înlocuiește și repornește. Un backup corupt sau din afara `backups/` e refuzat.
- **O copie în afara serverului** (recomandat, același disc nu e protecție împotriva defectării lui): `sudo cat /opt/job-dashboard/backups/jobs-....db > /locul/tău/sigur.db`, sau `sudo rsync -a /opt/job-dashboard/backups/ user@alt-server:backups/`.

## Acces pentru agenți (AGENT_KEY)
Agenții trimit `-H "X-Agent-Key: $AGENT_KEY"` și pot apela DOAR: `GET /api/jobs/seen`, `POST /api/jobs`, `GET /api/jobs/pending-evaluation`, `GET /api/jobs/pending-cv`, `GET /api/profile`, `GET /api/cv`, `POST /api/evaluations`, `POST /api/cv-suggestions`. Orice altceva primește `403 agent_forbidden` (inclusiv listarea joburilor, statistici, scrierea CV-ului/profilului, schimbarea statusului, reevaluarea și pagina UI). Cheie greșită sau lipsă pe server: `401 invalid_agent_key`.
Scrierile pentru CV, profil, status și reevaluare merg doar din UI (cereri fără `X-Agent-Key`, cu Basic Auth dacă e activ).

**Important:** restricția are efect real doar dacă Basic Auth e activ (`DASH_USER` și `DASH_PASS`). Fără el, un client care omite header-ul `X-Agent-Key` primește acces de UI, iar serverul avertizează la pornire. Agenții nu trebuie să primească niciodată parola de Basic Auth, doar `AGENT_KEY`. Cheia o citești cu `sudo grep AGENT_KEY /opt/job-dashboard/.env` și o pui în mediul agenților.

**Limita izolării:** `.env` și `jobs.db` sunt ilizibile pentru utilizatorul tău obișnuit, deci și pentru orice proces care rulează fără drepturi speciale (inclusiv Hermes). Dacă utilizatorul respectiv are `sudo` fără parolă sau face parte din grupul `docker`, acele protecții se pot ocoli: ambele dau acces de root. Izolarea e completă doar dacă Hermes rulează fără aceste drepturi.

## Acces de pe laptop
Serverul ascultă doar pe 127.0.0.1. Din laptop (după ce ai activat parola din secțiunea de mai sus):
```bash
ssh -N -L 3333:127.0.0.1:3333 ravtech@192.168.68.116
```
apoi deschide http://localhost:3333.

## Arhitectură și tehnologii

Diagrama: [`docs/architecture.excalidraw`](docs/architecture.excalidraw). Deschide-o la https://excalidraw.com (meniul ☰ → Open) sau cu extensia Excalidraw din VS Code.

```
Agenți Hermes ──curl──►┐
                       ├─► Express (un singur proces) ──► better-sqlite3 ──► data/jobs.db
Browser (React) ──────►┘        └─► servește și dist/ (build-ul React)
```

| Strat | Tehnologie | Rol |
|---|---|---|
| Runtime | Node 22 + `tsx` | rulează direct TypeScript-ul din `server/`, fără pas de compilare |
| Server | Express 5 | API `/api/*` și fișierele statice din `dist/`, în același proces și același port |
| Validare | zod 4 | schemele din `server/schemas.ts`; erorile ies ca JSON `{field, message}` în română, ca LLM-urile să se poată corecta |
| Bază de date | SQLite prin `better-sqlite3` | apeluri sincrone, WAL; schema se creează singură la pornire (`server/db.ts`) |
| Config | `dotenv` | `.env` → port, host, Basic Auth, fus orar, calea DB |
| Frontend | React 19 + TypeScript | `src/`; fără bibliotecă de componente |
| Stiluri | Tailwind 4 | prin pluginul `@tailwindcss/vite`; dark mode din `prefers-color-scheme` |
| Build | Vite 8 | `npm run build` → `dist/` |
| Proces | systemd (user) | repornire automată, pornire la boot (`install.sh`) |

### Cum sunt legate
1. **Un singur proces, un singur port.** `server/index.ts` montează întâi Basic Auth (dacă `DASH_USER` și `DASH_PASS` sunt setate), apoi routerul `/api`, apoi `express.static(dist)` cu fallback la `index.html`. De aceea frontend-ul face `fetch('/api/...')` pe același origin: nu există CORS, iar browserul reutilizează automat parola Basic Auth.
2. **Calea unei scrieri de la agenți.** `curl` → Basic Auth → `express.json()` → schema zod (normalizează `job_id`, acceptă `verdict` cu litere mici, transformă un string într-un array) → `better-sqlite3`. La `POST /api/jobs` dedup-ul se face verificând `job_id` (cheie UNIQUE) înainte de insert; evaluările și sugestiile CV sunt upsert (`ON CONFLICT(job_id) DO UPDATE`).
3. **Calea unei citiri din UI.** `GET /api/jobs` face un `LEFT JOIN` între `jobs`, `evaluations` și `cv_suggestions`, apoi parsează coloanele JSON în array-uri. Rezultatul e sortat după scor. `/api/stats` calculează cardurile din aceleași date.
4. **Data „azi”.** La inserare se salvează `found_date` în fusul `APP_TZ`; filtrele pe zi folosesc această coloană, nu ora UTC din `found_at`.
5. **Frontend.** `App.tsx` ține filtrele în state și reia cererile la fiecare schimbare și la 60 s. Butoanele de status actualizează UI-ul imediat și apoi trimit `PATCH`, iar la eroare reîncarcă lista. `JobCard.tsx` desenează cele 3 secțiuni, câte una pe agent.
6. **Dezvoltare.** `npm run dev:server` pornește API-ul și `npm run dev` pornește Vite. Vite trimite `/api` către `127.0.0.1:3333` (`vite.config.ts`).
7. **Acces.** Serverul ascultă doar pe `127.0.0.1`. Din laptop se ajunge la el printr-un tunel SSH, nu prin porturi deschise.

## Documentația pentru agenți
Vezi `AGENTS-API.md`.
