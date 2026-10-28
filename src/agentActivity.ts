import { useEffect, useState } from 'react'
import type { AgentKey } from './avatars'

export interface AgentActivity {
  working: boolean
  last_at: string | null
  last_title: string | null
  last_company: string | null
  pending_requests: number
}
export type ActivityMap = Record<Exclude<AgentKey, 'milchick'>, AgentActivity>

/** Starea agenților din dashboard (ce au scris recent), reîmprospătată la fiecare 10 s cât e montată componenta.
 *  `skew` = diferența dintre ceasul serverului și cel al browserului, ca timpul „de la ultima activitate” să fie corect. */
export function useAgentActivity(): { activity: ActivityMap | null; skew: number } {
  const [state, setState] = useState<{ activity: ActivityMap | null; skew: number }>({ activity: null, skew: 0 })
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const r = await fetch('/api/agents/activity')
        if (!r.ok) return
        const d = await r.json()
        if (live) setState({ activity: d.agents, skew: Date.parse(d.now) - Date.now() })
      } catch { /* rămâne starea veche */ }
    }
    load()
    const t = setInterval(load, 10_000)
    return () => { live = false; clearInterval(t) }
  }, [])
  return state
}
