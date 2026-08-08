import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import { getDb } from '@/lib/db'
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Potvrzení účtu',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<{ token?: string; stav?: string }> }

/**
 * Ověření tokenu běží v server action (POST po kliknutí), NE při vykreslení.
 *
 * PROČ: e-mailové služby (Outlook SafeLinks, Gmail, Seznam…) odkazy v došlé
 * poště samy navštěvují kvůli bezpečnostní kontrole — dřív, než na ně klikne
 * člověk. Když stránka ověřovala token už při GET, spotřeboval ho skener:
 * účet se sice potvrdil, ale uživatel pak klikl na mrtvý odkaz a viděl chybu
 * „už použitý nebo prošlý" (přesně tohle se stalo při testu 8. 8. 2026).
 * Skenery ale na tlačítka neklikají, takže POST token přežije až k člověku.
 *
 * `verifyEmail` běží s `overrideAccess: true` — uživatel v tu chvíli ještě
 * není přihlášený. Platnost tokenu hlídá Payload.
 */
async function confirmAccount(formData: FormData) {
  'use server'
  const token = String(formData.get('token') ?? '')

  let ok = false
  if (token) {
    try {
      const payload = await getDb()
      ok = Boolean(
        await payload.verifyEmail({ collection: 'users', token, overrideAccess: true } as never),
      )
    } catch {
      // Neplatný, už použitý nebo prošlý token — uživateli to řekne stránka.
      ok = false
    }
  }

  // redirect() vyhazuje interní výjimku, proto stojí až ZA try/catch.
  redirect(ok ? '/registrace/potvrzeni?stav=ok' : '/registrace/potvrzeni?stav=chyba')
}

export default async function VerifyPage({ searchParams }: Props) {
  const { token, stav } = await searchParams

  // Výsledek po odeslání formuláře (token už v URL není — nemá tu co dělat).
  if (stav === 'ok') {
    return (
      <AuthPageShell title="Účet je potvrzený">
        <div className="text-center">
          <CheckCircle2
            className="mx-auto mb-4 h-12 w-12 text-[#2f9a6a]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <p className="text-[15px] leading-relaxed text-[#5b666e]">
            Hotovo — teď se můžeš přihlásit a tvůj obsah bude pod tvým jménem.
          </p>
          <Link
            href="/prihlaseni"
            className="mx-auto mt-6 block w-fit rounded-full bg-[#215491] px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c]"
          >
            Přihlásit se
          </Link>
        </div>
      </AuthPageShell>
    )
  }

  // Příchod z e-mailu: token jen podržíme ve formuláři a čekáme na kliknutí.
  if (token && stav === undefined) {
    return (
      <AuthPageShell title="Potvrzení účtu">
        <div className="text-center">
          <MailCheck
            className="mx-auto mb-4 h-12 w-12 text-[#215491]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <p className="text-[15px] leading-relaxed text-[#5b666e]">
            Zbývá poslední krok — potvrď svůj účet tlačítkem níž.
          </p>
          <form action={confirmAccount}>
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="mx-auto mt-6 block w-fit rounded-full bg-[#215491] px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c]"
            >
              Potvrdit účet
            </button>
          </form>
        </div>
      </AuthPageShell>
    )
  }

  // Bez tokenu, nebo ověření nevyšlo (stav=chyba).
  return (
    <AuthPageShell title="Potvrzení účtu">
      <div className="text-center">
        <XCircle
          className="mx-auto mb-4 h-12 w-12 text-[#c2554a]"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <p className="text-[15px] leading-relaxed text-[#5b666e]">
          Odkaz je pravděpodobně už použitý nebo prošlý. Jestli se nemůžeš přihlásit, zkus
          registraci znovu — na už potvrzený účet se prostě přihlas.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/prihlaseni"
            className="rounded-full bg-[#215491] px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c]"
          >
            Přihlásit se
          </Link>
          <Link
            href="/registrace"
            className="rounded-full border-2 border-[#c9d4e0] px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-[#5b666e] transition-colors hover:border-[#215491] hover:text-[#215491]"
          >
            Registrovat znovu
          </Link>
        </div>
      </div>
    </AuthPageShell>
  )
}
