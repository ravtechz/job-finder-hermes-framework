import path from 'node:path'
import mammoth from 'mammoth'
import { fileURLToPath } from 'node:url'
import { createWorker } from 'tesseract.js'
import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf'

export class CvError extends Error {
  constructor(message: string, public status = 415) { super(message) }
}

/** PDF-urile „tipărite” ca imagine/contururi nu au strat de text: rămân doar iconițe și numere de pagină. */
function isReadable(text: string) {
  const letters = text.replace(/page:?\s*\d+\s*\/\s*\d+/gi, '').match(/\p{L}/gu)?.length ?? 0
  return letters >= 100
}

const OCR_MAX_PAGES = 10
const TESSDATA = fileURLToPath(new URL('./tessdata', import.meta.url))

/** OCR pe paginile randate, pentru PDF-uri fără strat de text. Limbi: română + engleză, date incluse local (fără internet). */
async function ocrPdf(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string> {
  const pages = Math.min(pdf.numPages, OCR_MAX_PAGES)
  const worker = await createWorker(['ron', 'eng'], 1, { langPath: TESSDATA, cacheMethod: 'none', gzip: true })
  try {
    const out: string[] = []
    for (let i = 1; i <= pages; i++) {
      const png = await renderPageAsImage(pdf, i, { canvasImport: () => import('@napi-rs/canvas'), scale: 2.5 })
      const { data } = await worker.recognize(Buffer.from(png))
      out.push(data.text.replace(/^\s*page:?\s*\d+\s*\/\s*\d+\s*$/gim, '').trim())
    }
    return out.join('\n\n')
  } finally {
    await worker.terminate()
  }
}

/** Scoate textul dintr-un CV după extensia fișierului: pdf, docx, txt, md. */
export async function extractCvText(filename: string, data: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase()
  let pdfText: string | null = null
  try {
    if (ext === '.pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(data))
      const { text } = await extractText(pdf, { mergePages: true })
      pdfText = isReadable(text) ? text : await ocrPdf(pdf)
    }
    if (ext === '.docx') return (await mammoth.extractRawText({ buffer: data })).value
  } catch {
    throw new CvError(`Nu pot citi fișierul ${ext.slice(1).toUpperCase()}. E corupt sau protejat cu parolă?`, 422)
  }
  if (pdfText !== null) {
    if (!isReadable(pdfText)) throw new CvError(
      'Nu am găsit text în PDF, nici cu OCR (scanare de calitate slabă?). Încarcă un DOCX/TXT sau lipește textul CV-ului.', 422)
    return pdfText
  }
  if (ext === '.txt' || ext === '.md') return data.toString('utf8')
  throw new CvError(`Format nesuportat (${ext || 'fără extensie'}). Folosește PDF, DOCX, TXT sau MD.`)
}
