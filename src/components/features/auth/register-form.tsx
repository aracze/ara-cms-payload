'use client'

import { useActionState, useId, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Turnstile, type TurnstileHandle } from '@/components/features/comments/turnstile'
import { registerAction, type RegisterState } from '@/lib/register-actions'

/**
 * Registrační formulář. Skutečný `<form action>`, takže funguje i bez
 * JavaScriptu (ochrana Turnstile se pak vynechá — server ji vyžaduje jen když
 * je nastavená; viz `verifyTurnstile`).
 *
 * Vzhled i tón odpovídají přihlášení: plná světlá políčka s plovoucím popiskem,
 * pilulkové tlačítko na střed, tykání.
 */

function Field({
  id,
  label,
  type,
  name,
  autoComplete,
  autoFocus,
  hint,
  invalid,
}: {
  id: string
  label: string
  type: string
  name: string
  autoComplete: string
  autoFocus?: boolean
  hint?: string
  invalid?: boolean
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
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          placeholder=" "
          className={`peer block w-full rounded-xl bg-[#eef3fb] px-4 pb-1.5 pt-5 text-[14.5px] text-[#2c3643] outline-none ring-2 transition-shadow focus:ring-[#215491]/35 ${
            invalid ? 'ring-[#e0b4b0]' : 'ring-transparent'
          }`}
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

export function RegisterForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(registerAction, {
    status: 'idle',
  })
  const emailId = useId()
  const usernameId = useId()
  const passwordId = useId()
  const turnstileRef = useRef<TurnstileHandle>(null)
  // Čas načtení formuláře — jednou při mountu (lazy init), stejně jako
  // u formuláře komentářů. Server podle něj pozná robota, který odešle
  // formulář dřív, než by to člověk stihl vyplnit.
  const [renderedAt] = useState(() => Date.now())

  if (state.status === 'success') {
    return (
      <div className="mx-auto max-w-[340px] text-center">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#2f7d9a] to-[#215491]">
          <Image src="/assets/avatar-parrot.png" alt="" width={32} height={32} unoptimized />
        </span>
        <h2 className="font-heading text-[20px] font-bold text-[#1a3f6c]">Podívej se do e-mailu</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[#5b666e]">
          Na <b className="text-[#2c3643]">{state.email}</b> jsme poslali odkaz, kterým účet
          potvrdíš. Bez potvrzení se nedá přihlásit.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-[#9aa4ad]">
          E-mail nepřišel? Zkontroluj spam — a jestli tam nebude, zkus registraci znovu.
        </p>
        <Link
          href="/"
          className="mx-auto mt-6 block w-fit rounded-full border-2 border-[#c9d4e0] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-[#5b666e] transition-colors hover:border-[#215491] hover:text-[#215491]"
        >
          Zpět na web
        </Link>
      </div>
    )
  }

  return (
    <form
      action={(fd) => {
        formAction(fd)
        // Token Turnstile je jednorázový — po odeslání ho vyresetujeme, aby
        // druhý pokus (např. po chybě) neposlal už použitý.
        turnstileRef.current?.reset()
      }}
      className="mx-auto max-w-[312px]"
    >
      <input type="hidden" name="renderedAt" value={renderedAt} />
      {/* Honeypot — skryté pole, které vyplní jen robot. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      {state.status === 'error' && (
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
          autoFocus
          invalid={state.status === 'error' && state.field === 'email'}
        />
        <Field
          id={usernameId}
          label="Uživatelské jméno"
          type="text"
          name="username"
          autoComplete="username"
          hint="Podepisuje tvoje komentáře a je v adrese profilu."
          invalid={state.status === 'error' && state.field === 'username'}
        />
        <Field
          id={passwordId}
          label="Heslo"
          type="password"
          name="password"
          autoComplete="new-password"
          invalid={state.status === 'error' && state.field === 'password'}
        />
      </div>

      {turnstileSiteKey && (
        <div className="mt-4">
          <Turnstile ref={turnstileRef} siteKey={turnstileSiteKey} />
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mx-auto mt-5 block w-fit rounded-full bg-[#215491] px-9 py-3 font-heading text-[14px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:opacity-60"
      >
        {pending ? 'Zakládám účet…' : 'Založit účet'}
      </button>

      <p className="mt-5 text-center text-[13.5px] text-[#8a939b]">
        Už účet máš?{' '}
        <Link href="/prihlaseni" className="font-semibold text-[#215491] hover:underline">
          Přihlas se
        </Link>
      </p>
    </form>
  )
}
