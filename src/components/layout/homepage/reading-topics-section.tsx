import Image from 'next/image'
import type { InspirationLink } from '@/types/payload'
import { SectionHeading } from './section-heading'
import { PhotoTile } from '@/components/features/photo-tile'

// Sekce „Témata ke čtení" na konci homepage — rozcestník rubrik článků
// (náhrada /inspirace starého webu, který se záměrně nestaví). Rozložení
// „rytmus výškou" (vybraná varianta C z maket, 4. 8. 2026): první tři rubriky
// velké, zbytek menší v řadách po čtyřech. Dynamiku dělá výškový kontrast
// řádků, ne střídání šířek — hrany dlaždic na sebe v řádku vždy navazují.
// Pořadí rubrik se denně obměňuje (seedovaný los ve fetchHomepageInspiration),
// takže velké dlaždice připadnou každý den jiným rubrikám. Dlaždice = sdílená
// PhotoTile: velké M 180, malé S 150 (dřív 178/124 — malé byly „pruhy").

type TopicTile = { span: 3 | 4 | 6 | 12; big: boolean }

/** První tři velké, zbytek po čtyřech; bez osamocené dlaždice na konci. */
function topicsLayout(count: number): TopicTile[] {
  if (count === 1) return [{ span: 12, big: true }]
  if (count === 2)
    return [
      { span: 6, big: true },
      { span: 6, big: true },
    ]
  const tiles: TopicTile[] = [
    { span: 4, big: true },
    { span: 4, big: true },
    { span: 4, big: true },
  ]
  let rest = count - 3
  while (rest > 0) {
    if (rest === 1) {
      tiles.push({ span: 12, big: false })
      rest = 0
    } else if (rest === 2) {
      tiles.push({ span: 6, big: false }, { span: 6, big: false })
      rest = 0
    } else if (rest === 3) {
      tiles.push({ span: 4, big: false }, { span: 4, big: false }, { span: 4, big: false })
      rest = 0
    } else if (rest === 5) {
      // Řada po čtyřech by nechala poslední dlaždici samotnou → 3 + 2.
      tiles.push(
        { span: 4, big: false },
        { span: 4, big: false },
        { span: 4, big: false },
        { span: 6, big: false },
        { span: 6, big: false },
      )
      rest = 0
    } else {
      tiles.push(
        { span: 3, big: false },
        { span: 3, big: false },
        { span: 3, big: false },
        { span: 3, big: false },
      )
      rest -= 4
    }
  }
  return tiles
}

// Tailwind potřebuje třídy jako celé řetězce (JIT je hledá staticky).
const SPAN_CLASS: Record<TopicTile['span'], string> = {
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  6: 'md:col-span-6',
  12: 'md:col-span-12',
}

// Šířky dlaždic v mřížce max-w-5xl (1024 px) pro srcset — mírně nadsazené.
const DESKTOP_SIZES: Record<TopicTile['span'], string> = {
  3: '250px',
  4: '340px',
  6: '500px',
  12: '1024px',
}

export function ReadingTopicsSection({ rubriky }: { rubriky: InspirationLink[] }) {
  if (rubriky.length === 0) return null

  const tiles = topicsLayout(rubriky.length)

  return (
    <section aria-labelledby="reading-topics-heading" className="max-w-5xl mx-auto text-left">
      <SectionHeading id="reading-topics-heading">Témata ke čtení</SectionHeading>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-4">
        {rubriky.map((rubrika, index) => {
          const tile = tiles[index]
          // Lichý počet: poslední dlaždice na mobilu přes oba sloupce,
          // ať nezůstává osamocená v půlce řádku.
          const mobileFull = rubriky.length % 2 === 1 && index === rubriky.length - 1
          return (
            <PhotoTile
              key={rubrika.key}
              href={rubrika.href}
              title={rubrika.title}
              size={tile.big ? 'md' : 'sm'}
              // Krátké názvy rubrik: všechny dlaždice stejný titulek (17 px),
              // ať se v jedné mřížce nestřídají dvě velikosti písma.
              titleSize="md"
              // Mobil: dvě dlaždice v řadě bez ohledu na desktopové velikosti —
              // řada musí mít jednu výšku, jinak by velká vedle malé zubatila.
              className={`h-32 ${mobileFull ? 'col-span-2' : ''} ${SPAN_CLASS[tile.span]}`}
            >
              {rubrika.imageUrl && (
                <Image
                  src={rubrika.imageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes={`(max-width: 768px) ${mobileFull ? '100vw' : '50vw'}, ${DESKTOP_SIZES[tile.span]}`}
                />
              )}
            </PhotoTile>
          )
        })}
      </div>
    </section>
  )
}
