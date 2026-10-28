import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type AgentKey = 'durian' | 'vadim' | 'tzanca' | 'milchick'
type Versions = Partial<Record<AgentKey, string | null>>

const Ctx = createContext<{ versions: Versions; reload: () => void }>({ versions: {}, reload: () => {} })

/** Pozele agenților. `versions[agent]` e data ultimei schimbări (null = fără poză): intră în URL ca poza nouă să înlocuiască cea din cache. */
export function AvatarsProvider({ children }: { children: ReactNode }) {
  const [versions, setVersions] = useState<Versions>({})
  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/avatars')
      if (r.ok) setVersions(await r.json())
    } catch { /* fără poze: rămân inițialele */ }
  }, [])
  useEffect(() => { reload() }, [reload])
  return <Ctx.Provider value={{ versions, reload }}>{children}</Ctx.Provider>
}

export const useAvatars = () => useContext(Ctx)

export function AgentAvatar({ agent, name, initials, bg, size = 'h-8 w-8 text-xs' }: { agent: AgentKey; name: string; initials: string; bg: string; size?: string }) {
  const v = useAvatars().versions[agent]
  if (v) return <img src={`/api/avatars/${agent}?v=${encodeURIComponent(v)}`} alt={name} className={`${size} shrink-0 rounded-full object-cover`} />
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-full font-bold text-white ${bg}`} aria-label={name}>{initials}</span>
}
