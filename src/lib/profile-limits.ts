/**
 * Meze pro vlastní profil — JEDNO místo pro server i formulář.
 *
 * Dřív byly hodnoty dvakrát: server je vynucoval v `profile-actions.ts`,
 * formulář je opisoval do `maxLength` a `accept`. Změna na serveru bez změny
 * ve formuláři by znamenala, že člověk může napsat text, který server odmítne
 * (nebo naopak že mu formulář brání v něčem, co je povolené).
 *
 * Tenhle soubor je čistá data, žádný server-only kód — smí ho tedy načíst
 * i komponenta běžící v prohlížeči (toMediaProxy je taky izomorfní).
 */

import { toMediaProxy } from '@/lib/cloudinary-loader'

export const MAX_NAME = 80
export const MAX_DESCRIPTION = 1000
export const MAX_URL = 200

/** Avatar: 2 MB. Stejnou mez vynucuje i kolekce Avatars na serveru. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
/** Hodnota pro `accept` u výběru souboru — odvozená, ať se nemůže rozejít. */
export const AVATAR_ACCEPT = AVATAR_MIME.join(',')

/**
 * Úvodní fotka stránek kolem účtu (přihlášení, registrace, nastavení).
 *
 * Tady, ne v komponentě: adresu mění redakce při výměně fotky a nemá kvůli
 * tomu chodit do kódu vzhledu. Profil má vlastní (i s rozmazaným náhledem).
 */
export const AUTH_COVER_URL = toMediaProxy(
  'https://res.cloudinary.com/ara/image/upload/v1785491112/mn4obrhlr3khap1ocrej.jpg',
)
