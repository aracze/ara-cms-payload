import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import { pluralCs } from '@/lib/utils'
import { SITE_LAUNCH_YEAR } from '@/lib/team'
import type { TeamMemberPublic, TeamSectionData } from '@/types/payload'

/**
 * Sekce „Náš tým" na konci textu stránky O nás.
 *
 * Renderuje se UVNITŘ čtecího sloupce (viz MainContent → belowText), takže
 * navazuje na text stejnou šířkou i rytmem — nadpis proto vypadá jako běžný
 * `h2` v prose (Poppins bold 22 px, #005580).
 *
 * Obsah karet si autoři spravují SAMI ve svých profilech (jméno, fotka,
 * medailonek); tady se jen zkracuje na dva řádky. Čísla jsou počty publikovaných
 * příspěvků a vedou na příslušnou sekci profilu — stejný vzor jako statistiky
 * na profilu samotném.
 */

/**
 * Čísla pod jménem — nulové kategorie se vynechají, zbytek se zkrátí na tři.
 *
 * Popisky jsou KRATŠÍ než na profilu („cílů" místo „turistických cílů"): tři
 * karty na řádku mají po ~210 px, kde by se dlouhý tvar lámal na tři řádky.
 * Vedle „míst" a „článků" je zkrácené „cílů" jednoznačné.
 */
function memberStats(member: TeamMemberPublic) {
  const profileHref = `/profil/${encodeURIComponent(member.username)}`
  return (
    [
      {
        count: member.counts.places,
        href: `${profileHref}#mista`,
        label: pluralCs(member.counts.places, ['místo', 'místa', 'míst']),
      },
      {
        count: member.counts.touristPoints,
        href: `${profileHref}#turisticke-cile`,
        label: pluralCs(member.counts.touristPoints, ['cíl', 'cíle', 'cílů']),
      },
      {
        count: member.counts.articles,
        href: `${profileHref}#clanky`,
        label: pluralCs(member.counts.articles, ['článek', 'články', 'článků']),
      },
      {
        count: member.counts.reviews,
        href: `${profileHref}#recenze`,
        label: pluralCs(member.counts.reviews, ['recenze', 'recenze', 'recenzí']),
      },
    ]
      .filter((stat) => stat.count > 0)
      // Tři čísla se na kartu vejdou na dva řádky; čtvrté už z ní dělá tabulku.
      .slice(0, 3)
  )
}

export function TeamSection({ members, faces, remainingContributors }: TeamSectionData) {
  if (members.length === 0) return null

  const years = new Date().getFullYear() - SITE_LAUNCH_YEAR

  return (
    <section aria-labelledby="nas-tym" className="mt-10">
      <h2
        id="nas-tym"
        className="font-heading text-[22px] font-bold leading-[1.25] tracking-tight text-[#005580]"
      >
        Náš tým
      </h2>

      <ul className="mt-5 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
        {members.map((member) => {
          const displayName = member.name || member.username
          const profileHref = `/profil/${encodeURIComponent(member.username)}`
          return (
            <li
              key={member.username}
              className="flex flex-col items-center rounded-xl border border-[#e3e9ef] px-5 py-6 text-center"
            >
              <Link href={profileHref} className="block" tabIndex={-1} aria-hidden="true">
                <UserAvatar name={displayName} avatarUrl={member.avatarUrl} size={84} />
              </Link>
              <Link
                href={profileHref}
                className="mt-3 font-heading text-[18px] font-semibold tracking-tight text-[#115194] hover:underline"
              >
                {displayName}
              </Link>
              {/* Uživatelské jméno neopakujeme, když je zároveň zobrazeným jménem
                  (autor s nevyplněným polem „Jméno") — jinak by tam stálo dvakrát. */}
              {displayName !== member.username && (
                <span className="mt-0.5 text-[13px] text-[#8a939b]">@{member.username}</span>
              )}
              {/* Medailonek z profilu tu ZÁMĚRNĚ není: tři karty s odstavcem
                  textu daly pod dvě věty úvodu blok vyšší než celá stránka.
                  Kdo chce vědět víc, klikne na jméno — na profilu je celý. */}
              {/* Čísla jdou POD SEBE, ne do řádku s oddělovači: na kartě široké
                  ~210 px se řádek zlomil a na začátku druhého zůstala viset
                  tečka. Pod sebou navíc není oddělovač vůbec potřeba. */}
              <ul className="mt-2.5 flex list-none flex-col items-center gap-y-0.5 p-0 text-[13.5px]">
                {memberStats(member).map((stat) => (
                  <li key={stat.href}>
                    <Link href={stat.href} className="font-semibold text-[#4a5765] hover:underline">
                      <span className="text-[#215491] tabular-nums">{stat.count}</span> {stat.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>

      {faces.length > 0 && (
        <div className="mt-8 border-t border-[#e7ecf1] pt-6">
          <p className="m-0 text-[16px] leading-[1.8] text-[#5b666e]">
            Za {years} {pluralCs(years, ['rok', 'roky', 'let'])} přispěla řada dalších cestovatelů —
            autora najdeš u každého článku i místa.
          </p>
          <ul className="mt-3.5 flex list-none flex-wrap items-center gap-2.5 p-0">
            {faces.map((face) => {
              const displayName = face.name || face.username
              return (
                <li key={face.username}>
                  <Link
                    href={`/profil/${encodeURIComponent(face.username)}`}
                    title={displayName}
                    className="block rounded-full transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
                  >
                    <UserAvatar name={displayName} avatarUrl={face.avatarUrl} size={42} />
                    <span className="sr-only">{displayName}</span>
                  </Link>
                </li>
              )
            })}
            {remainingContributors > 0 && (
              <li className="ml-1 text-[13.5px] text-[#5b666e]">
                a {pluralCs(remainingContributors, ['další', 'další', 'dalších'])}{' '}
                {remainingContributors}
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  )
}
