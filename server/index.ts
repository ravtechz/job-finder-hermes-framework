import 'dotenv/config'
import bcrypt from 'bcryptjs'
import express, { type NextFunction, type Request, type Response } from 'express'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z, ZodError, type ZodType } from 'zod'
import { openDb } from './db.js'
import { addDays, localDate, normalizeJobId } from './util.js'
import { formatProfile } from './profile.js'
import { CvError, extractCvText } from './cv.js'
import { cvSuggestionSchema, evaluationSchema, jobSchema, listQuerySchema, statusSchema, cvTextSchema, profileSchema, pendingQuerySchema, reevaluateSchema, verdictChangeSchema, type Profile } from './schemas.js'

const db = openDb()
const app = express()
app.disable('x-powered-by')

// ---------- Autentificare ----------
// Trei feluri de clienți:
//  - agenții trimit X-Agent-Key = AGENT_KEY și ating DOAR rutele din AGENT_ROUTES (restul: 403);
//  - orchestratorul (Milchick) trimite X-Agent-Key = ORCH_KEY și poate doar CITI rutele din ORCH_ROUTES;
//  - UI-ul (fără X-Agent-Key) are acces complet, protejat de Basic Auth dacă e configurat.
// Cheia agenților restricționează cu adevărat doar dacă Basic Auth e activ: altfel un client care
// omite header-ul primește acces de UI.
const { DASH_USER, DASH_PASS, DASH_PASS_HASH, AGENT_KEY, ORCH_KEY } = process.env
let passHash = DASH_PASS_HASH
if (passHash && !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passHash)) {
  // oprim pornirea în loc să rămânem fără parolă: de obicei hash-ul a fost mutilat de un shell ($...) sau lipit incomplet
  console.error("DASH_PASS_HASH nu e un hash bcrypt valid. Generează unul cu 'npm run hash-password' și pune-l între ghilimele simple în .env.")
  process.exit(1)
}
if (!passHash && DASH_PASS) {
  console.warn('Atenție: DASH_PASS în clar e depășit. Folosește DASH_PASS_HASH (npm run hash-password).')
  passHash = bcrypt.hashSync(DASH_PASS, 10)
}
const basicAuth = !!(DASH_USER && passHash)
const sha = (s: string) => crypto.createHash('sha256').update(s).digest()
const same = (a: string, b: string) => crypto.timingSafeEqual(sha(a), sha(b))

const AGENT_ROUTES = new Set([
  'GET /api/jobs/seen', 'POST /api/jobs', 'GET /api/jobs/pending-evaluation', 'GET /api/jobs/pending-cv',
  'GET /api/profile', 'GET /api/cv', 'GET /api/cv/file', 'POST /api/evaluations', 'POST /api/cv-suggestions',
])

// Orchestratorul doar citește: verificarea progresului și detaliul unui job. Fără scrieri.
const ORCH_ROUTES = new Set(['GET /api/jobs/pending-evaluation', 'GET /api/stats'])
const ORCH_JOB_DETAIL = /^\/api\/jobs\/(?!(?:seen|pending-evaluation|pending-cv|reevaluate-active)$)[^/]+$/

app.use((req, res, next) => {
  const key = req.headers['x-agent-key']
  if (key === undefined) return next()
  const isAgent = !!AGENT_KEY && typeof key === 'string' && same(key, AGENT_KEY)
  const isOrch = !!ORCH_KEY && typeof key === 'string' && same(key, ORCH_KEY)
  if (!isAgent && !isOrch) {
    res.status(401).json({ error: 'invalid_agent_key', message: 'X-Agent-Key lipsește, e greșit sau serverul nu are cheia configurată (AGENT_KEY / ORCH_KEY).' })
    return
  }
  // req.path e cel brut (fără decodare): orice variantă codificată sau neobișnuită iese din lista de mai sus
  const path = req.path.replace(/\/$/, '')
  const route = `${req.method} ${path}`
  const allowed = isAgent
    ? AGENT_ROUTES.has(route)
    : ORCH_ROUTES.has(route) || (req.method === 'GET' && ORCH_JOB_DETAIL.test(path))
  if (!allowed) {
    res.status(403).json({
      error: 'agent_forbidden',
      message: isAgent
        ? `Cu X-Agent-Key sunt permise doar: ${[...AGENT_ROUTES].join(', ')}.`
        : `Cu cheia orchestratorului sunt permise doar: ${[...ORCH_ROUTES].join(', ')}, GET /api/jobs/:job_id.`,
    })
    return
  }
  // cerere de agent validă: sare peste Basic Auth, dar rămâne în rutele permise
  ;(req as Request & { agent?: boolean }).agent = true
  next()
})

