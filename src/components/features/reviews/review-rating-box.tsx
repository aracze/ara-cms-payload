'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createReview, type ReviewFormState } from '@/lib/review-actions'
import { Turnstile, type TurnstileHandle } from '@/components/features/comments/turnstile'
import { StarInput } from './star-input'

/**
 * Lišta „Byl jsi zde? Ohodnoť to!" + sbalený formulář recenze (legacy
 * `.rating-review`, vizuál sjednocený s inline recenzemi na stránce místa).
 * Hvězdičky v liště JSOU vstup hodnocení — kliknutí nastaví počet hvězd
 * a rozbalí formulář (stejně jako raty + collapse na starém webu).
 *
 * Ochrana: skrytý honeypot `website`, čas načtení `renderedAt` a volitelně
 * Cloudflare Turnstile — stejné vrstvy jako u komentářů. Po úspěchu se přes
 * router.refresh() objeví nová recenze nahoře ve výpisu.
 */
export function ReviewRatingBox({
  pageId,
  turnstileSiteKey,
  signedAs,
  loginHint,
  isSignedIn = false,
}: {
  pageId: number
  turnstileSiteKey: string | null
  /** Pruh „Píšeš jako…" / pozvánka k přihlášení (vykresluje server). */
  signedAs?: React.ReactNode
  /** Jednořádková výzva k přihlášení POD políčkem jména (nepřihlášený). */
  loginHint?: React.ReactNode
  /** Přihlášený nevyplňuje jméno — bere se ze session na serveru. */
  isSignedIn?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<ReviewFormState>({ status: 'idle' })
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  // Čas načtení — jednou při mountu (anti-bot timing, viz komentáře).
  const [renderedAt] = useState(() => Date.now())

  const boxRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)

  const openForm = () => {
    setOpen(true)
    // Fokus až po vykreslení rozbaleného formuláře.
    window.setTimeout(() => bodyRef.current?.focus(), 100)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Legacy validační hláška — hvězdičky se vybírají v liště, ne ve formuláři.
    if (!rating) {
      setState({
        status: 'error',
        message: 'Je zapotřebí přidat hvězdičky k danému turistickému cíli.',
      })
      return
    }
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await createReview(state, formData)
        setState(result)
        if (result.status === 'success') {
          formRef.current?.reset()
          setRating(0)
          router.refresh()
        }
      } catch {
        // Pád akce (např. výpadek sítě) — srozumitelná hláška místo ticha.
        setState({ status: 'error', message: 'Odeslání se nepodařilo. Zkus to prosím znovu.' })
      } finally {
        // Turnstile token je jednorázový — reset po KAŽDÉM dokončení (chyba
        // i pád), jinak by další odeslání poslalo už spotřebovaný token.
        turnstileRef.current?.reset()
      }
    })
  }

  return (
    <div
      ref={boxRef}
      id="ohodnotit"
      className="scroll-mt-24 overflow-hidden rounded-xl border border-[#e3e9ef]"
    >
      {/* Hlavička lišty — nadpis, hvězdičkový vstup, tlačítko vpravo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <h2 className="text-[16px] font-bold text-[#215491]">Byl jsi zde? Ohodnoť to!</h2>

        <StarInput
          value={rating}
          onSelect={(n) => {
            setRating(n)
            openForm()
          }}
          size={19}
        />

        <button
          type="button"
          onClick={openForm}
          className="ml-auto whitespace-nowrap rounded-full border-[1.5px] border-[#215491] px-5 py-1.5 text-[13px] font-bold text-[#215491] transition-colors hover:bg-[#215491] hover:text-white"
        >
          Napsat recenzi
        </button>
      </div>

      {open && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="border-t border-[#e6eaee] bg-[#f5f7f9] p-6"
        >
          <input type="hidden" name="pageId" value={pageId} />
          <input type="hidden" name="renderedAt" value={renderedAt} />
          <input type="hidden" name="rating" value={rating || ''} />

          {/* Honeypot — skryté pole; vyplní ho jen robot. Mimo tab pořadí i čteček. */}
          <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label>
              Nevyplňuj toto pole
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          {signedAs}

          {/* Přihlášený jméno nevyplňuje — podepíše se účtem (server si ho bere
              ze session, hodnotě z formuláře by stejně nevěřil). */}
          {!isSignedIn && (
            <div className="mb-4">
              <div className="max-w-xs">
                <label
                  htmlFor="review-name"
                  className="mb-1.5 block text-sm font-semibold text-gray-500"
                >
                  Jméno
                </label>
                <input
                  id="review-name"
                  name="authorName"
                  type="text"
                  required
                  maxLength={80}
                  placeholder="Tvé jméno"
                  className="w-full rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]"
                />
              </div>
              {loginHint}
            </div>
          )}
          <div className="mb-4">
            <label
              htmlFor="review-body"
              className="mb-1.5 block text-sm font-semibold text-gray-500"
            >
              Recenze
            </label>
            <textarea
              id="review-body"
              ref={bodyRef}
              name="body"
              required
              maxLength={5000}
              rows={8}
              placeholder="Poděl se o své zkušenosti a zážitky a buď inspirací pro ostatní cestovatele. Odkazy či jiné html prvky nelze vkládat pro snížení spamu bez přidané hodnoty. Nekvalitní či bez hodnotné recenze budou automaticky mazané."
              className="min-h-[110px] w-full resize-y rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] leading-relaxed text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]"
            />
          </div>

          {turnstileSiteKey && (
            <div className="mb-4">
              <Turnstile ref={turnstileRef} siteKey={turnstileSiteKey} />
            </div>
          )}

          {state.status === 'error' && (
            <p role="alert" className="mb-4 text-sm font-medium text-red-600">
              {state.message}
            </p>
          )}
          {state.status === 'success' && (
            <p role="status" className="mb-4 text-sm font-medium text-green-700">
              Děkujeme! Recenze byla přidána.
            </p>
          )}

          <div className="flex items-center gap-3.5">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#215491] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Odesílám…' : 'Vložit recenzi'}
            </button>
            {!turnstileSiteKey && (
              <span className="text-[12.5px] text-gray-500">
                Chráněno proti spamu · bez opisování captchy
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
