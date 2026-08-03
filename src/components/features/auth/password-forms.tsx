'use client'

import { useActionState, useId, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Turnstile, type TurnstileHandle } from '@/components/features/comments/turnstile'
import {
  forgotPasswordAction,
  resetPasswordAction,
  type ForgotState,
  type ResetState,
} from '@/lib/password-actions'

/**
 * Formuláře pro zapomenuté heslo: žádost o odkaz a nastavení nového hesla.
 * Vzhled i tón (tykání) sdílí s přihlášením a registrací.
 */

function Field({
  id,
  label,
  type,
  name,
  autoComplete,
  autoFocus,
  hint,
}: {
  id: string
  label: string
  type: string
  name: string
  autoComplete: string
  autoFocus?: boolean
  hint?: string
}) {
  const hintId = `${id}-hint`
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={type}
          name={name}
          required
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-describedby={hint ? hintId : undefined}
          placeholder=" "
          className="peer block w-full rounded-xl bg-[#eef3fb] px-4 pb-1.5 pt-5 text-[14.5px] text-[#2c3643] outline-none ring-2 ring-transparent transition-shadow focus:ring-[#215491]/35"
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-4 top-1 text-[11px] font-semibold uppercase leading-none tracking-wide text-[#8a99a8] transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-[14.5px] peer-placeholder-shown:font-normal peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-[#9aa4ad] peer-focus:top-1 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wide peer-focus:text-[#215491]"
        >
          {label}
        </label>
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 px-1 text-[12px] leading-snug text-[#9aa4ad]">
          {hint}
        </p>
      )}
    </div>
  )
}

const ERROR_CLASS =
  'mb-5 rounded-xl bg-[#fdeceb] px-4 py-3 text-center text-[14px] font-medium text-[#a3271d]'
const BUTTON_CLASS =
  'mx-auto mt-5 block w-fit rounded-full bg-[#215491] px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:opacity-60'

/** Krok 1 — pošli mi odkaz na e-mail. */
export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(forgotPasswordAction, {
    status: 'idle',
  })
  const emailId = useId()
  const turnstileRef = useRef<TurnstileHandle>(null)
  const [renderedAt] = useState(() => Date.now())

  if (state.status === 'sent') {
    return (
      <div className="mx-auto max-w-[340px] text-center">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#2f7d9a] to-[#215491]">
          <Image src="/assets/avatar-parrot.png" alt="" width={32} height={32} unoptimized />
        </span>
        <h2 className="font-heading text-[20px] font-bold text-[#1a3f6c]">Podívej se do e-mailu</h2>
        {/* ZÁMĚRNĚ neříkáme, jestli účet existuje — jinak by šlo formulářem
            zjišťovat, kdo je na webu registrovaný. */}
        <p className="mt-2 text-[14.5px] leading-relaxed text-[#5b666e]">
          Pokud u nás účet s tímhle e-mailem je, poslali jsme na něj odkaz pro nastavení nového
          hesla.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-[#9aa4ad]">
          Nepřišel? Zkontroluj spam.
        </p>
        <Link
          href="/prihlaseni"
          className="mx-auto mt-6 block w-fit rounded-full border-2 border-[#c9d4e0] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-[#5b666e] transition-colors hover:border-[#215491] hover:text-[#215491]"
        >
          Zpět na přihlášení
        </Link>
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        formAction(fd)
        turnstileRef.current?.reset()
      }}
      className="mx-auto max-w-[312px]"
    >
      <input type="hidden" name="renderedAt" value={renderedAt} />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      {state.status === 'error' && (
        <p role="alert" className={ERROR_CLASS}>
          {state.message}
        </p>
      )}

      <Field
        id={emailId}
        label="E-mail"
        type="email"
        name="email"
        autoComplete="email"
        autoFocus
        hint="Pošleme na něj odkaz pro nastavení nového hesla."
      />

      {turnstileSiteKey && (
        <div className="mt-4">
          <Turnstile ref={turnstileRef} siteKey={turnstileSiteKey} />
        </div>
      )}

      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        {pending ? 'Odesílám…' : 'Poslat odkaz'}
      </button>

      <p className="mt-5 text-center text-[13.5px] text-[#8a939b]">
        Vzpomněl sis?{' '}
        <Link href="/prihlaseni" className="font-semibold text-[#215491] hover:underline">
          Přihlas se
        </Link>
      </p>
    </form>
  )
}

/** Krok 2 — nastavení nového hesla podle tokenu z e-mailu. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {
    status: 'idle',
  })
  const passwordId = useId()
  const againId = useId()

  return (
    <form action={formAction} className="mx-auto max-w-[312px]">
      <input type="hidden" name="token" value={token} />

      {state.status === 'error' && (
        <p role="alert" className={ERROR_CLASS}>
          {state.message}
        </p>
      )}

      <div className="space-y-4">
        <Field
          id={passwordId}
          label="Nové heslo"
          type="password"
          name="password"
          autoComplete="new-password"
          autoFocus
        />
        <Field
          id={againId}
          label="Heslo ještě jednou"
          type="password"
          name="passwordAgain"
          autoComplete="new-password"
        />
      </div>

      <button type="submit" disabled={pending} className={BUTTON_CLASS}>
        {pending ? 'Ukládám…' : 'Nastavit heslo'}
      </button>

      <p className="mt-5 text-center text-[13px] leading-relaxed text-[#9aa4ad]">
        Po nastavení tě rovnou přihlásíme.
      </p>
    </form>
  )
}
