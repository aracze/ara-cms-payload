import { cache } from 'react'
import { cookies as nextCookies, headers as nextHeaders } from 'next/headers'
import { getDb } from './db'
import { TOKEN_COOKIE } from './session-cookie'

/**
 * Přihlášený uživatel pro VEŘEJNÝ web.
 *
 * Zásada je stejná jako u `createdByPublic` v kolekcích: navenek nikdy nejde
 * surový uživatel z databáze, ale jen bezpečná podmnožina polí. Do RSC payloadu
 * (a tedy do prohlížeče) se tak nedostane e-mail, hash hesla ani interní vazby.
 *
 * `roles` schválně NEposíláme na klienta — o tom, co kdo smí, rozhoduje server
 * (přístupová práva kolekcí), ne klientský kód. Kdyby UI někdy potřebovalo
 * rozlišit editora, přidá se jediný odvozený příznak, ne celý seznam rolí.
 */
export type CurrentUser = {
  id: number
  username: string | null
  /** Celé jméno, jak si ho člověk vyplnil (nebo null). */
  name: string | null
  /** Jméno k zobrazení ve vlastním účtu: celé jméno, jinak uživatelské jméno. */
  displayName: string
  /**
   * Podpis pod VEŘEJNÝM obsahem (komentáře, recenze) — uživatelské jméno.
   *
   * Schválně NE celé jméno (`name`): všech 229 podepsaných komentářů z původního
   * webu je uložených s uživatelským jménem („jankonas"), takže podpis celým
   * jménem by u nových příspěvků vypadal jinak než u starých pod nimi.
   * Celé jméno patří do záhlaví profilu, kde ho člověk uvádí vědomě.
   */
  publicName: string
  avatarUrl: string | null
  /** Odkaz na veřejný profil; null u uživatele bez uživatelského jména (profil by neexistoval). */
  profileHref: string | null
  /**
   * Jediný odvozený příznak avizovaný v komentáři výše — ne celý seznam rolí.
   * Zatím jen pro zobrazení `analyticsPageViews` na dlaždicích v „Co vidět".
   */
  isAdmin: boolean
}

type RawAuthUser = {
  id: number
  username?: string | null
  name?: string | null
  avatar?: { url?: string | null } | number | null
  roles?: string[] | null
}

/**
 * Kdo je přihlášený v tomto requestu, nebo null.
 *
 * `payload.auth()` ověří podpis tokenu z cookie a dohledá uživatele — nespoléhá
 * se tedy na nic, co by šlo poslat z prohlížeče. Obalené v React `cache()`, aby
 * se při vykreslení jedné stránky ověřovalo jen jednou (hlavička, obsah i akce
 * si sáhnou pro stejný výsledek).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    // ZKRATKA PRO NEPŘIHLÁŠENÉ — bez ní byl web pro anonymní návštěvníky o ~4 s
    // pomalejší na KAŽDÉ stránce. `payload.auth()` totiž kromě ověření tokenu
    // dopočítává i oprávnění pro všechny kolekce, takže spustí pravidlo čtení
    // komentářů. To pro anonyma (protože existují rozpracované stránky) vytáhne
    // seznam všech ~3000 publikovaných stránek. Přihlášený má v tom pravidle
    // rychlou zkratku, proto se to na něm neprojevilo.
    // Bez cookie se nemá co ověřovat, takže rovnou vracíme null.
    const jar = await nextCookies()
    if (!jar.get(TOKEN_COOKIE)?.value) return null

    const payload = await getDb()
    const { user } = await payload.auth({ headers: await nextHeaders() })
    // Kontrola kolekce, ne jen existence: kdyby někdy přibyla další kolekce
    // s přihlašováním, její ID by se tady dohledalo jako CIZÍ účet v `users`.
    if (!user || user.collection !== 'users') return null

    // Avatar chodí z auth jako id (bez populace) — dohledáme URL jedním čtením
    // a jen povolená pole. overrideAccess: true je tu v pořádku: čteme profil
    // TOHO, kdo je přihlášený, a vracíme z něj jen veřejnou podmnožinu.
    const doc = (await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 1,
      select: { username: true, name: true, avatar: true, roles: true },
      overrideAccess: true,
    })) as unknown as RawAuthUser

    const name = doc.name?.trim() || null
    const username = doc.username ?? null
    const displayName = name || username || 'Uživatel'

    return {
      // `Number`: Payload typuje id jako `number | string` (kvůli databázím
      // s textovými id), Postgres ale vrací číslo. Sjednocení na číslo drží
      // porovnání `me.id === profile.id` spolehlivé.
      id: Number(doc.id),
      username,
      name,
      displayName,
      publicName: username || displayName,
      avatarUrl: doc.avatar && typeof doc.avatar === 'object' ? (doc.avatar.url ?? null) : null,
      profileHref: username ? `/profil/${encodeURIComponent(username)}` : null,
      isAdmin: Array.isArray(doc.roles) && doc.roles.includes('admin'),
    }
  } catch (err) {
    // Neplatná/prošlá cookie ani výpadek DB nesmí shodit celou stránku —
    // web se prostě zobrazí jako nepřihlášenému.
    console.error('[auth] načtení přihlášeného uživatele selhalo:', err)
    return null
  }
})
