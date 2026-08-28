'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper, { type Area } from 'react-easy-crop'
import { X, ZoomIn, ZoomOut } from 'lucide-react'

/**
 * Dialog ručního výřezu profilové fotky.
 *
 * Otevře se hned po vybrání souboru: fotka se posouvá tažením (myší i prstem),
 * přibližuje posuvníkem, kolečkem nebo štipcem. Kruh odpovídá PŘESNĚ budoucí
 * profilovce — co je v něm vidět, to se uloží, nic navíc se neořezává.
 *
 * Výchozí poloha je střed fotky, tedy totéž, co by jinak udělal server sám
 * (kolekce Avatars ořezává `position: 'centre'`). Kdo výřez řešit nechce,
 * rovnou potvrdí a dopadne stejně jako dřív.
 *
 * Výřez se dělá UŽ V PROHLÍŽEČI (canvas → JPEG 512 px): server pak dostane
 * hotový čtverec a jeho ořez ze středu nemá co pokazit. Vedlejší výhoda:
 * odesílá se malý soubor, takže i fotka větší než limit 2 MB projde — limit
 * se počítá až z výřezu.
 */

/** Hrana výsledného čtverce — stejná, na jakou stejně zmenšuje server. */
const VYSTUP_PX = 512

async function vyrizniCtverec(file: File, oblast: Area): Promise<Blob> {
  // `createImageBitmap` místo `img.decode()`: decode() umí bezdůvodně spadnout
  // na EncodingError (ověřeno v Chromiu) a bitmapa navíc rovnou respektuje
  // EXIF otočení, stejně jako náhled v dialogu.
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = VYSTUP_PX
    canvas.height = VYSTUP_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas není k dispozici.')
    // Průhledná místa PNG by převod do JPEG vyplnil černou — bílá je na
    // profilovce to, co člověk čeká.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, VYSTUP_PX, VYSTUP_PX)
    ctx.drawImage(
      bitmap,
      oblast.x,
      oblast.y,
      oblast.width,
      oblast.height,
      0,
      0,
      VYSTUP_PX,
      VYSTUP_PX,
    )

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Export výřezu selhal.'))),
        'image/jpeg',
        0.9,
      )
    })
  } finally {
    bitmap.close()
  }
}

