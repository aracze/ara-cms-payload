import type { Access, CollectionConfig, FieldAccess } from 'payload'
import { APIError } from 'payload'
import { AVATAR_MIME, MAX_AVATAR_BYTES } from '../lib/profile-limits'

/**
 * Profilové fotky uživatelů — ZÁMĚRNĚ mimo kolekci Media.
 *
 * Media je redakční knihovna (~3300 souborů) a vkládat do ní smí jen redakce.
 * Kdybychom ji otevřeli i běžným uživatelům kvůli avatarům, promíchaly by se
 * osobní fotky s obsahem webu a redakce by v tom hledala. Vlastní kolekce dává
 * avatarům vlastní pravidla: nahrát smí každý přihlášený, ale sáhnout jen na
 * svůj vlastní.
 *
 * Soubory jdou na Cloudinary úplně stejně jako Media (viz `cloudinaryStorage`
 * v payload.config.ts) — lokálně se nic neukládá, protože kontejner se při
 * každém nasazení zahazuje.
 */

// Meze sdílené s formulářem profilu — viz src/lib/profile-limits.ts.
const MAX_BYTES = MAX_AVATAR_BYTES
const ALLOWED_MIME: readonly string[] = AVATAR_MIME
/**
 * Kolik avatarů smí jeden účet mít.
 *
 * Uživatel potřebuje právě jeden — starý se při výměně z profilu maže. Strop je
 * proti přímému volání API, kterým by šlo nahrát neomezeně souborů; tři místo
 * jednoho proto, aby při souběhu (výměna fotky) nikdo nenarazil na hranici.
 */
const MAX_PER_USER = 3

function isAdminUser(user: unknown): boolean {
  const roles = (user as { roles?: string[] } | null)?.roles
  return Array.isArray(roles) && roles.includes('admin')
}

/** Nahrát smí každý přihlášený — i role `user`. To je smysl téhle kolekce. */
const canCreate: Access = ({ req }) => Boolean(req.user)

/**
 * Měnit a mazat smí jen vlastník (a admin). Vrací QUERY, ne boolean, takže
 * omezení platí i pro hromadné operace a výpis v adminu.
 */
const ownerOnly: Access = ({ req }) => {
  if (!req.user) return false
  if (isAdminUser(req.user)) return true
  return { owner: { equals: req.user.id } }
}

/** Vlastníka nastavuje server z přihlášení, nikdo ho nesmí přepsat z formuláře. */
const noOneCanWrite: FieldAccess = () => false

export const Avatars: CollectionConfig = {
  slug: 'avatars',
  labels: { singular: 'Avatar', plural: 'Avatary' },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'owner', 'updatedAt'],
    description: 'Profilové fotky uživatelů. Nahrávají si je lidé sami ze svého profilu.',
  },
  access: {
    // Avatar je veřejný — zobrazuje se u komentářů, recenzí i na profilu.
    read: () => true,
    create: canCreate,
    update: ownerOnly,
    delete: ownerOnly,
  },
  upload: {
    // Soubory drží Cloudinary, ne disk kontejneru (ten nasazení nepřežije).
    disableLocalStorage: true,
    // Whitelist v prohlížeči; skutečnou kontrolu dělá hook níž (klientu nevěřit).
    mimeTypes: [...ALLOWED_MIME],
    // Ořez na čtverec děláme ZA uživatele — starý web po lidech chtěl, ať si
    // čtvercovou fotku připraví sami, jinak se avatar deformoval.
    resizeOptions: { width: 512, height: 512, position: 'centre', fit: 'cover' },
    // Zmenšování do konkrétních velikostí řeší Cloudinary přes URL
    // (viz cloudinary-loader), takže tu žádné imageSizes nepotřebujeme.
    crop: false,
    focalPoint: false,
    adminThumbnail: ({ doc }) => (doc.url as string) || null,
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation }) => {
        if (operation !== 'create' && operation !== 'update') return args
        const file = args.req?.file
        if (!file) return args

        // Limity kontrolujeme na SERVERU. `mimeTypes` výš jen filtruje dialog
        // pro výběr souboru — ten se dá obejít, tohle ne.
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          throw new Error('Avatar musí být JPEG, PNG nebo WebP.')
        }
        if (file.size > MAX_BYTES) {
          throw new Error('Avatar může mít nejvýš 2 MB.')
        }

        // Původní název souboru zahazujeme — bývá v něm jméno, datum nebo cesta
        // z cizího počítače a byl by veřejně v URL.
        const ext =
          file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg'
        const userId = args.req?.user?.id ?? 'x'
        file.name = `avatar-${userId}-${Date.now()}.${ext}`
        return args
      },
    ],
    beforeValidate: [
      async ({ req, operation }) => {
        if (operation !== 'create' || !req.user) return
        // `count`, ne `find` s limitem 0: netahá dokumenty, jen číslo.
        const { totalDocs } = await req.payload.count({
          collection: 'avatars',
          where: { owner: { equals: req.user.id } },
          // `req` kvůli transakci; overrideAccess proto, že jde o interní
          // kontrolu limitu, ne o čtení dat pro uživatele.
          req,
          overrideAccess: true,
        })
        if (totalDocs >= MAX_PER_USER) {
          // `APIError` s kódem 400 — obyčejná výjimka by z API vypadla jako
          // chyba serveru (500), i když je to chyba na straně volajícího.
          throw new APIError('Máš nahraných příliš mnoho fotek. Zkus to prosím za chvíli.', 400)
        }
      },
    ],
    beforeChange: [
      ({ data, req, operation }) => {
        // Vlastník se bere ze session, ne z dat — jinak by šlo nahrát avatar
        // „za někoho jiného" a pak mu ho měnit.
        if (operation === 'create' && req.user) {
          return { ...data, owner: req.user.id }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      label: 'Patří uživateli',
      index: true,
      maxDepth: 0,
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: noOneCanWrite },
    },
    {
      name: 'alt',
      type: 'text',
      label: 'Alternativní text',
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: noOneCanWrite },
    },
  ],
}
