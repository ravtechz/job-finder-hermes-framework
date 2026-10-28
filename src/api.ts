import type { Filters, Job, Profile, Stats, Status, Verdict } from './types'

function qs(f: Filters) {
  const p = new URLSearchParams()
  if (f.mode === 'week') p.set('days', '7')
  else p.set('date', f.date)
  return p
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function fetchJobs(f: Filters): Promise<Job[]> {
  const p = qs(f)
  if (f.verdict) p.set('verdict', f.verdict)
  if (f.minScore) p.set('min_score', f.minScore)
  if (f.remote) p.set('remote', f.remote)
  if (f.status) p.set('status', f.status)
  return (await get<{ jobs: Job[] }>(`/api/jobs?${p}`)).jobs
}

export const fetchStats = (f: Filters) => get<Stats>(`/api/stats?${qs(f)}`)

export async function setStatus(jobId: string, status: Status) {
  const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

export interface CvInfo { filename: string; uploaded_at: string; size: number | null; chars: number; text: string }

export async function fetchCv(): Promise<CvInfo | null> {
  const r = await fetch('/api/cv')
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function cvRequest(init: RequestInit, query = '') {
  const r = await fetch('/api/cv' + query, init)
  if (!r.ok) {
    const b = await r.json().catch(() => null)
    throw new Error(b?.message ?? b?.error ?? `HTTP ${r.status}`)
  }
}

export const uploadCvFile = (file: File) =>
  cvRequest({ method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }, `?filename=${encodeURIComponent(file.name)}`)

export const uploadCvText = (text: string) =>
  cvRequest({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })

export const deleteCv = () => cvRequest({ method: 'DELETE' })

export const fetchJob = (jobId: string) => get<Job>(`/api/jobs/${encodeURIComponent(jobId)}`)

export async function setVerdict(jobId: string, verdict: Verdict) {
  const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/verdict`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verdict }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

export async function reevaluateJob(jobId: string) {
  const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/reevaluate`, { method: 'POST' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

export async function reevaluateActive(dryRun: boolean): Promise<number> {
  const r = await fetch('/api/jobs/reevaluate-active', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dry_run: dryRun }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()).affected
}

export type ProfileData = Profile & { updated_at: string }

export async function fetchProfile(): Promise<ProfileData | null> {
  const r = await fetch('/api/profile')
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function saveProfile(p: Profile): Promise<{ changed: boolean }> {
  const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
  const b = await r.json().catch(() => null)
  if (!r.ok) {
    const details = (b?.details as { field: string; message: string }[] | undefined)?.map((d) => d.message).join(' · ')
    throw new Error(details || b?.message || `HTTP ${r.status}`)
  }
  return b
}
