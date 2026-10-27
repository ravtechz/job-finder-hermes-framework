# Dashboard joburi – API pentru agenți

Bază: `http://127.0.0.1:3333`. Toate exemplele de mai jos pot fi copiate direct în instrucțiunile agentului.

## Reguli comune (toți agenții)

- **Autentificare.** Toate comenzile trimit header-ul `X-Agent-Key: $AGENT_KEY` (variabila `AGENT_KEY` trebuie să existe în mediul agentului). Cu această cheie ai acces DOAR la endpoint-urile din acest document; orice altceva primește `403 agent_forbidden`: nu încerca alte rute. `401 invalid_agent_key` înseamnă cheie lipsă sau greșită: oprește-te și raportează. Nu folosi Basic Auth și nu cere parola dashboard-ului.
- **Body JSON** se trimite cu `-H 'Content-Type: application/json'`.
- **Erori de validare (400)** vin ca `{"error":"validation_error","details":[{"field":"...","message":"..."}]}`. Citește `details`, corectează exact câmpurile indicate și retrimite o singură dată. Dacă tot dă eroare, raportează-o; nu insista.
- **Comentariile amuzante** merg DOAR în câmpurile `*_comment`. Restul câmpurilor rămân factuale și curate.
- **Nu ghici date.** Dacă o informație lipsește (dată, salariu, CV, profil), pune `null` sau oprește-te conform regulilor de mai jos; nu inventa.
- **Agenții doar citesc CV-ul și profilul.** Serverul blochează scrierea lor (403); se modifică numai de către utilizator, din dashboard.

### Citirea CV-ului și a profilului
```bash
curl -s -H "X-Agent-Key: $AGENT_KEY" "http://127.0.0.1:3333/api/cv?format=text"        # textul CV-ului
curl -s -H "X-Agent-Key: $AGENT_KEY" "http://127.0.0.1:3333/api/profile?format=text"   # profilul (text compact)
```
Variantele JSON (fără `?format=text`) întorc aceleași date structurate. Răspunsuri speciale:
- `404` cu `"code":"cv_not_found"` sau `"code":"profile_not_found"` (și `409` cu aceleași coduri la `POST /api/evaluations`): **oprește-te imediat**. Nu continua rularea, nu evalua și nu trimite nimic. Raportează: „Lipsește CV-ul/profilul în dashboard; utilizatorul trebuie să îl completeze”. Nu ghici conținutul.
- Citește CV-ul și profilul **o singură dată, la începutul rulării**, nu pentru fiecare job.

---
## Durian Popa – găsește joburi

**Ordinea pașilor la o rulare:**
1. Caută joburi noi și colectează pentru fiecare ID-ul (ID LinkedIn, sau URL-ul anunțului dacă nu există ID).
2. Verifică ce există deja (un singur apel pentru toate ID-urile).
3. Pentru fiecare ID din `new`, deschide anunțul, citește descrierea completă și trimite jobul.
4. Dacă răspunsul e `{"duplicate":true}`, treci la următorul (jobul exista deja și nu a fost modificat).

**Pas 2: verificare duplicate**
```bash
curl -s -H "X-Agent-Key: $AGENT_KEY" "http://127.0.0.1:3333/api/jobs/seen?ids=4012345678,4012345999"
# => {"seen":["4012345678"],"new":["4012345999"]}
```
Trimite doar joburile din `new`.

**Pas 3: trimite jobul**
```bash
curl -s -H "X-Agent-Key: $AGENT_KEY" -X POST http://127.0.0.1:3333/api/jobs -H 'Content-Type: application/json' -d '{
  "job_id": "4012345999",
  "title": "Senior Frontend Engineer",
  "company": "Acme",
  "url": "https://www.linkedin.com/jobs/view/4012345999",
  "location": "București",
  "remote": "remote",
  "posted_date": "2026-10-25",
  "salary": "4000-5000 EUR/lună",
  "source": "linkedin",
  "verified_link": true,
  "verified_date": true,
  "description": "Textul complet al anunțului: responsabilități, cerințe, beneficii...",
  "durian_comment": "Replica ta energică și amuzantă aici!"
}'
# => 201 {"duplicate":false,"job_id":"4012345999"}
# => 200 {"duplicate":true,"job_id":"..."}
```
| Câmp | Regulă |
|---|---|
| `title`, `company`, `url` | obligatorii; `url` e URL complet |
| `job_id` | opțional (implicit derivat din `url`, fără query params) |
| `remote` | `remote`, `hybrid`, `onsite` sau `unknown` (implicit) |
| `posted_date` | `YYYY-MM-DD` sau `null` dacă nu o știi |
| `salary` | text liber sau `null` |
| `verified_link`, `verified_date` | `true` doar dacă ai verificat efectiv; implicit `false` |
| `description` | **textul complet al anunțului**, folosit de Vadim și Tzanca. Max 10000 caractere (restul se taie). Trimite-l mereu; fără el ceilalți agenți lucrează orbește |
| `durian_comment` | replica ta |

