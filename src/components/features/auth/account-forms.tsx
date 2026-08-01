'use client'

import { useActionState, useId, useState } from 'react'
import {
  changePasswordAction,
  deleteAccountAction,
  type AccountFormState,
} from '@/lib/account-actions'

/**
 * Formuláře na stránce účtu: změna hesla a smazání účtu.
 *
 * Obě akce chtějí ZNOVU heslo — u odemčeného počítače nesmí stačit sednout
 * k němu. Mazání účtu je navíc schované za rozbalení a zaškrtnutí, aby se
 * nedalo spustit omylem jedním kliknutím.
 */

const inputClass =
  'w-full rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]'

const labelClass = 'mb-1.5 block text-sm font-semibold text-gray-500'

function Message({ state }: { state: AccountFormState }) {
  if (state.status === 'idle') return null
  const error = state.status === 'error'
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`mb-4 rounded-xl px-4 py-3 text-[14px] font-medium ${
        error ? 'bg-[#fdeceb] text-[#a3271d]' : 'bg-[#e8f5ee] text-[#1f6b45]'
      }`}
    >
      {state.message}
    </p>
  )
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    changePasswordAction,
    { status: 'idle' },
  )
  const currentId = useId()
  const nextId = useId()
  const againId = useId()

  return (
    <form action={formAction} className="max-w-[420px]">
      <Message state={state} />
      <div className="space-y-4">
        <div>
          <label htmlFor={currentId} className={labelClass}>
            Současné heslo
          </label>
          <input
            id={currentId}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={nextId} className={labelClass}>
            Nové heslo
          </label>
          <input
            id={nextId}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={againId} className={labelClass}>
            Nové heslo pro kontrolu
          </label>
          <input
            id={againId}
            name="newPasswordAgain"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-5 whitespace-nowrap rounded-full bg-[#215491] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Měním…' : 'Změnit heslo'}
      </button>
    </form>
  )
}

export function DeleteAccountForm({ publicName }: { publicName: string }) {
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    deleteAccountAction,
    { status: 'idle' },
  )
  const [open, setOpen] = useState(false)
  const passwordId = useId()
  const confirmId = useId()
  const removeNameId = useId()

  if (!open) {
    return (
      <>
        <p className="mb-4 max-w-[560px] text-[14.5px] leading-relaxed text-[#5b666e]">
          Účet zmizí i s profilem. Tvoje komentáře a recenze v diskusích zůstanou — jen přestanou
          být propojené s účtem, takže se budou chovat jako od nepřihlášeného. Smazat je celé nejde
          proto, že by z diskusí zmizely i odpovědi ostatních.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border-2 border-[#e3c4c0] px-6 py-2 font-heading text-[12.5px] font-bold uppercase tracking-wider text-[#a3271d] transition-colors hover:border-[#a3271d]"
        >
          Chci smazat účet
        </button>
      </>
    )
  }

  return (
    <form action={formAction} className="max-w-[520px]">
      <Message state={state} />
      <div className="rounded-2xl bg-[#fdf4f3] p-5">
        <div className="mb-4">
          <label htmlFor={passwordId} className={labelClass}>
            Pro jistotu zadej heslo
          </label>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className={inputClass}
          />
        </div>

        <label
          htmlFor={removeNameId}
          className="mb-3 flex cursor-pointer items-start gap-2.5 text-[14px] leading-snug text-[#2c3643]"
        >
          <input
            id={removeNameId}
            name="removeName"
            type="checkbox"
            value="1"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#a3271d]"
          />
          <span>
            Odstranit u příspěvků i moje jméno <b>{publicName}</b> — nahradí se za „Smazaný
            uživatel“.
          </span>
        </label>

        <label
          htmlFor={confirmId}
          className="flex cursor-pointer items-start gap-2.5 text-[14px] leading-snug text-[#2c3643]"
        >
          <input
            id={confirmId}
            name="confirm"
            type="checkbox"
            value="1"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#a3271d]"
          />
          <span>Rozumím, že smazání účtu už nejde vzít zpět.</span>
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3.5">
        <button
          type="submit"
          disabled={pending}
          className="whitespace-nowrap rounded-full bg-[#a3271d] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#821f17] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Mažu…' : 'Smazat účet'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[14px] text-[#8a939b] underline decoration-[#c9d4e0] hover:text-[#215491]"
        >
          Zrušit
        </button>
      </div>
    </form>
  )
}
