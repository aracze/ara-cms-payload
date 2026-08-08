import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import type { Metadata } from 'next'
import { ConfirmAccountForm, ConfirmErrorView } from './confirm-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Potvrzení účtu',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<{ token?: string | string[] }> }

/**
 * Cíl odkazu z potvrzovacího e-mailu (viz `auth.verify` v kolekci Users).
 *
 * Stránka token NEOVĚŘUJE — jen ho předá formuláři a ověření spustí až
 * kliknutí na tlačítko (proč, viz actions.ts: e-mailové skenery odkaz
 * navštíví dřív než člověk a ověření při GET by token spotřebovaly).
 */
export default async function VerifyPage({ searchParams }: Props) {
  const { token: raw } = await searchParams
  // Zdvojený parametr (?token=a&token=b) přijde jako pole — vezmeme první,
  // ať formulář neposílá slepenec „a,b", který by ověření zbytečně shodil.
  const token = Array.isArray(raw) ? raw[0] : raw

  return (
    <AuthPageShell title="Potvrzení účtu">
      {token ? <ConfirmAccountForm token={token} /> : <ConfirmErrorView />}
    </AuthPageShell>
  )
}
