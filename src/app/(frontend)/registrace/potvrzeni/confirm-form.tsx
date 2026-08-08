'use client'

import { CheckCircle2, MailCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useActionState } from 'react'
import { confirmAccount } from './actions'

/**
 * Chybová obrazovka potvrzení — sdílí ji formulář (neplatný token) i stránka
 * (odkaz úplně bez tokenu), aby obě situace mluvily stejně.
 */
export function ConfirmErrorView() {
  return (
    <div className="text-center">
      <XCircle
        className="mx-auto mb-4 h-12 w-12 text-[#c2554a]"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <p className="text-[15px] leading-relaxed text-[#5b666e]">
        Odkaz je pravděpodobně už použitý nebo prošlý. Jestli se nemůžeš přihlásit, zkus registraci
        znovu — na už potvrzený účet se prostě přihlas.
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
  )
}

/**
 * Formulář „Potvrdit účet" + obrazovky výsledku.
 *
 * Ověření spouští až kliknutí (viz actions.ts — ochrana před e-mailovými
 * skenery). Výsledek drží `useActionState` v paměti stránky, ne v URL —
 * adresa se neodesláním nemění a úspěch nejde „vyrobit" ručně.
 */
export function ConfirmAccountForm({ token }: { token: string }) {
  const [result, formAction, isPending] = useActionState(confirmAccount, null)

  if (result === 'ok') {
    return (
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
    )
  }

  if (result === 'chyba') return <ConfirmErrorView />

  return (
    <div className="text-center">
      <MailCheck
        className="mx-auto mb-4 h-12 w-12 text-[#215491]"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <p className="text-[15px] leading-relaxed text-[#5b666e]">
        Zbývá poslední krok — potvrď svůj účet tlačítkem níž.
      </p>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          disabled={isPending}
          className="mx-auto mt-6 block w-fit rounded-full bg-[#215491] px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:cursor-default disabled:opacity-60"
        >
          {isPending ? 'Potvrzuji…' : 'Potvrdit účet'}
        </button>
      </form>
    </div>
  )
}
