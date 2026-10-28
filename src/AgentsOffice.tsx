import { useEffect, useMemo, useState } from 'react'
import { AGENTS, AvatarControls } from './AgentsPage'
import { useAgentActivity, type AgentActivity, type FeedEvent, type Run } from './agentActivity'
import { AgentAvatar, type AgentKey } from './avatars'

type Worker = Exclude<AgentKey, 'milchick'>

// poziția fiecărui birou, în % din lățimea biroului
const DESKS: { key: Worker; short: string; role: string; bay: string; x: number }[] = [
  { key: 'durian', short: 'DURIAN', role: 'GĂSEȘTE JOBURI', bay: 'BAY-1', x: 16.66 },
  { key: 'vadim', short: 'VADIM', role: 'EVALUEAZĂ', bay: 'BAY-2', x: 50 },
  { key: 'tzanca', short: 'TZANCA', role: 'AJUSTEAZĂ CV-UL', bay: 'BAY-3', x: 83.33 },
]
const meta = (k: AgentKey) => AGENTS.find((a) => a.key === k)!

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (sec: number) => sec >= 3600 ? `${Math.floor(sec / 3600)}h ${pad(Math.floor((sec % 3600) / 60))}m` : `${pad(Math.floor(sec / 60))}m ${pad(sec % 60)}s`

/** Textul de pe ecranul biroului: cifre care se schimbă, ca la „Macrodata Refinement”. */
function digits(t: number, i: number) {
  let d = ''
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 9; c++) d += (((t * 3 + c * 7 + r * 11 + i * 5) * 2654435761 >>> 7) % 10) + (c < 8 ? ' ' : '')
    d += '\n'
  }
  return d
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
const dm = (iso: string) => new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
const UNIT: Record<Worker, [string, string]> = { durian: ['job', 'joburi'], vadim: ['evaluare', 'evaluări'], tzanca: ['sugestie', 'sugestii'] }

/** „28 oct 21:03–21:11 · 12 joburi”: când a rulat agentul (evenimente apropiate în timp) și câte a făcut. */
function runLabel(key: Worker, r: Run) {
  const span = hm(r.start) === hm(r.end) ? hm(r.start) : `${hm(r.start)}–${hm(r.end)}`
  const [one, many] = UNIT[key]
  return `${dm(r.start)} ${span} · ${r.count} ${r.count === 1 ? one : many}`
}

function feedText(e: FeedEvent) {
  const what = `„${e.title}”${e.company ? ` · ${e.company}` : ''}`
  if (e.kind === 'job') return `a găsit ${what}`
  if (e.kind === 'evaluation') return `a evaluat ${what}${e.detail ? ` → ${e.detail}` : ''}`
  return `a pregătit sugestii pentru ${what}`
}

function describe(key: Worker, a: AgentActivity | undefined, working: boolean) {
  if (!a || !a.last_at) return working ? 'activ' : 'idle · fără activitate încă'
  const what = `${a.last_title}${a.last_company ? ` · ${a.last_company}` : ''}`
  if (key === 'tzanca' && a.pending_requests > 0) return `are ${a.pending_requests === 1 ? 'o cerere' : `${a.pending_requests} cereri`} · ${what}`
  return working ? `activ · ${what}` : `idle · ultima: ${what}`
}

