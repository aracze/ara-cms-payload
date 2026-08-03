import Image from 'next/image'
import { StaticHeroImage } from '@/components/features/static-hero-image'
import { StaticHeroWave } from '@/components/features/static-hero-wave'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AUTH_COVER_URL } from '@/lib/profile-limits'

/**
 * Společný rám stránek kolem účtu (přihlášení, registrace, obnova hesla).
 *
 * PROČ NE rozdělená obrazovka (fotka vlevo, formulář vpravo):
 * ten vzor je běžný, ale funguje jen tam, kde stránka zabere celé okno BEZ
 * hlavičky a patičky webu. Tady hlavička webu průhledná a počítá s tmavou
 * fotkou pod sebou — v bílé polovině pak byly lupa, „Rady na cestu" i papoušek
 * bílé na bílé, a pod fotkou zůstávalo prázdné místo až k patičce.
 *
 * Proto stejný rytmus jako všechny ostatní stránky webu: krátká fotka s vlnkou
 * (drží čitelnost hlavičky a titulek) a pod ní vycentrovaná karta s obsahem.
 */

export function AuthPageShell({
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: {
  title: string
  /** Věta nad formulářem v kartě (proč to uživatel dělá). */
  subtitle?: string
  backHref?: string
  backLabel?: string
  children: React.ReactNode
}) {
  return (
    <>
      {/* Nižší hero než na obsahových stránkách (je to jen rám formuláře), ale
          dost vysoké na to, aby se titulek nelepil na menu webu. */}
      <section className="relative h-[260px] w-full bg-[#3b444f]">
        <div className="absolute inset-0 overflow-hidden">
          <StaticHeroImage imageUrl={AUTH_COVER_URL} styleCss="object-position: 50% 42%" />
        </div>
        <div
          className="absolute inset-0 z-[100]"
          style={{
            background: [
              'linear-gradient(180deg, rgba(8,20,38,0.62) 0%, rgba(8,20,38,0.30) 26%, rgba(8,20,38,0) 55%)',
              'radial-gradient(ellipse at 50% 60%, rgba(10,25,45,0.60) 0%, rgba(10,25,45,0.36) 60%, rgba(10,25,45,0.22) 100%)',
            ].join(', '),
          }}
        />
        {/* `pt-10`: odsazení od hlavičky webu (ta je vysoká 65 px a leží NAD fotkou). */}
        <div className="relative z-[101] flex h-full flex-col items-center justify-center px-4 pb-6 pt-10">
          <h1 className="text-center font-heading text-[30px] font-semibold text-white md:text-[36px]">
            {title}
          </h1>
          <div className="mt-3 h-px w-[30px] rounded-full bg-[#D7E1EF]" />
        </div>
        <StaticHeroWave />
      </section>

      <main id="obsah" tabIndex={-1} className="px-4 pb-20 pt-10 focus:outline-none">
        {backHref && (
          <div className="mx-auto mb-6 max-w-[430px]">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[#8a939b] transition-colors hover:text-[#215491]"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel ?? 'Zpět'}
            </Link>
          </div>
        )}
        <div className="mx-auto max-w-[430px] rounded-2xl bg-white p-7 shadow-[0_10px_34px_rgba(15,30,50,0.10)] ring-1 ring-[#eef1f4] sm:p-8">
          {/* Papoušek a věta „proč to dělám" jsou UVNITŘ karty, stejně jako
              v přihlašovacím okně — obsah je pak v okně i na stránce totožný
              a nadpis se neopakuje dvakrát (ten je ve fotce nahoře). */}
          {subtitle && (
            <div className="mb-6 flex flex-col items-center">
              <span className="mb-3.5 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#2f7d9a] to-[#215491]">
                <Image src="/assets/avatar-parrot.png" alt="" width={32} height={32} unoptimized />
              </span>
              <p className="max-w-[300px] text-center text-[14.5px] leading-relaxed text-[#8a939b]">
                {subtitle}
              </p>
            </div>
          )}
          {children}
        </div>
      </main>
    </>
  )
}
