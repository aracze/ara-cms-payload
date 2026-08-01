import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import { getDb } from '@/lib/db'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Potvrzení účtu',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<{ token?: string }> }

/**
 * Cíl odkazu z potvrzovacího e-mailu (viz `auth.verify` v kolekci Users).
 *
 * Token se ověřuje na SERVERU při vykreslení; `verifyEmail` běží
 * s `overrideAccess: true`, protože v tu chvíli uživatel ještě není přihlášený.
 * Platnost tokenu si hlídá Payload — my jen zobrazíme výsledek.
 */
export default async function VerifyPage({ searchParams }: Props) {
  const { token } = await searchParams

  let ok = false
  if (token) {
    try {
      const payload = await getDb()
      ok = Boolean(
        await payload.verifyEmail({ collection: 'users', token, overrideAccess: true } as never),
      )
    } catch {
      // Neplatný, už použitý nebo prošlý token — uživateli to řekneme níž.
      ok = false
    }
  }

  return (
    <AuthPageShell title={ok ? 'Účet je potvrzený' : 'Potvrzení účtu'}>
      <div className="text-center">
        {ok ? (
          <>
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
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </AuthPageShell>
  )
}
