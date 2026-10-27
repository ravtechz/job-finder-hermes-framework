// Capturi pentru verificare vizuală: node scripts/screenshots.mjs <baseUrl> <outDir>
import { chromium } from 'playwright'
import fs from 'node:fs'

const [base = 'http://127.0.0.1:3333', out = './screenshots'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })

const viewports = { desktop: { width: 1280, height: 900 }, mobile: { width: 375, height: 812 } }
const browser = await chromium.launch()

for (const [vpName, viewport] of Object.entries(viewports)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: vpName === 'mobile' ? 2 : 1 })
    const page = await ctx.newPage()
    const shot = (name) => page.screenshot({ path: `${out}/${name}-${vpName}-${scheme}.png`, fullPage: true })
    const tab = (name) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click()

    await page.goto(base)
    await page.getByText('Senior Frontend Engineer (React)').waitFor()
    await shot('1-joburi')

    // card expandat (APPLY cu breakdown) și card knockout
    await page.locator('article', { hasText: 'Senior Frontend Engineer (React)' }).getByRole('button', { name: /Detalii/ }).click()
    await page.getByText('Scor pe componente').first().waitFor()
    await page.waitForTimeout(300)
    await shot('2-job-expandat')
    await page.locator('article', { hasText: 'Junior Web Developer' }).getByRole('button', { name: /Detalii/ }).click()
    await page.waitForTimeout(300)
    await shot('3-job-knockout')

    await tab('CV'); await page.getByText('Textul pe care îl citesc agenții').waitFor(); await shot('4-cv')
    await tab('Profil'); await page.getByText('Stack principal').waitFor(); await page.waitForTimeout(200); await shot('5-profil')
    await ctx.close()
  }
}
await browser.close()
console.log('gata:', fs.readdirSync(out).length, 'capturi în', out)
