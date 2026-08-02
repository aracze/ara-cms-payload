'use server'

import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from './db'
import { getCurrentUser } from './auth'
import { AVATAR_MIME, MAX_AVATAR_BYTES, MAX_DESCRIPTION, MAX_NAME, MAX_URL } from './profile-limits'

/**
 * Uložení vlastního profilu (fotka, jméno, medailonek, web).
 *
 * BEZPEČNOST — tři věci, na kterých to stojí:
 *  1. Kdo je přihlášený, se bere VÝHRADNĚ z ověřené session (`payload.auth`),
 *     nikdy z formuláře. Z formuláře nechodí žádné ID účtu, takže není co
 *     podvrhnout — člověk může upravit jen sám sebe.
 *  2. Zápis jde přes Local API s `overrideAccess: false`, takže platí pravidla
 *     kolekce Users. Pole `roles` má zápis jen pro admina, takže si nikdo
 *     nemůže přidat práva ani kdyby si do formuláře dopsal vlastní políčko.
 *  3. Do `data` posíláme JMENOVITĚ vypsaná pole, ne rozbalený formulář.
 */

export type ProfileFormState = {
  status: 'idle' | 'error'
  message?: string
  field?: 'name' | 'description' | 'myWebUrl' | 'avatar'
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

/**
 * Web uživatele: bereme i tvar bez protokolu („www.jankonas.cz"), protože tak
 * to má většina migrovaných účtů. Odmítáme všechno, co není http(s) — hlavně
 * `javascript:` a `data:`, které by se z profilu daly použít jako past.
 */
function checkWebUrl(value: string): string | null {
  if (value.length === 0) return null
  if (value.length > MAX_URL) return `Adresa webu může mít nejvýš ${MAX_URL} znaků.`
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return 'Adresa webu nevypadá správně, zkus třeba www.mujweb.cz.'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Adresa webu musí začínat http:// nebo https://.'
  }
  // Doména musí mít tečku a nesmí být „localhost" apod. — chrání před překlepy.
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    return 'Adresa webu nevypadá správně, zkus třeba www.mujweb.cz.'
  }
  return null
}

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const me = await getCurrentUser()
  if (!me) {
    return { status: 'error', message: 'Nejsi přihlášený. Přihlas se prosím znovu.' }
  }

  const name = text(formData, 'name')
  const description = text(formData, 'description')
  const myWebUrl = text(formData, 'myWebUrl')
  const removeAvatar = formData.get('removeAvatar') === '1'
  const upload = formData.get('avatar')
  const file = upload instanceof File && upload.size > 0 ? upload : null

  if (name.length > MAX_NAME) {
    return { status: 'error', field: 'name', message: 'Jméno je příliš dlouhé.' }
  }
  if (description.length > MAX_DESCRIPTION) {
    return {
      status: 'error',
      field: 'description',
      message: `Text o sobě může mít nejvýš ${MAX_DESCRIPTION} znaků (teď má ${description.length}).`,
    }
  }
  const urlError = checkWebUrl(myWebUrl)
  if (urlError) return { status: 'error', field: 'myWebUrl', message: urlError }

  if (file) {
    // Stejné meze hlídá i kolekce Avatars — tady jsou proto, aby člověk dostal
    // srozumitelnou hlášku místo obecné chyby serveru.
    if (!(AVATAR_MIME as readonly string[]).includes(file.type)) {
      return { status: 'error', field: 'avatar', message: 'Fotka musí být JPEG, PNG nebo WebP.' }
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return { status: 'error', field: 'avatar', message: 'Fotka může mít nejvýš 2 MB.' }
    }
  }

  const payload = await getDb()
  // Ověřená identita pro Local API. `getCurrentUser` vrací jen veřejný výřez,
  // ale pro `overrideAccess: false` potřebuje Payload celý dokument uživatele.
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user || user.id !== me.id) {
    return { status: 'error', message: 'Přihlášení vypršelo. Přihlas se prosím znovu.' }
  }

  let newAvatarId: number | null | undefined
  let previousAvatarId: number | null = null
  try {
    const current = await payload.findByID({
      collection: 'users',
      id: me.id,
      depth: 0,
      select: { avatar: true },
      overrideAccess: true,
    })
    const raw = (current as { avatar?: number | { id?: number } | null }).avatar
    previousAvatarId = typeof raw === 'number' ? raw : (raw?.id ?? null)
  } catch (err) {
    // Nekritické: bez předchozího ID se jen neuklidí stará fotka. Ale zalogovat
    // to chceme — když tohle selhává pravidelně, je něco jinde špatně.
    console.error('[profil] nepodařilo se zjistit předchozí fotku:', err)
    previousAvatarId = null
  }

  try {
    if (file) {
      const data = Buffer.from(await file.arrayBuffer())
      const created = await payload.create({
        collection: 'avatars',
        data: { alt: `Profilová fotka ${me.publicName}` },
        file: { name: file.name, data, mimetype: file.type, size: data.length },
        user,
        overrideAccess: false,
      })
      newAvatarId = created.id
    } else if (removeAvatar) {
      newAvatarId = null
    }

    try {
      await payload.update({
        collection: 'users',
        id: me.id,
        data: {
          name: name || null,
          description: description || null,
          myWebUrl: myWebUrl || null,
          ...(newAvatarId !== undefined ? { avatar: newAvatarId } : {}),
        },
        user,
        overrideAccess: false,
      })
    } catch (err) {
      // Fotka se nahrála, ale profil se neuložil — uklidíme ji, ať v úložišti
      // neleží soubor, na který už se nikdo neodkáže.
      if (typeof newAvatarId === 'number') {
        try {
          await payload.delete({
            collection: 'avatars',
            id: newAvatarId,
            user,
            overrideAccess: false,
          })
        } catch (cleanupErr) {
          console.error('[profil] úklid nepoužité fotky selhal:', cleanupErr)
        }
      }
      throw err
    }

    // ÚKLID PO VÝMĚNĚ FOTKY — s ohledem na souběh.
    //
    // Když člověk odešle formulář dvakrát rychle po sobě (dvě karty, netrpělivé
    // dvojkliknutí), obě uložení si přečtou TÉŽ starou fotku, obě nahrají novou
    // a obě přepíšou účet. Vyhraje ta pozdější. Kdybychom slepě mazali „starou"
    // fotku, poražený by smazal cizí starou a svoji novou by nechal viset.
    //
    // Proto se po uložení zeptáme, co na účtu SKUTEČNĚ je, a mažeme podle toho:
    // vyhráli jsme → pryč se starou, prohráli jsme → pryč s naší nepoužitou.
    if (newAvatarId !== undefined) {
      let aktualniAvatarId: number | null = null
      try {
        const po = await payload.findByID({
          collection: 'users',
          id: me.id,
          depth: 0,
          select: { avatar: true },
          overrideAccess: true,
        })
        const raw = (po as { avatar?: number | { id?: number } | null }).avatar
        aktualniAvatarId = typeof raw === 'number' ? raw : (raw?.id ?? null)
      } catch (err) {
        console.error('[profil] kontrola aktuální fotky selhala:', err)
      }

      const kSmazani =
        aktualniAvatarId === newAvatarId
          ? previousAvatarId // uložilo se naše → stará je k ničemu
          : typeof newAvatarId === 'number'
            ? newAvatarId // přepsal nás někdo jiný → naše je k ničemu
            : null

      // Selhání úklidu není důvod hlásit uživateli chybu — profil je uložený.
      if (kSmazani) {
        try {
          await payload.delete({
            collection: 'avatars',
            id: kSmazani,
            user,
            overrideAccess: false,
          })
        } catch (err) {
          console.error('[profil] nepoužitou fotku se nepodařilo smazat:', err)
        }
      }
    }
  } catch (err) {
    console.error('[profil] uložení selhalo:', err)
    return { status: 'error', message: 'Uložení se nepovedlo. Zkus to prosím znovu.' }
  }

  // Zpět na profil bez parametru úprav. Invalidaci cache řeší hook kolekce
  // Users (revalidateUserAfterChange), takže se změna projeví okamžitě.
  redirect(me.profileHref ?? '/')
}
