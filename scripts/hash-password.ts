// Generează hash bcrypt pentru DASH_PASS_HASH. Parola se citește ascuns de la tastatură (sau dintr-un pipe).
import bcrypt from 'bcryptjs'

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const c of process.stdin) chunks.push(c as Buffer)
    return Buffer.concat(chunks).toString().replace(/\r?\n$/, '')
  }
  process.stderr.write('Parola nouă pentru dashboard: ')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve) => {
    let pw = ''
    process.stdin.on('data', (b) => {
      for (const ch of b.toString()) {
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n'); return resolve(pw) }
        if (ch === '\u0003') process.exit(130)
        if (ch === '\u007f') pw = pw.slice(0, -1)
        else pw += ch
      }
    })
  })
}

const password = await readPassword()
if (password.length < 10) { console.error('Parola trebuie să aibă cel puțin 10 caractere.'); process.exit(1) }
if (Buffer.byteLength(password) > 72) { console.error('bcrypt folosește doar primii 72 de octeți; alege o parolă mai scurtă.'); process.exit(1) }
// ghilimele simple: hash-ul conține $, iar un shell sau un .env cu expansiune l-ar mutila
console.log(`DASH_PASS_HASH='${bcrypt.hashSync(password, 10)}'`)