// Antetele Basic deja verificate (reținem doar sha256 al antetului, nu parola) ca bcrypt să nu ruleze la fiecare cerere
const verified = new Set<string>()

if (basicAuth) {
  app.use(async (req, res, next) => {
    if ((req as Request & { agent?: boolean }).agent) return next()
    const h = req.headers.authorization || ''
    if (h.startsWith('Basic ')) {
      const key = sha(h).toString('hex')
      if (verified.has(key)) return next()
      const [user, ...rest] = Buffer.from(h.slice(6), 'base64').toString().split(':')
      // bcrypt rulează mereu, ca timpul de răspuns să nu arate dacă utilizatorul există
      const passOk = await bcrypt.compare(rest.join(':'), passHash!)
      if (same(user, DASH_USER!) && passOk) {
        if (verified.size >= 100) verified.clear()
        verified.add(key)
        return next()
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="Job Dashboard"').status(401).json({ error: 'unauthorized' })
  })
}

app.use(express.json({ limit: '1mb' }))

// ---------- helpers ----------
class HttpError extends Error {
  constructor(public status: number, message: string, public extra: object = {}) { super(message) }
}

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  throw r.error
}

const wrap = (fn: (req: Request, res: Response) => void) => (req: Request, res: Response, next: NextFunction) => {
  try { fn(req, res) } catch (e) { next(e) }
}

const now = () => new Date().toISOString()
const json = (v: unknown) => JSON.stringify(v)
const arr = (s: string | null) => { try { return JSON.parse(s ?? '[]') } catch { return [] } }

interface Row {
  [k: string]: any
}

/** CV-ul și profilul curente: servesc la marcarea evaluărilor făcute pe date vechi. */
function currentVersions() {
  const cv = db.prepare('SELECT uploaded_at FROM cv WHERE id = 1').get() as Row | undefined
  const profile = db.prepare('SELECT updated_at FROM profile WHERE id = 1').get() as Row | undefined
  return { cv: (cv?.uploaded_at ?? null) as string | null, profile: (profile?.updated_at ?? null) as string | null }
}

type Versions = ReturnType<typeof currentVersions>

function shapeJob(r: Row, cur: Versions, withDescription = false) {
  const {
    ev_score, ev_verdict, ev_match, ev_missing, ev_red_flags, ev_comment, ev_at, ev_breakdown, ev_cv_at, ev_profile_at, ev_orig, ev_cv_req,
    cv_changes, cv_keywords, cv_questions, cv_comment, cv_at, cv_cv_at, description, ...job
  } = r
  return {
    ...job,
    ...(withDescription && { description }),
    verified_link: !!job.verified_link,
    verified_date: !!job.verified_date,
    evaluation: ev_verdict
      ? {
          job_id: job.job_id, score: ev_score, verdict: ev_verdict, score_breakdown: ev_breakdown ? JSON.parse(ev_breakdown) : null,
          match: arr(ev_match), missing: arr(ev_missing), red_flags: arr(ev_red_flags), vadim_comment: ev_comment, evaluated_at: ev_at,
          cv_uploaded_at: ev_cv_at, profile_updated_at: ev_profile_at,
          verdict_manual: !!ev_orig, original_verdict: ev_orig ?? null, cv_requested_at: ev_cv_req ?? null,
          stale_cv: cur.cv !== null && ev_cv_at !== cur.cv,
          stale_profile: cur.profile !== null && ev_profile_at !== cur.profile,
        }
      : null,
    cv_suggestion: cv_at
      ? {
          job_id: job.job_id, cv_changes: arr(cv_changes), keywords_added: arr(cv_keywords), questions_for_user: arr(cv_questions),
          tzanca_comment: cv_comment, created_at: cv_at, cv_uploaded_at: cv_cv_at, stale_cv: cur.cv !== null && cv_cv_at !== cur.cv,
        }
      : null,
  }
}

const SELECT = `
  SELECT j.*, e.score AS ev_score, e.verdict AS ev_verdict, e.match AS ev_match, e.missing AS ev_missing,
         e.red_flags AS ev_red_flags, e.vadim_comment AS ev_comment, e.evaluated_at AS ev_at,
         e.score_breakdown AS ev_breakdown, e.cv_uploaded_at AS ev_cv_at, e.profile_updated_at AS ev_profile_at,
         e.original_verdict AS ev_orig, e.cv_requested_at AS ev_cv_req,
         c.cv_changes, c.keywords_added AS cv_keywords, c.questions_for_user AS cv_questions,
         c.tzanca_comment AS cv_comment, c.created_at AS cv_at, c.cv_uploaded_at AS cv_cv_at
  FROM jobs j
  LEFT JOIN evaluations e ON e.job_id = j.job_id
  LEFT JOIN cv_suggestions c ON c.job_id = j.job_id`

function getJob(jobId: string) {
  const r = db.prepare(`${SELECT} WHERE j.job_id = ?`).get(jobId) as Row | undefined
  return r ? shapeJob(r, currentVersions(), true) : null
}

function requireJob(jobId: string) {
  if (!db.prepare('SELECT 1 FROM jobs WHERE job_id = ?').get(jobId)) {
    throw new HttpError(404, `Jobul "${jobId}" nu există. Trimite mai întâi POST /api/jobs.`, { code: 'job_not_found' })
  }
}

function dateRange(q: { date?: string; days?: number }) {
  const today = localDate()
  if (q.days) return { from: addDays(today, -(q.days - 1)), to: today }
  const d = q.date ?? today
  return { from: d, to: d }
}

// ---------- API ----------
const api = express.Router()

api.post('/jobs', wrap((req, res) => {
  const j = parse(jobSchema, req.body)
  const exists = db.prepare('SELECT 1 FROM jobs WHERE job_id = ?').get(j.job_id)
  if (exists) { res.status(200).json({ duplicate: true, job_id: j.job_id }); return }
  const t = new Date()
  db.prepare(`
    INSERT INTO jobs (job_id, title, company, url, location, remote, posted_date, salary, source,
                      verified_link, verified_date, found_at, found_date, durian_comment, description)
    VALUES (@job_id, @title, @company, @url, @location, @remote, @posted_date, @salary, @source,
            @verified_link, @verified_date, @found_at, @found_date, @durian_comment, @description)`)
    .run({ ...j, verified_link: +j.verified_link, verified_date: +j.verified_date, found_at: t.toISOString(), found_date: localDate(t) })
  res.status(201).json({ duplicate: false, job_id: j.job_id })
}))

api.get('/jobs/seen', wrap((req, res) => {
  const raw = String(req.query.ids ?? '')
  const ids = [...new Set(raw.split(',').map(normalizeJobId).filter(Boolean))]
  if (!ids.length) throw new HttpError(400, 'Parametrul ids e obligatoriu: /api/jobs/seen?ids=a,b,c')
  const found = new Set(
    (db.prepare(`SELECT job_id FROM jobs WHERE job_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Row[]).map((r) => r.job_id),
  )
  res.json({ seen: ids.filter((i) => found.has(i)), new: ids.filter((i) => !found.has(i)) })
}))

api.get('/jobs', wrap((req, res) => {
  const q = parse(listQuerySchema, req.query)
  const { from, to } = dateRange(q)
  const where = ['j.found_date BETWEEN @from AND @to']
  const params: Row = { from, to }
  if (q.verdict) { where.push('e.verdict = @verdict'); params.verdict = q.verdict }
  if (q.min_score !== undefined) { where.push('e.score >= @min_score'); params.min_score = q.min_score }
  if (q.remote) { where.push('j.remote = @remote'); params.remote = q.remote }
  if (q.status) { where.push('j.status = @status'); params.status = q.status }
  const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')}
    ORDER BY e.score IS NULL, e.score DESC, j.found_at DESC`).all(params) as Row[]
  const cur = currentVersions()
  res.json({ from, to, count: rows.length, jobs: rows.map((r) => shapeJob(r, cur)) })
}))

function requireCv() {
  const cv = currentVersions().cv
  if (!cv) throw new HttpError(409, 'Nu există CV încărcat. Încarcă-l din dashboard (tab-ul CV) înainte să trimiți evaluări sau sugestii.', { code: 'cv_not_found' })
  return cv
}

function requireProfile() {
  const p = currentVersions().profile
  if (!p) throw new HttpError(409, 'Nu există profil. Completează-l din dashboard (tab-ul Profil) înainte să trimiți evaluări.', { code: 'profile_not_found' })
  return p
}

api.post('/evaluations', wrap((req, res) => {
  const e = parse(evaluationSchema, req.body)
  requireJob(e.job_id)
  const cvAt = requireCv()
  const profileAt = requireProfile()
  const existed = db.prepare('SELECT 1 FROM evaluations WHERE job_id = ?').get(e.job_id)
  db.prepare(`
    INSERT INTO evaluations (job_id, score, verdict, score_breakdown, match, missing, red_flags, vadim_comment, evaluated_at, cv_uploaded_at, profile_updated_at)
    VALUES (@job_id, @score, @verdict, @score_breakdown, @match, @missing, @red_flags, @vadim_comment, @at, @cv_at, @profile_at)
    ON CONFLICT(job_id) DO UPDATE SET score=excluded.score, verdict=excluded.verdict, score_breakdown=excluded.score_breakdown,
      match=excluded.match, missing=excluded.missing, red_flags=excluded.red_flags, vadim_comment=excluded.vadim_comment,
      evaluated_at=excluded.evaluated_at, cv_uploaded_at=excluded.cv_uploaded_at, profile_updated_at=excluded.profile_updated_at,
      original_verdict=NULL, cv_requested_at=NULL`)
    .run({ ...e, score_breakdown: json(e.score_breakdown), match: json(e.match), missing: json(e.missing), red_flags: json(e.red_flags), at: now(), cv_at: cvAt, profile_at: profileAt })
  res.status(existed ? 200 : 201).json({ ok: true, updated: !!existed, job_id: e.job_id })
}))

api.post('/cv-suggestions', wrap((req, res) => {
  const c = parse(cvSuggestionSchema, req.body)
  requireJob(c.job_id)
  const cvAt = requireCv()
  const ev = db.prepare('SELECT verdict FROM evaluations WHERE job_id = ?').get(c.job_id) as Row | undefined
  if (ev?.verdict !== 'APPLY') {
    throw new HttpError(409, ev ? `Jobul are verdictul ${ev.verdict}; sugestiile de CV se acceptă doar pentru APPLY.` : 'Jobul nu are încă evaluare; sugestiile de CV se acceptă doar pentru joburi cu verdict APPLY.', { code: 'not_apply', verdict: ev?.verdict ?? null })
  }
  const existed = db.prepare('SELECT 1 FROM cv_suggestions WHERE job_id = ?').get(c.job_id)
  db.prepare(`
    INSERT INTO cv_suggestions (job_id, cv_changes, keywords_added, questions_for_user, tzanca_comment, created_at, cv_uploaded_at)
    VALUES (@job_id, @cv_changes, @keywords_added, @questions_for_user, @tzanca_comment, @at, @cv_at)
    ON CONFLICT(job_id) DO UPDATE SET cv_changes=excluded.cv_changes, keywords_added=excluded.keywords_added,
      questions_for_user=excluded.questions_for_user, tzanca_comment=excluded.tzanca_comment, created_at=excluded.created_at,
      cv_uploaded_at=excluded.cv_uploaded_at`)
    .run({ ...c, cv_changes: json(c.cv_changes), keywords_added: json(c.keywords_added), questions_for_user: json(c.questions_for_user), at: now(), cv_at: cvAt })
  res.status(existed ? 200 : 201).json({ ok: true, updated: !!existed, job_id: c.job_id })
}))

// ---------- joburi în așteptare (pentru agenți) ----------
// joburile deja aplicate sau ignorate nu mai merită evaluate
const PENDING_STATUS = "j.status NOT IN ('applied','ignored')"
api.get('/jobs/pending-evaluation', wrap((req, res) => {
  const { limit } = parse(pendingQuerySchema(20), req.query)
  const rows = db.prepare(`${SELECT} WHERE ${PENDING_STATUS} AND e.job_id IS NULL ORDER BY j.found_at ASC, j.id ASC LIMIT ?`).all(limit) as Row[]
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM jobs j LEFT JOIN evaluations e ON e.job_id = j.job_id WHERE ${PENDING_STATUS} AND e.job_id IS NULL`).get() as Row).n
  const cur = currentVersions()
  res.json({ count: rows.length, total_pending: total, jobs: rows.map((r) => shapeJob(r, cur, true)) })
}))

// ?requested=1: doar joburile pentru care utilizatorul a cerut sugestii din UI (butonul „Marchează APPLY”). O cerere
// explicită trece peste excluderea Aplicat/Ignorat.
const pendingCvQuery = (limit: number) => pendingQuerySchema(limit).extend({ requested: z.enum(['1', 'true']).optional() })

api.get('/jobs/pending-cv', wrap((req, res) => {
  const { limit, requested } = parse(pendingCvQuery(10), req.query)
  const where = requested
    ? `e.verdict = 'APPLY' AND e.cv_requested_at IS NOT NULL AND c.job_id IS NULL`
    : `${PENDING_STATUS} AND e.verdict = 'APPLY' AND c.job_id IS NULL`
  const order = requested ? 'e.cv_requested_at ASC' : 'j.found_at ASC, j.id ASC'
  const rows = db.prepare(`${SELECT} WHERE ${where} ORDER BY ${order} LIMIT ?`).all(limit) as Row[]
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM jobs j JOIN evaluations e ON e.job_id = j.job_id LEFT JOIN cv_suggestions c ON c.job_id = j.job_id WHERE ${where}`).get() as Row).n
  const cur = currentVersions()
  res.json({ count: rows.length, total_pending: total, jobs: rows.map((r) => shapeJob(r, cur, true)) })
}))

// ---------- reevaluare (din UI) ----------
const ACTIVE_WITH_RESULTS = `status IN ('new','seen') AND (
  EXISTS (SELECT 1 FROM evaluations e WHERE e.job_id = jobs.job_id) OR EXISTS (SELECT 1 FROM cv_suggestions c WHERE c.job_id = jobs.job_id))`

api.post('/jobs/reevaluate-active', wrap((req, res) => {
  const { dry_run } = parse(reevaluateSchema, req.body ?? {})
  const ids = (db.prepare(`SELECT job_id FROM jobs WHERE ${ACTIVE_WITH_RESULTS}`).all() as Row[]).map((r) => r.job_id)
  if (!dry_run) {
    db.transaction(() => {
      for (const id of ids) {
        db.prepare('DELETE FROM evaluations WHERE job_id = ?').run(id)
        db.prepare('DELETE FROM cv_suggestions WHERE job_id = ?').run(id)
      }
    })()
  }
  res.json({ ok: true, dry_run: !!dry_run, affected: ids.length })
}))

api.post('/jobs/:job_id/reevaluate', wrap((req, res) => {
  const jobId = normalizeJobId(String(req.params.job_id))
  requireJob(jobId)
  db.transaction(() => {
    db.prepare('DELETE FROM evaluations WHERE job_id = ?').run(jobId)
    db.prepare('DELETE FROM cv_suggestions WHERE job_id = ?').run(jobId)
  })()
  res.json({ ok: true, job_id: jobId })
}))

api.get('/jobs/:job_id', wrap((req, res) => {
  const job = getJob(normalizeJobId(String(req.params.job_id)))
  if (!job) throw new HttpError(404, 'Jobul nu există.', { code: 'job_not_found' })
  res.json(job)
}))

// Utilizatorul poate schimba verdictul lui Vadim (de ex. MAYBE -> APPLY). Doar din UI: nu e în rutele agenților.
// Verdictul inițial se păstrează în original_verdict (null = nemodificat). La APPLY se înregistrează cererea către Tzanca,
// pe care o preia scriptul deploy/tzanca-runner.sh. O evaluare nouă de la Vadim șterge modificarea manuală.
api.patch('/jobs/:job_id/verdict', wrap((req, res) => {
  const jobId = normalizeJobId(String(req.params.job_id))
  const { verdict } = parse(verdictChangeSchema, req.body)
  requireJob(jobId)
  const ev = db.prepare('SELECT verdict, original_verdict FROM evaluations WHERE job_id = ?').get(jobId) as Row | undefined
  if (!ev) throw new HttpError(409, 'Jobul nu are încă evaluare; verdictul se poate schimba doar după ce Vadim îl evaluează.', { code: 'not_evaluated' })
  const original = ev.original_verdict ?? ev.verdict
  const manual = verdict !== original
  const requestCv = verdict === 'APPLY' && ev.verdict !== 'APPLY'
  db.prepare(`UPDATE evaluations SET verdict = @verdict, original_verdict = @orig,
      cv_requested_at = CASE WHEN @verdict != 'APPLY' THEN NULL WHEN @req THEN @at ELSE cv_requested_at END
    WHERE job_id = @id`)
    .run({ verdict, orig: manual ? original : null, req: requestCv ? 1 : 0, at: now(), id: jobId })
  res.json({ ok: true, job_id: jobId, verdict, original_verdict: manual ? original : null, cv_requested: verdict === 'APPLY' })
}))

api.patch('/jobs/:job_id/status', wrap((req, res) => {
  const jobId = normalizeJobId(String(req.params.job_id))
  const { status } = parse(statusSchema, req.body)
  requireJob(jobId)
  db.prepare('UPDATE jobs SET status = ? WHERE job_id = ?').run(status, jobId)
  res.json({ ok: true, job_id: jobId, status })
}))

api.get('/stats', wrap((req, res) => {
  const q = parse(listQuerySchema.pick({ date: true, days: true }), req.query)
  const { from, to } = dateRange(q)
  const r = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(e.verdict = 'APPLY') AS apply, SUM(e.verdict = 'MAYBE') AS maybe, SUM(e.verdict = 'SKIP') AS skip,
      SUM(e.verdict IS NULL) AS unevaluated, AVG(e.score) AS avg_score
    FROM jobs j LEFT JOIN evaluations e ON e.job_id = j.job_id
    WHERE j.found_date BETWEEN ? AND ?`).get(from, to) as Row
  res.json({
    from, to,
    new_jobs: r.total, apply: r.apply ?? 0, maybe: r.maybe ?? 0, skip: r.skip ?? 0,
    unevaluated: r.unevaluated ?? 0,
    avg_score: r.avg_score === null ? null : Math.round(r.avg_score * 10) / 10,
    top_apply: db.prepare(`
      SELECT j.job_id, j.title, j.company, e.score FROM jobs j JOIN evaluations e ON e.job_id = j.job_id
      WHERE j.found_date BETWEEN ? AND ? AND e.verdict = 'APPLY' AND ${PENDING_STATUS}
      ORDER BY e.score DESC, j.found_date DESC LIMIT 3`).all(from, to),
  })
}))

// ---------- poze pentru agenți (doar din UI; agenții nu au acces) ----------
const AVATAR_AGENTS = ['durian', 'vadim', 'tzanca', 'milchick'] as const
const AVATAR_MAX = 2 * 1024 * 1024
// parserul acceptă până la 10 MB ca să putem răspunde clar „peste 2 MB”; verificarea reală e în rută
const avatarBody = express.raw({ type: () => true, limit: 10 * 1024 * 1024 })

/** Tipul real după primii octeți, nu după ce declară clientul. SVG nu e acceptat: poate conține scripturi. */
function sniffImage(b: Buffer): string | null {
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return 'image/gif'
  return null
}

function avatarAgent(param: unknown) {
  const a = String(param)
  if (!(AVATAR_AGENTS as readonly string[]).includes(a)) throw new HttpError(404, 'Agent necunoscut. Folosește: durian, vadim, tzanca, milchick.', { code: 'agent_not_found' })
  return a
}

api.get('/avatars', wrap((_req, res) => {
  const rows = db.prepare('SELECT agent, updated_at FROM agent_avatars').all() as Row[]
  res.json(Object.fromEntries(AVATAR_AGENTS.map((a) => [a, rows.find((r) => r.agent === a)?.updated_at ?? null])))
}))

api.get('/avatars/:agent', wrap((req, res) => {
  const agent = avatarAgent(req.params.agent)
  const r = db.prepare('SELECT mime, image, updated_at FROM agent_avatars WHERE agent = ?').get(agent) as Row | undefined
  if (!r) throw new HttpError(404, 'Agentul nu are poză.', { code: 'avatar_not_found' })
  // URL-ul din UI poartă ?v=updated_at, deci poate fi păstrat în cache fără risc de poză veche
  res.set({ 'Content-Type': r.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400', 'Content-Security-Policy': "default-src 'none'" })
  res.send(r.image)
}))

api.put('/avatars/:agent', avatarBody, wrap((req, res) => {
  const agent = avatarAgent(req.params.agent)
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  if (!body.length) throw new HttpError(400, 'Trimite imaginea ca body (PNG, JPEG, WebP sau GIF), cu Content-Type: image/...', { code: 'empty_body' })
  if (body.length > AVATAR_MAX) throw new HttpError(413, 'Poza depășește 2 MB.', { code: 'too_large' })
  const mime = sniffImage(body)
  if (!mime) throw new HttpError(415, 'Format nesuportat. Folosește PNG, JPEG, WebP sau GIF (SVG nu e permis).', { code: 'unsupported_format' })
  const at = now()
  db.prepare(`INSERT INTO agent_avatars (agent, mime, image, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(agent) DO UPDATE SET mime = excluded.mime, image = excluded.image, updated_at = excluded.updated_at`).run(agent, mime, body, at)
  res.json({ ok: true, agent, mime, size: body.length, updated_at: at })
}))

api.delete('/avatars/:agent', wrap((req, res) => {
  const agent = avatarAgent(req.params.agent)
  db.prepare('DELETE FROM agent_avatars WHERE agent = ?').run(agent)
  res.json({ ok: true, agent })
}))

// ---------- CV (unic; îl citesc Vadim și Tzanca) ----------
const CV_MAX = 10 * 1024 * 1024
const rawBody = express.raw({ type: (req) => !String(req.headers['content-type'] ?? '').includes('json'), limit: CV_MAX })

api.get('/cv', wrap((req, res) => {
  const r = db.prepare('SELECT filename, mime, text, uploaded_at, length(file) AS size FROM cv WHERE id = 1').get() as Row | undefined
  if (!r) throw new HttpError(404, 'Nu există CV încărcat. Încarcă-l din dashboard (pagina CV) sau cu POST /api/cv.', { code: 'cv_not_found' })
  if (req.query.format === 'text') { res.type('text/plain; charset=utf-8').send(r.text); return }
  res.json({ filename: r.filename, uploaded_at: r.uploaded_at, size: r.size, chars: r.text.length, text: r.text })
}))

api.get('/cv/file', wrap((_req, res) => {
  const r = db.prepare('SELECT filename, mime, file FROM cv WHERE id = 1').get() as Row | undefined
  if (!r?.file) throw new HttpError(404, 'Nu există fișier original salvat.')
  res.set({ 'Content-Type': r.mime || 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}` }).send(r.file)
}))

