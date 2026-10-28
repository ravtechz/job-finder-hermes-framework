import { useRef, useState } from 'react'
import { deleteAvatar, uploadAvatar } from './api'
import { AgentAvatar, useAvatars, type AgentKey } from './avatars'

export const AGENTS: { key: AgentKey; name: string; role: string; initials: string; bg: string }[] = [
  { key: 'milchick', name: 'Domnu Milchick', role: 'Supervizor al departamentului', initials: 'DM', bg: 'bg-slate-700' },
  { key: 'durian', name: 'Durian Popa', role: 'Găsește joburi', initials: 'DP', bg: 'bg-fuchsia-600' },
  { key: 'vadim', name: 'Vadim Sudor', role: 'Evaluează joburile', initials: 'VS', bg: 'bg-indigo-600' },
  { key: 'tzanca', name: 'Tzanca Ciocanu', role: 'Ajustează CV-ul', initials: 'TC', bg: 'bg-teal-600' },
]

const btn = 'btn rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50'
const ghost = `${btn} border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`

/** Decupează pătrat din centru și micșorează la 256 px: poza rămâne mică și se încarcă repede în carduri. */
async function toSquare(file: File, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, q))
  const webp = await toBlob('image/webp', 0.9)
  const out = webp && webp.type === 'image/webp' ? webp : await toBlob('image/png')
  if (!out) throw new Error('Nu pot procesa imaginea.')
  return out
}

/** Butoanele de încărcare/ștergere a pozei unui agent, folosite în ambele teme. */
export function AvatarControls({ agent, name, small = false }: { agent: AgentKey; name: string; small?: boolean }) {
  const { versions, reload } = useAvatars()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const has = !!versions[agent]
  const b = small ? 'btn-sm' : ''

  async function run(fn: () => Promise<void>, okText: string) {
    setBusy(true); setMsg(null)
    try { await fn(); await reload(); setMsg({ ok: true, text: okText }) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
    setBusy(false)
  }

  async function onFile(f?: File | null) {
    if (input.current) input.current.value = ''
    if (!f) return
    if (!f.type.startsWith('image/') || f.type === 'image/svg+xml') { setMsg({ ok: false, text: 'Alege o imagine PNG, JPEG, WebP sau GIF.' }); return }
    run(async () => uploadAvatar(agent, await toSquare(f)), 'Poza a fost salvată.')
  }

  return (
    <div className="avatar-controls">
      <div className="flex flex-wrap gap-2">
        <button className={`${ghost} ${b}`} disabled={busy} onClick={() => input.current?.click()}>{has ? 'Schimbă poza' : 'Încarcă poză'}</button>
        {has && <button className={`${ghost} ${b} text-red-600 dark:text-red-400`} disabled={busy}
                        onClick={() => confirm(`Ștergi poza lui ${name}?`) && run(() => deleteAvatar(agent), 'Poza a fost ștearsă.')}>Șterge</button>}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {busy && <p className="mt-2 text-sm text-slate-500">Se procesează…</p>}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
    </div>
  )
}

function AgentCard({ a }: { a: (typeof AGENTS)[number] }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <AgentAvatar agent={a.key} name={a.name} initials={a.initials} bg={a.bg} size="h-20 w-20 text-xl" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{a.name}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{a.role}</div>
        <div className="mt-2"><AvatarControls agent={a.key} name={a.name} /></div>
      </div>
    </div>
  )
}

export default function AgentsPage() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Poza fiecărui agent apare în cardurile joburilor, lângă comentariile și sugestiile lui. Domnu Milchick, care nu comentează joburi, apare în antetul dashboard-ului. Imaginea se decupează pătrat din centru. PNG, JPEG, WebP sau GIF (GIF-ul devine imagine statică).
      </p>
      {AGENTS.map((a) => <AgentCard key={a.key} a={a} />)}
    </div>
  )
}
