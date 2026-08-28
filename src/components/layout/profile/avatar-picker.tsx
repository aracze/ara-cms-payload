'use client'

import { useEffect, useId, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Camera } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { AVATAR_ACCEPT } from '@/lib/profile-limits'
import { useOznamZmenu } from '@/components/layout/profile/profile-edit-frame'

// Dialog (a s ním celá knihovna react-easy-crop) se stahuje až ve chvíli,
// kdy si člověk poprvé vybere soubor — do té doby profil nic nenese.
const AvatarCropDialog = dynamic(
  () => import('./avatar-crop-dialog').then((m) => m.AvatarCropDialog),
  { ssr: false },
)

/**
 * Fotka v hlavičce profilu v režimu úprav.
 *
 * Je to obyčejný `<input type="file">` schovaný pod popiskem, který vypadá jako
 * samotná fotka — kliknutím se rovnou otevře výběr souboru. Po vybrání se
 * otevře dialog ručního výřezu (viz `AvatarCropDialog`); do formuláře se pak
 * vloží už oříznutý čtverec.
 *
 * Skryté pole `removeAvatar` řeší odebrání; server podle něj pozná rozdíl mezi
 * „nic jsem neměnil" a „chci být bez fotky".
 */
export function AvatarPicker({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [nahled, setNahled] = useState<string | null>(null)
  const [odebrat, setOdebrat] = useState(false)
  // Soubor čekající v dialogu výřezu; do formuláře se dostane až po potvrzení.
  const [kOrezu, setKOrezu] = useState<File | null>(null)
  // Odebrání je tlačítko, ne psaní do pole — formulář by o něm sám nevěděl
  // a lišta by tvrdila, že nic neuloženého nemáš.
  const oznamZmenu = useOznamZmenu()

  // Náhled drží soubor v paměti prohlížeče, dokud se adresa neuvolní.
  useEffect(() => {
    if (!nahled) return
    return () => URL.revokeObjectURL(nahled)
  }, [nahled])

  const zobrazena = odebrat ? null : (nahled ?? avatarUrl)

  return (
    <div className="relative flex flex-col items-center">
      <input type="hidden" name="removeAvatar" value={odebrat ? '1' : '0'} />
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        name="avatar"
        accept={AVATAR_ACCEPT}
        className="peer sr-only"
        onChange={(e) => {
          // Náhled ani formulář se zatím nemění — soubor jde nejdřív do
          // dialogu výřezu a rozhodne se tam.
          const soubor = e.target.files?.[0]
          if (soubor) setKOrezu(soubor)
        }}
      />
      {kOrezu && (
        <AvatarCropDialog
          file={kOrezu}
          onDone={(soubor) => {
            // Výřez do formuláře: input přijímá soubory jen přes DataTransfer.
            const dt = new DataTransfer()
            dt.items.add(soubor)
            if (fileRef.current) fileRef.current.files = dt.files
            setNahled(URL.createObjectURL(soubor))
            setOdebrat(false)
            setKOrezu(null)
            // Programové nastavení `files` událost change nevyvolá — formuláři
            // je potřeba změnu ohlásit, jinak by nevěděl o neuloženém výřezu.
            oznamZmenu()
          }}
          onCancel={() => {
            // Zrušení = jako by si člověk žádný soubor nevybral.
            if (fileRef.current) fileRef.current.value = ''
            setKOrezu(null)
          }}
        />
      )}
      {/* Popisek JE ta fotka — proto `cursor-pointer` a zaostření z klávesnice
          přes `peer-focus-visible` (vlastní vstup je vizuálně skrytý). */}
      <label
        htmlFor={inputId}
        className="group relative cursor-pointer rounded-full ring-offset-2 ring-offset-transparent peer-focus-visible:ring-2 peer-focus-visible:ring-white"
      >
        <UserAvatar name={name} avatarUrl={zobrazena} size={84} />
        <span className="pointer-events-none absolute inset-[3px] grid place-items-center rounded-full bg-[#0a1626]/55 transition-colors group-hover:bg-[#0a1626]/70">
          <Camera className="h-6 w-6 text-white" strokeWidth={2} aria-hidden="true" />
        </span>
      </label>

      <span className="mt-1.5 flex items-center gap-2 text-[11.5px] font-semibold text-white/85">
        <label htmlFor={inputId} className="cursor-pointer hover:underline">
          Změnit fotku
        </label>
        {zobrazena && (
          <>
            <span aria-hidden="true" className="text-white/40">
              ·
            </span>
            <button
              type="button"
              onClick={() => {
                setNahled(null)
                setOdebrat(true)
                if (fileRef.current) fileRef.current.value = ''
                oznamZmenu()
              }}
              className="hover:underline"
            >
              Odebrat
            </button>
          </>
        )}
      </span>
      <span className="mt-0.5 text-[10.5px] text-white/55">JPEG, PNG nebo WebP do 2 MB</span>
    </div>
  )
}
