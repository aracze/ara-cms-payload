import { SectionHeading } from './section-heading'
import { PreparationCards } from '../page/preparation-section'

/**
 * Panel „Připrav se na cestu“ na homepage — legacy parita
 * (`affiliate--homepage` na starém webu): 4 obecné partnerské karty
 * (pojištění, zájezdy, ubytování, auto) bez karty Praktických informací
 * a bez deep-linků destinace — z homepage není kam cílit, odkazy vedou
 * na obecné stránky partnerů (řeší /go/ redirecty a výchozí odkazy
 * v PreparationCards).
 */
export function HomepagePreparationSection() {
  return (
    <section aria-labelledby="priprava">
      <SectionHeading id="priprava">Připrav se na cestu</SectionHeading>
      <PreparationCards affiliate={null} practicalInfo={null} />
    </section>
  )
}
