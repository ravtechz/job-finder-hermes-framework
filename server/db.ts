import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function openDb(file = process.env.DB_PATH || './data/jobs.db') {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      url TEXT NOT NULL,
      location TEXT,
      remote TEXT NOT NULL DEFAULT 'unknown' CHECK (remote IN ('remote','hybrid','onsite','unknown')),
      posted_date TEXT,
      salary TEXT,
      source TEXT,
      verified_link INTEGER NOT NULL DEFAULT 0,
      verified_date INTEGER NOT NULL DEFAULT 0,
      found_at TEXT NOT NULL,
      found_date TEXT NOT NULL,
      durian_comment TEXT,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','applied','ignored'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_found_date ON jobs(found_date);
    CREATE TABLE IF NOT EXISTS evaluations (
      job_id TEXT PRIMARY KEY REFERENCES jobs(job_id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('APPLY','MAYBE','SKIP')),
      match TEXT NOT NULL DEFAULT '[]',
      missing TEXT NOT NULL DEFAULT '[]',
      red_flags TEXT NOT NULL DEFAULT '[]',
      vadim_comment TEXT,
      evaluated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cv_suggestions (
      job_id TEXT PRIMARY KEY REFERENCES jobs(job_id) ON DELETE CASCADE,
      cv_changes TEXT NOT NULL DEFAULT '[]',
      keywords_added TEXT NOT NULL DEFAULT '[]',
      questions_for_user TEXT NOT NULL DEFAULT '[]',
      tzanca_comment TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cv (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      filename TEXT NOT NULL,
      mime TEXT,
      text TEXT NOT NULL,
      file BLOB,
      uploaded_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // Migrări pentru baze create înainte de aceste câmpuri
  const addColumn = (table: string, col: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`)
  }
  addColumn('jobs', 'description', 'TEXT')
  addColumn('evaluations', 'score_breakdown', 'TEXT') // JSON; null doar la evaluări vechi
  addColumn('evaluations', 'cv_uploaded_at', 'TEXT')
  addColumn('evaluations', 'profile_updated_at', 'TEXT')
  addColumn('cv_suggestions', 'cv_uploaded_at', 'TEXT')
  return db
}

export type Db = ReturnType<typeof openDb>
