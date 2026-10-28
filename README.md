# Job Dashboard

Dashboard pentru agenții Hermes (Durian, Vadim, Tzanca). Un singur proces Node: API Express + SQLite + build React.

## Instalare pe un server nou
**Cerințe:** Linux cu systemd (testat pe Ubuntu), un utilizator cu `sudo`, Node 20+ (recomandat 22), `rsync` și `curl`, portul 3333 liber (sau altul, vezi pasul 3).

1. **Pregătește serverul**
   ```bash
   node -v                                  # trebuie să fie v20 sau mai nou
   sudo apt install -y rsync curl           # dacă lipsesc
   ```
   Dacă Node lipsește, instalează-l (de ex. NodeSource: https://github.com/nodesource/distributions, sau nvm). Dacă `npm install` se plânge de compilare (`better-sqlite3`): `sudo apt install -y build-essential python3`.
2. **Adu codul pe server.** Din serverul vechi (copiază și istoricul git, dar nu `node_modules`, `dist` sau secrete):
   ```bash
   rsync -a --exclude node_modules --exclude dist --exclude .env ~/job-dashboard/ user@server-nou:~/job-dashboard/
   ```
   (Dacă repo-ul ajunge pe un remote git: `git clone <url> ~/job-dashboard`.)
3. **Opțional, înainte de instalare:** `cd ~/job-dashboard && cp .env.example .env`, apoi editezi `PORT`, `APP_TZ` și, dacă vrei să păstrezi cheile din serverul vechi, `AGENT_KEY=...` și `ORCH_KEY=...`. Fără `.env`, se folosesc valorile implicite și se generează chei noi.
4. **Rulează instalarea**
   ```bash
   cd ~/job-dashboard && ./install.sh
   ```
   Face singur: `npm ci` + build, utilizatorul de sistem `jobdash` (fără shell), codul în `/opt/job-dashboard`, `.env`/baza/backup-urile cu permisiuni 600/700, serviciul systemd, timerul de backup și comanda `sudo jobdash`. La final te întreabă dacă vrei să setezi acum utilizatorul și parola dashboard-ului (recomandat; stocată ca hash bcrypt). `./install.sh --no-password` sare peste întrebare; `./install.sh --help` arată opțiunile.
5. **Verifică**
   ```bash
   systemctl status job-dashboard
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3333/      # 200 (sau 401 dacă ai pus parolă)
   ```
6. **Acces din laptop:** serverul ascultă doar pe 127.0.0.1; vezi „Acces de pe laptop” mai jos (tunel SSH).
7. **Datele din serverul vechi (CV, profil, joburi), opțional.** Pe serverul vechi: `sudo jobdash backup`, apoi copiază ultimul fișier din `/opt/job-dashboard/backups/` (`sudo cat /opt/job-dashboard/backups/jobs-....db > ~/jobs.db`, apoi `scp`). Pe cel nou:
   ```bash
   sudo install -m 600 -o jobdash -g jobdash ~/jobs.db /opt/job-dashboard/backups/imported.db
   sudo jobdash restore /opt/job-dashboard/backups/imported.db
   shred -u ~/jobs.db        # și pe serverul vechi: copia din home conține CV-ul
   ```
8. **Agenții Hermes:** instalarea generează două chei (`AGENT_KEY` și `ORCH_KEY`), dar agenții nu le au încă. Urmează pașii din secțiunea [Conectarea agenților Hermes](#conectarea-agenților-hermes).
9. **Actualizare ulterioară:** aduci codul nou (`git pull` sau `rsync`) și rulezi din nou `./install.sh`. Nu atinge `.env`, baza sau backup-urile.

Unde ajunge fiecare lucru:

| Ce | Unde | Proprietar / permisiuni |
|---|---|---|
| Cod, `node_modules`, `runtime/node` | `/opt/job-dashboard` | `root`, doar citire |
| `.env` (secrete) | `/opt/job-dashboard/.env` | `jobdash`, `600` |
| Baza SQLite | `/opt/job-dashboard/data/` | `jobdash`, `700` (fișierele `600`) |
| Backup-uri | `/opt/job-dashboard/backups/` | `jobdash`, `700` |

Directorul sursă (`~/job-dashboard`) rămâne locul în care lucrezi și nu conține secrete. Dacă existase un `.env` acolo, la prima instalare e mutat în `/opt` și copia din home e ștearsă. Pașii de mai sus pot fi făcuți și manual: `npm ci && npm run build`, apoi `sudo NODE_BIN="$(which node)" deploy/deploy.sh`.

**Variantă rapidă, fără sudo și fără izolare** (doar pentru încercări): `./install.sh --user` (serviciu systemd de utilizator, rulează ca tine, `.env` și baza rămân în `~/job-dashboard`). Nu o folosi pe aceeași mașină cu varianta de producție (ambele vor același port).

**Probleme frecvente:** `sudo jobdash logs` arată erorile serviciului; „portul e ocupat” înseamnă alt proces pe același `PORT` (schimbă-l în `.env`); `install.sh` refuză să ruleze ca root (rulează-l ca utilizator normal, cere sudo singur).

## Configurare (.env)
| Variabilă | Implicit | Rol |
|---|---|---|
| `PORT` | `3333` | port |
| `HOST` | `127.0.0.1` | interfața de ascultare (nu o schimba dacă nu ai nevoie) |
| `DASH_USER` / `DASH_PASS_HASH` | gol | Basic Auth pentru UI, activ doar dacă ambele sunt setate; se aplică și pe `/api`. Parola se stochează ca hash bcrypt (vezi mai jos). `DASH_PASS` în clar încă funcționează, dar e depășit și pornește cu avertisment |
| `ORCH_KEY` | gol | cheia orchestratorului (Milchick), doar citire: `GET /api/stats`, `GET /api/jobs/pending-evaluation`, `GET /api/jobs/:job_id`. Se generează automat la instalare/deploy dacă lipsește |
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
Din dashboard: tab-ul **CV** (încarcă PDF, DOCX, TXT sau MD, ori lipește textul). Se păstrează un singur CV, cel mai recent. Serverul extrage textul (`unpdf` pentru PDF, `mammoth` pentru DOCX), iar agenții îl citesc cu `GET /api/cv?format=text`. **PDF-uri fără text** (tipărite ca imagine, scanate, „Print → Save as PDF” din macOS): dacă PDF-ul nu are text selectabil, serverul face automat OCR (`tesseract.js` + `@napi-rs/canvas`, română + engleză, primele 10 pagini, ~3 s/pagină). Modelele de limbă sunt în `server/tessdata/` (fără internet, fără pachete de sistem). OCR-ul poate greși diacriticele sau unele cuvinte, deci verifică „Textul pe care îl citesc agenții”. Originalul și textul sunt în `data/jobs.db`, deci intră în backup. CV-ul e protejat de Basic Auth, dacă e activ.
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

## Conectarea agenților Hermes
Aplicația e făcută pentru trei agenți care scriu în ea (Durian caută joburi, Vadim le evaluează, Tzanca propune modificări de CV) și un orchestrator care doar citește (Milchick). Fiecare agent trebuie să primească **o cheie** și **instrucțiunile din `AGENTS-API.md`**. Fără cheie, toate apelurile primesc `401 invalid_agent_key`.

**Ce cheie primește fiecare**
| Cheie | Pentru cine | Ce poate face |
|---|---|---|
| `AGENT_KEY` | agenții care lucrează: Durian, Vadim, Tzanca | doar rutele lor (vezi „Acces pentru agenți”): citește CV-ul și profilul, trimite joburi, evaluări și sugestii |
| `ORCH_KEY` | orchestratorul (Milchick) | doar citire: `GET /api/stats`, `GET /api/jobs/pending-evaluation`, `GET /api/jobs/:job_id` |

Dă fiecărui agent doar cheia lui. Dacă nu folosești un orchestrator, ignori `ORCH_KEY`.

**1. Ia cheile din server** (se generează singure la instalare; `.env` e citibil doar de `jobdash`, de aceea cu `sudo`):
```bash
sudo grep -E '^(AGENT|ORCH)_KEY=' /opt/job-dashboard/.env
```
Dacă o cheie lipsește sau vrei alta: `openssl rand -hex 24`, o pui cu `sudoedit /opt/job-dashboard/.env`, apoi `sudo jobdash restart`. Nu pune cheile în repo și nu le trimite în chat sau e-mail.

**2. Pune cheia în mediul agentului.** În Hermes, fiecare agent e un profil în `~/.hermes/profiles/<nume>/`. Adaugi cheia în `.env`-ul profilului (fișier cu permisiuni `600`; `printf` cu `\n` în față ca să nu se lipească de ultima linie):
```bash
cd ~/.hermes/profiles
printf '\nAGENT_KEY=<valoarea>\n' >> durian/.env
printf '\nAGENT_KEY=<valoarea>\n' >> vadim/.env
printf '\nAGENT_KEY=<valoarea>\n' >> tzanca/.env
printf '\nORCH_KEY=<valoarea>\n'  >> milchick/.env
```

**3. Permite variabila în comenzile agentului.** Hermes scoate implicit din comenzile din terminal orice variabilă care arată a secret (nume cu `KEY`, `TOKEN`...), deci agentul ar vedea `$AGENT_KEY` gol. Adaugă numele variabilei în `config.yaml` al aceluiași profil:
```yaml
# ~/.hermes/profiles/vadim/config.yaml (la fel pentru durian și tzanca)
terminal:
  env_passthrough:
    - AGENT_KEY
```
```yaml
# ~/.hermes/profiles/milchick/config.yaml
terminal:
  env_passthrough:
    - ORCH_KEY
```
Dacă profilul are deja o secțiune `terminal:`, adaugi doar `env_passthrough` în ea (fără a o dubla).

**4. Dă-le instrucțiunile.** În `SOUL.md` (sau promptul) fiecărui agent pui că, înainte de fiecare rulare, citește `AGENTS-API.md` (secțiunea „Reguli comune” și secțiunea lui) și urmează exact pașii de acolo. Exemplu de paragraf:
```markdown
## Cum lucrezi
Înainte de fiecare rulare citești `~/job-dashboard/AGENTS-API.md`: secțiunea „Reguli comune” și secțiunea „Vadim Sudor”.
Urmezi exact pașii, endpoint-urile și câmpurile de acolo. Nu inventa endpoint-uri sau câmpuri.
```
Pentru orchestrator, secțiunea e „Orchestrator”. Dacă agenții rulează pe alt calculator decât codul, copiază `AGENTS-API.md` acolo (agenții îl citesc ca fișier local). Exemplele din el folosesc `http://127.0.0.1:3333`: schimbă adresa dacă agenții nu rulează pe același server (preferabil printr-un tunel SSH, nu prin deschiderea portului în rețea).

**5. Repornește și verifică.** Repornește gateway-ul Hermes (`systemctl --user restart hermes-gateway`, sau comanda cu care îl rulezi tu) ca profilurile să preia `.env` și `config.yaml`. Apoi testează din interiorul agentului, nu din terminalul tău, pentru că asta verifică și pasul 3:
```bash
hermes -p vadim -z 'Rulează în terminal: curl -s -o /dev/null -w "%{http_code}" -H "X-Agent-Key: $AGENT_KEY" http://127.0.0.1:3333/api/jobs/pending-evaluation?limit=1'
# => 200
```
Și testul de pe server, cu cheia în variabilă: `curl -s -H "X-Agent-Key: $AGENT_KEY" http://127.0.0.1:3333/api/cv?format=text`.

| Rezultat | Cauză |
|---|---|
| `200` | totul e în regulă |
| `401 invalid_agent_key` | cheia lipsește, e greșită, sau `$AGENT_KEY` e gol în agent (verifică pasul 3) |
| `403 agent_forbidden` | rută care nu e a acelui tip de cheie (de ex. `ORCH_KEY` pe `POST /api/jobs`) |
| `404`/`409` cu `cv_not_found` sau `profile_not_found` | cheia merge, dar nu ai încărcat CV-ul (tab-ul CV) sau nu ai completat profilul (tab-ul Profil) |

**Înainte să pornești agenții:** încarcă CV-ul din tab-ul **CV** și completează tab-ul **Profil**. Vadim și Tzanca se opresc fără ele, intenționat. Dacă CV-ul e un PDF fără text, aplicația face OCR, iar agenții pot descărca și originalul (`GET /api/cv/file`).

## Acces pentru agenți (AGENT_KEY)
Agenții trimit `-H "X-Agent-Key: $AGENT_KEY"` și pot apela DOAR: `GET /api/jobs/seen`, `POST /api/jobs`, `GET /api/jobs/pending-evaluation`, `GET /api/jobs/pending-cv`, `GET /api/profile`, `GET /api/cv`, `GET /api/cv/file`, `POST /api/evaluations`, `POST /api/cv-suggestions`. Cu `ORCH_KEY` (Milchick) sunt permise doar `GET /api/stats`, `GET /api/jobs/pending-evaluation` și `GET /api/jobs/:job_id`. Orice altceva primește `403 agent_forbidden` (inclusiv listarea joburilor, statistici, scrierea CV-ului/profilului, schimbarea statusului, reevaluarea și pagina UI). Cheie greșită sau lipsă pe server: `401 invalid_agent_key`.
Scrierile pentru CV, profil, status și reevaluare merg doar din UI (cereri fără `X-Agent-Key`, cu Basic Auth dacă e activ).

**Important:** restricția are efect real doar dacă Basic Auth e activ (`DASH_USER` și `DASH_PASS_HASH`). Fără el, un client care omite header-ul `X-Agent-Key` primește acces de UI, iar serverul avertizează la pornire. Agenții nu trebuie să primească niciodată parola de Basic Auth, doar `AGENT_KEY`. Cheia o citești cu `sudo grep -E '^(AGENT|ORCH)_KEY' /opt/job-dashboard/.env` și o pui în mediul agenților.

**Limita izolării:** `.env` și `jobs.db` sunt ilizibile pentru utilizatorul tău obișnuit, deci și pentru orice proces care rulează fără drepturi speciale (inclusiv Hermes). Dacă utilizatorul respectiv are `sudo` fără parolă sau face parte din grupul `docker`, acele protecții se pot ocoli: ambele dau acces de root. Izolarea e completă doar dacă Hermes rulează fără aceste drepturi.

## Acces de pe laptop
Serverul ascultă doar pe 127.0.0.1. Din laptop (după ce ai activat parola din secțiunea de mai sus):
```bash
ssh -N -L 3333:127.0.0.1:3333 utilizator@adresa-serverului
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
| Config | `dotenv` | `.env` → port, host, Basic Auth (hash bcrypt), chei agenți, fus orar, calea DB |
| Frontend | React 19 + TypeScript | `src/`; fără bibliotecă de componente |
| Stiluri | Tailwind 4 | prin pluginul `@tailwindcss/vite`; dark mode din `prefers-color-scheme` |
| Build | Vite 8 | `npm run build` → `dist/` |
| Proces | systemd (serviciu de sistem, utilizatorul `jobdash`) | repornire automată, pornire la boot, sandbox (`deploy/deploy.sh`) |

### Cum sunt legate
1. **Un singur proces, un singur port.** `server/index.ts` montează întâi verificarea `X-Agent-Key` (agenții), apoi Basic Auth (UI, dacă `DASH_USER` și `DASH_PASS_HASH` sunt setate), apoi routerul `/api`, apoi `express.static(dist)` cu fallback la `index.html`. De aceea frontend-ul face `fetch('/api/...')` pe același origin: nu există CORS, iar browserul reutilizează automat parola Basic Auth.
2. **Calea unei scrieri de la agenți.** `curl` → `X-Agent-Key` (doar rutele permise cheii) → `express.json()` → schema zod (normalizează `job_id`, acceptă `verdict` cu litere mici, transformă un string într-un array) → `better-sqlite3`. La `POST /api/jobs` dedup-ul se face verificând `job_id` (cheie UNIQUE) înainte de insert; evaluările și sugestiile CV sunt upsert (`ON CONFLICT(job_id) DO UPDATE`).
3. **Calea unei citiri din UI.** `GET /api/jobs` face un `LEFT JOIN` între `jobs`, `evaluations` și `cv_suggestions`, apoi parsează coloanele JSON în array-uri. Rezultatul e sortat după scor. `/api/stats` calculează cardurile din aceleași date.
4. **Data „azi”.** La inserare se salvează `found_date` în fusul `APP_TZ`; filtrele pe zi folosesc această coloană, nu ora UTC din `found_at`.
5. **Frontend.** `App.tsx` ține filtrele în state și reia cererile la fiecare schimbare și la 60 s. Butoanele de status actualizează UI-ul imediat și apoi trimit `PATCH`, iar la eroare reîncarcă lista. `JobCard.tsx` desenează cele 3 secțiuni, câte una pe agent.
6. **Dezvoltare.** `npm run dev:server` pornește API-ul și `npm run dev` pornește Vite. Vite trimite `/api` către `127.0.0.1:3333` (`vite.config.ts`).
7. **Acces.** Serverul ascultă doar pe `127.0.0.1`. Din laptop se ajunge la el printr-un tunel SSH, nu prin porturi deschise.

## Documentația pentru agenți
Vezi `AGENTS-API.md`.
