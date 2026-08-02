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
  auth: true,
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
      relationTo: 'media',
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
