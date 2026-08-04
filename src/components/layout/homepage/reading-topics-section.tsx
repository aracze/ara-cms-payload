import Link from 'next/link'
import Image from 'next/image'
import type { InspirationLink } from '@/types/payload'
import { SectionHeading } from './section-heading'

// Sekce „Témata ke čtení" na konci homepage — rozcestník rubrik článků
// (náhrada /inspirace starého webu, který se záměrně nestaví). Vědomě menší
// dlaždice než „Inspirace na cestu": rubriky jsou druhořadý obsah, výška
// karty to říká za nás.
//
// Mozaika po vzoru starého webu: řádky šestisloupcové mřížky se střídají
// [široká + úzká] → [tři stejné] → [úzká + široká] (zrcadlově). Působí to
// živě, ale rozložení je deterministické — počítá se jen z počtu rubrik,
// takže nic nepřeskakuje a poslední řádek nikdy nezůstane děravý.

type MosaicTile = { span: 2 | 3 | 4 | 6; tall: boolean }

/** Rozpočítá dlaždice do řádků; při zbytku 1–2 položek řádek dopočítá. */
function mosaicLayout(count: number): MosaicTile[] {
  const ROWS: { spans: MosaicTile['span'][]; tall: boolean }[] = [
    { spans: [4, 2], tall: true },
    { spans: [2, 2, 2], tall: false },
    { spans: [2, 4], tall: true },
    { spans: [2, 2, 2], tall: false },
  ]
  const tiles: MosaicTile[] = []
  let remaining = count
  let rowIndex = 0
  while (remaining > 0) {
    const row = ROWS[rowIndex % ROWS.length]
    if (remaining >= row.spans.length) {
      for (const span of row.spans) tiles.push({ span, tall: row.tall })
      remaining -= row.spans.length
    } else if (remaining === 2) {
      tiles.push({ span: 3, tall: true }, { span: 3, tall: true })
      remaining = 0
    } else {
      tiles.push({ span: 6, tall: true })
      remaining = 0
    }
    rowIndex += 1
  }
  return tiles
}

// Tailwind potřebuje třídy jako celé řetězce (JIT je hledá staticky).
const SPAN_CLASS: Record<MosaicTile['span'], string> = {
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  6: 'md:col-span-6',
}

const SIZES: Record<MosaicTile['span'], string> = {
  2: '(max-width: 768px) 50vw, 360px',
  3: '(max-width: 768px) 50vw, 520px',
  4: '(max-width: 768px) 50vw, 700px',
  6: '(max-width: 768px) 50vw, 1024px',
}

export function ReadingTopicsSection({ rubriky }: { rubriky: InspirationLink[] }) {
  if (rubriky.length === 0) return null

  const tiles = mosaicLayout(rubriky.length)

  return (
    <section aria-labelledby="reading-topics-heading" className="max-w-5xl mx-auto text-left">
      <SectionHeading id="reading-topics-heading">Témata ke čtení</SectionHeading>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {rubriky.map((rubrika, index) => {
          const tile = tiles[index]
          return (
            <Link
              key={rubrika.key}
              href={rubrika.href}
              className={`group relative block h-20 rounded-xl overflow-hidden shadow-[0_4px_16px_-8px_rgba(0,0,0,0.18)] ${SPAN_CLASS[tile.span]} ${tile.tall ? 'md:h-28' : 'md:h-24'}`}
            >
              {rubrika.imageUrl ? (
                <Image
                  src={rubrika.imageUrl}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes={SIZES[tile.span]}
                />
              ) : (
                <span className="absolute inset-0 bg-gradient-to-br from-[#1a3f6c]/10 to-[#1a3f6c]/20" />
              )}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[75%] bg-gradient-to-t from-[#0f1a2a]/75 to-transparent"
              />
              <span className="absolute left-3.5 right-3 bottom-2.5 text-white font-bold text-[14.5px] leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]">
                {rubrika.title}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
