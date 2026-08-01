import React from 'react'
import { MessageCircle, Pencil } from 'lucide-react'
import { CommentThread } from '@/types/payload'
import { getTurnstileSiteKey } from '@/lib/comment-spam'
import { getCurrentUser } from '@/lib/auth'
import { LoginHint, SignedAsRow } from '@/components/features/auth/signed-as'
import { CommentItem } from './comment-item'
import { CommentForm } from './comment-form'

/**
 * Sekce komentářů pod článkem (plná šířka — kontejner řeší article.tsx).
 * Komentáře jsou ve vláknech: kořenový komentář + odsazené odpovědi (jedna
 * úroveň). Data (vlákna + počet) načítá volající přes fetchArticleComments.
 */
export async function CommentsSection({
  articleId,
  threads,
  count,
  /** Adresa článku — po přihlášení se sem uživatel vrátí. */
  backTo,
}: {
  articleId: number
  threads: CommentThread[]
  count: number
  backTo: string
}) {
  const siteKey = getTurnstileSiteKey()
  // Přihlášeného zjišťuje SERVER; formulář dostane hotový pruh „Píšeš jako…".
  const currentUser = await getCurrentUser()

  return (
    <section id="komentare" className="scroll-mt-24">
      <div className="mb-6 flex items-center justify-between gap-4 border-b border-[#e6eaee] pb-4">
        <h2 className="flex items-center gap-2.5 text-xl font-bold text-[#2c3643]">
          <MessageCircle className="h-5 w-5 text-[#215491]" strokeWidth={1.8} />
          Komentáře k článku
          <span className="rounded-full bg-[#e9f1f9] px-2.5 py-0.5 text-[13px] font-bold text-[#215491]">
            {count}
          </span>
        </h2>
        {/* Ghost/outline (varianta C): stejná výška jako dřív, širší, s ikonou;
            na hover se vyplní. Sekundární akce (skok na formulář) — plné modré
            tlačítko zůstává až u samotného odeslání ve formuláři. */}
        <a
          href="#napsat-komentar"
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-[#215491] px-6 py-2.5 text-[13px] font-bold tracking-wide text-[#215491] transition-colors hover:bg-[#215491] hover:text-white"
        >
          <Pencil className="h-[14px] w-[14px]" strokeWidth={2} />
          Vložit komentář
        </a>
      </div>

      {threads.length > 0 ? (
        <div className="flex flex-col gap-4">
          {threads.map((thread) => (
            <div key={thread.comment.id}>
              <CommentItem comment={thread.comment} />
              {thread.replies.length > 0 && (
                <div className="mt-3.5 flex flex-col gap-3.5 pl-6 md:pl-11">
                  {thread.replies.map((reply) => (
                    <CommentItem key={reply.id} comment={reply} isReply />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-[15px] text-gray-500">
          Zatím tu není žádný komentář. Buď první, kdo přidá svůj názor!
        </p>
      )}

      <CommentForm
        articleId={articleId}
        turnstileSiteKey={siteKey}
        isSignedIn={Boolean(currentUser)}
        signedAs={currentUser ? <SignedAsRow user={currentUser} /> : null}
        loginHint={currentUser ? null : <LoginHint backTo={`${backTo}#komentare`} />}
      />
    </section>
  )
}
