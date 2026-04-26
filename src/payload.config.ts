import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
  UploadFeature,
  HTMLConverterFeature,
  BlocksFeature,
  EXPERIMENTAL_TableFeature,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { cloudinaryStorage } from 'payload-storage-cloudinary'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Articles } from './collections/Articles'
import { ContentImage } from './blocks/ContentImage'
import { MapBlock } from './blocks/Map'
import { Homepage } from './globals/Homepage'
import { Header } from './globals/Header'
import { Footer } from './globals/Footer'
import { dbDumpEndpoint } from './endpoints/dbDump'
import { dbImportEndpoint } from './endpoints/dbImport'

import { initDbEndpoint } from './endpoints/initDb'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      afterNavLinks: ['/components/DatabaseNav#DatabaseNav'],
    },
  },
  collections: [Users, Media, Pages, Articles],
  globals: [Homepage, Header, Footer],
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => [
      ...defaultFeatures,
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
        blocks: [ContentImage, MapBlock],
      }),
    ],
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    push: process.env.NODE_ENV !== 'production',
  }),
  sharp,
  endpoints: [
    dbDumpEndpoint,
    dbImportEndpoint,
    {
      path: '/init-db',
      method: 'get',
      handler: initDbEndpoint,
    },
  ],
  plugins: [
    nestedDocsPlugin({
      collections: ['pages'],
      generateLabel: (_, doc) => doc.title as string,
      generateURL: (docs) =>
        docs.reduce((url, doc, index) => {
          const isLast = index === docs.length - 1
          if (isLast || doc.includeInChildUrlPaths !== false) {
            return `${url}/${doc.slug}`
          }
          return url
        }, ''),
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
              // Najdeme hlavní stránku, abychom získali její fullSlug
              const mainPage = await req.payload.findByID({
                collection: 'pages',
                id: typeof mainPageId === 'object' ? mainPageId.id : mainPageId,
                depth: 0,
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
