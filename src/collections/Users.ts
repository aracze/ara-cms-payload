import type { Access, CollectionConfig, FieldAccess } from 'payload'
import { isAdminOrEditor } from '../access/isAdminOrEditor'
import { SESSION_SECONDS } from '../lib/session-constants'
import { publicBaseUrl } from '../lib/public-url'
import { escapeHtml, renderAraEmail } from '../lib/email-template'
import { revalidateUserAfterChange, revalidateUserAfterDelete } from '../hooks/revalidation'

const isAdmin: Access = ({ req: { user } }) => {
  return Boolean(user?.roles?.includes('admin'))
}

const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.roles?.includes('admin')) return true
  return {
    id: {
      equals: user.id,
    },
  }
}

// Přístup do admin panelu (`access.admin`) — jen admin/editor (sdílený helper
// `isAdminOrEditor`). Bez tohoto pravidla by se do /admin dostal KAŽDÝ
// přihlášený (i výchozí role `user`).
const isAdminFieldAccess: FieldAccess = ({ req: { user } }) => {
  return Boolean(user?.roles?.includes('admin'))
}

const isAdminOrSelfFieldAccess: FieldAccess = ({ req: { user }, id }) => {
  if (!user) return false
  if (user.roles?.includes('admin')) return true
  return user.id === id
}

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    // Zpevnění proti hádání hesel: po 5 neúspěšných pokusech Payload účet
    // na 10 minut zamkne (počítá si to sám v `loginAttempts`/`lockUntil`).
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    // Platnost přihlášení = 7 dní; MUSÍ odpovídat `maxAge` cookie
    // v `src/lib/auth-actions.ts`, jinak by cookie přežila platnost tokenu
    // (uživatel by vypadal přihlášený, ale server by ho odmítal).
    // Ze sdílené konstanty, ať platnost tokenu a platnost cookie nemůžou
    // utéct od sebe (viz src/lib/session-constants.ts).
    tokenExpiration: SESSION_SECONDS,
    // Registrace z webu vyžaduje potvrzení e-mailu (brání překlepům v adrese
    // i zakládání účtů na cizí e-maily).
    //
    // ⚠️ POZOR: zapnutím `verify` začne Payload odmítat přihlášení každému, kdo
    // nemá `_verified: true` — včetně účtů, které existovaly PŘED zapnutím.
    // Proto k tomu patří jednorázový doběh `pnpm backfill:verified`, který
    // stávající účty označí za ověřené. Bez něj by se nikdo (ani admin)
    // nepřihlásil.
    // Obnova hesla — odkaz vede na VEŘEJNÝ web (výchozí Payload míří do administrace,
    // kam se běžný uživatel stejně nedostane). Vzhled dodává sdílená šablona
    // v src/lib/email-template.ts.
    forgotPassword: {
      generateEmailSubject: () => 'Nastavení nového hesla na Ara.cz',
      generateEmailHTML: (args) => {
        const token = (args as { token?: string } | undefined)?.token ?? ''
        const base = publicBaseUrl()
        const url = `${base}/nove-heslo?token=${encodeURIComponent(token)}`
        return renderAraEmail({
          title: 'Nové heslo',
          bodyHtml:
            'Ahoj, někdo (snad ty) požádal o nové heslo k účtu na Ara.cz. Nastavíš si ho tlačítkem:',
          buttonLabel: 'Nastavit nové heslo',
          buttonUrl: url,
          note: 'O nové heslo jsi nežádal? Tenhle e-mail klidně smaž — dokud na odkaz neklikneš, staré heslo dál platí.',
          reason: 'někdo požádal o obnovu hesla k tvému účtu.',
        })
      },
    },
    verify: {
      generateEmailSubject: () => 'Potvrď svůj účet na Ara.cz',
      // Odkaz míří na VEŘEJNÝ web, ne do administrace (výchozí chování Payloadu).
      generateEmailHTML: ({ token, user }) => {
        const base = publicBaseUrl()
        const url = `${base}/registrace/potvrzeni?token=${encodeURIComponent(token)}`
        const name = escapeHtml((user as { username?: string })?.username ?? '')
        return renderAraEmail({
          title: 'Vítej na Ara.cz!',
          bodyHtml: `Ahoj${name ? ' <b>' + name + '</b>' : ''}, díky za registraci. Zbývá poslední krok — potvrď prosím svůj e-mail:`,
          buttonLabel: 'Potvrdit e-mail',
          buttonUrl: url,
          note: 'Když jsi o účet nežádal, tenhle e-mail klidně smaž — bez potvrzení účet nevznikne.',
          reason: 'se s tvou adresou někdo zaregistroval.',
        })
      },
    },
  },
  access: {
    admin: isAdminOrEditor,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
    create: isAdmin,
  },
  hooks: {
    // Okamžitá invalidace veřejného profilu (/profil/<username>) při změně
    // uživatele v adminu — viz src/hooks/revalidation.ts.
    afterChange: [revalidateUserAfterChange],
    afterDelete: [revalidateUserAfterDelete],
  },
  fields: [
    // Email added by default
    {
      name: 'legacyUserId',
      type: 'number',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        read: isAdminOrSelfFieldAccess,
        update: isAdminFieldAccess, // Pouze admin může měnit migrační ID
      },
    },
    {
      name: 'username',
      type: 'text',
      index: true,
      // Uživatelské jméno je VEŘEJNÁ IDENTITA — adresa profilu je /profil/<username>,
      // takže dva stejné by se o adresu hádaly. `unique` to hlídá i v databázi
      // (chrání i proti dvěma souběžným registracím se stejným jménem).
      // Rozlišování velkých/malých písmen řeší registrace: nové uživatelského jména ukládá
      // malými písmeny a obsazenost kontroluje bez ohledu na velikost
      // (viz `src/lib/username.ts`). Staré migrované uživatelského jména s velkými písmeny
      // a diakritikou (např. „TravelPortal.cz", „káťa") zůstávají, jak jsou.
      unique: true,
      access: {
        read: isAdminOrSelfFieldAccess,
        update: isAdminOrSelfFieldAccess,
      },
    },
    {
      // JEDNO pole na celé jméno, ne dvojice jméno + příjmení.
      //
      // Důvod je věcný: nikde v aplikaci se ty dvě části nepoužívají zvlášť —
      // všech pět míst, kde se jméno zobrazuje, je zase slepí dohromady.
      // A jména se na dvě kolonky spolehlivě nedělí: dvě příjmení, jen jedno
      // jméno, tituly, jinde ve světě příjmení první. Jedno pole nikoho netlačí
      // do tvaru, který jeho jméno nemá.
      //
      // Zobrazuje se v záhlaví profilu. Příspěvky podepisuje uživatelské jméno
      // (viz `publicName` v src/lib/auth.ts), ne tohle.
      name: 'name',
      label: 'Jméno',
      type: 'text',
      access: {
        read: isAdminOrSelfFieldAccess,
        update: isAdminOrSelfFieldAccess,
      },
    },
    {
      name: 'description',
      type: 'textarea',
      access: {
        read: isAdminOrSelfFieldAccess,
        update: isAdminOrSelfFieldAccess,
      },
    },
    {
      name: 'myWebUrl',
      type: 'text',
      access: {
        read: isAdminOrSelfFieldAccess,
        update: isAdminOrSelfFieldAccess,
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      // Avatary mají vlastní kolekci s vlastními právy (nahrát smí i běžný
      // uživatel, ale jen svůj) — viz src/collections/Avatars.ts.
      relationTo: 'avatars',
      hasMany: false,
      maxDepth: 1,
      access: {
        read: isAdminOrSelfFieldAccess,
        update: isAdminOrSelfFieldAccess,
      },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: ['admin', 'editor', 'user'],
      defaultValue: ['user'],
      required: true,
      saveToJWT: true,
      access: {
        read: isAdminFieldAccess,
        update: isAdminFieldAccess,
      },
    },
  ],
}
