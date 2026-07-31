import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  LinkFeature,
  lexicalEditor,
  UploadFeature,
  HTMLConverterFeature,
  BlocksFeature,
  // TODO: Replace EXPERIMENTAL_TableFeature with stable TableFeature once it graduates
  EXPERIMENTAL_TableFeature,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { cloudinaryStorage } from 'payload-storage-cloudinary'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'

import { migrations } from './migrations'
import { buildPageUrl } from './lib/page-url'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Articles } from './collections/Articles'
import { Comments } from './collections/Comments'
import { Transactions } from './collections/Transactions'
import { ContentImage } from './blocks/ContentImage'
import { MapBlock } from './blocks/Map'
import { SeasonalityBlock } from './blocks/Seasonality'
import { NiceToKnowBlock } from './blocks/NiceToKnow'
import { DailyCostsBlock } from './blocks/DailyCosts'
import { PromoBlock } from './blocks/Promo'
import { Homepage } from './globals/Homepage'
import { Header } from './globals/Header'
import { Footer } from './globals/Footer'
import { dbDumpEndpoint } from './endpoints/dbDump'
import { dbImportEndpoint } from './endpoints/dbImport'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
      // Generovaný import map držíme jako .ts (pravidlo: zdroje Payloadu pod src
      // jsou TypeScript). `payload generate:importmap` zapisuje na tuto cestu.
      importMapFile: path.resolve(dirname, 'app/(payload)/admin/importMap.ts'),
    },
    components: {
      afterNavLinks: ['/components/DatabaseNav#DatabaseNav'],
    },
  },
  collections: [Users, Media, Pages, Articles, Comments, Transactions],
  globals: [Homepage, Header, Footer],
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures.filter((feature: any) => feature?.key !== 'link'),
      LinkFeature({
        fields: ({ defaultFields }) => [
          ...defaultFields,
          {
            name: 'nofollow',
            type: 'checkbox',
            label: 'No follow',
            defaultValue: false,
          },
        ],
      }),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
      UploadFeature({
        collections: {
          media: {
            fields: [
              {
                name: 'caption',
                type: 'richText',
                editor: lexicalEditor(),
              },
            ],
          },
        },
      }),
      HTMLConverterFeature({}),
      EXPERIMENTAL_TableFeature(),
      BlocksFeature({
        blocks: [
          ContentImage,
          MapBlock,
          SeasonalityBlock,
          NiceToKnowBlock,
          DailyCostsBlock,
          PromoBlock,
        ],
      }),
    ],
  }),
  // E-maily (reset hesla do administrace atd.) posílá Payload přes SMTP.
  // Adaptér zapojíme JEN když je nastavené SMTP_HOST — bez něj se web chová
  // jako dřív (e-mail se vypíše do konzole). Zoho: host smtp.zoho.com, port 465
  // = implicitní SSL (`secure: true`); pro STARTTLS port (587) je `secure: false`.
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.SMTP_FROM || process.env.SMTP_USER || 'info@ara.cz',
        defaultFromName: process.env.SMTP_FROM_NAME || 'Ara.cz',
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 465,
          secure: (Number(process.env.SMTP_PORT) || 465) === 465,
          // Auth přidáme JEN když je nastavený SMTP_USER. Lokální relay bez
          // přihlášení (Mailpit/Mailhog) by jinak dostal auth s undefined
          // přihlašovacími údaji a NodeMailer může vyhodit chybu.
          ...(process.env.SMTP_USER
            ? {
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASSWORD,
                },
              }
            : {}),
        },
      })
    : undefined,
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    push: process.env.NODE_ENV !== 'production',
    // Schéma v produkci spravujeme importem databázového dumpu z lokálu
    // (admin dbDump/dbImport). prodMigrations proto standardně NEBĚŽÍ — jinak
    // by Payload na importovaném (dev-push) schématu detekoval drift a čekal na
    // interaktivní odpověď, čímž by start zamrzl. Migrace lze zapnout proměnnou
    // PAYLOAD_RUN_MIGRATIONS=true (např. pro čistý deploy bez dumpu).
    prodMigrations: process.env.PAYLOAD_RUN_MIGRATIONS === 'true' ? migrations : undefined,
  }),
  sharp,
  endpoints: [dbDumpEndpoint, dbImportEndpoint],
  plugins: [
    nestedDocsPlugin({
      collections: ['pages'],
      generateLabel: (_, doc) => doc.title as string,
      // Pravidlo pro vypnuté „Zobrazit v URL" viz buildPageUrl — platí jen pro
      // místa pod danou stránkou, ne pro její informační podstránky.
      generateURL: (docs) => buildPageUrl(docs),
      parentFieldSlug: 'parent',
      breadcrumbsFieldSlug: 'breadcrumbs',
    }),
    seoPlugin({
      generateTitle: ({ doc }) => `${(doc as any).title || ''} | Ara.cz`,
      generateDescription: ({ doc }) => {
        const title = (doc as any).title || ''
        return `Informace o destinaci ${title} na Ara.cz – inspirace a rady na cesty.`
      },
      generateURL: async ({ doc, collectionSlug, req }) => {
        const slug = (doc as any).slug || ''

        if (collectionSlug === 'pages') {
          const fullSlug = (doc as any).fullSlug || ''
          return `https://www.ara.cz${fullSlug}`
        }

        if (collectionSlug === 'articles') {
          const mainPageId = (doc as any).mainPage
          if (mainPageId) {
            try {
              // Najdeme hlavní stránku, abychom získali její fullSlug.
              // `req` předáváme, aby dotaz běžel ve stejné transakci jako
              // původní operace (jinak si bere separátní DB spojení z poolu).
              const mainPage = await req.payload.findByID({
                collection: 'pages',
                id: typeof mainPageId === 'object' ? mainPageId.id : mainPageId,
                depth: 0,
                select: { fullSlug: true },
                req,
              })
              if (mainPage?.fullSlug) {
                return `https://www.ara.cz${mainPage.fullSlug}/${slug}`
              }
            } catch (e) {
              console.error('Error generating Article URL:', e)
            }
          }
          return `https://www.ara.cz/${slug}` // Fallback bez hlavní stránky
        }

        return `https://www.ara.cz/${slug}`
      },
      generateImage: ({ doc }) => (doc as any).featuredImage?.image,
    }),
    ...(process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
      ? [
          cloudinaryStorage({
            cloudConfig: {
              cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
              api_key: process.env.CLOUDINARY_API_KEY as string,
              api_secret: process.env.CLOUDINARY_API_SECRET as string,
            },
            collections: {
              media: true,
            },
          }),
        ]
      : []),
  ],
})