export default function AgentsOffice() {
  const { activity, recent, skew } = useAgentActivity()
  const [tick, setTick] = useState(0)             // 1 tick = 0,5 s
  const [sim, setSim] = useState<Partial<Record<Worker, boolean>>>({}) // doar în dev: forțează starea unui agent
  const [simOn, setSimOn] = useState(false)
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 500); return () => clearInterval(t) }, [])

  // DEV: butonul „simulează” schimbă aleatoriu starea unui agent, ca să se vadă mutarea birou <-> bancă fără agenți reali
  useEffect(() => {
    if (!import.meta.env.DEV || !simOn) return
    const t = setInterval(() => {
      const k = DESKS[Math.floor(Math.random() * 3)].key
      setSim((s) => ({ ...s, [k]: !(s[k] ?? activity?.[k]?.working) }))
    }, 3000)
    return () => clearInterval(t)
  }, [simOn, activity])

  const rows = useMemo(() => DESKS.map((d, i) => {
    const a = activity?.[d.key]
    const working = sim[d.key] ?? a?.working ?? false
    const since = a?.last_at ? Math.max(0, Math.floor((Date.now() + skew - Date.parse(a.last_at)) / 1000)) : null
    return { ...d, i, a, working, since }
  }), [activity, skew, sim, tick])  // tick: recalculează „de la ultima activitate” în fiecare secundă
  const atDesk = rows.filter((r) => r.working).length
  const milState = activity ? (atDesk ? `orchestrează · ${atDesk}/3 agenți la birou` : 'supraveghează · 0/3 agenți la birou') : 'se conectează…'
  const mil = meta('milchick')

  return (
    <div className="office-wrap">
      <div className="office-head">
        <span className="office-title">STATUS AGENȚI</span>
        <span className="label">BIROURI OPERAȚIONALE — SESIUNI ACTIVE</span>
        {import.meta.env.DEV && (
          <button className="btn btn-sm office-sim" onClick={() => setSimOn((v) => !v)}>{simOn ? '■ OPREȘTE SIMULAREA' : '▶ SIMULEAZĂ ACTIVITATE'}</button>
        )}
      </div>

      <div className="office-scroll">
        <div className="office" role="img" aria-label="Biroul agenților: cine lucrează la birou și cine e pe bancă">
          <div className="otag" style={{ left: 14, top: 8 }}>LUMON · ETAJ MDR · SECȚIUNEA 4</div>
          <div className="divider" />
          <div className="otag" style={{ left: 14, top: 326 }}>— BANCĂ DE ODIHNĂ —</div>
          <div className="bench" />

          {/* liniile punctate Milchick -> birouri */}
          <div className="olink" style={{ left: '16.66%', width: '66.68%', top: 110, borderTopWidth: 1 }} />
          <div className="olink" style={{ left: '16.66%', top: 110, height: 14, borderLeftWidth: 1 }} />
          <div className="olink" style={{ left: '83.34%', top: 110, height: 14, borderLeftWidth: 1 }} />
          <div className="olink" style={{ left: '50%', top: 96, height: 28, borderLeftWidth: 1 }} />

          <div className="mgr">
            <div className="cap">— FLOOR MANAGER · BAY-00 —</div>
            <AgentAvatar agent="milchick" name={mil.name} initials={mil.initials} bg="bg-slate-700" size="h-11 w-11" />
            <div className="txt">
              <div className="mgr-nm">MILCHICK</div>
              <div className="mgr-role">SUPERVIZEAZĂ · ORCHESTREAZĂ</div>
              <div className="mgr-state">● {milState}</div>
            </div>
          </div>

          {rows.map((r) => (
            <div key={r.key}>
              <div className={`desk ${r.working ? '' : 'idle'}`} data-agent={r.key} style={{ left: `calc(${r.x}% - 105px)` }}>
                <div className="cap">— WORK DESK · {r.bay} —</div>
                <div className="screen"><pre>{r.working ? digits(tick, r.i) : ''}</pre></div>
                <div className="stand" /><div className="kbd" /><div className="chair" />
              </div>
              <div className={`agent ${r.working ? '' : 'idle'}`} data-agent={r.key} style={{ left: `calc(${r.x}% - 28px)` }}>
                <AgentAvatar agent={r.key} name={meta(r.key).name} initials={meta(r.key).initials} bg={meta(r.key).bg} size="h-[52px] w-[52px]" />
                <div className="nm">{r.short}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="agent-cards">
        <div className="acard mgr-card">
          <div className="acard-top"><span className="nm">MILCHICK</span><span className="label">BAY-00</span></div>
          <div className="label">FLOOR MANAGER</div>
          <div className="state">● {milState}</div>
          <AvatarControls agent="milchick" name={mil.name} small />
        </div>
        {rows.map((r) => (
          <div key={r.key} className="acard" data-agent={r.key}>
            <div className="acard-top"><span className="nm">{meta(r.key).name.toUpperCase()}</span><span className="label">{r.bay}</span></div>
            <div className="label">{r.role}</div>
            <div className={`state ${r.working ? 'on' : 'off'}`}>● {describe(r.key, r.a, r.working)}{r.since !== null ? ` [${clock(r.since)}]` : ''}</div>
            {r.a && r.a.runs.length > 0 && (
              <div className="runs">
                <div className="label">RULĂRI RECENTE</div>
                {r.a.runs.slice(0, 3).map((run) => <div key={run.start} className="run">{runLabel(r.key, run)}</div>)}
              </div>
            )}
            {import.meta.env.DEV && (
              <button className="btn btn-sm" onClick={() => setSim((s) => ({ ...s, [r.key]: !r.working }))}>{r.working ? '→ PE BANCĂ' : '→ LA BIROU'}</button>
            )}
            <AvatarControls agent={r.key} name={meta(r.key).name} small />
          </div>
        ))}
      </div>

      <div className="feed">
        <div className="office-head"><span className="office-title">JURNAL DE ACTIVITATE</span><span className="label">CE AU FĂCUT AGENȚII, ULTIMELE EVENIMENTE</span></div>
        {recent.length === 0 ? <p className="feed-empty">Încă nu există activitate.</p> : (
          <ul>
            {recent.map((e, i) => (
              <li key={`${e.agent}-${e.at}-${i}`} data-agent={e.agent}>
                <span className="feed-time">{dm(e.at)} {hm(e.at)}</span>
                <span className="feed-who">{meta(e.agent).name}</span>
                <span className="feed-what">{feedText(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
