import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import { LoginForm } from '@/components/features/auth/login-form'
import { getCurrentUser } from '@/lib/auth'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Přihlášení',
  // Přihlašovací stránka nemá co dělat ve výsledcích hledání.
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<{ next?: string }> }

/** Adresa pro návrat — jen cesta na tomto webu (stejné pravidlo jako v akci). */
function safeNext(raw?: string): string {
  return raw && /^\/(?!\/)[^\s"'<>\\]*$/.test(raw) ? raw : '/'
}

/**
 * Samostatná přihlašovací stránka — ZÁKLAD přihlašování.
 *
 * Na webu se běžně otevře modál se stejným formulářem, ale tahle stránka je
 * pravda pro všechny ostatní případy: bez JavaScriptu, ze zaslaného odkazu,
 * po vypršení přihlášení nebo když se sem uživatel dostane z e-mailu.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams
  const nextPath = safeNext(next)

  // Přihlášeného sem nepouštíme — rovnou ho vrátíme tam, kam mířil.
  const user = await getCurrentUser()
  if (user) redirect(nextPath)

  return (
    <AuthPageShell
      title="Přihlášení"
      subtitle="Přihlas se a měj vše na jednom místě."
      backHref={nextPath}
    >
      <LoginForm nextPath={nextPath} autoFocus />
    </AuthPageShell>
  )
}
