import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'basic' | 'severance'
const KEY = 'jd-theme'

const readTheme = (): Theme => {
  try { return localStorage.getItem(KEY) === 'severance' ? 'severance' : 'basic' } catch { return 'basic' }
}

/** Basic urmărește tema sistemului (ca înainte); Severance e mereu întunecată. Clasa `dark` activează variantele `dark:`. */
function apply(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  const dark = theme === 'severance' || matchMedia('(prefers-color-scheme: dark)').matches
  root.classList.toggle('dark', dark)
}

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'basic', setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem(KEY, t) } catch { /* fără localStorage: tema rămâne doar pentru sesiune */ }
  }, [])

  useEffect(() => {
    apply(theme)
    if (theme !== 'basic') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => apply('basic')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)

const THEMES: [Theme, string][] = [['basic', 'Basic'], ['severance', 'Severance']]

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="theme-switch" role="group" aria-label="Temă">
      <span className="theme-switch-label">Temă</span>
      {THEMES.map(([t, label]) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{label}</button>
      ))}
    </div>
  )
}