// Fie JSON {"text": "...", "filename": "cv.md"}, fie fișierul brut (PDF/DOCX/TXT/MD) cu ?filename=cv.pdf
api.post('/cv', rawBody, async (req, res) => {
  let filename: string, mime: string | null, text: string, file: Buffer | null
  if (Buffer.isBuffer(req.body) && req.body.length) {
    filename = String(req.query.filename || '').trim()
    if (!filename) throw new HttpError(400, 'Lipsește ?filename= (ex. /api/cv?filename=cv.pdf), pe baza extensiei aflu tipul fișierului.')
    file = req.body
    mime = String(req.headers['content-type'] ?? '') || null
    text = await extractCvText(filename, file)
  } else {
    const b = parse(cvTextSchema, req.body)
    filename = b.filename; mime = 'text/plain'; text = b.text; file = null
  }
  text = text.replace(/\r\n/g, '\n').trim()
  if (text.length < 20) throw new HttpError(422, 'Nu am găsit text în CV (PDF scanat/imagine?). Încarcă un PDF cu text selectabil, un DOCX, sau lipește textul.', { code: 'cv_empty' })
  db.prepare(`INSERT INTO cv (id, filename, mime, text, file, uploaded_at) VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, mime=excluded.mime, text=excluded.text, file=excluded.file, uploaded_at=excluded.uploaded_at`)
    .run(filename, mime, text, file, now())
  res.status(201).json({ ok: true, filename, chars: text.length })
})

