import type { Access, CollectionConfig, FieldAccess } from 'payload'

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
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
    create: isAdmin,
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
