export type Verdict = 'APPLY' | 'MAYBE' | 'SKIP'
export type Status = 'new' | 'seen' | 'applied' | 'ignored'
export type Remote = 'remote' | 'hybrid' | 'onsite' | 'unknown'

export interface ScoreBreakdown {
  must_haves: number
  stack: number
  seniority: number
  location: number
  salary: number
  knockout: boolean
  knockout_reason: string | null
}

export interface Evaluation {
  score: number
  verdict: Verdict
  score_breakdown: ScoreBreakdown | null
  stale_cv: boolean
  stale_profile: boolean
  match: string[]
  missing: string[]
  red_flags: string[]
  vadim_comment: string | null
  evaluated_at: string
}

export interface CvSuggestion {
  cv_changes: string[]
  keywords_added: string[]
  questions_for_user: string[]
  tzanca_comment: string | null
  created_at: string
  stale_cv: boolean
}

export interface Job {
  job_id: string
  title: string
  company: string
  url: string
  location: string | null
  remote: Remote
  posted_date: string | null
  salary: string | null
  source: string | null
  verified_link: boolean
  verified_date: boolean
  found_at: string
  durian_comment: string | null
  description?: string | null
  status: Status
  evaluation: Evaluation | null
  cv_suggestion: CvSuggestion | null
}

export interface Stats {
  new_jobs: number
  apply: number
  maybe: number
  skip: number
  unevaluated: number
  avg_score: number | null
}

export interface Filters {
  mode: 'day' | 'week'
  date: string
  verdict: '' | Verdict
  minScore: string
  remote: '' | Remote
  status: '' | Status
}

export interface Profile {
  primary_stack: string[]
  secondary_stack: string[]
  years_experience: number | ''
  target_seniority: 'junior' | 'mid' | 'senior' | 'lead' | 'principal'
  min_salary: number | ''
  salary_currency: string
  salary_basis: 'net' | 'gross'
  locations: string[]
  work_modes: Exclude<Remote, 'unknown'>[]
  languages: string[]
  exclusions: string[]
  preferences: string
}
