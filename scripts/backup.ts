// Backup consistent al bazei (API-ul SQLite `backup`, sigur și cât timp serverul scrie). Păstrează ultimele BACKUP_KEEP copii.
import 'dotenv/config'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

process.umask(0o077) // copiile conțin CV-ul: doar proprietarul le citește
const src = path.resolve(process.env.DB_PATH || './data/jobs.db')
const dir = path.resolve(process.env.BACKUP_DIR || './backups')
const keep = Number(process.env.BACKUP_KEEP) || 14

if (!fs.existsSync(src)) { console.error(`Nu găsesc baza de date: ${src}`); process.exit(1) }
fs.mkdirSync(dir, { recursive: true, mode: 0o700 })

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const dest = path.join(dir, `jobs-${stamp}.db`)
const db = new Database(src, { fileMustExist: true })
await db.backup(dest)
db.close()

// copia devine un singur fișier (fără -wal/-shm) și e verificată înainte să o numim backup
const check = new Database(dest)
check.pragma('journal_mode = DELETE')
const result = check.pragma('integrity_check', { simple: true })
check.close()
if (result !== 'ok') { fs.rmSync(dest); console.error(`Backup invalid (${result}); copia a fost ștearsă.`); process.exit(1) }

const all = fs.readdirSync(dir).filter((f) => /^jobs-.*\.db$/.test(f)).sort()
for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dir, old))
console.log(`Backup: ${dest} (${fs.statSync(dest).size} octeți, ${Math.min(all.length, keep)} păstrate din ${all.length})`)
