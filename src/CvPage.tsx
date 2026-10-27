import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteCv, fetchCv, reevaluateActive, uploadCvFile, uploadCvText, type CvInfo } from './api'

const btn = 'rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50'
const ghost = `${btn} border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800`

export default function CvPage() {
  const [cv, setCv] = useState<CvInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pasted, setPasted] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try { setCv(await fetchCv()) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function run(fn: () => Promise<void>, okText: string) {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: okText }); await load() }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
    setBusy(false)
  }

  const onFile = (f?: File | null) => f && run(() => uploadCvFile(f), `CV încărcat: ${f.name}`)

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold">CV curent</h2>
        {loading ? <p className="text-sm text-slate-500">Se încarcă…</p> : cv ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-medium">{cv.filename}</span>
            <span className="text-slate-500">încărcat {new Date(cv.uploaded_at).toLocaleString('ro-RO')} · {cv.chars} caractere</span>
            <span className="ml-auto flex gap-2">
              {cv.size ? <a className={ghost} href="/api/cv/file">Descarcă originalul</a> : null}
              <button className={`${ghost} text-red-600 dark:text-red-400`} disabled={busy}
                      onClick={() => confirm('Ștergi CV-ul?') && run(deleteCv, 'CV șters.')}>Șterge</button>
            </span>
          </div>
        ) : (
          <p className="mt-1 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Nu ai încărcat încă un CV. Tzanca (modificări CV) și Vadim (scor) nu au ce citi.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold">{cv ? 'Înlocuiește CV-ul' : 'Încarcă CV-ul'}</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]) }}
          onClick={() => input.current?.click()}
          className={`mt-3 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${
            drag ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-300 dark:border-slate-700'}`}
        >
          Trage aici fișierul sau apasă pentru a alege<br />
          <span className="text-xs text-slate-500">PDF (cu text selectabil), DOCX, TXT sau MD · maxim 10 MB</span>
          <input ref={input} type="file" accept=".pdf,.docx,.txt,.md" className="hidden"
                 onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400">Sau lipește textul CV-ului</summary>
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={8} placeholder="Lipește textul CV-ului aici…"
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <button className={`${btn} mt-2 border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500`} disabled={busy || pasted.trim().length < 20}
                  onClick={() => run(() => uploadCvText(pasted), 'CV salvat din text.').then(() => setPasted(''))}>Salvează textul</button>
        </details>

        {busy && <p className="mt-3 text-sm text-slate-500">Se procesează…</p>}
        {msg && (
          <p className={`mt-3 rounded-lg p-3 text-sm ${msg.ok ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>{msg.text}</p>
        )}
      </section>

      {cv && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Reevaluare după schimbarea CV-ului</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Șterge evaluările și sugestiile de CV ale joburilor active (status Nou sau Văzut) ca agenții să le refacă pe CV-ul de acum. Joburile marcate Aplicat sau Ignorat nu se ating.
          </p>
          <button className={`${btn} mt-3 border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500`} disabled={busy}
                  onClick={async () => {
                    setBusy(true); setMsg(null)
                    try {
                      const n = await reevaluateActive(true)
                      if (n === 0) setMsg({ ok: true, text: 'Nu există joburi active evaluate; nimic de reevaluat.' })
                      else if (confirm(`Reevaluezi ${n} ${n === 1 ? 'job activ' : 'joburi active'} pe noul CV? Evaluările și sugestiile lor de CV se șterg.`)) {
                        const done = await reevaluateActive(false)
                        setMsg({ ok: true, text: `${done} ${done === 1 ? 'job va fi reevaluat' : 'joburi vor fi reevaluate'} la următoarea rulare a lui Vadim.` })
                      }
                    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
                    setBusy(false)
                  }}>
            ↻ Reevaluează joburile active pe noul CV
          </button>
        </section>
      )}

      {cv && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold">Textul pe care îl citesc agenții</h2>
          <p className="text-xs text-slate-500">Verifică ca extragerea să fie corectă (diacritice, ordinea secțiunilor).</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-950">{cv.text}</pre>
        </section>
      )}
    </div>
  )
}
