import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import { ResetPasswordForm } from '@/components/features/auth/password-forms'
import { XCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nové heslo',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<{ token?: string }> }

/**
 * Krok 2 obnovy hesla — cíl odkazu z e-mailu.
 *
 * Token se sem jen předá do formuláře; platnost ověří až Payload při odeslání
 * (`resetPassword`). Kontrolovat ho předem by nedávalo smysl — jednorázový
 * token by se tím „spotřeboval" pouhým otevřením stránky (třeba náhledem
 * v e-mailovém klientu).
 */
export default async function NewPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams

  return (
    <AuthPageShell title="Nové heslo" subtitle="Zvol si nové heslo a leť dál.">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="text-center">
          <XCircle
            className="mx-auto mb-4 h-12 w-12 text-[#c2554a]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <p className="text-[15px] leading-relaxed text-[#5b666e]">
            V adrese chybí odkaz z e-mailu. Otevři prosím odkaz, který jsme ti poslali, nebo si nech
            poslat nový.
          </p>
          <Link
            href="/zapomenute-heslo"
            className="mx-auto mt-6 block w-fit rounded-full bg-[#215491] px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c]"
          >
            Poslat nový odkaz
          </Link>
        </div>
      )}
    </AuthPageShell>
  )
}
