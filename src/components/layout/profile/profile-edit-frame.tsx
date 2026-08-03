'use client'

import { createContext, useActionState, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { updateProfileAction, type ProfileFormState } from '@/lib/profile-actions'

/**
 * Rám režimu úprav profilu.
 *
 * Profil se v úpravách NEMĚNÍ na formulář — zůstává profilem, jen se dají
 * přepisovat jednotlivé části tam, kde jsou (fotka v hlavičce, jméno v nadpisu,
 * medailonek, web). Tenhle komponent kolem toho jen obtočí `<form>` a hlídá
 * stav; samotné tlačítko vykresluje `ProfileSaveRow`.
 *
 * Proč jedno uložení a ne ukládání po každém políčku: člověk vidí, že má
 * rozdělanou práci, a uloží ji jedním rozhodnutím. Automatické ukládání po
 * opuštění políčka nedává jistotu, že se změna povedla, a špatně se z něj
 * couvá při chybě.
 *
 * Bez JavaScriptu funguje všechno kromě náhledu fotky, hlášky „neuložené
 * změny" a varování při odchodu — je to obyčejný `<form action>`.
 */

type StavUprav = {
  zmeneno: boolean
  pending: boolean
  profileHref: string
  /** Ohlásí změnu, kterou prohlížeč sám nezachytí (tlačítko, ne psaní do pole). */
  oznamZmenu: () => void
}

const KontextUprav = createContext<StavUprav | null>(null)

export function ProfileEditFrame({
  profileHref,
  children,
}: {
  profileHref: string
  children: React.ReactNode
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfileAction,
    { status: 'idle' },
  )
  const [zmeneno, setZmeneno] = useState(false)

  // Pojistka proti ztrátě rozepsaného profilu. Tlačítko „Uložit" je hned pod
  // políčky, takže při odrolování dolů není vidět — bez téhle hlášky by šlo
  // odejít a o změny přijít, aniž by na to cokoliv upozornilo.
  useEffect(() => {
    if (!zmeneno || pending) return
    const varovani = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', varovani)
    return () => window.removeEventListener('beforeunload', varovani)
  }, [zmeneno, pending])

  return (
    <KontextUprav.Provider
      value={{ zmeneno, pending, profileHref, oznamZmenu: () => setZmeneno(true) }}
    >
      <form action={formAction} onInput={() => setZmeneno(true)} onChange={() => setZmeneno(true)}>
        {state.status === 'error' && (
          <div className="sticky top-0 z-[120] bg-[#fdeceb]">
            <p
              role="alert"
              className="mx-auto max-w-[720px] px-4 py-3 text-center text-[14px] font-medium text-[#a3271d]"
            >
              {state.message}
            </p>
          </div>
        )}
        {children}
      </form>
    </KontextUprav.Provider>
  )
}

/**
 * Řádek s uložením — patří HNED POD poslední upravované pole, ne na konec
 * stránky. Dole (pod mapou a výpisy) vypadal jako součást obsahu profilu,
 * ne jako zakončení rozdělané práce.
 */
export function ProfileSaveRow() {
  const stav = useContext(KontextUprav)
  if (!stav) return null
  const { zmeneno, pending, profileHref } = stav

  return (
    <div className="mx-auto mt-7 max-w-[560px] border-t border-[#eef1f4] pt-5">
      {/* Hláška NAD tlačítky: nejdřív se člověk dozví, co má udělat, teprve
          pak na to sáhne. Pod tlačítkem ji přečte, až když je po všem. */}
      <p aria-live="polite" className="mb-3 text-center text-[12.5px] text-[#9aa4ad]">
        {zmeneno ? 'Máš neuložené změny' : 'Uprav si, co potřebuješ — pak ulož.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={pending}
          className="whitespace-nowrap rounded-full bg-[#215491] px-8 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Ukládám…' : 'Uložit změny'}
        </button>
        <Link
          href={profileHref}
          className="text-[14px] text-[#8a939b] underline decoration-[#c9d4e0] hover:text-[#215491]"
        >
          {zmeneno ? 'Zahodit změny' : 'Zavřít úpravy'}
        </Link>
      </div>
    </div>
  )
}

/** Ohlášení změny zvenčí (např. tlačítko „Odebrat" u fotky). */
export function useOznamZmenu(): () => void {
  return useContext(KontextUprav)?.oznamZmenu ?? (() => {})
}