export function AvatarCropDialog({
  file,
  onDone,
  onCancel,
}: {
  /** Soubor, který si člověk právě vybral (ještě neoříznutý). */
  file: File
  /**
   * Hotový soubor k odeslání formulářem. Většinou výřez; když se fotku
   * nepodaří v prohlížeči zpracovat (exotický formát), přijde původní soubor
   * a ořez nechá na serveru — stejné chování jako před zavedením dialogu.
   */
  onDone: (soubor: File) => void
  onCancel: () => void
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [ukladam, setUkladam] = useState(false)
  // Potvrdit jde až po načtení fotky: knihovna hlásí vybranou oblast teprve
  // od té chvíle a rychlý klik před tím by skončil v záložní větvi (odeslal by
  // se neoříznutý originál). Ověřeno testem — 0,4 s po otevření to nastalo.
  const [nacteno, setNacteno] = useState(false)
  // Vybranou oblast hlásí knihovna při každé změně — do refu, ne do stavu:
  // k ničemu se nekreslí, potřebuje ji až potvrzení.
  const oblastRef = useRef<Area | null>(null)

  // Adresa fotky pro náhled vzniká i zaniká V EFEKTU, ne v useState: React ve
  // vývoji komponentu zkušebně odpojí a hned připojí znovu — adresa z useState
  // by to přežila, ale úklid by ji mezitím uvolnil a fotka by se už nenačetla
  // (černý čtverec po zrušení a novém výběru).
  const [zdrojUrl, setZdrojUrl] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    // Lint tu setState v efektu nechce (obecně rozjíždí kaskádu překreslení);
    // tady je to ale životní cyklus externího zdroje, který jinde vzniknout
    // nemůže — viz komentář výš.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZdrojUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  // Prohlížeč fotku neumí zobrazit (typicky HEIC z iPhonu) — místo černého
  // čtverce a věčně neaktivního tlačítka dostane člověk vysvětlení.
  const [chyba, setChyba] = useState(false)

  // Zrušení BĚHEM zpracování: `potvrdit` chvíli čeká na dekódování a export,
  // a Esc nebo „Zrušit" mezitím dialog zavřou. Bez příznaku by se hotový výřez
  // po chvíli stejně propsal do formuláře — jako by člověk nezrušil.
  const zrusenoRef = useRef(false)
  const zrusit = useCallback(() => {
    zrusenoRef.current = true
    onCancel()
  }, [onCancel])

  // Po zavření vrátit fokus tam, odkud se dialog otevřel (výběr souboru) —
  // jinak po odstranění zaostřeného tlačítka spadne na <body> a člověk
  // s klávesnicí ztratí místo. Zvlášť a bez závislostí: zapamatuje se JEDNOU
  // při otevření, ne při každém překreslení rodiče.
  useEffect(() => {
    const predtim = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => predtim?.focus()
  }, [])

  // Chování modálu (zkrácená verze vzoru z header-account): stránka pod oknem
  // se neroluje, Esc zavírá, fokus zůstává uvnitř. Na zákryt kliknutím mimo
  // okno schválně nereaguje — při tažení fotky by šlo o rozdělaný výřez přijít
  // jedním ujetím myši.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const puvodniOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const zaostritelne = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
      ).filter((el) => el.getClientRects().length > 0)
    if (!panel.contains(document.activeElement)) zaostritelne()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        zrusit()
        return
      }
      if (e.key !== 'Tab') return
      const list = zaostritelne()
      if (list.length === 0) return
      const prvni = list[0]
      const posledni = list[list.length - 1]
      if (!panel.contains(document.activeElement)) {
        e.preventDefault()
        prvni.focus()
      } else if (e.shiftKey && document.activeElement === prvni) {
        e.preventDefault()
        posledni.focus()
      } else if (!e.shiftKey && document.activeElement === posledni) {
        e.preventDefault()
        prvni.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = puvodniOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [zrusit])

  const potvrdit = async () => {
    const oblast = oblastRef.current
    setUkladam(true)
    try {
      if (!oblast) throw new Error('Chybí vybraná oblast.')
      const blob = await vyrizniCtverec(file, oblast)
      if (zrusenoRef.current) return
      // Jméno je jedno — server ho z důvodu soukromí stejně přepisuje.
      onDone(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    } catch (err) {
      if (zrusenoRef.current) return
      // Nepodařilo se — pošle se původní soubor a ořez udělá server (ze středu).
      // Log zůstává i v produkci: bez něj by se o tiché degradaci nevědělo.
      console.error('[avatar] výřez v prohlížeči selhal:', err)
      onDone(file)
    }
  }

  // Portál na <body>: dialog je vykreslený z hlavičky profilu, která má vlastní
  // vrstvení (z-[101] + vlnka). Uvnitř ní by překryv přes celou stránku
  // nepřekryl vlnku — kreslila se přes fotku v dialogu.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[300] bg-[#0a1626]/55 animate-in fade-in duration-150 motion-reduce:animate-none" />
      <div className="fixed inset-0 z-[310] grid place-items-center overflow-y-auto p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-[0_18px_44px_rgba(15,30,50,0.22)] animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
        >
          <button
            type="button"
            onClick={zrusit}
            aria-label="Zavřít bez uložení výřezu"
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-[#8a939b] transition-colors hover:bg-[#f0f4f9] hover:text-[#2c3643]"
          >
            <X className="h-5 w-5" />
          </button>

          <h2 id={titleId} className="font-heading text-[18px] font-bold text-[#1a3f6c]">
            Umísti se do kruhu
          </h2>
          <p className="mb-4 mt-0.5 text-[13px] text-[#8a939b]">
            Fotku posuň tažením, přibliž posuvníkem. Co je v kruhu, bude tvoje profilovka.
          </p>

          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#0a1626]">
            {chyba ? (
              <p
                role="alert"
                className="absolute inset-0 grid place-items-center px-8 text-center text-[14px] leading-snug text-white/85"
              >
                Tuhle fotku prohlížeč neumí zobrazit. Zkus JPEG, PNG nebo WebP — fotky HEIC z iPhonu
                je potřeba nejdřív převést.
              </p>
            ) : zdrojUrl ? (
              <Cropper
                image={zdrojUrl}
                crop={crop}
                zoom={zoom}
                minZoom={1}
                maxZoom={3}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropAreaChange={(_, oblastPx) => {
                  oblastRef.current = oblastPx
                }}
                onMediaLoaded={() => setNacteno(true)}
                mediaProps={{ onError: () => setChyba(true) }}
              />
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-3 px-1">
            <ZoomOut className="h-4 w-4 shrink-0 text-[#8a939b]" aria-hidden="true" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Přiblížení fotky"
              className="h-6 w-full accent-[#215491]"
            />
            <ZoomIn className="h-5 w-5 shrink-0 text-[#8a939b]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-center text-[12px] text-[#9aa4ad]">
            Fotka jde posouvat tam, kde přesahuje kruh — po přibližení všemi směry.
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={zrusit}
              className="px-1.5 py-2 text-[13.5px] font-semibold text-[#8a939b] hover:text-[#2c3643] hover:underline"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={potvrdit}
              disabled={ukladam || !nacteno || chyba}
              className="whitespace-nowrap rounded-full bg-[#215491] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ukladam ? 'Ořezávám…' : 'Použít fotku'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
