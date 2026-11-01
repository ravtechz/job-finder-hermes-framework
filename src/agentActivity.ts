import { useEffect, useState } from 'react'
import type { AgentKey } from './avatars'

export interface Run { start: string; end: string; count: number }
export interface FeedEvent { agent: Worker; kind: 'job' | 'evaluation' | 'suggestion'; at: string; title: string; company: string | null; detail: string | null }

export interface AgentActivity {
  working: boolean
  runs: Run[]
  last_at: string | null
  last_title: string | null
  last_company: string | null
  pending_requests: number
  active_now?: boolean   // Hermes rulează agentul chiar acum (din loguri), chiar dacă n-a scris încă nimic
}
type Worker = Exclude<AgentKey, 'milchick'>
export type ActivityMap = Record<Worker, AgentActivity>

/** Starea agenților din dashboard (ce au scris recent), reîmprospătată la fiecare 10 s cât e montată componenta.
 *  `skew` = diferența dintre ceasul serverului și cel al browserului, ca timpul „de la ultima activitate” să fie corect. */
export function useAgentActivity(): { activity: ActivityMap | null; recent: FeedEvent[]; skew: number; milchickWorking: boolean } {
  const [state, setState] = useState<{ activity: ActivityMap | null; recent: FeedEvent[]; skew: number; milchickWorking: boolean }>({ activity: null, recent: [], skew: 0, milchickWorking: false })
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const r = await fetch('/api/agents/activity')
        if (!r.ok) return
        const d = await r.json()
        if (live) setState({ activity: d.agents, recent: d.recent ?? [], skew: Date.parse(d.now) - Date.now(), milchickWorking: !!d.orchestrator?.working })
      } catch { /* rămâne starea veche */ }
    }
    load()
    const t = setInterval(load, 10_000)
    return () => { live = false; clearInterval(t) }
  }, [])
  return state
}

export type ModelMap = Partial<Record<AgentKey, { model: string; provider: string | null }>>

/** Modelul fiecărui agent, raportat de deploy/sync-agent-models.sh. */
export function useAgentModels(): ModelMap {
  const [models, setModels] = useState<ModelMap>({})
  useEffect(() => {
    let live = true
    const load = () => fetch('/api/agents/models').then((r) => (r.ok ? r.json() : {})).then((d) => live && setModels(d)).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => { live = false; clearInterval(t) }
  }, [])
  return models
}

export const modelLabel = (m?: ModelMap[AgentKey]) => (m ? m.model : null)
