import type { Profile } from './schemas.js'

const list = (a: string[]) => (a.length ? a.join(', ') : '(nespecificat)')

/** Text compact pentru LLM-uri. */
export function formatProfile(p: Profile, updatedAt: string): string {
  const salary = p.min_salary === null ? '(nespecificat)' : `${p.min_salary} ${p.salary_currency} ${p.salary_basis === 'net' ? 'net' : 'brut'}/lună`
  return [
    `Profil candidat (actualizat ${updatedAt.slice(0, 10)})`,
    `Stack principal: ${list(p.primary_stack)}`,
    `Stack secundar: ${list(p.secondary_stack)}`,
    `Experiență: ${p.years_experience} ani · Senioritate țintă: ${p.target_seniority}`,
    `Salariu minim: ${salary}`,
    `Locații acceptate: ${list(p.locations)}`,
    `Mod de lucru acceptat: ${p.work_modes.join(', ')}`,
    `Limbi: ${list(p.languages)}`,
    `Condiții de excludere (knockout): ${p.exclusions.length ? p.exclusions.join('; ') : '(niciuna)'}`,
    `Preferințe: ${p.preferences || '(niciuna)'}`,
  ].join('\n')
}