---
## Vadim Sudor – scor și verdict

**Ordinea pașilor la o rulare:**
1. Citește **o singură dată** profilul (`/api/profile?format=text`) și CV-ul (`/api/cv?format=text`). La 404 `profile_not_found` sau `cv_not_found`, oprește-te și raportează (vezi regulile comune).
2. Ia joburile de evaluat:
   ```bash
   curl -s -H "X-Agent-Key: $AGENT_KEY" "http://127.0.0.1:3333/api/jobs/pending-evaluation?limit=20"
   # => {"count":20,"total_pending":57,"jobs":[{"job_id":"...","title":"...","description":"...", ...}]}
   ```
   Cele mai vechi vin primele; `description` e inclus. Joburile marcate de utilizator Aplicat sau Ignorat nu apar. Dacă `count` e 0, ai terminat. Dacă `total_pending` > `count`, restul rămân pentru rularea următoare.
3. Pentru fiecare job, evaluează-l pe baza descrierii, a CV-ului și a profilului, apoi trimite evaluarea (pasul de mai jos).
4. Dacă un POST dă 409 `cv_not_found` sau 409 `profile_not_found`, oprește tot și raportează. Dacă dă 400, corectează conform `details` și retrimite o dată.

**Trimite evaluarea**
```bash
curl -s -H "X-Agent-Key: $AGENT_KEY" -X POST http://127.0.0.1:3333/api/evaluations -H 'Content-Type: application/json' -d '{
  "job_id": "4012345999",
  "score": 82,
  "verdict": "APPLY",
  "score_breakdown": {
    "must_haves": 34,
    "stack": 21,
    "seniority": 12,
    "location": 8,
    "salary": 7,
    "knockout": false,
    "knockout_reason": null
  },
  "match": ["React 5+ ani", "TypeScript"],
  "missing": ["GraphQL"],
  "red_flags": ["Program în fus orar US"],
  "vadim_comment": "Replica ta dramatică aici!"
}'
# => 201 {"ok":true,"updated":false,"job_id":"4012345999"}
```
Serverul completează singur versiunea de CV și de profil folosite; nu le trimite tu.

**`score_breakdown` (toate cheile sunt obligatorii, valori întregi):**
| Cheie | Interval | Ce măsoară |
|---|---|---|
| `must_haves` | 0–40 | cerințele obligatorii din anunț acoperite de CV |
| `stack` | 0–25 | potrivirea tehnologiilor cu stack-ul principal/secundar din profil |
| `seniority` | 0–15 | nivelul rolului față de senioritatea țintă și experiența din profil |
| `location` | 0–10 | locația și modul de lucru față de profil |
| `salary` | 0–10 | salariul față de minimul din profil (vezi regulile de mai jos) |
| `knockout` | true/false | job eliminatoriu |
| `knockout_reason` | text sau `null` | obligatoriu dacă `knockout` e `true`, altfel `null` |

**Salariul (`salary`):**
- **Anunț fără salariu: 5 puncte, fără red flag.** Lipsa salariului nu se penalizează și nu se trece în `red_flags`.
- **Convertește înainte să compari.** Aduce salariul din anunț la moneda, tipul (net/brut) și perioada (lunar) din profil, abia apoi îl compari cu minimul din profil. Exemplu: „80-110k USD/an” devine suma lunară în moneda din profil.
- **Net sau brut neclar:** presupune **brut** (și apoi convertește la tipul din profil) și notează asta în `match` sau `missing`, de exemplu „Salariu: net/brut nespecificat, presupus brut”.
- Pentru orice conversie estimată (curs valutar, net↔brut) notează estimarea folosită în `match` sau `missing`, ca utilizatorul să o poată verifica.

