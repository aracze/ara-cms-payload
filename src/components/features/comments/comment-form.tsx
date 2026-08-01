'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createComment, type CommentFormState } from '@/lib/comment-actions'
import { Turnstile, type TurnstileHandle } from './turnstile'

type ReplyTarget = { id: number; name: string }

/**
 * Formulář pro vložení komentáře / odpovědi. Odesílá přes Server Action.
 * Ochrana: skrytý honeypot `website`, čas načtení `renderedAt` a volitelně
 * Cloudflare Turnstile. Když uživatel klikne u komentáře na „Odpovědět", formulář
 * si zapamatuje cíl (`parentId`) a předvyplní „@jméno" — vznikne skutečná vazba
 * vlákna. Po úspěchu vyčistí pole a přes router.refresh() zobrazí nový komentář.
 */
export function CommentForm({
  articleId,
  turnstileSiteKey,
  signedAs,
  loginHint,
  isSignedIn = false,
}: {
  articleId: number
  turnstileSiteKey: string | null
  /**
   * Pruh „Píšeš jako…" / pozvánka k přihlášení. Vykresluje ho SERVER
   * (potřebuje přihlášeného uživatele) a sem přijde hotový.
   */
  signedAs?: React.ReactNode
  /** Jednořádková výzva k přihlášení POD políčkem jména (nepřihlášený). */
  loginHint?: React.ReactNode
  /** Přihlášený nevyplňuje jméno — bere se ze session na serveru. */
  isSignedIn?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<CommentFormState>({ status: 'idle' })
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  // Čas načtení formuláře — jednou při mountu (lazy init), bez efektu i bez resetu:
  // pro anti-bot timing stačí čas mountu (další odeslání jsou vždy dost daleko).
  const [renderedAt] = useState(() => Date.now())

  const formRef = useRef<HTMLFormElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)

  // „Odpovědět" u komentáře → zapamatuj cíl, předvyplň @jméno, zaměř a odroluj.
  useEffect(() => {
    const onReply = (e: Event) => {
      const detail = (e as CustomEvent<{ commentId: number; authorName: string }>).detail
      if (!detail) return
      setReplyTo({ id: detail.commentId, name: detail.authorName })
      const textarea = bodyRef.current
      if (textarea) {
        const prefix = `@${detail.authorName} `
        if (!textarea.value.startsWith(`@${detail.authorName}`)) {
          textarea.value = prefix + textarea.value
        }
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        textarea.focus()
        const end = textarea.value.length
        textarea.setSelectionRange(end, end)
      }
    }
    window.addEventListener('ara:comment-reply', onReply)
    return () => window.removeEventListener('ara:comment-reply', onReply)
  }, [])

  // Odeslání: úklid po úspěchu (reset pole, konec režimu odpovědi, refresh) běží
  // ZDE v obsluze události, ne v efektu reagujícím na stav → žádný „setState
  // synchronně v efektu" (jinak padá CI přes ESLint).
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await createComment(state, formData)
        setState(result)
        if (result.status === 'success') {
          formRef.current?.reset()
          setReplyTo(null)
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

  const cancelReply = () => {
    const textarea = bodyRef.current
    if (textarea && replyTo) {
      // Bez regexu (jméno může obsahovat speciální znaky) — odstřihni známý prefix.
      const prefix = `@${replyTo.name}`
      if (textarea.value.startsWith(prefix)) {
        textarea.value = textarea.value.slice(prefix.length).replace(/^\s+/, '')
      }
      textarea.focus()
    }
    setReplyTo(null)
  }

  return (
    <div id="napsat-komentar" className="mt-10 scroll-mt-24">
      <h3 className="mb-5 text-lg font-bold text-[#2c3643]">
        {replyTo ? 'Napiš odpověď' : 'Napiš komentář'}
      </h3>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[#e6eaee] bg-[#f5f7f9] p-6 md:pr-[44px]"
      >
        <input type="hidden" name="articleId" value={articleId} />
        <input type="hidden" name="renderedAt" value={renderedAt} />
        <input type="hidden" name="parentId" value={replyTo?.id ?? ''} />

        {/* Honeypot — skryté pole; vyplní ho jen robot. Mimo tab pořadí i čteček. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label>
            Nevyplňuj toto pole
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {replyTo && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
            <span>
              Odpovídáš na <span className="font-semibold text-[#215491]">@{replyTo.name}</span>
            </span>
            <button
              type="button"
              onClick={cancelReply}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-[#2c3643]"
            >
              <X className="h-3.5 w-3.5" /> zrušit
            </button>
          </div>
        )}

        {signedAs}

        {/* Přihlášenému políčko na jméno nedáváme — podepíše se účtem (server
            si jméno bere ze session, hodnotě z formuláře by stejně nevěřil). */}
        {!isSignedIn && (
          <div className="mb-4">
            <div className="max-w-xs">
              <label
                htmlFor="comment-name"
                className="mb-1.5 block text-sm font-semibold text-gray-500"
              >
                Jméno
              </label>
              <input
                id="comment-name"
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
            htmlFor="comment-body"
            className="mb-1.5 block text-sm font-semibold text-gray-500"
          >
            {replyTo ? 'Odpověď' : 'Komentář'}
          </label>
          <textarea
            id="comment-body"
            ref={bodyRef}
            name="body"
            required
            maxLength={5000}
            rows={5}
            placeholder="Napiš svůj komentář…"
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
            Děkujeme! Komentář byl přidán.
          </p>
        )}

        <div className="flex items-center gap-3.5">
          {/* Stejný ghost styl jako tlačítko v hlavičce sekce (identické). */}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#215491] px-7 py-2.5 font-heading text-[13px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#1a3f6c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Odesílám…' : replyTo ? 'Odeslat odpověď' : 'Vložit komentář'}
          </button>
          {!turnstileSiteKey && (
            <span className="text-[12.5px] text-gray-500">
              Chráněno proti spamu · bez opisování captchy
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
