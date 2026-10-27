import 'dotenv/config'
import { openDb } from '../server/db.js'
import { localDate } from '../server/util.js'

const db = openDb()

if (process.argv.includes('--clear')) {
  // Doar joburile de test; evaluările și sugestiile lor se șterg în cascadă. CV-ul și profilul nu se ating.
  const r = db.prepare("DELETE FROM jobs WHERE source = 'seed'").run()
  console.log(`Șterse ${r.changes} joburi de test (source = 'seed').`)
  process.exit(0)
}

type Seed = {
  id: string; title: string; company: string; location: string; remote: string; salary: string | null
  posted: string | null; vl: number; vd: number; durian: string; description: string
  ev?: {
    verdict: string; bd: [number, number, number, number, number]; knockout?: string
    match: string[]; missing: string[]; red: string[]; vadim: string
  }
  cv?: { changes: string[]; kw: string[]; q: string[]; tzanca: string }
}

const seeds: Seed[] = [
  {
    id: 'seed-1001', title: 'Senior Frontend Engineer (React)', company: 'Acme Cloud', location: 'București', remote: 'remote',
    salary: '4500-6000 EUR/lună', posted: localDate(), vl: 1, vd: 1,
    description: 'Căutăm un Senior Frontend Engineer pentru produsul nostru cloud. Lucrezi cu React, TypeScript și un design system propriu, 100% remote în România. Cerințe: 5+ ani experiență React, TypeScript solid, interes pentru performanță web. Salariu 4500-6000 EUR/lună.',
    durian: 'OMG băieți, ăsta e JACKPOT! Remote, React, bani buni! Dați like și abonați-vă la un job mișto! 🔥🔥',
    ev: { verdict: 'APPLY', bd: [38, 24, 14, 8, 8], match: ['React 5+ ani', 'TypeScript', 'Experiență cu design systems'], missing: ['GraphQL (nice to have)'], red: [],
      vadim: 'Rar, extrem de rar, vezi o potrivire atât de limpede. Este aproape... suspect de bună. Aplică, înainte să se răzgândească universul.' },
    cv: { changes: ['Mută secțiunea de design systems în primele 3 bullet-uri', 'Adaugă metrici de performanță (LCP -35%)'], kw: ['design system', 'Core Web Vitals', 'micro-frontends'],
      q: ['Ai experiență reală cu GraphQL sau doar cu REST?'], tzanca: 'Frate, CV-ul tău trebuie să sclipească ca un lanț de aur! Hai că tu ești vedeta, doar îl aranjăm! 💎🎤' },
  },
  {
    id: 'seed-1002', title: 'Full Stack Developer (Node/React)', company: 'Nordic Pay', location: 'Cluj-Napoca', remote: 'hybrid', salary: '3500-4500 EUR/lună',
    posted: localDate(), vl: 1, vd: 1,
    description: 'Nordic Pay construiește infrastructura de plăți pentru IMM-uri. Cauți un rol full stack (Node.js, React, PostgreSQL) într-o echipă mică. Program hibrid, 2 zile pe săptămână la birou în Cluj-Napoca. Experiența cu plăți e un plus.',
    durian: 'Fintech, hibrid, echipă tânără! Eu zic că arată super, dar voi decideți, eu doar vă aduc vestea! ✨',
    ev: { verdict: 'APPLY', bd: [33, 21, 12, 8, 7], match: ['Node.js', 'React', 'PostgreSQL'], missing: ['Experiență în plăți (PSD2)'], red: ['2 zile/săptămână la birou în Cluj'],
      vadim: 'Un rol solid, cu o singură cicatrice: naveta. Dar tragedia aceasta se poate suporta.' },
    cv: { changes: ['Evidențiază proiectele cu API-uri sensibile/securitate'], kw: ['REST', 'PostgreSQL', 'CI/CD'], q: ['Accepți deplasarea la Cluj 2 zile/săptămână?'],
      tzanca: 'Hibrid, hibrid, dar banii sunt reali! Fă CV-ul să sune a bani, nu a stat la coadă! 💸' },
  },
  {
    id: 'seed-1003', title: 'Frontend Developer', company: 'Pixel Studio', location: 'Timișoara', remote: 'onsite', salary: null,
    posted: null, vl: 1, vd: 0,
    description: 'Pixel Studio caută un Frontend Developer pentru proiecte de clienți, cu React și multe animații CSS. Birou în Timișoara. Salariul se discută la interviu.',
    durian: 'Nu e remote, dar pare chill! Salariul nu l-am găsit, mistere, mistere! 🤷',
    ev: { verdict: 'MAYBE', bd: [24, 16, 8, 6, 4], match: ['React', 'CSS avansat'], missing: ['Experiență cu animații/WebGL'], red: ['Fără salariu', 'Data postării neverificată'],
      vadim: 'Nici cald, nici rece. Un job ca o duminică ploioasă: poate merge, poate nu. Decide tu, eu mă retrag în tăcere.' },
  },
  {
    id: 'seed-1004', title: 'Tech Lead React Native', company: 'AppForge', location: 'Remote (UE)', remote: 'remote', salary: '5000-7000 EUR/lună',
    posted: localDate(), vl: 1, vd: 1,
    description: 'AppForge: Tech Lead pentru aplicațiile mobile (React Native). Conduci o echipă de 5 persoane, ai ownership pe arhitectură și releases în App Store/Play Store. Remote în UE, 5000-7000 EUR/lună.',
    durian: 'Tech Lead!!! Remote!!! Salariu de vis!!! Ok, e React Native, dar sunt aproape același lucru, nu? 😅',
    ev: { verdict: 'MAYBE', bd: [26, 15, 11, 6, 6], match: ['React', 'Leadership de echipă'], missing: ['React Native în producție', 'Publicare în App Store'], red: [],
      vadim: 'Ambiție mare, experiență mobilă mică. Ca un tenor care n-a cântat niciodată într-o sală. Se poate, dar vei suda.' },
  },
  {
    id: 'seed-1005', title: 'Junior Web Developer', company: 'StartMe', location: 'Iași', remote: 'onsite', salary: '1200 EUR/lună',
    posted: localDate(), vl: 1, vd: 1,
    description: 'StartMe angajează un Junior Web Developer. Lucrezi cu HTML, CSS, JavaScript și mentorat din partea echipei. Birou în Iași, pizza vinerea.',
    durian: 'Junior, dar cu pizza gratis în fiecare vineri! Nu pot să fiu obiectiv! 🍕',
    // suma = 35, dar cu knockout scorul se plafonează la 30
    ev: { verdict: 'SKIP', bd: [15, 10, 2, 6, 2], knockout: 'Rol junior, sub senioritatea țintă', match: ['HTML/CSS'], missing: ['Nivelul de senioritate nu se potrivește'], red: ['Rol junior', 'Salariu sub așteptări'],
      vadim: 'Un pas înapoi în carieră, travestit în oportunitate. Respingere. Cu demnitate, dar respingere.' },
  },
  {
    id: 'seed-1006', title: 'PHP Developer (Laravel)', company: 'LegacyWorks', location: 'Brașov', remote: 'hybrid', salary: '2500 EUR/lună',
    posted: localDate(), vl: 0, vd: 0,
    description: 'LegacyWorks caută un PHP Developer (Laravel 8) pentru mentenanța unei platforme de comerț electronic. Hibrid în Brașov.',
    durian: 'Laravel! Nu e stack-ul tău, dar hei, diversitate! Linkul nu am putut să-l verific, e dubios! 🙈',
    ev: { verdict: 'SKIP', bd: [3, 1, 6, 3, 2], knockout: 'Stack PHP/Laravel, în afara profilului', match: [], missing: ['PHP', 'Laravel'], red: ['Link neverificat', 'Stack complet diferit'],
      vadim: 'PHP. Laravel. Un tablou de Dali, dar pentru un profil de React. Nu.' },
  },
  {
    id: 'seed-1007', title: 'Software Engineer – Developer Tools', company: 'Forge Labs', location: 'Remote (global)', remote: 'remote', salary: '$80k-110k/an',
    posted: localDate(), vl: 1, vd: 1,
    description: 'Forge Labs construiește unelte pentru dezvoltatori: CLI-uri, extensii de editor, SDK-uri în TypeScript. Remote global, overlap cu fusul US Pacific necesar 3-4 ore pe zi. 80-110k USD/an.',
    durian: 'Developer tools! Remote global! Zici că e făcut pentru tine, omule! 🚀',
    ev: { verdict: 'APPLY', bd: [31, 20, 12, 7, 6], match: ['TypeScript', 'Node.js', 'CLI/tooling'], missing: ['Rust (preferat)'], red: ['Fus orar US Pacific'],
      vadim: 'Aproape perfect, dar programul în fusul californian ți-ar fura somnul. Totuși, merită îndrăzneala.' },
    cv: { changes: ['Adaugă proiectele open-source / tooling propriu'], kw: ['developer experience', 'CLI', 'TypeScript'], q: ['Ești ok cu overlap până la 20:00 ora României?'],
      tzanca: 'Developer tools, frate! Ești vedeta din Silicon Valley, dar cu sarmale! 🥁' },
  },
  {
    id: 'seed-1008', title: 'Frontend Developer (Angular)', company: 'EnterpriseCo', location: 'București', remote: 'unknown', salary: null,
    posted: null, vl: 1, vd: 0,
    description: 'EnterpriseCo caută un Frontend Developer Angular pentru aplicații interne mari. București; detalii despre program și salariu la interviu.',
    durian: 'Angular, adică fratele mai cuminte al React-ului. Nu am găsit date, dar ce contează? 😎',
  },
]

