import type { CollectionConfig } from 'payload'
import { revalidatePageAfterChange, revalidatePageAfterDelete } from '../hooks/revalidation'
import { isAllowedInviaFeedUrl } from '../endpoints/syncAffiliateDeals'
import { imageFields } from '../fields/image'
import { currencyCodeField, timezoneField } from '../fields/place-detail'
import { slugField } from '../fields/slug'
import { isAdmin } from '../access/isAdmin'
import { isAdminOrEditor } from '../access/isAdminOrEditor'
import {
  MetaDescriptionField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Pages: CollectionConfig = {
  slug: 'pages',
  hooks: {
    afterChange: [revalidatePageAfterChange],
    afterDelete: [revalidatePageAfterDelete],
  },
  versions: {
    drafts: true,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
  },
  access: {
    read: ({ req }) => {
      // Logged-in users (admin/editor) can see drafts; public traffic sees only published.
      if (req.user) return true
      return {
        or: [{ _status: { equals: 'published' } }, { _status: { exists: false } }],
      }
    },
    // Zápis obsahu jen admin/editor; mazání jen admin. Bez těchto pravidel by
    // Payload povolil zápis KAŽDÉMU přihlášenému (i roli `user`).
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Místo k navštívení', value: 'Místo k navštívení' },
        { label: 'Turistický cíl', value: 'Turistický cíl' },
        { label: 'Praktické informace', value: 'Praktické informace' },
        { label: 'Vstupní podmínky', value: 'Vstupní podmínky' },
        { label: 'Cesta', value: 'Cesta' },
        { label: 'Počasí', value: 'Počasí' },
        { label: 'Doprava', value: 'Doprava' },
        { label: 'Měna a ceny', value: 'Měna a ceny' },
        { label: 'Zdraví a bezpečí', value: 'Zdraví a bezpečí' },
        { label: 'Jazyk a kultura', value: 'Jazyk a kultura' },
        { label: 'Jídlo a pití', value: 'Jídlo a pití' },
        { label: 'Ubytování', value: 'Ubytování' },
        { label: 'Články', value: 'Články' },
        { label: 'Rubrika', value: 'Rubrika' },
        { label: 'Statická stránka', value: 'Statická stránka' },
      ],
      required: true,
      defaultValue: 'Místo k navštívení',
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'featuredImage',
              type: 'group',
              fields: imageFields,
              admin: {
                className: 'content-featured-image',
              },
            },
            {
              name: 'text',
              type: 'richText',
            },
          ],
        },
        {
          name: 'detail',
          label: 'Detail',
          admin: {
            condition: (data) => ['Místo k navštívení', 'Turistický cíl'].includes(data?.category),
          },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'googleMapsAddress',
                  label: 'Adresa v Google Maps',
                  type: 'text',
                  admin: { width: '50%' },
                },
                {
                  name: 'latitude',
                  label: 'Latitude',
                  type: 'text',
                  admin: { width: '25%' },
                },
                {
                  name: 'longitude',
                  label: 'Longitude',
                  type: 'text',
                  admin: { width: '25%' },
                },
              ],
            },
            {
              name: 'website',
              label: 'Webová stránka',
              type: 'text',
              admin: {
                description: 'Oficiální web místa (z praktických informací).',
              },
            },
            {
              name: 'googleMapsZoom',
              label: 'Google Maps Zoom Level',
              type: 'number',
              defaultValue: 10,
              admin: { width: '50%' },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'locative',
                  label: 'Šestý pád (v kom, v čem)',
                  type: 'text',
                  admin: { width: '50%' },
                },
                {
                  name: 'genitive',
                  label: 'Druhý pád (do koho, do čeho)',
                  type: 'text',
                  admin: { width: '50%' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                // Obojí se DĚDÍ od nejbližšího nadřazeného místa, které to má
                // vyplněné (viz fetchInheritedPlaceDetail) — u potomků proto
                // nechávej políčka prázdná a vyplňuj je jen tam, kde se hodnota
                // od předka liší. Validaci a normalizaci drží fields/place-detail.
                timezoneField,
                currencyCodeField,
              ],
            },
            // Políčko „Zobrazit přehled počasí" (`showWeather`) tu bývalo jako
            // dědictví migrace ze starého webu (`displayWeatherOverview`).
            // Odstraněné 17. 8. 2026: přehled počasí podřazených míst se pozná
            // sám podle toho, jestli je pod stránkou nějaké místo s vlastní
            // stránkou počasí (viz page.tsx a fetchWeatherOverviewPlaces), takže
            // zaškrtávátko nic neovlivňovalo a jen mátlo. Migrovaná data se
            // navíc s realitou rozcházela u šesti stránek. Sloupce
            // `pages.detail_show_weather` a `_pages_v.version_detail_show_weather`
            // v databázi zůstávají — nic je nečte a mazání dat na produkci by
            // bylo zbytečné riziko.
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'featuredImage.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
        {
          name: 'affiliate',
          label: 'Affiliate',
          admin: {
            // Affiliate (booking) odkazy dávají smysl u míst — stejné kategorie jako Detail.
            condition: (data) => ['Místo k navštívení', 'Turistický cíl'].includes(data?.category),
          },
          fields: [
            {
              name: 'toursUrl',
              label: 'Zájezdy (URL)',
              type: 'text',
            },
            {
              name: 'accommodationUrl',
              label: 'Rezervace ubytování (URL)',
              type: 'text',
            },
            {
              name: 'carRentalUrl',
              label: 'Půjčení auta (URL)',
              type: 'text',
            },
            {
              name: 'kiwiIataCode',
              label: 'Kiwi Fly To (IATA kód letiště)',
              type: 'text',
              admin: {
                description:
                  'Kam hledat nejlevnější letenku z ČR (sekce „Akční nabídky"). Bere IATA kód letiště/města (LON, PAR) i kód země (HR, GR) — viz Tequila Search API.',
              },
            },
            {
              name: 'inviaFeedUrl',
              label: 'Invia XML feed (URL)',
              type: 'text',
              // Adresu stahuje server (denní sync) — bez omezení hosta by šla
              // zneužít jako SSRF; stejné pravidlo hlídá i endpoint samotný.
              validate: (value: string | null | undefined) => {
                if (!value) return true
                return (
                  isAllowedInviaFeedUrl(value) ||
                  'Musí být odkaz https://affil.invia.cz/… (Nástroje → XML feed → Vygenerovat XML).'
                )
              },
              admin: {
                description:
                  'Odkaz „Vygenerovat XML" z affil.invia.cz (Nástroje → XML feed → Uložené XML feedy). Plní kartu zájezdu v sekci „Akční nabídky".',
              },
            },
            {
              // Denně přepisuje /api/sync-affiliate-deals (přímým SQL mimo hooky,
              // ať neroste historie verzí) — viz src/endpoints/syncAffiliateDeals.ts.
              // V adminu VYŘAZENÉ (`disabled`, ne `hidden`): surový JSON editor jen
              // mátl, a skryté pole navíc zůstává ve stavu formuláře — redaktor,
              // který má stránku otevřenou přes noční sync, by uložením vrátil
              // včerejší nabídky. Co web zrovna ukazuje, je vidět na stránce.
              name: 'deals',
              label: 'Akční nabídky (stažená data)',
              type: 'json',
              admin: {
                disabled: true,
              },
            },
          ],
        },
        {
          label: 'Reviews',
          fields: [
            {
              // Reverzní pohled: recenze/komentáře mířící na tuto stránku přes `relatedTo`.
              name: 'comments',
              label: false,
              type: 'join',
              collection: 'comments',
              on: 'relatedTo',
              defaultSort: '-createdAt',
              admin: {
                defaultColumns: ['authorName', 'rating', 'body', 'createdAt', 'status'],
                allowCreate: false,
              },
            },
          ],
        },
      ],
    },
    {
      // Klimatické normály (12 měsíců: min/max teplota, srážky) pro stránky
      // kategorie „Počasí" — plní /api/sync-climate-normals z Meteostatu
      // (přímým SQL mimo hooky, ať neroste historie verzí), souřadnice se
      // berou z rodičovského místa. V adminu VYŘAZENÉ (`disabled`) ze stejného
      // důvodu jako affiliate.deals: JSON editor by mátl a skryté pole by při
      // uložení stránky z adminu přepsalo čerstvá data ze syncu starými.
      name: 'climateNormals',
      label: 'Klimatické normály (stažená data)',
      type: 'json',
      admin: {
        disabled: true,
      },
    },
    slugField(),
    {
      name: 'legacyPageId',
      label: 'Legacy Page ID',
      type: 'number',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        update: ({ req: { user } }) => Boolean(user?.roles?.includes('admin')),
      },
    },
    {
      name: 'analyticsPageViews',
      label: 'Zobrazení za 12 měsíců (GA4)',
      type: 'number',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Zobrazení za posledních 12 měsíců z Google Analytics — aktualizuje se automaticky jednou denně, needituj ručně. Používá se pro řazení v sekci „Co vidět".',
      },
      // admin.readOnly chrání jen formulář v adminu, ne API — bez field-level
      // access by editor mohl hodnotu přepsat přes REST/Local API a ovlivnit
      // řazení. Sync endpoint (syncAnalytics.ts) píše přímo SQL, obchází
      // Payload access stejně jako ostatní hooky, takže mu tohle nevadí.
      access: {
        update: ({ req: { user } }) => Boolean(user?.roles?.includes('admin')),
      },
    },
    {
      name: 'createdBy',
      label: 'Autor',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ req, operation, value }) => {
            if (operation === 'create' && req.user) {
              return req.user.id
            }
            return value
          },
        ],
      },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      filterOptions: ({ id }) => {
        if (!id) return true
        return {
          id: {
            not_equals: id,
          },
        }
      },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'fullSlug',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        components: {
          Field: '/components/FinalUrl#FinalUrl',
        },
      },
      hooks: {
        beforeChange: [
          ({ data, originalDoc }) => {
            const breadcrumbs = data?.breadcrumbs || originalDoc?.breadcrumbs || []
            if (breadcrumbs.length > 0) {
              return breadcrumbs[breadcrumbs.length - 1].url
            }
            return undefined
          },
        ],
      },
    },
    {
      name: 'includeInChildUrlPaths',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'stopDisplayingChildPlaces',
      label: 'Stop Displaying Child Places',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        condition: (data) => data?.category === 'Místo k navštívení',
        description:
          'Pro zobrazení vyššího rodiče, než je ten nejmenší. Například ostrov Zakynthos se zobrazí pro Řecko, ačkoliv existují ještě na ostrově další místa a cíle.',
      },
    },
    {
      name: 'breadcrumbs',
      type: 'array',
      fields: [
        {
          name: 'doc',
          type: 'relationship',
          relationTo: 'pages',
          hasMany: false,
          admin: {
            disabled: true,
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'url',
              label: 'URL',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
            {
              name: 'label',
              type: 'text',
              admin: {
                width: '50%',
              },
            },
          ],
        },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'subPages',
      label: 'Sub Pages',
      type: 'join',
      collection: 'pages',
      on: 'parent',
      defaultLimit: 100,
      admin: {
        position: 'sidebar',
        allowCreate: false,
      },
    },
    {
      name: 'primaryArticles',
      label: 'Main Article (Canonical)',
      type: 'join',
      collection: 'articles',
      on: 'mainPage',
      defaultLimit: 100,
      admin: {
        position: 'sidebar',
        allowCreate: false,
      },
    },
    {
      name: 'secondaryArticles',
      label: 'Other Articles',
      type: 'join',
      collection: 'articles',
      on: 'pages',
      defaultLimit: 100,
      admin: {
        position: 'sidebar',
        allowCreate: false,
      },
    },
    {
      name: 'createdByPublic',
      type: 'json',
      virtual: true,
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            const createdBy = data?.createdBy
            if (!createdBy) return null

            const authorId =
              typeof createdBy === 'number'
                ? createdBy
                : typeof createdBy === 'object' && createdBy && 'id' in createdBy
                  ? Number(createdBy.id)
                  : null

            if (!authorId) return null

            // Memo v req.context: výpis dětí (např. 11 cílů na stránce místa)
            // spouští tento hook pro KAŽDÝ dokument, ale autoři se opakují.
            // Sdílený Promise per autor v rámci jedné operace srazí N dotazů
            // na počet unikátních autorů (typicky 1–2) a pokryje i souběh.
            const memo = ((
              req.context as { createdByPublicMemo?: Map<number, Promise<unknown>> }
            ).createdByPublicMemo ??= new Map())

            let lookup = memo.get(authorId)
            if (!lookup) {
              lookup = req.payload
                .findByID({
                  collection: 'users',
                  id: authorId,
                  depth: 1,
                  // Taháme jen pole, která níže skládáme do veřejného objektu —
                  // ne celého uživatele (heslo/hash, role, e-mail sem nepatří).
                  select: {
                    username: true,
                    name: true,
                    avatar: true,
                  },
                  overrideAccess: true,
                  req,
                })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .then((user: any) => ({
                  id: user.id,
                  username: user.username ?? null,
                  name: user.name ?? null,
                  avatar:
                    user.avatar && typeof user.avatar === 'object'
                      ? { url: user.avatar.url ?? null }
                      : null,
                }))
                .catch(() => null)
              memo.set(authorId, lookup)
            }

            return lookup
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
  ],
}
