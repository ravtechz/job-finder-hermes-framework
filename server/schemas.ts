import { z } from 'zod'
import { normalizeJobId } from './util.js'

const str = (name: string) =>
  z.string({ error: `${name} trebuie să fie text` }).trim().min(1, `${name} nu poate fi gol`)
const optStr = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().nullish().transform((v) => v ?? null),
)
const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v)
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v)
const bool = z.preprocess(
  (v) => (v === 'true' || v === 1 || v === '1' ? true : v === 'false' || v === 0 || v === '0' ? false : v),
  z.boolean({ error: 'trebuie să fie true sau false' }),
)
/** Acceptă array de stringuri; un string simplu devine array cu un element. */
const strList = z.preprocess(
  (v) => (typeof v === 'string' ? [v] : v ?? []),
  z.array(z.string({ error: 'elementele trebuie să fie text' }), { error: 'trebuie să fie un array de stringuri' }),
)

export const STATUSES = ['new', 'seen', 'applied', 'ignored'] as const
export const REMOTE = ['remote', 'hybrid', 'onsite', 'unknown'] as const
export const VERDICTS = ['APPLY', 'MAYBE', 'SKIP'] as const

export const DESCRIPTION_MAX = 10000

export const jobSchema = z
  .object({
    job_id: z.string().trim().min(1).optional(),
    title: str('title'),
    company: str('company'),
    url: z.url({ error: 'url trebuie să fie un URL complet (https://...)' }),
    location: optStr,
    remote: z.preprocess(lower, z.enum(REMOTE, { error: `remote trebuie să fie unul din: ${REMOTE.join(', ')}` })).default('unknown'),
    posted_date: z.preprocess(
      (v) => (v === '' ? null : v),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'posted_date trebuie să fie YYYY-MM-DD').nullish().transform((v) => v ?? null),
    ),
    salary: optStr,
    source: optStr,
    verified_link: bool.default(false),
    verified_date: bool.default(false),
    durian_comment: optStr,
    description: optStr.transform((v) => (v ? v.slice(0, DESCRIPTION_MAX) : v)),
  })
  .transform((j) => ({ ...j, job_id: normalizeJobId(j.job_id ?? j.url) }))

const component = (name: string, max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z
      .number({ error: (i) => (i.input === undefined ? `score_breakdown.${name} lipsește` : `score_breakdown.${name} trebuie să fie număr`) })
      .int(`score_breakdown.${name} trebuie să fie întreg`)
      .min(0, `score_breakdown.${name} minim 0`)
      .max(max, `score_breakdown.${name} maxim ${max}`),
  )

export const BREAKDOWN_MAX = { must_haves: 40, stack: 25, seniority: 15, location: 10, salary: 10 } as const

const breakdownSchema = z.object({
  must_haves: component('must_haves', BREAKDOWN_MAX.must_haves),
  stack: component('stack', BREAKDOWN_MAX.stack),
  seniority: component('seniority', BREAKDOWN_MAX.seniority),
  location: component('location', BREAKDOWN_MAX.location),
  salary: component('salary', BREAKDOWN_MAX.salary),
  knockout: bool,
  knockout_reason: optStr,
}, { error: 'score_breakdown e obligatoriu: {must_haves, stack, seniority, location, salary, knockout, knockout_reason}' })

export const evaluationSchema = z
  .object({
    job_id: str('job_id').transform(normalizeJobId),
    score: z.coerce.number({ error: 'score trebuie să fie număr' }).int('score trebuie să fie întreg').min(0, 'score minim 0').max(100, 'score maxim 100'),
    verdict: z.preprocess(upper, z.enum(VERDICTS, { error: `verdict trebuie să fie unul din: ${VERDICTS.join(', ')}` })),
    score_breakdown: breakdownSchema,
    match: strList,
    missing: strList,
    red_flags: strList,
    vadim_comment: optStr,
  })
  .superRefine((e, ctx) => {
    const b = e.score_breakdown
    const sum = b.must_haves + b.stack + b.seniority + b.location + b.salary
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
    if (!b.knockout) {
      if (Math.abs(e.score - sum) > 1) bad(['score'], `score (${e.score}) trebuie să fie suma componentelor din score_breakdown (${sum}), cu toleranță ±1`)
      return
    }
    if (!b.knockout_reason) bad(['score_breakdown', 'knockout_reason'], 'knockout_reason e obligatoriu când knockout=true')
    if (e.verdict !== 'SKIP') bad(['verdict'], 'verdict trebuie să fie SKIP când knockout=true')
    const expected = Math.min(sum, 30)
    if (Math.abs(e.score - expected) > 1) bad(['score'], `Cu knockout=true, score trebuie să fie min(suma=${sum}, 30) = ${expected} (±1), nu ${e.score}`)
  })
  .transform((e) => ({ ...e, score_breakdown: { ...e.score_breakdown, knockout_reason: e.score_breakdown.knockout ? e.score_breakdown.knockout_reason : null } }))

