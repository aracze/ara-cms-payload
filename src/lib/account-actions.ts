'use server'

import { headers as nextHeaders } from 'next/headers'
import { clearSessionCookie, setSessionCookie } from './session-cookie'
import { redirect } from 'next/navigation'
import { getDb } from './db'
import { getCurrentUser } from './auth'
import { checkPassword } from './username'

/**
 * Neveřejná část účtu: změna hesla a smazání účtu.
 *
 * Proč zvlášť od profilu: tyhle věci se na VEŘEJNÉM profilu nezobrazují, takže
 * tam nepatří ani jejich úprava. Políčko s e-mailem uprostřed veřejné stránky
 * navíc svádí k dojmu, že je e-mail veřejný.
 *
 * Obě operace vyžadují ZNOVU zadat heslo. Kdyby někdo nechal počítač odemčený,
 * nesmí stačit sednout k němu a udělat nevratnou změnu.
 */

const ANONYM = 'Smazaný uživatel'

export type AccountFormState = {
  status: 'idle' | 'error' | 'success'
  message?: string
}

/**
 * Ověří heslo tím, že se s ním zkusí přihlásit.
 *
 * POZOR na vedlejší účinek: neúspěch se počítá do limitu pokusů o přihlášení
 * (5, pak 10 minut zámek). Je to daň za to, že Payload jiný způsob ověření
 * hesla nenabízí — a proti hádání hesla u odemčeného počítače to hraje spíš pro
 * nás.
 */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  try {
    const payload = await getDb()
    const result = await payload.login({
      collection: 'users',
      data: { email, password },
    })
    return Boolean(result?.user)
  } catch {
    return false
  }
}

export async function changePasswordAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const me = await getCurrentUser()
  if (!me) return { status: 'error', message: 'Nejsi přihlášený. Přihlas se prosím znovu.' }

  const current = String(formData.get('currentPassword') ?? '')
  const next = String(formData.get('newPassword') ?? '')
  const again = String(formData.get('newPasswordAgain') ?? '')

  if (current.length === 0) return { status: 'error', message: 'Vyplň prosím současné heslo.' }
  const shapeError = checkPassword(next)
  if (shapeError) return { status: 'error', message: shapeError }
  if (next !== again) return { status: 'error', message: 'Nová hesla se neshodují.' }

  const payload = await getDb()
  // E-mail bereme z databáze podle ID ze session — z formuláře nechodí.
  const doc = await payload.findByID({
    collection: 'users',
    id: me.id,
    depth: 0,
    select: { email: true },
    overrideAccess: true,
  })
  const email = (doc as { email?: string }).email
  if (!email) return { status: 'error', message: 'Účet se nepodařilo načíst.' }

  if (!(await verifyPassword(email, current))) {
    return { status: 'error', message: 'Současné heslo nesouhlasí.' }
  }

  try {
    // Zápis pod právy přihlášeného (`Users.update = isAdminOrSelf`), ne s obejitím
    // — kdyby se někdy pravidla změnila, platí i tady.
    const { user } = await payload.auth({ headers: await nextHeaders() })
    if (!user || user.id !== me.id) {
      return { status: 'error', message: 'Přihlášení vypršelo. Přihlas se prosím znovu.' }
    }
    await payload.update({
      collection: 'users',
      id: me.id,
      data: { password: next },
      user,
      overrideAccess: false,
    })
  } catch (err) {
    console.error('[účet] změna hesla selhala:', err)
    return { status: 'error', message: 'Heslo se nepodařilo změnit. Zkus to prosím znovu.' }
  }

  // Přihlašovací token je bezstavový (podepsaný JWT), takže změnou hesla sám od
  // sebe nepřestane platit. Vystavíme nový, ať sezení odpovídá novému heslu.
  try {
    const fresh = await payload.login({ collection: 'users', data: { email, password: next } })
    if (fresh?.token) await setSessionCookie(fresh.token)
  } catch (err) {
    console.error('[účet] obnovení sezení po změně hesla selhalo:', err)
  }

  return { status: 'success', message: 'Heslo je změněné.' }
}

