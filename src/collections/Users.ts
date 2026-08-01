import type { Access, CollectionConfig, FieldAccess } from 'payload'
import { isAdminOrEditor } from '../access/isAdminOrEditor'
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
    tokenExpiration: 60 * 60 * 24 * 7,
    // Registrace z webu vyžaduje potvrzení e-mailu (brání překlepům v adrese
    // i zakládání účtů na cizí e-maily).
    //
    // ⚠️ POZOR: zapnutím `verify` začne Payload odmítat přihlášení každému, kdo
    // nemá `_verified: true` — včetně účtů, které existovaly PŘED zapnutím.
    // Proto k tomu patří jednorázový doběh `pnpm backfill:verified`, který
    // stávající účty označí za ověřené. Bez něj by se nikdo (ani admin)
    // nepřihlásil.
    // Obnova hesla — odkaz vede na VEŘEJNÝ web (výchozí Payload míří do administrace,
    // kam se běžný uživatel stejně nedostane).
    forgotPassword: {
      generateEmailSubject: () => 'Nastavení nového hesla na Ara.cz',
      generateEmailHTML: (args) => {
        const token = (args as { token?: string } | undefined)?.token ?? ''
        const base = (process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL || 'http://localhost:3000').replace(
          /\/$/,
          '',
        )
        const url = `${base}/nove-heslo?token=${token}`
        return `
          <p>Ahoj,</p>
          <p>někdo (snad ty) požádal o nové heslo k účtu na Ara.cz. Nastavíš si ho tímhle odkazem:</p>
          <p><a href="${url}">Nastavit nové heslo</a></p>
          <p>Pokud odkaz nefunguje, zkopíruj si do prohlížeče tuhle adresu:<br>${url}</p>
          <p>O nové heslo jsi nežádal? Tenhle e-mail klidně smaž — dokud na odkaz neklikneš, staré heslo dál platí.</p>
        `
      },
    },
    verify: {
      generateEmailSubject: () => 'Potvrď svůj účet na Ara.cz',
      // Odkaz míří na VEŘEJNÝ web, ne do administrace (výchozí chování Payloadu).
      generateEmailHTML: ({ token, user }) => {
        const base = (process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL || 'http://localhost:3000').replace(
          /\/$/,
          '',
        )
        const url = `${base}/registrace/potvrzeni?token=${token}`
        const name = (user as { username?: string })?.username ?? ''
        return `
          <p>Ahoj${name ? ' ' + name : ''},</p>
          <p>vítej na Ara.cz! Potvrď prosím svůj e-mail kliknutím na odkaz:</p>
          <p><a href="${url}">Potvrdit e-mail</a></p>
          <p>Pokud odkaz nefunguje, zkopíruj si do prohlížeče tuhle adresu:<br>${url}</p>
          <p>Když jsi o účet nežádal, tenhle e-mail klidně smaž — bez potvrzení účet nevznikne.</p>
        `
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
      name: 'firstName',
      type: 'text',
      access: {
        read: isAdminOrSelfFieldAccess,
        update: isAdminOrSelfFieldAccess,
      },
    },
    {
      name: 'lastName',
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
