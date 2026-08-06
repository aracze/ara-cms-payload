import { Globe, Pencil } from 'lucide-react'
import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import { StaticHeroImage } from '@/components/features/static-hero-image'
import { StaticHeroWave } from '@/components/features/static-hero-wave'
import { MapLibreMap } from '@/components/features/maplibre-map'
import { ProfileCardGrid } from '@/components/layout/profile/profile-card-grid'
import { AvatarPicker } from '@/components/layout/profile/avatar-picker'
import { ProfileEditFrame, ProfileSaveRow } from '@/components/layout/profile/profile-edit-frame'
import {
  ProfileArticleCard,
  ProfileCommentCard,
  ProfilePlaceCard,
  ProfileReviewCard,
} from '@/components/layout/profile/profile-cards'
import { pluralCs, websiteHref, websiteLabel } from '@/lib/utils'
import { DEFAULT_COVER_BLUR, DEFAULT_COVER_POSITION, DEFAULT_COVER_URL } from '@/lib/default-cover'
import { MAX_DESCRIPTION, MAX_NAME, MAX_URL } from '@/lib/profile-limits'
import type { UserProfileData } from '@/types/payload'

/**
 * Veřejný profil uživatele (/profil/<username>) — vše na JEDNÉ stránce:
 * hero s vlnkou (jako každá stránka webu, jen se značkovým přechodem místo
 * fotky), medailonek, statistiky-kotvy a pět sekcí obsahu.
 *
 * Všech pět sekcí používá STEJNÝ vizuální jazyk: mřížku karet 280 px se
 * kruhovým odznakem typu (článek / místo / cíl / recenze / komentář), jako
 * výpis míst na stránkách míst. Sekce se střídavě podkládají šedou, aby byly
 * od sebe opticky oddělené. Prázdné sekce se nevykreslují.
 * Data skládá fetchUserProfile výhradně z veřejných polí.
 */

/** Výška mapy pod statistikami — nižší, než mají mapy u výpisů míst. */
const MAP_HEIGHT = '360px'

