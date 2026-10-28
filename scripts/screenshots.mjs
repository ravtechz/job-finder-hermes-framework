// Capturi pentru verificare vizuală, pentru fiecare temă: node scripts/screenshots.mjs <baseUrl> <outDir>
// Rulează cu joburi de test în bază (sudo jobdash seed). Basic se face în varianta luminoasă și în cea întunecată;
// Severance și Synthwave sunt mereu întunecate.
import { chromium } from 'playwright'
import fs from 'node:fs'

const [base = 'http://127.0.0.1:3333', out = './screenshots'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })

const viewports = { desktop: { width: 1280, height: 900 }, mobile: { width: 375, height: 812 } }
const variants = [
  { name: 'basic-light', theme: 'basic', scheme: 'light' },
  { name: 'basic-dark', theme: 'basic', scheme: 'dark' },
  { name: 'severance', theme: 'severance', scheme: 'dark' },
  { name: 'synthwave', theme: 'synthwave', scheme: 'dark' },
]
const browser = await chromium.launch()

for (const [vpName, viewport] of Object.entries(viewports)) {
  for (const v of variants) {
    const ctx = await browser.newContext({ viewport, colorScheme: v.scheme, deviceScaleFactor: vpName === 'mobile' ? 2 : 1 })
    await ctx.addInitScript((t) => localStorage.setItem('jd-theme', t), v.theme)
    const page = await ctx.newPage()
    const shot = (name) => page.screenshot({ path: `${out}/${name}-${vpName}-${v.name}.png`, fullPage: true })
    const tab = (name) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()
    const toggle = (title) => page.locator('article', { hasText: title }).getByRole('button', { name: /Detalii/ }).click()

    await page.goto(base)
    await page.getByText('Senior Frontend Engineer (React)').waitFor()
    await shot('1-joburi')

    // card expandat (APPLY cu breakdown) și card knockout
    await toggle('Senior Frontend Engineer (React)')
    await page.getByText('Scor pe componente').first().waitFor()
    await page.waitForTimeout(700) // animația de deschidere
    await shot('2-job-expandat')
    await toggle('Junior Web Developer')
    await page.waitForTimeout(700)
    await shot('3-job-knockout')

    await tab('CV'); await page.getByRole('heading', { name: /CV curent/ }).waitFor(); await shot('4-cv')
    await tab('Profil'); await page.getByText('Stack principal').waitFor(); await page.waitForTimeout(200); await shot('5-profil')
    await tab('Agenți'); await page.waitForTimeout(1500); await shot('6-agenti') // biroul (Severance, Synthwave) sau pagina de poze (Basic)
    await ctx.close()
  }
}
await browser.close()
console.log('gata:', fs.readdirSync(out).length, 'capturi în', out)
