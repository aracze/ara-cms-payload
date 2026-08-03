'use client'

import { useActionState, useId } from 'react'
import Link from 'next/link'
import { loginAction, type LoginState } from '@/lib/auth-actions'

/**
 * Přihlašovací formulář — JEDEN pro stránku /prihlaseni i pro modál na webu.
 *
 * Je to skutečný `<form>` s `action`, takže funguje i bez JavaScriptu: prohlížeč
 * ho odešle, server ověří a přesměruje. S JavaScriptem navíc uživatel zůstane
 * na místě a chyba se vypíše bez přenačtení stránky.
 *
 * Vzhled: vzdušný, plná světlá políčka bez rámečku a pilulkové tlačítko na
 * střed (v duchu původního webu). Popisek políčka ale ZŮSTÁVÁ — jen jako
 * plovoucí uvnitř. Na starém webu byla políčka pouze s nápovědou, která po
 * začátku psaní zmizela, takže nebylo poznat, co do políčka patří, a čtečky
 * obrazovky si s ním neporadily.
 *
 * Tón je tykání, stejně jako zbytek webu („Byl jsi zde? Ohodnoť to!").
 */

/** Sekundární „pilulkové" tlačítko (odkaz i button vypadají stejně). */
const SECONDARY_CLASS =
  'mx-auto block w-fit rounded-full border-2 border-[#c9d4e0] px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-[#5b666e] transition-colors hover:border-[#215491] hover:text-[#215491]'

/** Plovoucí popisek: sedí v políčku a při psaní/fokusu vyjede nad text. */
function Field({
  id,
  label,
  type,
  name,
  autoComplete,
  autoFocus,
}: {
  id: string
  label: string
  type: string
  name: string
  autoComplete: string
  autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        name={name}
        required
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        // `placeholder=" "` (mezera) je potřeba pro CSS `placeholder-shown`,
        // podle kterého se popisek vrací dolů u prázdného políčka.
        placeholder=" "
        // Odsazení je laděné na NAMĚŘENOU výšku 48 px (bylo 56). Pozor: skutečný
        // `input` je vyšší než stejně odsazený `span` v návrhu — má vlastní
        // řádkování, takže hodnoty z mockupu se sem nedají přepsat 1 : 1.
        className="peer block w-full rounded-xl bg-[#eef3fb] px-4 pb-1.5 pt-5 text-[14.5px] text-[#2c3643] outline-none ring-2 ring-transparent transition-shadow focus:ring-[#215491]/35"
      />
      <label
        htmlFor={id}
        // `leading-none`: bez něj má rámec popisku výšku celého řádku a zasahoval
        // 1 px do textu v políčku.
        className="pointer-events-none absolute left-4 top-1 text-[11px] font-semibold uppercase leading-none tracking-wide text-[#8a99a8] transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-[14.5px] peer-placeholder-shown:font-normal peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-[#9aa4ad] peer-focus:top-1 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wide peer-focus:text-[#215491]"
      >
        {label}
      </label>
    </div>
  )
}

export function LoginForm({
  nextPath,
  autoFocus = false,
  onForgot,
  onRegister,
}: {
  /** Kam se vrátit po přihlášení (jen cesta na tomto webu — ověřuje server). */
  nextPath: string
  autoFocus?: boolean
  /**
   * V přihlašovacím OKNĚ se registrace i obnova hesla otevřou rovnou v něm,
   * ať uživatel neskáče mezi stránkami. Když obsluha není předaná (stránka
   * /prihlaseni), zůstávají odkazy — ty fungují i bez JavaScriptu.
   */
  onForgot?: () => void
  onRegister?: () => void
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {
    status: 'idle',
  })
  const emailId = useId()
  const passwordId = useId()

  return (
    // Šířka obsahu se drží tady (ne na okně): políčka pro e-mail a heslo jsou
    // krátké údaje a na plnou šířku okna působila rozvláčně. Okno tím zároveň
    // získá vzdušnější okraje. Stejná šířka platí i na stránce /prihlaseni.
    <form action={formAction} className="mx-auto max-w-[312px]">
      <input type="hidden" name="next" value={nextPath} />

      {state.status === 'error' && (
        // `role="alert"` = čtečka obrazovky hlášku přečte hned, jak se objeví.
        <p
          role="alert"
          className="mb-5 rounded-xl bg-[#fdeceb] px-4 py-3 text-center text-[14px] font-medium text-[#a3271d]"
        >
          {state.message}
        </p>
      )}

      <div className="space-y-4">
        <Field
          id={emailId}
          label="E-mail"
          type="email"
          name="email"
          autoComplete="email"
          autoFocus={autoFocus}
        />
        <Field
          id={passwordId}
          label="Heslo"
          type="password"
          name="password"
          autoComplete="current-password"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mx-auto mt-5 block w-fit rounded-full bg-[#215491] px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:opacity-60"
      >
        {pending ? 'Přihlašuji…' : 'Přihlásit se'}
      </button>

      <p className="mt-4 text-center">
        {onForgot ? (
          <button
            type="button"
            onClick={onForgot}
            className="text-[13.5px] font-semibold text-[#215491] hover:underline"
          >
            Zapomenuté heslo?
          </button>
        ) : (
          <Link
            href="/zapomenute-heslo"
            className="text-[13.5px] font-semibold text-[#215491] hover:underline"
          >
            Zapomenuté heslo?
          </Link>
        )}
      </p>

      <div className="mt-5 border-t border-[#eef1f4] pt-5">
        {onRegister ? (
          <button type="button" onClick={onRegister} className={SECONDARY_CLASS}>
            Založit nový účet
          </button>
        ) : (
          <Link href="/registrace" className={SECONDARY_CLASS}>
            Založit nový účet
          </Link>
        )}
      </div>
    </form>
  )
}
