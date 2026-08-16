import React from 'react'
import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'

/**
 * Podpis autora obsahu („avatar + jméno + Cestovní průvodce") — legacy blok
 * `.contribution`. Vykresluje se pod textem stránky, na stránkách počasí až
 * na SAMÉM KONCI (za předpovědí), protože mezi textem a grafy by rozdělil
 * související sekce; viz `contributorAtEnd` v MainContent.
 */
export interface Contributor {
  name?: string | null
  profileHref?: string | null
  avatarUrl?: string | null
}

export function PageContributor({
  contributor,
  align = 'center',
}: {
  contributor: Contributor
  /** Sbalený text zarovnává podpis k hornímu okraji (vedle „zobrazit více"). */
  align?: 'center' | 'start'
}) {
  if (!contributor.name) return null
  const avatar = <UserAvatar name={contributor.name} avatarUrl={contributor.avatarUrl} size={40} />
  return (
    <div className={`flex ${align === 'center' ? 'items-center' : 'items-start'}`}>
      <div className="mr-[15px] shrink-0">
        {contributor.profileHref ? (
          // Avatar vede na týž profil jako jméno vedle, takže je pro čtečky
          // i klávesnici schovaný — jinak by v pořadí přibyl druhý odkaz na
          // totéž, a u výchozího papouška bez `alt` navíc odkaz bez názvu.
          // Stejný vzor má už `team-section.tsx`.
          <Link href={contributor.profileHref} className="block" tabIndex={-1} aria-hidden="true">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
      </div>
      <div className="inline-block pt-[3px]">
        <div className="block text-[12px] leading-[20.4px] text-[#565656]">
          {contributor.profileHref ? (
            <Link
              href={contributor.profileHref}
              className="font-semibold text-[#565656] no-underline hover:underline"
            >
              {contributor.name}
            </Link>
          ) : (
            <span className="font-semibold">{contributor.name}</span>
          )}
        </div>
        <div className="block text-[12px] leading-[20.4px] text-[#898e95]">Cestovní průvodce</div>
      </div>
    </div>
  )
}
