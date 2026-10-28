import { useCallback, useEffect, useState } from 'react'
import { fetchJobs, fetchStats, setStatus } from './api'
import AgentsOffice from './AgentsOffice'
import AgentsPage from './AgentsPage'
import { AgentAvatar } from './avatars'
import { ThemeSwitch, useTheme } from './theme'
import CvPage from './CvPage'
import JobCard from './JobCard'
import ProfilePage from './ProfilePage'
import type { Filters, Job, Stats, Status } from './types'

const today = () => new Intl.DateTimeFormat('en-CA').format(new Date()) // YYYY-MM-DD în fusul browserului

const field = 'field rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'

function Stat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="stat rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className={`stat-v text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="stat-l text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

export default function App() {
  const [filters, setFilters] = useState<Filters>({ mode: 'day', date: today(), verdict: '', minScore: '', remote: '', status: '' })
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<'jobs' | 'cv' | 'profile' | 'agents'>('jobs')
  const { theme } = useTheme()

  const load = useCallback(async () => {
    try {
      const [j, s] = await Promise.all([fetchJobs(filters), fetchStats(filters)])
      setJobs(j); setStats(s); setError('')
    } catch (e) {
      setError('Nu pot încărca datele. ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    setLoading(true)
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const isToday = filters.mode === 'day' && filters.date === today()

  async function changeStatus(job: Job, status: Status) {
    const next = job.status === status ? 'new' : status // click repetat = revenire la "nou"
    setJobs((js) => js.map((j) => (j.job_id === job.job_id ? { ...j, status: next } : j)))
    try { await setStatus(job.job_id, next) } catch { load() }
  }

  return (
    <div className="app">
      <header className="app-top">
        <div className="sev-only crumb">LUMON / MACRODATA REFINEMENT</div>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            {page === 'cv' ? 'CV' : page === 'profile' ? 'Profil' : page === 'agents' ? 'Agenți' : filters.mode === 'week' ? 'Ultimele 7 zile' : isToday ? 'Azi' : filters.date}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Joburi găsite de Durian, evaluate de Vadim, pregătite de Tzanca.</p>
          <p className="basic-only mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <AgentAvatar agent="milchick" name="Domnu Milchick" initials="DM" bg="bg-slate-700" size="h-5 w-5 text-[9px]" />
            Sub supravegherea lui Domnu Milchick
          </p>
        </div>
      </header>

      <aside className="app-side">
        <div className="sev-only side-menu">MENU</div>
        <nav role="tablist" className="tabs flex shrink-0 gap-1 self-start rounded-xl bg-slate-200 p-1 text-sm dark:bg-slate-800">
          {([['jobs', 'Joburi', 'Live desk'], ['cv', 'CV', 'Documente'], ['profile', 'Profil', 'Preferințe'], ['agents', 'Agenți', 'Birouri']] as const).map(([k, label, sub]) => (
            <button key={k} role="tab" aria-selected={page === k} onClick={() => setPage(k)}
                    className={`rounded-lg px-3 py-1 font-medium ${page === k ? 'bg-white shadow dark:bg-slate-600' : 'text-slate-600 dark:text-slate-300'}`}>
              <span className="tab-label">{label}</span>
              <span className="sev-only tab-sub">{sub}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <ThemeSwitch />
          <div className="sev-only side-brand">LUMON INDUSTRIES<br />JOB FINDER<br />BAY-00 / SESIUNE ACTIVĂ</div>
        </div>
      </aside>

      <main className="app-main">
      {page === 'cv' ? <CvPage /> : page === 'profile' ? <ProfilePage /> : page === 'agents' ? (theme === 'severance' ? <AgentsOffice /> : <AgentsPage />) : <>

      <div className="stats mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label={filters.mode === 'week' ? 'Noi (7 zile)' : isToday ? 'Noi azi' : 'Noi în zi'} value={stats?.new_jobs ?? '–'} tone="" />
        <Stat label="APPLY" value={stats?.apply ?? '–'} tone="text-emerald-600 dark:text-emerald-400" />
        <Stat label="MAYBE" value={stats?.maybe ?? '–'} tone="text-amber-600 dark:text-amber-400" />
        <Stat label="SKIP" value={stats?.skip ?? '–'} tone="text-slate-500" />
        <Stat label="Scor mediu" value={stats?.avg_score ?? '–'} tone="" />
      </div>

      <div className="filters mb-4 flex flex-wrap items-center gap-2">
        <input type="date" className={field} value={filters.date} max={today()}
               onChange={(e) => e.target.value && setFilters((f) => ({ ...f, mode: 'day', date: e.target.value }))} />
        <button onClick={() => set('mode', filters.mode === 'week' ? 'day' : 'week')} aria-pressed={filters.mode === 'week'}
                className={`btn rounded-lg border px-3 py-1.5 text-sm ${filters.mode === 'week' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
          Ultimele 7 zile
        </button>
        {!isToday && <button onClick={() => setFilters((f) => ({ ...f, mode: 'day', date: today() }))} className="text-sm underline">Azi</button>}
        <select className={field} value={filters.verdict} onChange={(e) => set('verdict', e.target.value as Filters['verdict'])}>
          <option value="">Orice verdict</option><option>APPLY</option><option>MAYBE</option><option>SKIP</option>
        </select>
        <input type="number" min={0} max={100} placeholder="Scor min" className={`${field} w-24`} value={filters.minScore}
               onChange={(e) => set('minScore', e.target.value)} />
        <select className={field} value={filters.remote} onChange={(e) => set('remote', e.target.value as Filters['remote'])}>
          <option value="">Orice mod</option><option value="remote">Remote</option><option value="hybrid">Hibrid</option>
          <option value="onsite">La birou</option><option value="unknown">Necunoscut</option>
        </select>
        <select className={field} value={filters.status} onChange={(e) => set('status', e.target.value as Filters['status'])}>
          <option value="">Orice status</option><option value="new">Nou</option><option value="seen">Văzut</option>
          <option value="applied">Aplicat</option><option value="ignored">Ignorat</option>
        </select>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}

      <div className="space-y-3">
        {jobs.map((j) => <JobCard key={j.job_id} job={j} onStatus={(s) => changeStatus(j, s)} onReload={load} />)}
        {!loading && !jobs.length && !error && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
            Niciun job pentru filtrele alese.
          </p>
        )}
      </div>
      </>}
      </main>
    </div>
  )
}
