import { describe, it, expect } from 'vitest'

// Šablony SEO titulků/popisků podle kategorie (src/lib/seo-templates.ts) —
// znění starého webu, skloňování z polí detail.genitive/locative.
import {
  genitiveOf,
  leadSentence,
  locativeBare,
  locativeOf,
  seoDescriptionTemplate,
  seoTitleTemplate,
} from '@/lib/seo-templates'
import { PageCategory } from '@/types/payload'

const norsko = { title: 'Norsko', detail: { genitive: 'do Norska', locative: 'v Norsku' } }
const malta = { title: 'Malta', detail: { genitive: 'na Maltu', locative: 'na Maltě' } }
const francie = { title: 'Francie', detail: { genitive: 'do Francie', locative: 've Francii' } }
const bezSklonovani = { title: 'Bright Angel Trail', detail: null }

describe('skloňování místa', () => {
  it('bere pády z detailu, bez nich název s předložkou', () => {
    expect(genitiveOf(norsko)).toBe('do Norska')
    expect(locativeOf(malta)).toBe('na Maltě')
    expect(genitiveOf(bezSklonovani)).toBe('do Bright Angel Trail')
    expect(locativeOf(bezSklonovani)).toBe('v Bright Angel Trail')
  })

  it('locativeBare odřízne předložku v/ve/na („o Norsku", „o Maltě", „o Francii")', () => {
    expect(locativeBare(norsko)).toBe('Norsku')
    expect(locativeBare(malta)).toBe('Maltě')
    expect(locativeBare(francie)).toBe('Francii')
  })
})

describe('leadSentence — první věta textu', () => {
  it('vrátí první větu, dlouhou zkrátí na slovo s výpustkou', () => {
    expect(leadSentence('Norsko je země fjordů. Druhá věta.')).toBe('Norsko je země fjordů.')
    expect(leadSentence('Cena 3.5 EUR za vstup. Další.')).toBe('Cena 3.5 EUR za vstup.')
    const long = leadSentence('slovo '.repeat(60).trim() + '.', 40)
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('…')).toBe(true)
    expect(leadSentence('   ')).toBe('')
  })
})

describe('seoTitleTemplate — titulek bez přípony webu', () => {
  it('informační podstránky skloňují místo', () => {
    expect(
      seoTitleTemplate({ title: 'Vstup', category: PageCategory.Vstupni_podminky }, norsko),
    ).toBe('Vstupní podmínky a víza do Norska')
    expect(seoTitleTemplate({ title: 'Měna', category: PageCategory.Mena_a_ceny }, malta)).toBe(
      'Čím platit na Maltě – aktuální měna a ceny',
    )
    expect(
      seoTitleTemplate(
        { title: 'Praktické informace', category: PageCategory.Prakticke_informace },
        francie,
      ),
    ).toBe('Praktické informace při cestě do Francie')
  })

  it('cíl nese i místo, kde stojí (6. pád); místo samo a statická stránka šablonu nemají', () => {
    expect(
      seoTitleTemplate(
        { title: 'Skulpturenpark', category: PageCategory.Turisticky_cil },
        { title: 'Graz', detail: { locative: 've Štýrském Hradci' } },
      ),
    ).toBe('Skulpturenpark ve Štýrském Hradci')
    // Cíl přímo pod kontinentem/bez místa → jen název (šablona null).
    expect(
      seoTitleTemplate(
        { title: 'Mount Popa', category: PageCategory.Turisticky_cil },
        { title: 'Mount Popa' },
      ),
    ).toBeNull()
    expect(
      seoTitleTemplate({ title: 'Norsko', category: PageCategory.Misto_k_navstiveni }, norsko),
    ).toBeNull()
    expect(
      seoTitleTemplate({ title: 'O nás', category: PageCategory.Staticka_stranka }, norsko),
    ).toBeNull()
  })
})

describe('seoDescriptionTemplate — popisek podle kategorie', () => {
  it('místo: legacy „Inspirace a doporučení…" s druhým a šestým pádem; město má vlastní variantu', () => {
    const d = seoDescriptionTemplate(
      { title: 'Norsko', category: PageCategory.Misto_k_navstiveni },
      norsko,
      '',
    )
    expect(d).toBe(
      'Inspirace a doporučení pro cestování do Norska. Nejlepší místa k návštěvě, články a praktické informace o Norsku – kdy jet, co vidět a na co si dát pozor.',
    )
    const kodan = { title: 'Kodaň', detail: { genitive: 'do Kodaně', locative: 'v Kodani' } }
    expect(
      seoDescriptionTemplate(
        { title: 'Kodaň', category: PageCategory.Misto_k_navstiveni },
        kodan,
        '',
        { placeHasParentPlace: true },
      ),
    ).toBe(
      'Inspirace a doporučení pro cestování do Kodaně. Praktické informace, oblíbená místa a aktivity, které si nenech ujít v Kodani – kdy jet, co vidět a kde se ubytovat.',
    )
  })

  it('cíl a vstupní podmínky připojí první větu textu, bez ní legacy výčet / tečka', () => {
    const graz = { title: 'Graz', detail: { locative: 've Štýrském Hradci' } }
    expect(
      seoDescriptionTemplate(
        { title: 'Skulpturenpark', category: PageCategory.Turisticky_cil },
        graz,
        'Park soch pod širým nebem.',
      ),
    ).toBe(
      'Cestovní průvodce a informace o cíli Skulpturenpark ve Štýrském Hradci: Park soch pod širým nebem.',
    )
    expect(
      seoDescriptionTemplate(
        { title: 'Skulpturenpark', category: PageCategory.Turisticky_cil },
        graz,
        '',
      ),
    ).toBe(
      'Cestovní průvodce a informace o cíli Skulpturenpark ve Štýrském Hradci. Praktické informace, mapa, recenze, fotky a zajímavá místa v okolí.',
    )
    expect(
      seoDescriptionTemplate(
        { title: 'Vstup', category: PageCategory.Vstupni_podminky },
        malta,
        '',
      ),
    ).toBe(
      'Podmínky vstupu na Maltu – víza, pasy, potřebné dokumenty a odkazy na oficiální zdroje.',
    )
  })

  it('statická stránka šablonu nemá (použije se text)', () => {
    expect(
      seoDescriptionTemplate(
        { title: 'O nás', category: PageCategory.Staticka_stranka },
        norsko,
        'x',
      ),
    ).toBeNull()
  })
})
