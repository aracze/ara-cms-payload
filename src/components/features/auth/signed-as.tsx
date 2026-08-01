import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import type { CurrentUser } from '@/lib/auth'
import { LoginHintLink } from './login-hint-link'

/**
 * Dva stavy identity u formuláře komentáře / recenze.
 *
 * PŘIHLÁŠENÝ (`SignedAsRow`) — řádek NAHOŘE nad formulářem: kdo píše, má být
 * jasné dřív, než člověk začne psát.
 *
 * NEPŘIHLÁŠENÝ (`LoginHint`) — jednořádková nápověda POD POLÍČKEM JMÉNA, ne
 * banner nahoře. Je to v místě, kde se rozhodnutí odehrává (vyplňuji jméno →
 * „tohle za tebe udělá přihlášení") a nezabírá vlastní blok. Záměrně NE pod
 * textem komentáře: kdo by se přihlašoval až tam, přišel by o rozepsaný text.
 */

export function SignedAsRow({ user }: { user: CurrentUser }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <UserAvatar name={user.publicName} avatarUrl={user.avatarUrl} size={34} />
      <p className="text-[14px] text-[#2c3643]">
        Píšeš jako <b>{user.publicName}</b>
        {user.profileHref && (
          <>
            {' · '}
            <Link href={user.profileHref} className="font-semibold text-[#215491] hover:underline">
              tvůj profil
            </Link>
          </>
        )}
      </p>
    </div>
  )
}

export function LoginHint({
  backTo,
  noun = 'komentář',
}: {
  backTo: string
  /** „komentář" / „recenze" — hláška má mluvit o tom, co člověk zrovna píše. */
  noun?: 'komentář' | 'recenze'
}) {
  // Text říká PŘÍNOS, ne mechaniku (dřívější „a podepíšeme to za tebe" znělo,
  // jako by příspěvek psal někdo jiný). Formulace „na jednom místě" schválně
  // opakuje slib z přihlašovacího okna, ať uživatel slyší totéž dvakrát.
  return (
    <p className="mt-1.5 text-[12.5px] leading-snug text-[#9aa4ad]">
      <LoginHintLink backTo={backTo} /> a měj {noun === 'recenze' ? 'recenze' : 'komentáře'} u sebe
      na jednom místě.
    </p>
  )
}
