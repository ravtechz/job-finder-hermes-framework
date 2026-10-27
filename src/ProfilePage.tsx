import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { fetchProfile, saveProfile } from './api'
import type { Profile } from './types'

const EMPTY: Profile = {
  primary_stack: [], secondary_stack: [], years_experience: '', target_seniority: 'senior',
  min_salary: '', salary_currency: 'EUR', salary_basis: 'net',
  locations: [], work_modes: ['remote'], languages: [], exclusions: [], preferences: '',
}

const input = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const items = raw.split(',').map((x) => x.trim()).filter((x) => x && !value.includes(x))
    if (items.length) onChange([...value, ...items])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) }
    else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-950">
      {value.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
          {t}
          <button type="button" aria-label={`Șterge ${t}`} className="text-indigo-500 hover:text-red-600" onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => add(draft)} placeholder={value.length ? '' : placeholder}
             className="min-w-[4rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none" />
    </div>
  )
}

const MODES: [Profile['work_modes'][number], string][] = [['remote', 'Remote'], ['hybrid', 'Hibrid'], ['onsite', 'La birou']]

export default function ProfilePage() {
  const [p, setP] = useState<Profile>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [exists, setExists] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetchProfile()
      .then((d) => { if (d) { const { updated_at, ...rest } = d; setP(rest); setSavedAt(updated_at); setExists(true) } })
      .catch((e) => setMsg({ ok: false, text: (e as Error).message }))
      .finally(() => setLoading(false))
  }, [])

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }))
  const toggleMode = (m: Profile['work_modes'][number]) =>
    set('work_modes', p.work_modes.includes(m) ? p.work_modes.filter((x) => x !== m) : [...p.work_modes, m])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const r = await saveProfile(p)
      setExists(true)
      setMsg({ ok: true, text: r.changed ? 'Profil salvat. Evaluările existente vor apărea marcate „pe profil vechi”.' : 'Nicio modificare față de profilul salvat.' })
      const d = await fetchProfile(); if (d) setSavedAt(d.updated_at)
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) }
    setBusy(false)
  }

  if (loading) return <p className="text-sm text-slate-500">Se încarcă…</p>

  const card = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
  return (
    <form onSubmit={submit} className="space-y-4">
      {!exists && (
        <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Nu ai completat încă profilul. Vadim îl folosește ca să dea scorul, deci completează-l înainte de următoarea rulare.
        </p>
      )}

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">Tehnic</h2>
        <Field label="Stack principal" hint="Enter sau virgulă pentru a adăuga"><TagInput value={p.primary_stack} onChange={(v) => set('primary_stack', v)} placeholder="React, TypeScript…" /></Field>
        <Field label="Stack secundar"><TagInput value={p.secondary_stack} onChange={(v) => set('secondary_stack', v)} placeholder="Python, Docker…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ani de experiență">
            <input type="number" min={0} max={60} step="0.5" className={input} value={p.years_experience} onChange={(e) => set('years_experience', e.target.value === '' ? '' : Number(e.target.value))} required />
          </Field>
          <Field label="Senioritate țintă">
            <select className={input} value={p.target_seniority} onChange={(e) => set('target_seniority', e.target.value as Profile['target_seniority'])}>
              {['junior', 'mid', 'senior', 'lead', 'principal'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Limbi"><TagInput value={p.languages} onChange={(v) => set('languages', v)} placeholder="română, engleză…" /></Field>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">Condiții</h2>
        <div className="grid grid-cols-[1fr_5.5rem_6rem] items-end gap-2 sm:gap-3">
          <Field label="Salariu minim / lună">
            <input type="number" min={0} className={input} value={p.min_salary} onChange={(e) => set('min_salary', e.target.value === '' ? '' : Number(e.target.value))} />
          </Field>
          <Field label="Monedă">
            <select className={input} value={p.salary_currency} onChange={(e) => set('salary_currency', e.target.value)}>
              {['EUR', 'RON', 'USD', 'GBP'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Tip">
            <select className={input} value={p.salary_basis} onChange={(e) => set('salary_basis', e.target.value as Profile['salary_basis'])}>
              <option value="net">Net</option><option value="gross">Brut</option>
            </select>
          </Field>
        </div>
        <Field label="Locații acceptate"><TagInput value={p.locations} onChange={(v) => set('locations', v)} placeholder="București, Remote UE…" /></Field>
        <fieldset>
          <legend className="text-sm font-medium">Mod de lucru acceptat</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {MODES.map(([m, label]) => (
              <label key={m} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${p.work_modes.includes(m) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                <input type="checkbox" className="sr-only" checked={p.work_modes.includes(m)} onChange={() => toggleMode(m)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">Excluderi și preferințe</h2>
        <Field label="Condiții de excludere" hint="un job care le încalcă primește knockout">
          <TagInput value={p.exclusions} onChange={(v) => set('exclusions', v)} placeholder="fără on-call, fără relocare…" />
        </Field>
        <Field label="Preferințe">
          <textarea rows={4} className={input} value={p.preferences} onChange={(e) => set('preferences', e.target.value)} placeholder="Ex: produs propriu, echipă mică, fără outsourcing…" />
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">Salvează profilul</button>
        {savedAt && <span className="text-xs text-slate-500">ultima modificare {new Date(savedAt).toLocaleString('ro-RO')}</span>}
      </div>
      {msg && <p className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>{msg.text}</p>}
    </form>
  )
}
