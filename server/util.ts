export const TZ = () => process.env.APP_TZ || 'Europe/Bucharest'

/** YYYY-MM-DD în fusul orar configurat */
export function localDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ID stabil: dacă e URL, scoate query/hash, www. și slash-ul final; altfel trim. */
export function normalizeJobId(raw: string): string {
  const s = raw.trim()
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const path = u.pathname.replace(/\/+$/, '')
      return `${u.protocol}//${u.hostname.replace(/^www\./, '').toLowerCase()}${path}`
    } catch { /* cade pe trim */ }
  }
  return s
}
