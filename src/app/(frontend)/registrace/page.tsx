import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import { RegisterForm } from '@/components/features/auth/register-form'
import { getCurrentUser } from '@/lib/auth'
import { getTurnstileSiteKey } from '@/lib/comment-spam'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Registrace',
  robots: { index: false, follow: false },
}

/** Registrace nového účtu — stejný rám jako ostatní stránky kolem účtu. */
export default async function RegisterPage() {
  // Přihlášený se neregistruje.
  const user = await getCurrentUser()
  if (user) redirect('/')

  return (
    <AuthPageShell
      title="Nový účet"
      subtitle="Měj svůj obsah pod svým jménem."
      backHref="/"
      backLabel="Zpět na web"
    >
      <RegisterForm turnstileSiteKey={getTurnstileSiteKey()} />
    </AuthPageShell>
  )
}
