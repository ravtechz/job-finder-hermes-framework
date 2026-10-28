import { useState, type ReactNode } from 'react'
import { fetchJob, reevaluateJob, setVerdict } from './api'
import { AgentAvatar } from './avatars'
import type { Job, Remote, ScoreBreakdown, Status, Verdict } from './types'

const VERDICT_STYLE: Record<Verdict, string> = {
  APPLY: 'bg-emerald-600 text-white',
  MAYBE: 'bg-amber-500 text-white',
  SKIP: 'bg-slate-500 text-white',
}
const SCORE_STYLE: Record<Verdict, string> = {
  APPLY: 'text-emerald-600 dark:text-emerald-400',
  MAYBE: 'text-amber-600 dark:text-amber-400',
  SKIP: 'text-slate-500 dark:text-slate-400',
}
const REMOTE_LABEL: Record<Remote, string> = { remote: 'Remote', hybrid: 'Hibrid', onsite: 'La birou', unknown: 'Remote necunoscut' }
const STATUS_LABEL: Record<Status, string> = { new: 'Nou', seen: 'Văzut', applied: 'Aplicat', ignored: 'Ignorat' }

const AGENTS = {
  durian: { name: 'Durian Popa', role: 'Găsește joburi', initials: 'DP', box: 'border-fuchsia-300 bg-fuchsia-50 dark:border-fuchsia-800 dark:bg-fuchsia-950/40', avatar: 'bg-fuchsia-600', title: 'text-fuchsia-700 dark:text-fuchsia-300' },
  vadim: { name: 'Vadim Sudor', role: 'Evaluează', initials: 'VS', box: 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40', avatar: 'bg-indigo-600', title: 'text-indigo-700 dark:text-indigo-300' },
  tzanca: { name: 'Tzanca Ciocanu', role: 'Ajustează CV-ul', initials: 'TC', box: 'border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/40', avatar: 'bg-teal-600', title: 'text-teal-700 dark:text-teal-300' },
}

const fmtWhen = (iso?: string | null) => iso ? new Date(iso).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

function AgentSection({ agent, when, children }: { agent: keyof typeof AGENTS; when?: string | null; children: ReactNode }) {
  const a = AGENTS[agent]
  return (
    <section className={`box ${agent} rounded-xl border p-3 ${a.box}`}>
      <div className="who mb-2 flex items-center gap-2">
        <AgentAvatar agent={agent} name={a.name} initials={a.initials} bg={a.avatar} />
        <div className="leading-tight">
          <div className={`nm text-sm font-semibold ${a.title}`}>{a.name}</div>
          <div className="rl text-xs text-slate-500 dark:text-slate-400">{a.role}</div>
        </div>
        {when && <span className="sw-only when" title={when}>{fmtWhen(when)}</span>}
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  )
}

function List({ label, items, tone, kind }: { label: string; items: string[]; tone?: string; kind?: 'fit' | 'miss' | 'flag' }) {
  if (!items.length) return null
  return (
    <div className="list" data-kind={kind}>
      <div className={`lh text-xs font-semibold uppercase tracking-wide ${tone ?? 'text-slate-500 dark:text-slate-400'}`}>{label}</div>
      <ul className="ml-4 list-disc space-y-0.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}

// comentariul unui agent, cu poza lui alături
const Quote = ({ text, agent }: { text: string; agent: keyof typeof AGENTS }) => {
  const a = AGENTS[agent]
  return (
    <div className="quote-row flex items-start gap-2">
      <AgentAvatar agent={agent} name={a.name} initials={a.initials} bg={a.avatar} size="h-9 w-9 text-xs" />
      <p className="quote min-w-0 flex-1 rounded-lg bg-white/60 px-3 py-2 italic dark:bg-black/20">„{text}”</p>
    </div>
  )
}

const Warn = ({ children }: { children: ReactNode }) => (
  <span className="chip chip-warn rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">⚠ {children}</span>
)

const BAR_LABELS: [keyof Omit<ScoreBreakdown, 'knockout' | 'knockout_reason'>, string, number][] = [
  ['must_haves', 'Cerințe esențiale', 40], ['stack', 'Stack', 25], ['seniority', 'Senioritate', 15], ['location', 'Locație', 10], ['salary', 'Salariu', 10],
]

function Breakdown({ b }: { b: ScoreBreakdown }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Scor pe componente</div>
      {BAR_LABELS.map(([key, label, max]) => (
        <div key={key} className="bar grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-xs" title={`${label}: ${b[key]} din ${max}`}>
          <span className="truncate">{label}</span>
          <div className="track h-2 overflow-hidden rounded-full bg-indigo-200/70 dark:bg-indigo-900/60" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={b[key]}>
            <div className="fill h-full rounded-full bg-indigo-600 dark:bg-indigo-400" style={{ width: `${(b[key] / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-slate-600 dark:text-slate-300">{b[key]}/{max}</span>
        </div>
      ))}
      {b.knockout && (
        <div className="knockout mt-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white">
          ⛔ KNOCKOUT: {b.knockout_reason}
        </div>
      )}
    </div>
  )
}

const Stale = ({ children }: { children: ReactNode }) => (
  <span className="chip chip-stale rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">🕓 {children}</span>
)

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="chip rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{children}</span>
)

export default function JobCard({ job, onStatus, onReload }: { job: Job; onStatus: (s: Status) => void; onReload: () => void }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState<string | null | undefined>(undefined) // undefined = încă neîncărcat

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && description === undefined) {
      try { setDescription((await fetchJob(job.job_id)).description ?? null) } catch { setDescription(null) }
    }
  }

  async function reevaluate() {
    if (!confirm('Ștergi evaluarea și sugestiile de CV pentru acest job? Jobul va fi evaluat din nou la următoarea rulare a lui Vadim.')) return
    try { await reevaluateJob(job.job_id) } finally { onReload() }
  }
  const ev = job.evaluation
  const cv = job.cv_suggestion
  const [busy, setBusy] = useState(false)

  async function changeVerdict(v: Verdict) {
    setBusy(true)
    try { await setVerdict(job.job_id, v) } finally { setBusy(false); onReload() }
  }
  const waitingTzanca = !!ev && ev.verdict === 'APPLY' && !!ev.cv_requested_at && !cv
  const dim = job.status === 'ignored' ? 'opacity-60' : ''

  const btn = (s: Status, label: string, active: string) => (
    <button
      onClick={() => onStatus(s)} aria-pressed={job.status === s} data-s={s}
      className={`btn rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
        job.status === s ? active : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )

  return (
    <article data-verdict={ev?.verdict ?? 'none'} className={`job ${open ? 'is-open' : ''} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${dim}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {ev ? <span className={`badge v-${ev.verdict.toLowerCase()} rounded-md px-2 py-0.5 text-xs font-bold ${VERDICT_STYLE[ev.verdict]}`}>{ev.verdict}</span>
                : <span className="badge v-none rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">NEEVALUAT</span>}
            {ev?.verdict_manual && <Chip>manual (Vadim: {ev.original_verdict})</Chip>}
            {waitingTzanca && <Chip>sugestii CV cerute (Tzanca)…</Chip>}
            {ev?.score_breakdown?.knockout && <span className="badge v-knockout rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">KNOCKOUT</span>}
            {job.status !== 'new' && <Chip>{STATUS_LABEL[job.status]}</Chip>}
            {ev?.stale_cv && <Stale>evaluat pe CV vechi</Stale>}
            {ev?.stale_profile && <Stale>evaluat pe profil vechi</Stale>}
            {job.source === 'seed' && <Chip>test</Chip>}
          </div>
          <h2 className="job-title mt-1 text-base font-semibold leading-snug sm:text-lg">{job.title}</h2>
          <p className="job-meta text-sm text-slate-600 dark:text-slate-400">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
        </div>
        {ev && (
          <div className="score text-right">
            <div className={`score-n v-${ev.verdict.toLowerCase()} text-3xl font-bold tabular-nums leading-none ${SCORE_STYLE[ev.verdict]}`}>{ev.score}</div>
            <div className="score-l text-[10px] uppercase tracking-wide text-slate-500">scor</div>
          </div>
        )}
      </div>

      <div className="chips mt-2 flex flex-wrap items-center gap-1.5">
        <Chip>{REMOTE_LABEL[job.remote]}</Chip>
        {job.salary && <Chip>💰 {job.salary}</Chip>}
        <Chip>📅 {job.posted_date ?? 'dată necunoscută'}</Chip>
        {!job.verified_link && <Warn>link neverificat</Warn>}
        {!job.verified_date && <Warn>dată neverificată</Warn>}
      </div>

      <div className="actions mt-3 flex flex-wrap items-center gap-2">
        <a href={job.url} target="_blank" rel="noopener noreferrer"
           className="btn btn-solid rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300">
          Vezi anunțul ↗
        </a>
        {btn('applied', 'Aplicat', 'border-emerald-600 bg-emerald-600 text-white')}
        {btn('seen', 'Văzut', 'border-sky-600 bg-sky-600 text-white')}
        {btn('ignored', 'Ignoră', 'border-slate-600 bg-slate-600 text-white')}
        {ev && ev.verdict !== 'APPLY' && (
          <button onClick={() => changeVerdict('APPLY')} disabled={busy}
            title="Schimbă verdictul în APPLY și cere lui Tzanca sugestii de CV"
            className="btn btn-apply rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
            ↑ Marchează APPLY
          </button>
        )}
        {ev?.verdict_manual && ev.original_verdict && (
          <button onClick={() => changeVerdict(ev.original_verdict!)} disabled={busy}
            className="btn rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
            ↩ Înapoi la {ev.original_verdict}
          </button>
        )}
        <button onClick={toggle} className="btn btn-ghost toggle ml-auto text-sm text-slate-500 underline-offset-2 hover:underline" aria-expanded={open}>
          {open ? 'Ascunde detalii' : 'Detalii'} <span className="chev" aria-hidden="true">▼</span>
        </button>
      </div>

      {/* detaliile rămân în DOM: se animă din CSS (grid-template-rows 0fr -> 1fr), iar `inert` le scoate din tab/cititor cât sunt închise */}
      <div className="details" inert={!open}>
       <div>
        <div className="details-in mt-4 space-y-3">
          <section className="box desc rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="label mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Descrierea anunțului</div>
            {description === undefined ? <p className="text-sm text-slate-500">Se încarcă…</p>
              : description ? <p className="max-h-56 overflow-auto whitespace-pre-wrap text-sm">{description}</p>
              : <p className="text-sm text-slate-500">Durian nu a trimis descrierea.</p>}
          </section>

          <AgentSection agent="durian" when={job.found_at}>
            {job.durian_comment ? <Quote agent="durian" text={job.durian_comment} /> : <p className="text-slate-500">Fără comentariu.</p>}
          </AgentSection>

          <AgentSection agent="vadim" when={ev?.evaluated_at}>
            {ev ? (
              <>
                {(ev.stale_cv || ev.stale_profile) && (
                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Evaluarea e făcută pe {[ev.stale_cv && 'un CV mai vechi', ev.stale_profile && 'un profil mai vechi'].filter(Boolean).join(' și ')}. Apasă „Reevaluează” ca să fie refăcută.
                  </p>
                )}
                {ev.score_breakdown && <Breakdown b={ev.score_breakdown} />}
                <div className="lists space-y-2">
                  <List kind="fit" label="Se potrivește" items={ev.match} tone="text-emerald-700 dark:text-emerald-400" />
                  <List kind="miss" label="Lipsește" items={ev.missing} tone="text-amber-700 dark:text-amber-400" />
                </div>
                <List kind="flag" label="Semnale de alarmă" items={ev.red_flags} tone="text-red-700 dark:text-red-400" />
                {ev.vadim_comment && <Quote agent="vadim" text={ev.vadim_comment} />}
              </>
            ) : <p className="text-slate-500">Încă neevaluat.</p>}
          </AgentSection>

          {cv && (
            <AgentSection agent="tzanca" when={cv.created_at}>
              {cv.stale_cv && <Stale>sugestii făcute pe CV vechi</Stale>}
              <List label="Modificări CV" items={cv.cv_changes} />
              {cv.keywords_added.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Keywords</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cv.keywords_added.map((k, i) => <span key={i} className="chip chip-kw rounded-full bg-teal-600/15 px-2 py-0.5 text-xs text-teal-800 dark:text-teal-200">{k}</span>)}
                  </div>
                </div>
              )}
              <List label="Întrebări pentru tine" items={cv.questions_for_user} />
              {cv.tzanca_comment && <Quote agent="tzanca" text={cv.tzanca_comment} />}
            </AgentSection>
          )}
          {ev && (
            <div className="flex justify-end">
              <button onClick={reevaluate} className="btn rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">↻ Reevaluează</button>
            </div>
          )}
        </div>
       </div>
      </div>
    </article>
  )
}
