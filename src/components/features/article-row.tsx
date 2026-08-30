import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { isCloudinary } from '@/lib/cloudinary-loader'
import { NoPreview } from './photo-tile'

/**
 * Lehký view-model položky výpisu článků. Server (seznam) předpočítá
 * perex/URL/href, takže přes RSC hranici do klienta jde jen tohle — NE celý
 * `Article` s plným tělem rich-textu. Viz ArticlesList / ArticlesListClassic.
 */
export interface ArticleCardVM {
  key: string
  title: string
  href: string
  excerpt: string
  imageUrl: string | null
}

/**
 * Karta článku ve výpisu rubriky — stejný vzhled jako „Články a cestopisy"
 * na stránkách míst (rámeček, vnitřní odsazení, text vlevo, fotka 280×180
 * vpravo). Vybráno uživatelem 28. 8. 2026 ze živých srovnání (proti vzdušným
 * řádkům, fotce vlevo i nižší variantě karty): rubrika je „výkladní skříň"
 * článků, proto plná velikost. Články mají rovnocennou váhu, žádný není
 * zvýrazněný.
 *
 * Jediný rozdíl proti stránkám míst: linka u „Číst více" se protáhne už při
 * najetí na CELOU kartu (tam jen při najetí na samotný text, čehož si čtenář
 * většinou nevšimne).
 */
export function ArticleRowCard({
  title,
  href,
  excerpt,
  imageUrl,
  className,
}: {
  title: string
  href: string
  excerpt: string
  imageUrl: string | null
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col sm:flex-row gap-6 items-stretch bg-white rounded-3xl border border-gray-100/50 p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] transition-all duration-500 transform hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)]',
        className,
      )}
    >
      <div className="flex-1 order-2 sm:order-1 flex flex-col justify-center">
        <h3 className="text-2xl font-bold text-[#1a3f6c] mb-3 leading-[1.2] transition-colors group-hover:text-[#215491]">
          {title}
        </h3>
        <p className="text-gray-500 line-clamp-3 text-[15px] leading-relaxed font-light">
          {excerpt}
        </p>
        <div className="mt-[20px] flex items-center text-[#215491] font-bold text-[12px] tracking-[0.1em] uppercase font-heading">
          <span>Číst více</span>
          <div className="ml-3 w-8 h-[1px] bg-[#215491]/30 transition-all duration-300 group-hover:w-12 group-hover:bg-[#215491]"></div>
        </div>
      </div>
      <div className="order-1 sm:order-2 relative w-full sm:w-[280px] h-[180px] shrink-0 overflow-hidden rounded-2xl">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, 280px"
            unoptimized={!isCloudinary(imageUrl)}
          />
        ) : (
          <NoPreview />
        )}
      </div>
    </Link>
  )
}
