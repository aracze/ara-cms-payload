'use server'

import { getDb } from '@/lib/db'

export type ConfirmResult = 'ok' | 'chyba'

/**
 * Ověření tokenu z potvrzovacího e-mailu — běží až po kliknutí (POST),
 * NE při vykreslení stránky.
 *
 * PROČ: e-mailové služby (Outlook SafeLinks, Gmail, Seznam…) odkazy v došlé
 * poště samy navštěvují kvůli bezpečnostní kontrole — dřív, než na ně klikne
 * člověk. Když stránka ověřovala token už při GET, spotřeboval ho skener:
 * účet se sice potvrdil, ale uživatel pak klikl na mrtvý odkaz a viděl chybu
 * „už použitý nebo prošlý" (přesně tohle se stalo při testu 8. 8. 2026).
 * Skenery ale na tlačítka neklikají, takže POST token přežije až k člověku.
 *
 * Výsledek se VRACÍ (kreslí ho `useActionState` ve formuláři), nepřesměrovává
 * se na `?stav=ok` — úspěšná obrazovka se tak nedá vyvolat ručně zadanou
 * adresou a token zůstává jediným způsobem, jak ji zobrazit.
 *
 * `verifyEmail` běží s `overrideAccess: true` — uživatel v tu chvíli ještě
 * není přihlášený. Platnost tokenu hlídá Payload.
 */
export async function confirmAccount(
  _prev: ConfirmResult | null,
  formData: FormData,
): Promise<ConfirmResult> {
  const token = String(formData.get('token') ?? '')
  if (!token) return 'chyba'

  try {
    const payload = await getDb()
    const ok = Boolean(
      await payload.verifyEmail({ collection: 'users', token, overrideAccess: true } as never),
    )
    return ok ? 'ok' : 'chyba'
  } catch {
    // Neplatný, už použitý nebo prošlý token — uživateli to řekne formulář.
    return 'chyba'
  }
}
