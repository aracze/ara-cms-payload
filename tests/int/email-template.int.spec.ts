import { describe, it, expect } from 'vitest'
import { renderAraEmail, escapeHtml, type AraEmailContent } from '@/lib/email-template'

/**
 * Sdílená šablona e-mailů (potvrzení účtu, obnova hesla). Testy hlídají dvě
 * věci, které se při úpravách vzhledu snadno rozbijí: adresa tlačítka musí
 * být v e-mailu DVAKRÁT (tlačítko + náhradní rámeček pro případ, že tlačítko
 * v klientovi nefunguje) a prostotextová pole si šablona musí ošetřit sama,
 * aby bezpečnost nestála na kázni volajících.
 */
describe('šablona e-mailů (renderAraEmail)', () => {
  const obsah: AraEmailContent = {
    title: 'Vítej na Ara.cz!',
    bodyHtml: 'Ahoj <b>jko</b>, potvrď prosím svůj e-mail:',
    buttonLabel: 'Potvrdit e-mail',
    buttonUrl: 'http://localhost:3000/registrace/potvrzeni?token=abc123',
    note: 'Když jsi o účet nežádal, tenhle e-mail klidně smaž.',
    reason: 'se s tvou adresou někdo zaregistroval.',
  }

  it('adresa tlačítka je v e-mailu dvakrát — tlačítko a náhradní rámeček', () => {
    const html = renderAraEmail(obsah)
    const vyskyty = html.split(`href="${obsah.buttonUrl}"`).length - 1
    expect(vyskyty, 'čekám href v tlačítku A v náhradním rámečku').toBe(2)
    // V rámečku je adresa i jako viditelný text (na zkopírování).
    expect(html).toContain(`>${obsah.buttonUrl}</a>`)
  })

  it('obsahuje titulek, text, popisek tlačítka i patičku', () => {
    const html = renderAraEmail(obsah)
    expect(html).toContain('Vítej na Ara.cz!')
    expect(html).toContain(obsah.bodyHtml)
    expect(html).toContain('Potvrdit e-mail')
    expect(html).toContain('protože se s tvou adresou někdo zaregistroval.')
  })

  it('odkazuje na vygenerované obrázky (logo + papoušek)', () => {
    const html = renderAraEmail(obsah)
    expect(html).toContain('/assets/email/logo.png')
    expect(html).toContain('/assets/email/ara.png')
  })

  it('prostotextová pole ošetřuje sama — HTML v nich nesmí projít', () => {
    const html = renderAraEmail({
      ...obsah,
      title: '<script>alert(1)</script>',
      note: 'a < b & "c"',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('a &lt; b &amp; &quot;c&quot;')
  })

  it('`&` v adrese escapuje pro HTML atribut, `bodyHtml` nechává být', () => {
    const html = renderAraEmail({
      ...obsah,
      buttonUrl: 'http://localhost:3000/x?token=abc&kind=verify',
    })
    expect(html).toContain('href="http://localhost:3000/x?token=abc&amp;kind=verify"')
    expect(html).toContain('Ahoj <b>jko</b>')
  })

  it('escapeHtml ošetřuje všech pět rizikových znaků', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
