'use client'

import { LoadMoreButton } from '@/components/features/load-more-button'
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ReviewPublic } from '@/types/payload'
import { reviewsCountLabel, pluralCs } from '@/lib/utils'
import {
  createReview,
  getPageReviews,
  type ReviewAuthorHint,
  type ReviewFormState,
} from '@/lib/review-actions'
import { UserAvatar } from '@/components/user-avatar'
import { LoginHint } from '@/components/features/auth/signed-as'
import { Turnstile, type TurnstileHandle } from '@/components/features/comments/turnstile'
import { ReviewItem } from './review-item'
import { StarInput } from './star-input'

/** Požadavek „vyplň hodnocení a otevři formulář" z hlavičky cíle („Ohodnoť
 * jako první"). Nonce odlišuje opakovaná kliknutí; rating 0 = jen otevřít. */
export type InlineReviewRateRequest = { rating: number; nonce: number }

/** Kolik recenzí ukázat hned; zbytek schová „Zobrazit další". */
const INITIAL_VISIBLE = 3

/**
 * Inline blok recenzí uvnitř rozbaleného cíle ve výpisu „Co vidět…" (varianta A):
 * hlavička „Byl jsi zde? Ohodnoť to!" + tlačítko, výpis recenzí (nejnovější
 * nahoře, prvních 3 + „Zobrazit další") a formulář na vyžádání. Recenze se
 * načítají LÍNĚ — komponenta se mountuje až po rozbalení cíle, takže stránka
 * se všemi cíli zůstává rychlá. Hvězdičkový vstup je tady součástí formuláře
 * (na rozdíl od lišty na detailu cíle — ReviewRatingBox).
 *
 * Odeslání sdílí server action createReview (stejné anti-spam vrstvy); po
 * úspěchu se seznam znovu načte (nová recenze nahoře) a router.refresh()
 * obnoví hvězdičky + počet pod názvem cíle.
 */
