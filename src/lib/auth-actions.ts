'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from './db'
import { isProduction } from './utils'

/**
 * Přihlášení a odhlášení na veřejném webu.
 *
 * Proč Server Action a ne fetch na `/api/users/login` z prohlížeče:
 * Next u Server Actions sám kontroluje původ požadavku (ochrana proti CSRF)
 * a token se nikdy neocitne v JavaScriptu — nastavíme ho rovnou jako `httpOnly`
 * cookie, ke které skript v prohlížeči nemá přístup (obrana proti krádeži
 * přihlášení přes XSS).
 *
 * Formulář musí fungovat i BEZ JavaScriptu, proto akce nevrací jen data, ale
 * při úspěchu sama přesměruje (viz `redirectTo`).
 */

/** Jak dlouho platí přihlášení (v sekundách) — musí odpovídat `tokenExpiration`. */
const SESSION_SECONDS = 60 * 60 * 24 * 7

/** Cookie, ze které Payload čte token. Bez `cookiePrefix` v configu je to `payload`. */
const TOKEN_COOKIE = 'payload-token'

export type LoginState = { status: 'idle' } | { status: 'error'; message: string }

/** Adresa pro návrat po přihlášení — jen vlastní web, nikdy cizí doména. */
function safeNextPath(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  // Musí to být cesta na tomto webu: začíná jedním lomítkem a neobsahuje
  // whitespace ani další schéma. Tím padá `//zlo.cz` i `javascript:`.
  return /^\/(?!\/)[^\s"'<>\\]*$/.test(value) ? value : '/'
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')
  const nextPath = safeNextPath(formData.get('next'))

  if (!email || !password) {
    return { status: 'error', message: 'Zadejte e-mail i heslo.' }
  }

  try {
    const payload = await getDb()
    // Cookie si nastavíme sami (níže) — chceme mít pod kontrolou její parametry.
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })

    if (!result?.token) {
      return { status: 'error', message: 'Přihlášení se nepodařilo. Zkuste to prosím znovu.' }
    }

    const jar = await cookies()
    jar.set(TOKEN_COOKIE, result.token, {
      httpOnly: true, // skript v prohlížeči se k tokenu nedostane
      secure: isProduction(), // v produkci jen přes HTTPS
      sameSite: 'lax', // cookie neputuje s požadavky z cizích stránek
      path: '/',
      maxAge: SESSION_SECONDS,
    })
  } catch (err) {
    // ZÁMĚRNĚ jedna společná hláška pro „neexistující e-mail" i „špatné heslo":
    // rozdílné odpovědi by prozradily, které e-maily jsou v databázi.
    // Payload sám po několika pokusech účet dočasně zamkne (viz Users.auth).
    const message = err instanceof Error ? err.message : ''
    if (/locked/i.test(message)) {
      return {
        status: 'error',
        message: 'Účet je po několika neúspěšných pokusech dočasně zamčený. Zkuste to za chvíli.',
      }
    }
    console.error('[auth] přihlášení selhalo pro', email.slice(0, 3) + '***')
    return { status: 'error', message: 'Nesprávný e-mail nebo heslo.' }
  }

  // redirect() vyhazuje výjimku, proto stojí VNĚ try/catch (jinak by ho catch
  // spolkl a přihlášení by skončilo chybovou hláškou i po úspěchu).
  redirect(nextPath)
}

/**
 * Odhlášení = smazání cookie s tokenem.
 *
 * Payload podepisuje bezstavový JWT, takže neexistuje způsob, jak už vydaný
 * token zneplatnit na serveru (Local API proto ani žádné `logout` nemá). Proti
 * zneužití ukradeného tokenu chrání krátká platnost (7 dní) a `httpOnly` cookie,
 * ke které se skript v prohlížeči nedostane.
 */
export async function logoutAction(): Promise<void> {
  const jar = await cookies()
  jar.delete(TOKEN_COOKIE)
  redirect('/')
}
