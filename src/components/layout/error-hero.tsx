import Image from 'next/image'
import { StaticHeroWave } from '@/components/features/static-hero-wave'
import { StaticHeroOverlay } from '@/components/features/static-hero-overlay'

/**
 * HLAVIČKOVÝ PRUH CHYBOVÝCH STRÁNEK
 * ---------------------------------
 * Společný pro 404 i pro pád stránky (error.tsx), aby obě vypadaly jako jedna
 * rodina. Drží rytmus zbytku webu — pruh, titulek, vlnka — jen místo fotky je
 * v něm původní kresba papouška ze starého webu.
 *
 * Kresba je schválně větší než pruh a ten ji ořízne, stejně jako by ořízl
 * fotku. Obrázek je LOKÁLNÍ, ne přes Cloudinary: chybová stránka má fungovat
 * i když je něco rozbité, a měřením se ukázalo, že Cloudinary tady nic
 * neušetří — na `f_auto` vrací WebP stejné velikosti, jakou vyrobí sharp.
 *
 * ⚠️ DVĚ SLEPÉ ULIČKY, KTERÉ UŽ BYLY VYZKOUŠENÉ:
 * 1. Ztlumit kresbu průhledností (vodoznak) — žlutá přes tmavé pozadí dá
 *    olivově zelenou a z papouška je špinavý flek. Musí zůstat v plné barvě.
 * 2. Ztmavit celý pruh závojem kvůli čitelnosti titulku — totéž zezelenání.
 *    Proto ztmavuje jen `StaticHeroOverlay`, tedy prostředek pruhu pod
 *    titulkem; po stranách zůstává ara sytá.
 */
export function ErrorHero({ title, filterId }: { title: string; filterId: string }) {
  return (
    <section className="relative h-[315px] w-full overflow-hidden bg-[#f7f9fb]">
      {/* Kresba přiletí zleva a ustálí se — jednou, ne dokola. `motion-safe:`
          znamená, že kdo má v systému vypnuté animace, uvidí rovnou statický
          obrázek. */}
      <Image
        src="/assets/404-ara.webp"
        alt=""
        width={1200}
        height={1234}
        unoptimized
        priority
        className="absolute left-1/2 top-[52%] h-auto w-[30rem] -translate-x-1/2 -translate-y-1/2 select-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-16 motion-safe:duration-1000 motion-safe:ease-out md:w-[42rem]"
      />

      {/* Standardní rozmazaná skvrna webu — ztmaví jen prostředek pruhu pod
          titulkem, takže bílé písmo drží a ara zůstane po stranách barevná.
          POZOR: `StaticHeroOverlay` má `opacity-30` uvnitř sebe, takže pouhé
          obalení dalším `opacity-*` se NÁSOBÍ. Proto se vnitřní krytí přebíjí
          přes `[&>div]:opacity-100` a teprve pak platí hodnota tady.
          `filterId` musí být na každé stránce jiný — je to id SVG filtru. */}
      <div className="opacity-45 [&>div]:opacity-100">
        <StaticHeroOverlay filterId={filterId} />
      </div>

      {/* Hlavička webu je průhledná a počítá s tmavým podkladem — na světlém
          pruhu by bílé menu bez tohohle ztmavení zmizelo. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-[101] h-[120px]"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,20,38,0.72) 0%, rgba(8,20,38,0.40) 45%, rgba(8,20,38,0) 100%)',
        }}
      />

      <div className="relative z-[102] flex h-full flex-col items-center justify-center px-4 duration-1000 animate-in fade-in slide-in-from-bottom-4">
        <h1 className="text-center text-[30px] font-semibold tracking-normal text-white [text-shadow:0_1px_2px_rgba(6,17,32,0.75),0_3px_14px_rgba(6,17,32,0.55)] md:text-[40px]">
          {title}
        </h1>
        <div className="mx-auto mt-3 h-px w-[30px] rounded-full bg-[#D7E1EF]" />
      </div>

      <StaticHeroWave />
    </section>
  )
}
