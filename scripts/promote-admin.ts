import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

const email = process.argv[2]

if (!email) {
  console.error('Usage: pnpm run promote:admin -- user@example.com')
  process.exit(1)
}

const run = async () => {
  const payload = await getPayload({ config: configPromise })

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    depth: 0,
    limit: 1,
  })

  const user = existing.docs[0]
  if (!user) {
    console.error(`User not found: ${email}`)
    process.exit(1)
  }

  const roles = Array.isArray(user.roles) ? user.roles : []
  if (roles.includes('admin')) {
    console.log(`User already admin: ${email}`)
    return
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      roles: [...roles, 'admin'],
    },
  })

  console.log(`Promoted to admin: ${email}`)
}

run()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
