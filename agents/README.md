# Agenții Hermes

Câte un profil Hermes pentru fiecare agent: `SOUL.md` (personalitatea și regulile lui) și `config.example.yaml` (ce trebuie adăugat în `config.yaml`-ul profilului). Instrucțiunile tehnice despre API sunt în [`../AGENTS-API.md`](../AGENTS-API.md); `SOUL.md` îi trimite acolo.

| Agent | Rol | Cheie |
|---|---|---|
| [`durian`](durian/SOUL.md) | caută joburi și le trimite în dashboard | `AGENT_KEY` |
| [`vadim`](vadim/SOUL.md) | evaluează joburile (scor 0–100 și verdict) | `AGENT_KEY` |
| [`tzanca`](tzanca/SOUL.md) | propune modificări de CV, doar pentru joburile APPLY | `AGENT_KEY` |
| [`milchick`](milchick/SOUL.md) | orchestrator: delegă celorlalți și raportează | `ORCH_KEY` (doar citire) |

## Instalare
Profilurile trebuie să existe în Hermes (`hermes profile list`), fiecare cu modelul lui. Apoi, pentru fiecare agent:

```bash
cp agents/vadim/SOUL.md ~/.hermes/profiles/vadim/SOUL.md       # la fel pentru durian, tzanca, milchick
```
și adaugi în `~/.hermes/profiles/<agent>/config.yaml` conținutul din `config.example.yaml`-ul lui. Cheile se pun în `.env`-ul profilului, conform [README-ului](../README.md#conectarea-agenților-hermes).

`SOUL.md`-urile citesc `~/job-finder-hermes-framework/AGENTS-API.md`, adică repo-ul clonat cu `git clone` fără alt nume de director, în home-ul utilizatorului sub care rulează Hermes. Dacă l-ai clonat în altă parte, schimbi calea în `SOUL.md`-uri (sau faci un link: `ln -s <calea-ta> ~/job-finder-hermes-framework`).

## De personalizat
- **Personajele** sunt parodii românești; le poți rescrie liber. Păstrează secțiunile „Rol”, „Cum lucrezi” și „Corectitudinea datelor”, pentru că de ele depinde corectitudinea muncii.
- **Criteriile de căutare** nu sunt în `SOUL.md`: Durian și Vadim le iau din tab-ul **Profil** al dashboard-ului.
- **Milchick** pornește agenții în ordinea din `SOUL.md` („Workflow zilnic”); ordinea nu e impusă de cod.
