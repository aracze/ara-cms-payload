'use client'

import Link from 'next/link'

/**
 * Odkaz „přihlas se" u formuláře komentáře / recenze.
 *
 * Je to skutečný odkaz na /prihlaseni (funguje i bez JavaScriptu), ale když
 * JavaScript běží, klik se zachytí a místo přechodu se OTEVŘE PŘIHLAŠOVACÍ OKNO
 * v hlavičce. Důvod je praktický: kdo už má rozepsaný komentář, o něj odchodem
 * na jinou stránku přijde.
 *
 * Komunikace přes vlastní událost na `window` — hlavička žije jinde ve stromu
 * komponent, takže si stav nemají jak předat přímo (stejný vzor jako tlačítko
 * „Odpovědět" u komentářů).
 */
export const OPEN_LOGIN_EVENT = 'ara:open-login'

export function LoginHintLink({ backTo }: { backTo: string }) {
  return (
    <Link
      href={`/prihlaseni?next=${encodeURIComponent(backTo)}`}
      // Přihlašovací stránka je noindex a `next` dělá z každé stránky webu
      // unikátní adresu — nofollow šetří vyhledávačům zbytečné procházení.
      rel="nofollow"
      onClick={(e) => {
        // Ctrl/⌘ + klik i prostřední tlačítko necháme prohlížeči (nová karta).
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT))
      }}
      className="font-semibold text-[#215491] underline decoration-[#215491]/30 hover:decoration-[#215491]"
    >
      Přihlas se
    </Link>
  )
}