**Reguli de consistență (altfel primești 400):**
- `knockout=false`: `score` = suma celor 5 componente (±1).
- `knockout=true`: `score` = min(suma, 30) (±1), `verdict` = `SKIP` și `knockout_reason` completat. Folosește knockout când jobul încalcă o condiție de excludere din profil sau e o nepotrivire fundamentală (ex. senioritate sau stack complet diferite).
- `verdict`: `APPLY`, `MAYBE` sau `SKIP`. `match`, `missing`, `red_flags` sunt array-uri de stringuri (pot fi `[]`).
- Retrimiterea pentru același `job_id` înlocuiește evaluarea (upsert).

---
## Tzanca Ciocanu – modificări CV (doar joburi APPLY)

**Ordinea pașilor la o rulare:**
1. Citește **o singură dată** CV-ul (`/api/cv?format=text`) și profilul (`/api/profile?format=text`). La 404 `cv_not_found` sau `profile_not_found`, oprește-te și raportează.
2. Ia joburile pentru care trebuie sugestii (doar APPLY, fără sugestii încă):
   ```bash
   curl -s -H "X-Agent-Key: $AGENT_KEY" "http://127.0.0.1:3333/api/jobs/pending-cv?limit=10"
   # => {"count":3,"total_pending":3,"jobs":[{"job_id":"...","description":"...","evaluation":{...}, ...}]}
   ```
   Joburile marcate Aplicat sau Ignorat nu apar. Fiecare job vine cu `description` și cu evaluarea lui Vadim (`match`, `missing`, `red_flags`). Dacă `count` e 0, ai terminat.
3. Pentru fiecare job, propune modificări concrete pe textul CV-ului, în funcție de descriere și de evaluare, apoi trimite sugestiile.
4. Dacă un POST dă 409 `not_apply`, jobul nu (mai) e APPLY: treci peste el, nu insista. La 409 `cv_not_found` oprește tot și raportează.

**Trimite sugestiile**
```bash
curl -s -H "X-Agent-Key: $AGENT_KEY" -X POST http://127.0.0.1:3333/api/cv-suggestions -H 'Content-Type: application/json' -d '{
  "job_id": "4012345999",
  "cv_changes": ["Mută proiectul X în primele bullet-uri", "Adaugă metrici de performanță"],
  "keywords_added": ["design system", "Core Web Vitals"],
  "questions_for_user": ["Ai folosit GraphQL în producție?"],
  "tzanca_comment": "Replica ta de superstar aici!"
}'
# => 201 {"ok":true,"updated":false,"job_id":"4012345999"}
```
Câmpuri: `cv_changes`, `keywords_added`, `questions_for_user` sunt array-uri de stringuri (pot fi `[]`); `tzanca_comment` e replica ta. Retrimiterea pentru același `job_id` înlocuiește sugestiile.

---
## Referință: coduri de răspuns la erori
| Cod | `code` | Înseamnă | Ce faci |
|---|---|---|---|
| 400 | `validation_error` | câmpuri invalide (vezi `details`) | corectezi și retrimiți o dată |
| 401 | `invalid_agent_key` | `X-Agent-Key` lipsă, greșită sau neconfigurată pe server | **te oprești** și raportezi |
| 403 | `agent_forbidden` | ai apelat o rută care nu e a agenților | nu insista; folosește doar endpoint-urile din document |
| 404 | `job_not_found` | `job_id` necunoscut | verifici ID-ul; Durian trebuie să fi creat jobul întâi |
| 404 | `cv_not_found` / `profile_not_found` | lipsește CV-ul/profilul (la `GET`) | **te oprești** și raportezi |
| 409 | `cv_not_found` | nu poți trimite evaluări/sugestii fără CV | **te oprești** și raportezi |
| 409 | `profile_not_found` | nu poți trimite evaluări fără profil | **te oprești** și raportezi |
| 409 | `not_apply` | sugestii CV pentru un job care nu e APPLY | treci peste job |
