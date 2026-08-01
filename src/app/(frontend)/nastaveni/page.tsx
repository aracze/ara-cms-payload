import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthPageShell } from '@/components/features/auth/auth-page-shell'
import { ChangePasswordForm, DeleteAccountForm } from '@/components/features/auth/account-forms'
import { getCurrentUser } from '@/lib/auth'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nastavení účtu',
  robots: { index: false, follow: false },
}

/**
 * Neveřejná část účtu — e-mail, heslo, smazání účtu.
 *
 * Veřejné údaje (fotka, jméno, medailonek, web) tady schválně NEJSOU: ty se
 * upravují přímo na profilu, kde je člověk vidí. Tahle stránka drží jen to, co
 * se na profilu nezobrazuje, a proto je celá jedna — žádná další navigace jako
 * na starém webu, kde byly tři záložky vedle sebe.
 */
export default async function AccountSettingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/prihlaseni?next=/nastaveni')

  // E-mail se čte na serveru a jen se ukazuje. Do prohlížeče tak jde jedna
  // hodnota k zobrazení, ne celý uživatel.
  const payload = await getDb()
  const doc = await payload.findByID({
    collection: 'users',
    id: me.id,
    depth: 0,
    select: { email: true },
    overrideAccess: true,
  })
  const email = (doc as { email?: string }).email ?? ''

  return (
    <AuthPageShell title="Nastavení účtu">
      <div className="space-y-10">
        <section>
          <h2 className="mb-1 font-heading text-[19px] font-bold text-[#1a3f6c]">
            Přihlašovací e-mail
          </h2>
          <p className="mb-3 text-[14.5px] leading-relaxed text-[#5b666e]">
            Slouží k přihlášení a k obnově hesla. Veřejně ho nikde neukazujeme.
          </p>
          <p className="max-w-[420px] rounded-xl bg-[#f5f7f9] px-4 py-3 text-[15px] text-[#2c3643]">
            {email}
          </p>
          <p className="mt-2 text-[13px] leading-snug text-[#9aa4ad]">
            Změnu e-mailu zatím neděláme — potřebuje potvrzení z nové adresy, jinak by stačil
            překlep a přišel bys o možnost obnovit heslo. Napiš nám a přepíšeme ho.
          </p>
        </section>

        <section className="border-t border-[#eef1f4] pt-8">
          <h2 className="mb-1 font-heading text-[19px] font-bold text-[#1a3f6c]">Změna hesla</h2>
          <p className="mb-4 text-[14.5px] leading-relaxed text-[#5b666e]">
            Zapomenuté heslo řeší{' '}
            <Link href="/zapomenute-heslo" className="font-semibold text-[#215491] hover:underline">
              obnova přes e-mail
            </Link>
            .
          </p>
          <ChangePasswordForm />
        </section>

        <section className="border-t border-[#eef1f4] pt-8">
          <h2 className="mb-1 font-heading text-[19px] font-bold text-[#a3271d]">Smazání účtu</h2>
          <div className="mt-3">
            <DeleteAccountForm publicName={me.publicName} />
          </div>
        </section>

        {me.profileHref && (
          <p className="border-t border-[#eef1f4] pt-6 text-[14px] text-[#8a939b]">
            Fotku, jméno, medailonek a web najdeš{' '}
            <Link href={me.profileHref} className="font-semibold text-[#215491] hover:underline">
              na svém profilu
            </Link>{' '}
            pod tlačítkem Upravit profil.
          </p>
        )}
      </div>
    </AuthPageShell>
  )
}
