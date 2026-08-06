/**
 * Kdo je „náš tým" na stránce O nás.
 *
 * PROČ V KÓDU A NE V CMS: seznam se mění řádově raz za pár let, zatímco OBSAH
 * karty (fotka, jméno, počty příspěvků) si každý autor spravuje sám ve svém
 * profilu — sekce si ho odtud bere. Kdyby přesto měla být sestava editovatelná
 * v adminu, je to relationship pole na Pages + migrace; do té doby by nová
 * tabulka jen přidávala kliky navíc bez užitku.
 *
 * Uživatelská jména se musí přesně krýt s polem `username` (adresa profilu).
 * Pořadí v poli = pořadí karet v sekci.
 */
export const TEAM_USERNAMES = ['jankonas', 'lojzatran', 'lucienne'] as const

/** Slug statické stránky, pod kterou se sekce „Náš tým" vykresluje. */
export const ABOUT_PAGE_SLUG = 'o-nas'

/** Rok spuštění webu — z něj se počítá „Za X let přispěla řada dalších…". */
export const SITE_LAUNCH_YEAR = 2013

/**
 * Kolik tváří dřívějších přispěvatelů se vejde do řady pod tým. Zbytek se
 * shrne do textu „a dalších N" — celá řada 27 kolečkem by pod dvěma kartami
 * působila jako mřížka avatarů, ne jako poděkování.
 */
export const CONTRIBUTOR_FACES_LIMIT = 10

/**
 * Účty, které nejsou konkrétní lidé. Do řady tváří ani do počtu přispěvatelů
 * nepatří — jinak by web děkoval „adminovi".
 *
 * Býval tu i redakční účet `TravelPortal.cz`; ten se ale přejmenoval na
 * skutečného člověka (Ondřej Kuděla, `kudela`), takže do poděkování naopak
 * patří — 26 míst a 24 turistických cílů. Zpátky ho nepřidávej.
 */
export const NON_PERSON_USERNAMES = ['admin']
