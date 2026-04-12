import { postgresAdapter } from '@payloadcms/db-postgres'
import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
  LinkFeature,
  UploadFeature,
  HTMLConverterFeature,
  BlocksFeature,
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
      BlocksFeature({
        blocks: [], // Zde můžete přidat své bloky, které chcete vkládat do textu
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
        return `Informace o destinaci ${title} na Ara.cz – cestovatelský průvodce.`
      },
      generateURL: ({ doc }) => {
        const fullSlug = (doc as any).fullSlug || ''
        return `https://www.ara.cz${fullSlug}`
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