export function InlineReviews({
  pageId,
  turnstileSiteKey,
  rateRequest = null,
}: {
  pageId: number
  turnstileSiteKey: string | null
  /** Předvyplnění z hlavičky cíle („Ohodnoť jako první") — viz typ výše. */
  rateRequest?: InlineReviewRateRequest | null
}) {
  const router = useRouter()
  // Kam se vrátit po přihlášení z nápovědy pod jménem. Bereme z adresy —
  // inline recenze žijí uvnitř stránky cíle, kterou komponenta sama nezná.
  const pathname = usePathname()
  const [reviews, setReviews] = useState<ReviewPublic[] | null>(null)
  // Kdo je přihlášený — chodí spolu s recenzemi. Dosud se načítalo a zahazovalo,
  // takže inline formulář chtěl jméno i po přihlášeném (a server ho stejně
  // ignoruje, protože identitu bere ze session).
  const [signedAs, setSignedAs] = useState<ReviewAuthorHint>(null)
  const [loadError, setLoadError] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [state, setState] = useState<ReviewFormState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()
  // Čas načtení — jednou při mountu (anti-bot timing, viz komentáře).
  const [renderedAt] = useState(() => Date.now())
  // Přihlášení se pozná až z odpovědi `getPageReviews` — dokud se recenze
  // načítají, NEVÍME, kdo píše, a captcha by přihlášenému zbytečně problikla.
  // Widget se proto ukáže až po doběhnutí načítání; při chybě bereme pisatele
  // jako anonyma (server si přihlášení stejně ověří sám, viz createReview).
  const authResolved = reviews !== null || loadError

  const formRef = useRef<HTMLFormElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)

  const loadReviews = (pageIdToLoad: number) =>
    getPageReviews(pageIdToLoad).then(
      (res) => {
        if ('reviews' in res) {
          setReviews(res.reviews)
          setSignedAs(res.signedAs)
        } else {
          setLoadError(true)
        }
      },
      () => setLoadError(true),
    )

  // Líné načtení při prvním zobrazení (mount = uživatel cíl rozbalil).
  useEffect(() => {
    let cancelled = false
    getPageReviews(pageId).then(
      (res) => {
        if (cancelled) return
        if ('reviews' in res) {
          setReviews(res.reviews)
          setSignedAs(res.signedAs)
        } else setLoadError(true)
      },
      () => {
        if (!cancelled) setLoadError(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [pageId])

  const openForm = () => {
    setFormOpen(true)
    window.setTimeout(() => bodyRef.current?.focus(), 100)
  }

  // Hvězdička kliknutá v liště (nebo v hlavičce cíle přes event) = rovnou
  // vybrané hodnocení + otevřený formulář.
  const pickRating = (n: number) => {
    setRating(n)
    openForm()
  }

  // „Ohodnoť jako první" v hlavičce cíle: prop s hodnocením + nonce — funguje
  // i při prvním mountu (na rozdíl od eventu nehrozí, že proletí dřív, než se
  // formulář připojí). setState běží až v timeoutu (ESLint zakazuje synchronní
  // setState v efektu — stejný vzor jako rozbalení z kotvy).
  useEffect(() => {
    if (!rateRequest) return
    const t = window.setTimeout(() => {
      if (rateRequest.rating > 0) setRating(rateRequest.rating)
      setFormOpen(true)
      window.setTimeout(() => bodyRef.current?.focus(), 100)
    }, 0)
    return () => window.clearTimeout(t)
  }, [rateRequest])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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
          // Nová recenze se objeví hned nahoře; hvězdičky pod názvem obnoví refresh.
          await loadReviews(pageId)
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

  const visibleReviews = reviews ? (showAll ? reviews : reviews.slice(0, INITIAL_VISIBLE)) : []
  const hiddenCount = reviews ? reviews.length - visibleReviews.length : 0

  return (
    <div className="mt-7">
      {/* Lišta s tenkým rámečkem místo dělicí linky — ukotví blok recenzí, ale
          neodřízne ho od cíle (plné linky jsou vyhrazené oddělovačům MEZI cíli).
          Odlehčená ozvěna lišty „Byl jsi zde?" z detailu cíle; obrysové tlačítko
          je stejné jako u komentářů pod články. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3e9ef] bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-bold text-[#215491]">
            Byl jsi zde? Ohodnoť to!
            {reviews && reviews.length > 0 && (
              <span className="ml-2 font-normal text-[#7e93a8]">
                · {reviews.length} {reviewsCountLabel(reviews.length)}
              </span>
            )}
          </h3>
          {/* Hvězdičky v liště jsou jen VSTUPNÍ BRÁNA — klik vybere hodnocení
              a otevře formulář, ale lišta se hned „vyresetuje" (value=0).
              Vybraný počet hvězd je vidět jen ve formuláři v „Tvé hodnocení",
              ať nesvítí dvakrát nad sebou. */}
          <StarInput value={0} onSelect={pickRating} size={17} />
        </div>
        <button
          type="button"
          onClick={openForm}
          className="whitespace-nowrap rounded-full border-[1.5px] border-[#215491] px-5 py-1.5 text-[13px] font-bold text-[#215491] transition-colors hover:bg-[#215491] hover:text-white"
        >
          Napsat recenzi
        </button>
      </div>

      {formOpen && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mt-4 rounded-xl border border-[#e6eaee] bg-[#fafafa] px-4 py-5"
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

          {/* Stejné pořadí jako u velkého formuláře: kdo píše → co píše. */}
          {signedAs ? (
            <div className="mb-4 flex items-center gap-3">
              <UserAvatar name={signedAs.displayName} avatarUrl={signedAs.avatarUrl} size={34} />
              <p className="text-[14px] text-[#2c3643]">
                Píšeš jako <b>{signedAs.displayName}</b>
              </p>
            </div>
          ) : (
            <div className="mb-4 max-w-xs">
              <label
                htmlFor={`inline-review-name-${pageId}`}
                className="mb-1.5 block text-sm font-semibold text-gray-500"
              >
                Jméno
              </label>
              <input
                id={`inline-review-name-${pageId}`}
                name="authorName"
                type="text"
                required
                maxLength={80}
                placeholder="Tvé jméno"
                className="w-full rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]"
              />
              <LoginHint backTo={`${pathname}#recenze`} noun="recenze" />
            </div>
          )}

          <div className="mb-3">
            <span className="mb-1.5 block text-sm font-semibold text-gray-500">Tvé hodnocení</span>
            <StarInput value={rating} onSelect={setRating} />
          </div>

          <div className="mb-4">
            <label
              htmlFor={`inline-review-body-${pageId}`}
              className="mb-1.5 block text-sm font-semibold text-gray-500"
            >
              Recenze
            </label>
            <textarea
              id={`inline-review-body-${pageId}`}
              ref={bodyRef}
              name="body"
              required
              maxLength={5000}
              rows={5}
              placeholder="Poděl se o své zkušenosti a zážitky a buď inspirací pro ostatní cestovatele. Odkazy či jiné html prvky nelze vkládat pro snížení spamu bez přidané hodnoty."
              className="min-h-[100px] w-full resize-y rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] leading-relaxed text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]"
            />
          </div>

          {/* Captcha jen pro nepřihlášené (a až víme, kdo píše — viz
              `authResolved`); server si přihlášení stejně ověří sám. */}
          {turnstileSiteKey && authResolved && !signedAs && (
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
            {!turnstileSiteKey && authResolved && !signedAs && (
              <span className="text-[12.5px] text-gray-500">
                Chráněno proti spamu · bez opisování captchy
              </span>
            )}
          </div>
        </form>
      )}

      <div className="mt-2">
        {reviews === null && !loadError && (
          <p className="py-4 text-[14px] text-gray-500">Načítám recenze…</p>
        )}
        {loadError && (
          <p className="py-4 text-[14px] text-gray-500">
            Recenze se nepodařilo načíst. Zkus to prosím později.
          </p>
        )}
        {reviews && reviews.length === 0 && (
          <p className="py-4 text-[14px] text-gray-500">
            Zatím tu není žádná recenze. Buď první, kdo se podělí o zážitek!
          </p>
        )}
        {visibleReviews.map((review, i) => (
          <ReviewItem
            key={review.id}
            review={review}
            // Jemnější oddělovače uvnitř karty cíle; poslední recenze bez linky,
            // ať se nesráží s (světlejším) oddělovačem mezi cíli.
            className={
              i === visibleReviews.length - 1 && hiddenCount === 0
                ? 'border-b-0'
                : 'border-[#eceff2]'
            }
          />
        ))}
        {hiddenCount > 0 && (
          <LoadMoreButton variant="text" onClick={() => setShowAll(true)} className="mt-3">
            Zobrazit další {pluralCs(hiddenCount, ['recenzi', 'recenze', 'recenze'])} ({hiddenCount}
            )
          </LoadMoreButton>
        )}
      </div>
    </div>
  )
}