api.delete('/cv', wrap((_req, res) => {
  db.prepare('DELETE FROM cv WHERE id = 1').run()
  res.json({ ok: true })
}))

// ---------- Profil (unic; agenții doar îl citesc) ----------
api.get('/profile', wrap((req, res) => {
  const r = db.prepare('SELECT data, updated_at FROM profile WHERE id = 1').get() as Row | undefined
  if (!r) throw new HttpError(404, 'Nu există profil. Completează-l din dashboard (tab-ul Profil).', { code: 'profile_not_found' })
  const data = JSON.parse(r.data) as Profile
  if (req.query.format === 'text') { res.type('text/plain; charset=utf-8').send(formatProfile(data, r.updated_at)); return }
  res.json({ ...data, updated_at: r.updated_at })
}))

api.put('/profile', wrap((req, res) => {
  const p = parse(profileSchema, req.body)
  const data = json(p)
  const prev = db.prepare('SELECT data, updated_at FROM profile WHERE id = 1').get() as Row | undefined
  // dacă nu s-a schimbat nimic, păstrăm data: altfel un "Salvează" gol ar marca toate evaluările drept vechi
  const updatedAt = prev && JSON.stringify(JSON.parse(prev.data)) === data ? prev.updated_at : now()
  db.prepare(`INSERT INTO profile (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(data, updatedAt)
  res.json({ ok: true, changed: updatedAt !== prev?.updated_at, updated_at: updatedAt })
}))

api.use((_req, _res, next) => next(new HttpError(404, 'Endpoint inexistent')))
app.use('/api', api)

// ---------- frontend ----------
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// ---------- erori ----------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Datele trimise sunt invalide. Corectează câmpurile de mai jos și retrimite.',
      details: err.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message })),
    })
    return
  }
  if (err instanceof CvError) { res.status(err.status).json({ error: err.status === 415 ? 'unsupported_format' : 'unreadable_file', message: err.message }); return }
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message, ...err.extra }); return }
  if ((err as any)?.type === 'entity.too.large') {
    res.status(413).json({ error: 'too_large', message: 'Fișierul depășește 10 MB.' })
    return
  }
  if ((err as any)?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json', message: 'Body-ul nu e JSON valid. Trimite Content-Type: application/json și JSON corect.' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})

const port = Number(process.env.PORT) || 3333
const host = process.env.HOST || '127.0.0.1'
app.listen(port, host, () => {
  console.log(`Job Dashboard pe http://${host}:${port} (Basic Auth: ${basicAuth ? 'activ' : 'oprit'}, cheie agenți: ${AGENT_KEY ? 'setată' : 'nesetată'})`)
  if (AGENT_KEY && AGENT_KEY.length < 16) console.warn('Atenție: AGENT_KEY e scurtă (sub 16 caractere).')
  if (AGENT_KEY && !basicAuth) console.warn('Atenție: fără Basic Auth, restricțiile pentru agenți se pot ocoli omițând X-Agent-Key.')
})
