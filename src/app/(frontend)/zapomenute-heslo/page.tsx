import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import { ForgotPasswordForm } from '@/components/features/auth/password-forms'
import { getCurrentUser } from '@/lib/auth'
import { getTurnstileSiteKey } from '@/lib/comment-spam'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Zapomenuté heslo',
  robots: { index: false, follow: false },
}

/** Krok 1 obnovy hesla — stejný rám jako přihlášení a registrace. */
export default async function ForgotPasswordPage() {
  const user = await getCurrentUser()
  if (user) redirect('/')

  return (
    <AuthPageShell
      title="Zapomenuté heslo"
      subtitle="Nevadí, nové si nastavíš za chvilku."
      backHref="/prihlaseni"
      backLabel="Zpět na přihlášení"
    >
      <ForgotPasswordForm turnstileSiteKey={getTurnstileSiteKey()} />
    </AuthPageShell>
  )
}