export async function deleteAccountAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const me = await getCurrentUser()
  if (!me) return { status: 'error', message: 'Nejsi přihlášený. Přihlas se prosím znovu.' }

  const password = String(formData.get('password') ?? '')
  const confirmed = formData.get('confirm') === '1'
  const removeName = formData.get('removeName') === '1'

  if (!confirmed) {
    return { status: 'error', message: 'Zaškrtni prosím potvrzení, že účet chceš opravdu smazat.' }
  }
  if (password.length === 0) {
    return { status: 'error', message: 'Pro smazání účtu zadej prosím heslo.' }
  }

  const payload = await getDb()
  const doc = await payload.findByID({
    collection: 'users',
    id: me.id,
    depth: 0,
    select: { email: true },
    overrideAccess: true,
  })
  const email = (doc as { email?: string }).email
  if (!email) return { status: 'error', message: 'Účet se nepodařilo načíst.' }

  if (!(await verifyPassword(email, password))) {
    return { status: 'error', message: 'Heslo nesouhlasí.' }
  }

  // Ověřená identita pro operace, které zvládnou běžet pod právy uživatele.
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user || user.id !== me.id) {
    return { status: 'error', message: 'Přihlášení vypršelo. Přihlas se prosím znovu.' }
  }

  // Tři kroky níž musí dopadnout BUĎ VŠECHNY, NEBO ŽÁDNÝ. Kdyby to spadlo
  // uprostřed, zůstaly by příspěvky odpojené od účtu, který dál existuje —
  // a nikdo by je už nespároval zpátky. Proto transakce.
  const transactionID = await payload.db.beginTransaction()
  const req = (transactionID ? { transactionID } : {}) as Parameters<
    typeof payload.update
  >[0]['req']

  try {
    // 1) Příspěvky ZŮSTÁVAJÍ, jen se odpojí od účtu — komentář se pak chová
    //    přesně jako od nepřihlášeného. Kdyby se mazaly, zmizely by z diskusí
    //    i odpovědi ostatních a vznikly by v nich díry.
    await payload.update({
      collection: 'comments',
      where: { author: { equals: me.id } },
      data: { authorName: removeName ? ANONYM : me.publicName, author: null },
      req,
      overrideAccess: true,
    })

    // 2) Profilová fotka — soubor i záznam pryč. Běží pod právy vlastníka
    //    (kolekce Avatars pouští `delete` na vlastní záznamy).
    // Hromadné mazání NEVYHAZUJE výjimku, když se jednotlivý záznam smazat
    // nepodaří — vrátí ho v `errors`. Bez téhle kontroly by transakce potvrdila
    // smazání účtu, i kdyby fotka zůstala viset.
    const smazaneAvatary = await payload.delete({
      collection: 'avatars',
      where: { owner: { equals: me.id } },
      user,
      req,
      overrideAccess: false,
    })
    if (smazaneAvatary.errors.length > 0) {
      throw new Error(`Fotku se nepodařilo smazat: ${JSON.stringify(smazaneAvatary.errors)}`)
    }

    // 3) Samotný účet. `overrideAccess: true` je tu nutné (mazat uživatele smí
    //    jinak jen admin) a bezpečné: totožnost je ověřená ze session A heslem
    //    o pár řádků výš, a maže se výhradně `me.id` — nic z formuláře.
    await payload.delete({ collection: 'users', id: me.id, req, overrideAccess: true })

    if (transactionID) await payload.db.commitTransaction(transactionID)
  } catch (err) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID)
    console.error('[účet] smazání selhalo:', err)
    return { status: 'error', message: 'Účet se nepodařilo smazat. Zkus to prosím znovu.' }
  }

  await clearSessionCookie()
  redirect('/ucet-smazan')
}
