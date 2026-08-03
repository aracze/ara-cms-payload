/**
 * Pravidla pro uživatelské jméno a heslo při registraci.
 *
 * Uživatelské jméno je VEŘEJNÁ IDENTITA: je z ní adresa profilu (/profil/<username>)
 * a podepisují se s ní komentáře a recenze. Proto si ji uživatel volí sám —
 * odvozovat ji z e-mailu by veřejně vyzradilo jeho část (z „jan.konas@…" by
 * vznikla adresa /profil/jan.konas).
 *
 * Čistá funkce bez závislostí na databázi, aby šla samostatně testovat;
 * obsazenost kontroluje až registrační akce.
 */

/** Nová uživatelské jméno se ukládá malými písmeny — viz komentář u pole v kolekci Users. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

const MIN = 3
const MAX = 30

/**
 * Slova, která si nikdo nesmí vzít.
 *
 * Kromě zjevných („admin") jsou tu i názvy cest webu. Nastavení profilu je
 * záměrně na /nastaveni (ne /profil/nastaveni), takže kolize s uživatelským jménem
 * nemůže vzniknout — přesto je držíme zakázané, aby profil s takovým názvem
 * nemátl (odkaz /profil/prihlaseni vypadá jako systémová stránka).
 */
const RESERVED = new Set([
  'admin',
  'administrace',
  'api',
  'nastaveni',
  'prihlaseni',
  'odhlaseni',
  'registrace',
  'profil',
  'profily',
  'ara',
  'aracz',
  'podpora',
  'kontakt',
  'redakce',
  'zapomenute-heslo',
  'nove-heslo',
  'me',
  'muj-profil',
  'null',
  'undefined',
])

export type UsernameProblem = 'prazdna' | 'kratka' | 'dlouha' | 'znaky' | 'zacatek' | 'rezervovana'

/**
 * Ověří tvar uživatelského jména. Vrací null, když je v pořádku, jinak důvod.
 * Povolena jsou malá písmena bez diakritiky, číslice, tečka, pomlčka
 * a podtržítko — tedy jen znaky, které v adrese nepotřebují kódování.
 */
export function checkUsernameShape(raw: string): UsernameProblem | null {
  const value = normalizeUsername(raw)
  if (!value) return 'prazdna'
  if (value.length < MIN) return 'kratka'
  if (value.length > MAX) return 'dlouha'
  if (!/^[a-z0-9._-]+$/.test(value)) return 'znaky'
  // Nesmí začínat ani končit oddělovačem („-jan", „jan." vypadají jako chyba).
  if (/^[._-]|[._-]$/.test(value)) return 'zacatek'
  if (RESERVED.has(value)) return 'rezervovana'
  return null
}

/** Hláška pro uživatele k danému problému (tykání, jako zbytek webu). */
export function usernameProblemMessage(problem: UsernameProblem): string {
  switch (problem) {
    case 'prazdna':
      return 'Vyplň uživatelské jméno.'
    case 'kratka':
      return `Uživatelské jméno musí mít aspoň ${MIN} znaky.`
    case 'dlouha':
      return `Uživatelské jméno může mít nejvýš ${MAX} znaků.`
    case 'znaky':
      return 'Použij jen malá písmena bez diakritiky, číslice, tečku, pomlčku nebo podtržítko.'
    case 'zacatek':
      return 'Uživatelské jméno nesmí začínat ani končit tečkou, pomlčkou ani podtržítkem.'
    case 'rezervovana':
      return 'Tohle uživatelské jméno použít nelze, vyber si prosím jiné.'
  }
}

const PASSWORD_MIN = 3

/**
 * Jediné pravidlo na heslo: minimální délka 3 znaky — stejná hranice, jakou má
 * sám Payload. Web není kritický systém (žádné platby ani citlivé údaje), takže
 * vynucovat délku ani kombinace znaků nemá smysl; lidi to vede k horším a hůř
 * zapamatovatelným heslům. Kontrola tu zůstává jen kvůli české hlášce — bez ní
 * by Payload vrátil anglickou.
 */
export function checkPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Heslo musí mít aspoň ${PASSWORD_MIN} znaků.`
  return null
}

/** Hrubá kontrola tvaru e-mailu (přesnou platnost ověří až potvrzovací e-mail). */
export function isEmailShapeValid(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email)
}
