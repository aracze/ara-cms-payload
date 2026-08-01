import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { AuthPageShell } from '@/components/features/auth/auth-page-shell'

// Hlavička webu čte přihlášení z cookie, takže se stránka nedá předgenerovat
// (build jinak spadne na „couldn't be rendered statically"). Stejně jako ostatní
// stránky kolem účtu.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Účet je smazaný',
  robots: { index: false, follow: false },
}

/**
 * Potvrzení po smazání účtu.
 *
 * Vlastní stránka místo hlášky na titulce: titulka se vykresluje pro všechny
 * stejně a čtení parametru z adresy by ji zbytečně zdynamičtělo.
 */
export default function AccountDeletedPage() {
  return (
    <AuthPageShell title="Účet je smazaný">
      <div className="text-center">
        <CheckCircle2
          className="mx-auto mb-4 h-12 w-12 text-[#2f9a6a]"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <p className="text-[15px] leading-relaxed text-[#5b666e]">
          Hotovo — účet i profil jsou pryč a jsi odhlášený. Tvoje komentáře a recenze v diskusích
          zůstaly, ale už nejsou propojené s žádným účtem.
        </p>
        <p className="mt-4 text-[13.5px] leading-relaxed text-[#9aa4ad]">
          Kdyby ses chtěl někdy vrátit, stačí se zaregistrovat znovu.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-[#215491] px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c]"
          >
            Zpět na web
          </Link>
          <Link
            href="/registrace"
            className="rounded-full border-2 border-[#c9d4e0] px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-[#5b666e] transition-colors hover:border-[#215491] hover:text-[#215491]"
          >
            Založit nový účet
          </Link>
        </div>
      </div>
    </AuthPageShell>
  )
}
