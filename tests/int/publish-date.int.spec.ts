import { describe, it, expect } from 'vitest'

// Datum vydání článku (src/lib/relative-time.ts): text i strojový den ve
// STEJNÉ zóně (Praha). Kolem půlnoci se UTC a pražský den liší — <time dateTime>
// musí říkat to, co čtenář vidí.
import { formatPublishDate } from '@/lib/relative-time'

describe('formatPublishDate', () => {
  it('text i dateTime jsou pražský den — i když UTC je ještě den předtím', () => {
    // 30. 8. 2026 22:30 UTC = 31. 8. 2026 00:30 SELČ
    const r = formatPublishDate('2026-08-30T22:30:00.000Z')!
    expect(r.text).toBe('31. srpna 2026')
    expect(r.dateTime).toBe('2026-08-31')
  })

  it('v zimě (SEČ) totéž: 12. 3. 2024 22:00 UTC = 12. 3. 2024 23:00 Praha', () => {
    const r = formatPublishDate('2024-03-12T22:00:00.000Z')!
    expect(r.text).toBe('12. března 2024')
    expect(r.dateTime).toBe('2024-03-12')
    // 23:30 UTC už je v Praze 13. 3.
    expect(formatPublishDate('2024-03-12T23:30:00.000Z')!.dateTime).toBe('2024-03-13')
  })

  it('prázdné nebo nevalidní datum → null', () => {
    expect(formatPublishDate(null)).toBeNull()
    expect(formatPublishDate('')).toBeNull()
    expect(formatPublishDate('nesmysl')).toBeNull()
  })
})