export const cvSuggestionSchema = z.object({
  job_id: str('job_id').transform(normalizeJobId),
  cv_changes: strList,
  keywords_added: strList,
  questions_for_user: strList,
  tzanca_comment: optStr,
})

export const verdictChangeSchema = z.object({
  verdict: z.preprocess(upper, z.enum(VERDICTS, { error: `verdict trebuie să fie unul din: ${VERDICTS.join(', ')}` })),
})

export const statusSchema = z.object({
  status: z.preprocess(lower, z.enum(STATUSES, { error: `status trebuie să fie unul din: ${STATUSES.join(', ')}` })),
})

export const listQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date trebuie să fie YYYY-MM-DD').optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  verdict: z.preprocess(upper, z.enum(VERDICTS)).optional(),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  remote: z.preprocess(lower, z.enum(REMOTE)).optional(),
  status: z.preprocess(lower, z.enum(STATUSES)).optional(),
})

export const cvTextSchema = z.object({
  text: z.string({ error: 'text trebuie să fie text' }).trim().min(20, 'text e prea scurt pentru un CV'),
  filename: z.string().trim().min(1).default('cv-lipit.txt'),
})

const tags = strList.transform((a) => [...new Set(a.map((x) => x.trim()).filter(Boolean))])
const numOrNull = (name: string) =>
  z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number({ error: `${name} trebuie să fie număr` }).min(0, `${name} minim 0`).nullable())

export const SENIORITY = ['junior', 'mid', 'senior', 'lead', 'principal'] as const
export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const

export const profileSchema = z.object({
  primary_stack: tags.refine((a) => a.length >= 1, 'primary_stack: cel puțin un element'),
  secondary_stack: tags,
  years_experience: z.coerce.number({ error: 'years_experience trebuie să fie număr' }).min(0, 'years_experience minim 0').max(60, 'years_experience maxim 60'),
  target_seniority: z.preprocess(lower, z.enum(SENIORITY, { error: `target_seniority trebuie să fie unul din: ${SENIORITY.join(', ')}` })),
  min_salary: numOrNull('min_salary'),
  salary_currency: z.preprocess(upper, z.string().min(2, 'salary_currency invalid').max(5, 'salary_currency invalid')).default('EUR'),
  salary_basis: z.preprocess((v) => (lower(v) === 'brut' ? 'gross' : lower(v)), z.enum(['net', 'gross'], { error: 'salary_basis trebuie să fie net sau gross' })).default('net'),
  locations: tags,
  work_modes: z.preprocess(
    (v) => (Array.isArray(v) ? v.map(lower) : v),
    z.array(z.enum(WORK_MODES, { error: `work_modes: valori permise ${WORK_MODES.join(', ')}` }), { error: `work_modes trebuie să fie un array cu: ${WORK_MODES.join(', ')}` }).min(1, 'work_modes: cel puțin un mod'),
  ).transform((a) => [...new Set(a)]),
  languages: tags,
  exclusions: tags,
  preferences: optStr.transform((v) => v ?? ''),
})
export type Profile = z.infer<typeof profileSchema>

export const pendingQuerySchema = (def: number) =>
  z.object({ limit: z.coerce.number().int().min(1, 'limit minim 1').max(100, 'limit maxim 100').default(def) })

export const reevaluateSchema = z.object({ dry_run: bool.optional() })