export function UserProfile({
  profile,
  isOwner = false,
  editing = false,
}: {
  profile: UserProfileData
  /** Dívá se na svůj vlastní profil → uvidí tlačítko „Upravit profil". */
  isOwner?: boolean
  /** Režim úprav (adresa `?upravit=1`) — medailonek se vymění za formulář. */
  editing?: boolean
}) {
  const displayName = profile.name || profile.username

  // Statistiky = rychlá navigace na sekce níže; nulové se vůbec neukazují.
  // Pořadí ODPOVÍDÁ pořadí sekcí na stránce (místa → cíle → články → recenze
  // → komentáře), aby kotva vedla „dopředu" ve stejném sledu, jak je čísla čte.
  const stats = [
    {
      count: profile.places.length,
      href: '#mista',
      label: pluralCs(profile.places.length, ['místo', 'místa', 'míst']),
    },
    {
      count: profile.touristPoints.length,
      href: '#turisticke-cile',
      label: pluralCs(profile.touristPoints.length, [
        'turistický cíl',
        'turistické cíle',
        'turistických cílů',
      ]),
    },
    {
      count: profile.articles.length,
      href: '#clanky',
      label: pluralCs(profile.articles.length, ['článek', 'články', 'článků']),
    },
    {
      count: profile.reviews.length,
      href: '#recenze',
      label: pluralCs(profile.reviews.length, ['recenze', 'recenze', 'recenzí']),
    },
    {
      count: profile.comments.length,
      href: '#komentare',
      label: pluralCs(profile.comments.length, ['komentář', 'komentáře', 'komentářů']),
    },
  ].filter((s) => s.count > 0)

  // Sekce se střídavě podkládají šedou. Pořadí se mění podle toho, které sekce
  // uživatel vůbec má, proto se index počítá průběžně (ne z pevného pořadí).
  let sectionIndex = 0
  const nextShaded = () => sectionIndex++ % 2 === 1

  // Střed mapy = STŘED OBÁLKY všech bodů (ne jejich průměr — jediná hustá
  // oblast by průměr přetáhla k sobě a body na druhé straně světa by vypadly
  // z výřezu). Výřez si mapa u VÍCE bodů dorámuje sama (`fitToMarkers`), tohle
  // je jen výchozí stav pro první vykreslení.
  const lats = profile.mapPins.map((p) => p.lat)
  const lngs = profile.mapPins.map((p) => p.lng)
  const mapCenter = profile.mapPins.length
    ? {
        lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      }
    : { lat: 20, lng: 10 }
  const span = profile.mapPins.length
    ? Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs))
    : 360
  // Jediný bod má rozpětí 0 a `fitToMarkers` se na něj nevztahuje (rámuje až od
  // dvou bodů), takže by mapa zůstala natrvalo oddálená na měřítko státu.
  const mapZoom =
    profile.mapPins.length === 1
      ? 10
      : span > 120
        ? 1
        : span > 60
          ? 2
          : span > 25
            ? 3
            : span > 10
              ? 4
              : 5

  const stranka = (
    <>
      {/* Hero s vlnkou — stejná výška, podklad i rytmus jako HeroSection
          ostatních stránek. Barvu pozadí ale při načítání skoro nikdo neuvidí:
          překryje ji rozmazaný náhled fotky (viz DEFAULT_COVER_BLUR), takže
          přechod na ostrou fotku je plynulý a neproblikne holá barva. */}
      <section className="relative w-full h-[315px] bg-[#3b444f]">
        <div className="absolute inset-0 overflow-hidden">
          <StaticHeroImage
            imageUrl={DEFAULT_COVER_URL}
            styleCss={DEFAULT_COVER_POSITION}
            blurDataURL={DEFAULT_COVER_BLUR}
          />
        </div>

        {/* Dvě vrstvy ztmavení, obě jemné, aby fotka zůstala vidět (plochý tmavý
            překryv by z ní udělal jen texturu):
            1) do STŘEDU — čitelnost jména a vyniknutí avataru,
            2) shora — pod hlavičkou webu, jejíž bílé menu jinak leželo na
               světlé obloze s nedostatečným kontrastem. */}
        <div
          className="absolute inset-0 z-[100]"
          style={{
            background: [
              'linear-gradient(180deg, rgba(8,20,38,0.62) 0%, rgba(8,20,38,0.30) 22%, rgba(8,20,38,0) 45%)',
              'radial-gradient(ellipse at 50% 58%, rgba(10,25,45,0.66) 0%, rgba(10,25,45,0.40) 55%, rgba(10,25,45,0.24) 100%)',
            ].join(', '),
          }}
        />

        {/* Identita v hlavičce: avatar, jméno a uživatelské jméno jako JEDEN blok na ose
            stránky (titulky ostatních stránek jsou taky na středu).
            Historie: nejdřív tu byly čtyři úrovně nad sebou — avatar, jméno,
            linka a „@jméno · Cestovní průvodce" — což působilo přeplněně (role
            byla navíc na všech profilech stejná, takže nic neříkala). Pak avatar
            sjel na vlnku, ale odtržený od jména nedržel s ním pohromadě. Teď je
            zpátky nad jménem a blok scelují dvě věci: těsné odsazení (14 px)
            a plynulý tmavý kužel pod ním. */}
        {/* `overflow-hidden`: kužel je vyšší než blok, takže bez oříznutí
            prosvítal pod vlnkou do bílé části jako šedá šmouha.
            Svislá poloha je laděná OKEM, ne na matematický střed: vlnka ukrajuje
            spodních ~70 px hlavičky, takže přesně vystředěný blok působí
            posazený nízko. Odsazení proto drž malé a měň jen podle výsledku. */}
        <div className="relative z-[101] h-full overflow-hidden flex flex-col items-center justify-center px-4 pt-1">
          {/* Animace (nájezd nadpisu) je na VNITŘNÍM elementu, oříznutí na
              vnějším. Když bylo obojí na jednom, posouvalo se při nájezdu
              i oříznutí — a tmavý kužel na okamžik vykoukl pod vlnku na bílou. */}
          <div className="relative flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-1000 motion-reduce:animate-none">
            {/* Kužel je výrazně širší než obsah a mizí do neurčita — nemá hranu,
                která by se dala přečíst jako rámeček nebo tlačítko. Zároveň drží
                čitelnost i kdyby se výchozí fotka vyměnila za světlejší. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-32 -inset-y-14"
              style={{
                background:
                  'radial-gradient(ellipse 55% 60% at center, rgba(6,16,32,0.58) 0%, rgba(6,16,32,0.30) 55%, rgba(6,16,32,0) 82%)',
              }}
            />
            <div className="relative">
              {editing ? (
                <AvatarPicker name={displayName} avatarUrl={profile.avatarUrl} />
              ) : (
                <UserAvatar name={displayName} avatarUrl={profile.avatarUrl} size={84} />
              )}
            </div>
            {editing ? (
              // Pole vypadá jako nadpis, na kterém stojí: stejná velikost i váha
              // písma, jen s čárkovaným rámečkem, aby bylo poznat, že jde psát.
              <input
                name="name"
                defaultValue={profile.name ?? ''}
                maxLength={MAX_NAME}
                placeholder="Tvoje jméno"
                aria-label="Jméno"
                className="relative mt-3.5 w-full max-w-[420px] rounded-lg border-2 border-dashed border-white/45 bg-white/10 px-3 py-1 text-center text-[32px] md:text-[40px] font-semibold leading-tight tracking-normal text-white outline-none transition-colors placeholder:text-white/50 hover:border-white/65 focus:border-white/85"
              />
            ) : (
              <h1 className="relative mt-3.5 max-w-full truncate text-center text-[32px] md:text-[40px] font-semibold leading-none text-white tracking-normal">
                {displayName}
              </h1>
            )}
            {/* Uživatelské jméno neopakujeme, když je zároveň zobrazeným jménem (uživatel
                s prázdným polem `name`, např. „TravelPortal.cz"). Blok by
                pak končil jménem natvrdo, takže místo uživatelského jména přijde tenká
                linka — stejná, jakou mají titulky ostatních stránek webu. */}
            {editing ? (
              <p className="relative mt-2.5 text-[13px] font-medium text-white/70">
                @{profile.username} · uživatelské jméno se nemění, je z něj adresa profilu
              </p>
            ) : displayName !== profile.username ? (
              <p className="relative mt-2.5 text-[15px] font-medium text-white/75">
                @{profile.username}
              </p>
            ) : (
              <div className="relative mt-4 h-px w-[30px] rounded-full bg-[#D7E1EF]" />
            )}
          </div>
        </div>

        {/* Rozmazaný papoušek (StaticHeroOverlay) tu ZÁMĚRNĚ není — ztmavení
            výše už kontrast řeší a dvě vrstvy přes sebe fotku jen zakalily. */}
        <StaticHeroWave />
      </section>

      <main id="obsah" tabIndex={-1} className="focus:outline-none">
        {/* Medailonek — popis „o mně" + vlastní web (jen když jsou vyplněné).
            Uživatelské jméno tu není: patří k identitě, takže je nahoře u jména. */}
        {(profile.description || profile.myWebUrl || stats.length > 0 || isOwner) && (
          <section className="mx-auto max-w-[720px] px-4 pt-10 pb-2 text-center">
            {/* V režimu úprav se medailonek a web přepisují PŘÍMO TADY, na svém
                místě — profil zůstává profilem, jen jeho části jdou psát. */}
            {editing && (
              <div className="mx-auto max-w-[560px] text-left">
                <div className="relative rounded-xl border-2 border-dashed border-[#c9d4e0] p-3 transition-colors focus-within:border-[#215491] hover:border-[#9fb3c8]">
                  <label
                    htmlFor="profil-o-mne"
                    className="absolute -top-2.5 left-3 bg-white px-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8a939b]"
                  >
                    O mně
                  </label>
                  <textarea
                    id="profil-o-mne"
                    name="description"
                    rows={4}
                    maxLength={MAX_DESCRIPTION}
                    defaultValue={profile.description ?? ''}
                    placeholder="Napiš pár vět o sobě…"
                    className="w-full resize-y bg-transparent text-center text-[17px] leading-relaxed text-[#4a4a4a] outline-none placeholder:text-[#b6c0ca]"
                  />
                </div>

                <div className="mt-4 flex items-center justify-center gap-2">
                  <Globe aria-hidden="true" className="h-4 w-4 shrink-0 text-[#215491]" />
                  <input
                    name="myWebUrl"
                    defaultValue={profile.myWebUrl ?? ''}
                    maxLength={MAX_URL}
                    placeholder="www.mujweb.cz"
                    aria-label="Webové stránky"
                    className="w-[250px] rounded-md border-2 border-dashed border-[#c9d4e0] bg-transparent px-2 py-1 text-center text-[15px] text-[#215491] outline-none transition-colors placeholder:text-[#b6c0ca] hover:border-[#9fb3c8] focus:border-[#215491]"
                  />
                </div>

                {/* Uložení HNED pod posledním polem: tady končí rozdělaná práce.
                    Přišpendlené dole vypadalo, jako by patřilo k mapě pod tím. */}
                <ProfileSaveRow />
              </div>
            )}
            {!editing && profile.description && (
              <p className="whitespace-pre-line text-[17px] leading-relaxed text-[#4a4a4a]">
                {profile.description}
              </p>
            )}
            {!editing && profile.myWebUrl && (
              <p className="mt-4 flex items-center justify-center gap-2 text-[15px]">
                <Globe aria-hidden="true" className="h-4 w-4 shrink-0 text-[#215491]" />
                <a
                  href={websiteHref(profile.myWebUrl)}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="text-[#215491] hover:underline"
                >
                  {websiteLabel(profile.myWebUrl)}
                </a>
              </p>
            )}

            {/* Tlačítko vidí jen vlastník profilu. Je to skutečný odkaz (ne
                tlačítko s JavaScriptem), takže úpravy fungují i bez JS. */}
            {isOwner && !editing && (
              <p className="mt-6">
                <Link
                  href={`/profil/${encodeURIComponent(profile.username)}?upravit=1`}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[#c9d4e0] px-6 py-2 font-heading text-[12.5px] font-bold uppercase tracking-wider text-[#5b666e] transition-colors hover:border-[#215491] hover:text-[#215491]"
                >
                  <Pencil aria-hidden="true" className="h-[13px] w-[13px]" strokeWidth={2.2} />
                  Upravit profil
                </Link>
              </p>
            )}

            {/* Statistiky = kotvy na sekce. Prostý <a> — cíl je na téže stránce.
                V režimu úprav zůstávají: smysl varianty A je, že stránka vypadá
                pořád stejně a jen se v ní dá psát. Když jsem je schovával,
                profil se při vstupu do úprav viditelně přeskládal. */}
            {stats.length > 0 && (
              <nav aria-label="Souhrn příspěvků" className="mt-8">
                <ul className="flex flex-wrap items-stretch justify-center gap-x-2">
                  {stats.map((s) => (
                    <li key={s.href}>
                      <a
                        href={s.href}
                        className="flex min-w-[96px] flex-col items-center gap-0.5 rounded-lg px-4 py-2 hover:bg-[#f0f4f9]"
                      >
                        <span className="font-heading text-[24px] font-bold leading-tight text-[#215491] tabular-nums">
                          {s.count}
                        </span>
                        <span className="text-[13px] text-[#5b666e]">{s.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </section>
        )}

        {/* Mapa „kde všude jsem byl" — přes CELOU šířku okna hned pod čísly.
            Jedna mapa pro celý profil, ne mapa u každé sekce: body autora jsou
            rozeseté po světě, takže mapa vedle mřížky karet (jako na stránkách
            míst, kde jde o JEDEN region) by byla malá a nečitelná, ubrala by
            kartám sloupec a znamenala dvě instance Google Maps na stránce.
            Nižší než mapy u výpisů míst — je to přehled, ne pracovní nástroj. */}
        {profile.mapPins.length > 0 && (
          // `!rounded-none`: komponenta mapy má zaoblené rohy (počítá s mapou
          // v obsahovém sloupci), u pásu přes celou šířku by visely do prázdna.
          // Cíleno JEN na dva vlastní obaly mapy (`> div` a `> div > div`) —
          // obecné `[&_div]` sráželo rohy i kartičkám míst, které mapa kreslí
          // uvnitř, a ty pak byly hranaté.
          <section
            aria-label="Mapa míst a turistických cílů autora"
            className="w-full pt-4 [&>div]:!rounded-none [&>div>div]:!rounded-none"
          >
            <MapLibreMap
              markers={profile.mapPins}
              centerLat={mapCenter.lat}
              centerLng={mapCenter.lng}
              zoom={mapZoom}
              height={MAP_HEIGHT}
              // Výřez si mapa dorámuje na všechny piny sama; střed a zoom výše
              // jsou jen výchozí stav pro první vykreslení (než doběhne fitBounds).
              fitToMarkers
            />
          </section>
        )}

        {/* Pořadí sekcí: od nejobecnějšího k nejdrobnějšímu přínosu autora —
            místa (celé destinace) → cíle → články → recenze → komentáře. */}
        {profile.places.length > 0 && (
          <CardSection
            id="mista"
            title="Místa"
            subtitle="Města a oblasti s průvodcem a praktickými informacemi"
            moreNoun={['další místo', 'další místa', 'dalších míst']}
            shaded={nextShaded()}
          >
            {profile.places.map((item) => (
              <ProfilePlaceCard key={item.id} item={item} />
            ))}
          </CardSection>
        )}

        {profile.touristPoints.length > 0 && (
          <CardSection
            id="turisticke-cile"
            title="Turistické cíle"
            subtitle="Konkrétní místa, která stojí za návštěvu"
            moreNoun={['další cíl', 'další cíle', 'dalších cílů']}
            shaded={nextShaded()}
          >
            {profile.touristPoints.map((item) => (
              <ProfilePlaceCard key={item.id} item={item} />
            ))}
          </CardSection>
        )}

        {profile.articles.length > 0 && (
          <CardSection
            id="clanky"
            title="Články a cestopisy"
            subtitle="Reportáže a cestopisy z vlastních cest"
            moreNoun={['další článek', 'další články', 'dalších článků']}
            shaded={nextShaded()}
          >
            {profile.articles.map((item) => (
              <ProfileArticleCard key={item.key} item={item} />
            ))}
          </CardSection>
        )}

        {profile.reviews.length > 0 && (
          <CardSection
            id="recenze"
            title="Recenze"
            subtitle="Hodnocení turistických cílů z první ruky"
            moreNoun={['další recenzi', 'další recenze', 'dalších recenzí']}
            shaded={nextShaded()}
          >
            {profile.reviews.map((item) => (
              <ProfileReviewCard key={item.id} item={item} />
            ))}
          </CardSection>
        )}

        {profile.comments.length > 0 && (
          <CardSection
            id="komentare"
            title="Komentáře"
            // Komentáře patří VÝHRADNĚ k článkům (recenze naopak ke stránkám
            // cílů) — ověřeno v datech, proto to podtitulek říká naplno.
            subtitle="Odpovědi a postřehy v diskusích pod články"
            moreNoun={['další komentář', 'další komentáře', 'dalších komentářů']}
            shaded={nextShaded()}
          >
            {profile.comments.map((item) => (
              <ProfileCommentCard key={item.id} item={item} />
            ))}
          </CardSection>
        )}
      </main>
    </>
  )

  // V režimu úprav obtočíme CELOU stránku formulářem — pole jsou roztroušená
  // po profilu (fotka v hlavičce, jméno v nadpisu, medailonek níž) a odesílají
  // se jedním tlačítkem z lišty dole.
  return editing ? (
    <ProfileEditFrame profileHref={`/profil/${encodeURIComponent(profile.username)}`}>
      {stranka}
    </ProfileEditFrame>
  ) : (
    stranka
  )
}

/**
 * Nadpis sekce — vycentrovaný, s červenou linkou a podtitulkem, přesně jako
 * „Co vidět…" na stránkách míst. Bez počtu: souhrn nad mapou ho už uvádí
 * a u nadpisu působil jako přebytek. Kolik položek zbývá, říká až tlačítko
 * „Zobrazit dalších N…" pod mřížkou.
 */
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-12 flex flex-col items-center text-center">
      <h2 className="mb-3 font-heading text-3xl font-bold tracking-tight text-[#1a3f6c]">
        {title}
      </h2>
      <div className="mb-5 h-[1px] w-[30px] rounded-full bg-[#d45145]" />
      <p className="max-w-xl text-[17px] leading-relaxed text-gray-400">{subtitle}</p>
    </div>
  )
}

/** Sekce s mřížkou karet — obal se stejným rytmem jako sekce míst na webu. */
function CardSection({
  id,
  title,
  subtitle,
  moreNoun,
  shaded,
  children,
}: {
  id: string
  title: string
  subtitle: string
  /** Skloňované tvary pro tlačítko — viz ProfileCardGrid. */
  moreNoun: [string, string, string]
  /** true = šedý podklad (sekce se střídají, aby byly opticky oddělené). */
  shaded: boolean
  children: React.ReactNode[]
}) {
  return (
    <section id={id} className={`w-full py-16 ${shaded ? 'bg-gray-50/50' : 'bg-white'}`}>
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        <SectionHeading title={title} subtitle={subtitle} />
        <ProfileCardGrid moreNoun={moreNoun}>{children}</ProfileCardGrid>
      </div>
    </section>
  )
}
