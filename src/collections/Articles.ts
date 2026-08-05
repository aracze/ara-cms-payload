import type { CollectionConfig } from 'payload'
import { revalidateArticleAfterChange, revalidateArticleAfterDelete } from '../hooks/revalidation'
import { imageFields } from '../fields/image'
import { slugField } from '../fields/slug'
import { isAdmin } from '../access/isAdmin'
import { isAdminOrEditor } from '../access/isAdminOrEditor'

import {
  MetaDescriptionField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

// Veřejná (bezpečná) podmnožina autora pro frontend.
type PublicAuthor = {
  id: number
  username: string | null
  name: string | null
  description: string | null
  avatar: { url: string | null } | null
}

export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'updatedAt'],
  },
  access: {
    read: () => true,
    // Zápis obsahu jen admin/editor; mazání jen admin. Bez těchto pravidel by
    // Payload povolil zápis KAŽDÉMU přihlášenému (i roli `user`).
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [revalidateArticleAfterChange],
    afterDelete: [revalidateArticleAfterDelete],
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
        { label: 'Článek', value: 'Článek' },
        { label: 'Průvodce', value: 'Průvodce' },
        { label: 'Rady na cestu', value: 'RadyNaCestu' },
      ],
      defaultValue: 'Článek',
      required: true,
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
            {
              name: 'attribution',
              label: 'Zdroj / attribution',
              type: 'richText',
              admin: {
                description:
                  'Zdroj na konci článku (např. "Zdroj: www.example.com"). Zobrazí se zarovnaný vpravo kurzívou.',
              },
            },
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
          label: 'Comments',
          fields: [
            {
              // Reverzní pohled: komentáře/recenze mířící na tento článek přes `relatedTo`.
              name: 'comments',
              label: false,
              type: 'join',
              collection: 'comments',
              on: 'relatedTo',
              defaultSort: '-createdAt',
              admin: {
                defaultColumns: ['authorName', 'body', 'createdAt', 'status'],
                allowCreate: false,
              },
            },
          ],
        },
      ],
    },
    slugField(),
    {
      name: 'publishedAt',
      label: 'Datum publikace',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'legacyArticleId',
      label: 'Legacy Article ID',
      type: 'number',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        create: ({ req: { user } }) => Boolean(user?.roles?.includes('admin')),
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
      name: 'mainPage',
      label: 'Main Page (Canonical)',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description: 'Určuje výslednou domovskou URL adresu článku a kanonický odkaz pro Google.',
      },
    },
    {
      name: 'pages',
      label: 'Other Pages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description:
          'Vyberte další destinace, ve kterých se má tento článek zobrazit v doporučeném výpisu.',
      },
    },
    {
      // Bezpečná podmnožina autorových údajů pro veřejný frontend (bez e-mailu/rolí).
      name: 'createdByPublic',
      type: 'json',
      virtual: true,
      hooks: {
        afterRead: [
          async ({ data, req }): Promise<PublicAuthor | null> => {
            const createdBy = data?.createdBy
            if (!createdBy) return null

            const authorId =
              typeof createdBy === 'number'
                ? createdBy
                : typeof createdBy === 'object' && createdBy && 'id' in createdBy
                  ? Number(createdBy.id)
                  : null

            if (!authorId) return null

            // Cache autorů per-request → výpisy nefetchují stejného autora opakovaně.
            const ctx = req.context as {
              authorCache?: Map<number, PublicAuthor | null>
            }
            const cache = (ctx.authorCache ??= new Map())
            if (cache.has(authorId)) return cache.get(authorId) ?? null

            let result: PublicAuthor | null = null
            try {
              // `select` omezí načtená pole (bez `as any` a bez over-fetche); `depth: 1`
              // zůstává jen kvůli populaci `avatar` (upload) na objekt s `url`.
              const user = await req.payload.findByID({
                collection: 'users',
                id: authorId,
                depth: 1,
                overrideAccess: true,
                req,
                select: {
                  username: true,
                  name: true,
                  description: true,
                  avatar: true,
                },
              })

              result = {
                id: user.id,
                username: user.username ?? null,
                name: user.name ?? null,
                description: user.description ?? null,
                avatar:
                  user.avatar && typeof user.avatar === 'object'
                    ? { url: user.avatar.url ?? null }
                    : null,
              }
            } catch {
              result = null
            }

            cache.set(authorId, result)
            return result
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
  ],
}
