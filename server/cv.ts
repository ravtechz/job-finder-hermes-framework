import path from 'node:path'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

export class CvError extends Error {
  constructor(message: string, public status = 415) { super(message) }
}

/** Scoate textul dintr-un CV după extensia fișierului: pdf, docx, txt, md. */
export async function extractCvText(filename: string, data: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase()
  try {
    if (ext === '.pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(data))
      const { text } = await extractText(pdf, { mergePages: true })
      return text
    }
    if (ext === '.docx') return (await mammoth.extractRawText({ buffer: data })).value
  } catch {
    throw new CvError(`Nu pot citi fișierul ${ext.slice(1).toUpperCase()}. E corupt sau protejat cu parolă?`, 422)
  }
  if (ext === '.txt' || ext === '.md') return data.toString('utf8')
  throw new CvError(`Format nesuportat (${ext || 'fără extensie'}). Folosește PDF, DOCX, TXT sau MD.`)
}
