'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { UserAvatar } from '@/components/user-avatar'
import { updateProfileAction, type ProfileFormState } from '@/lib/profile-actions'

/**
 * Úprava vlastního profilu PŘÍMO na profilu.
 *
 * Nikam se neodchází: tlačítko „Upravit profil" jen přidá do adresy `?upravit=1`
 * a tatáž stránka se vykreslí s formulářem. Díky tomu to funguje i bez
 * JavaScriptu (odkaz + `<form action>`), ale se zapnutým JS je přechod okamžitý,
 * protože Next stránku překreslí bez načtení celého dokumentu.
 *
 * Ukládá se VÝSLOVNĚ tlačítkem, ne samo po odkliknutí políčka. Automatické
 * ukládání sice vypadá moderně, ale člověk pak neví, jestli se změna uložila,
 * hůř se z něj vzpamatovává při chybě a špatně se ovládá z klávesnice.
 */

const MAX_DESCRIPTION = 1000

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-500">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-[#9aa4ad]">{hint}</p>}
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]'

export function ProfileEditForm({
  profileHref,
  publicName,
  firstName,
  lastName,
  description,
  myWebUrl,
  avatarUrl,
}: {
  profileHref: string
  publicName: string
  firstName: string | null
  lastName: string | null
  description: string | null
  myWebUrl: string | null
  avatarUrl: string | null
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfileAction,
    { status: 'idle' },
  )
  const firstNameId = useId()
  const lastNameId = useId()
  const descriptionId = useId()
  const webId = useId()
  const avatarId = useId()

  const fileRef = useRef<HTMLInputElement>(null)
  // Náhled vybrané fotky — člověk uvidí výsledek dřív, než uloží.
  const [preview, setPreview] = useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [descLength, setDescLength] = useState(description?.length ?? 0)

  // Náhled drží soubor v paměti prohlížeče, dokud se adresa neuvolní.
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const shownAvatar = removeAvatar ? null : (preview ?? avatarUrl)

  return (
    <form action={formAction} className="mx-auto max-w-[560px] text-left">
      <input type="hidden" name="removeAvatar" value={removeAvatar ? '1' : '0'} />

      {state.status === 'error' && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-[#fdeceb] px-4 py-3 text-center text-[14px] font-medium text-[#a3271d]"
        >
          {state.message}
        </p>
      )}

      <div className="rounded-2xl bg-[#f5f7f9] p-6">
        {/* FOTKA — vlevo náhled, vpravo ovládání. Ořez na čtverec dělá server,
            takže po uživateli nechceme čtvercovou fotku jako starý web. */}
        <div className="mb-5 flex items-center gap-4">
          <UserAvatar name={publicName} avatarUrl={shownAvatar} size={72} />
          <div className="min-w-0">
            <input
              ref={fileRef}
              id={avatarId}
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              className="peer sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                setPreview(f ? URL.createObjectURL(f) : null)
                if (f) setRemoveAvatar(false)
              }}
            />
            <label
              htmlFor={avatarId}
              className="peer-focus-visible:ring-3 inline-block cursor-pointer rounded-full border-2 border-[#c9d4e0] px-5 py-2 font-heading text-[12.5px] font-bold uppercase tracking-wider text-[#5b666e] transition-colors hover:border-[#215491] hover:text-[#215491] peer-focus-visible:border-[#215491] peer-focus-visible:ring-[#e9f1f9]"
            >
              Vybrat fotku
            </label>
            {shownAvatar && (
              <button
                type="button"
                onClick={() => {
                  setPreview(null)
                  setRemoveAvatar(true)
                  if (fileRef.current) fileRef.current.value = ''
                }}
                className="ml-3 text-[13px] text-[#8a939b] underline decoration-[#c9d4e0] hover:text-[#a3271d]"
              >
                Odebrat
              </button>
            )}
            <p className="mt-2 text-[12.5px] leading-snug text-[#9aa4ad]">
              JPEG, PNG nebo WebP do 2 MB. Na čtverec ji ořízneme za tebe.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={firstNameId} label="Jméno">
            <input
              id={firstNameId}
              name="firstName"
              type="text"
              maxLength={80}
              defaultValue={firstName ?? ''}
              autoComplete="given-name"
              className={inputClass}
            />
          </Field>
          <Field id={lastNameId} label="Příjmení">
            <input
              id={lastNameId}
              name="lastName"
              type="text"
              maxLength={80}
              defaultValue={lastName ?? ''}
              autoComplete="family-name"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            id={descriptionId}
            label="O mně"
            hint={`Krátký medailonek nad tvým obsahem. Zbývá ${MAX_DESCRIPTION - descLength} znaků.`}
          >
            <textarea
              id={descriptionId}
              name="description"
              rows={5}
              maxLength={MAX_DESCRIPTION}
              defaultValue={description ?? ''}
              onChange={(e) => setDescLength(e.target.value.length)}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field
            id={webId}
            label="Webové stránky"
            hint="Třeba www.mujweb.cz — nemusíš psát https://"
          >
            <input
              id={webId}
              name="myWebUrl"
              type="text"
              inputMode="url"
              maxLength={200}
              defaultValue={myWebUrl ?? ''}
              placeholder="www.mujweb.cz"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3.5">
        <button
          type="submit"
          disabled={pending}
          className="whitespace-nowrap rounded-full bg-[#215491] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Ukládám…' : 'Uložit změny'}
        </button>
        <Link
          href={profileHref}
          className="text-[14px] text-[#8a939b] underline decoration-[#c9d4e0] hover:text-[#215491]"
        >
          Zrušit
        </Link>
      </div>
    </form>
  )
}