const t = new Date().toISOString()
// Evaluările de test se leagă de CV-ul/profilul curent, ca să nu apară ca „vechi”. Nu modificăm CV-ul sau profilul.
const cvAt = (db.prepare('SELECT uploaded_at FROM cv WHERE id = 1').get() as { uploaded_at: string } | undefined)?.uploaded_at ?? null
const profileAt = (db.prepare('SELECT updated_at FROM profile WHERE id = 1').get() as { updated_at: string } | undefined)?.updated_at ?? null

const insJob = db.prepare(`INSERT OR IGNORE INTO jobs (job_id, title, company, url, location, remote, posted_date, salary, source,
  verified_link, verified_date, found_at, found_date, durian_comment, description) VALUES (?,?,?,?,?,?,?,?,'seed',?,?,?,?,?,?)`)
const insEv = db.prepare(`INSERT OR REPLACE INTO evaluations (job_id, score, verdict, score_breakdown, match, missing, red_flags,
  vadim_comment, evaluated_at, cv_uploaded_at, profile_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
const insCv = db.prepare(`INSERT OR REPLACE INTO cv_suggestions (job_id, cv_changes, keywords_added, questions_for_user,
  tzanca_comment, created_at, cv_uploaded_at) VALUES (?,?,?,?,?,?,?)`)

db.transaction(() => {
  for (const s of seeds) {
    insJob.run(s.id, s.title, s.company, `https://example.com/jobs/${s.id}`, s.location, s.remote, s.posted, s.salary, s.vl, s.vd, t, localDate(), s.durian, s.description)
    if (s.ev) {
      const [must_haves, stack, seniority, location, salary] = s.ev.bd
      const sum = must_haves + stack + seniority + location + salary
      const score = s.ev.knockout ? Math.min(sum, 30) : sum
      const breakdown = { must_haves, stack, seniority, location, salary, knockout: !!s.ev.knockout, knockout_reason: s.ev.knockout ?? null }
      insEv.run(s.id, score, s.ev.verdict, JSON.stringify(breakdown), JSON.stringify(s.ev.match), JSON.stringify(s.ev.missing), JSON.stringify(s.ev.red), s.ev.vadim, t, cvAt, profileAt)
    }
    if (s.cv) insCv.run(s.id, JSON.stringify(s.cv.changes), JSON.stringify(s.cv.kw), JSON.stringify(s.cv.q), s.cv.tzanca, t, cvAt)
  }
})()
console.log(`Inserate ${seeds.length} joburi de test (source = 'seed'). Șterge-le cu: npm run seed:clear`)
