/**
 * Migrační skript: MySQL (cms.user) -> Payload users (Postgres)
 *
 * Migruje pouze uživatele, kteří mají součet transakcí > 0.
 *
 * Spuštění:
 *   pnpm migrate:users -- --dry-run
 *   pnpm migrate:users
 *   pnpm migrate:users -- --limit=100
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

type MySQLUserRow = mysql.RowDataPacket & {
  id?: number
  total_amount?: number | string | null
  [key: string]: unknown
}

const OLD_DB_CONFIG = {
  host: process.env.OLD_DB_HOST || 'localhost',
  port: Number(process.env.OLD_DB_PORT || 3306),
  user: process.env.OLD_DB_USER || 'root',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME || 'cms',
}

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : null
const SKIP_LEGACY_USER_IDS = new Set<number>([1])

function getFirstString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim()
    }
  }
  return null
}

function getEmail(row: Record<string, unknown>): string | null {
  const email = getFirstString(row, ['email', 'e_mail', 'mail', 'username'])
  const username = getFirstString(row, ['username', 'login', 'name'])

  if (!email) {
    if (!username) return null

    const fallbackLocal = username
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '')

    if (!fallbackLocal) return null
    return `${fallbackLocal}@legacy.local`
  }

  // Minimal sanity check to avoid creating invalid users.
  const normalized = email.toLowerCase()
  if (!normalized.includes('@') || normalized.startsWith('@') || normalized.endsWith('@')) {
    if (!username) return null

    const fallbackLocal = username
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '')

    if (!fallbackLocal) return null
    return `${fallbackLocal}@legacy.local`
  }

  return normalized
}

function getRoles(row: Record<string, unknown>): Array<'admin' | 'editor' | 'user'> {
  const roleRaw = getFirstString(row, ['role', 'roles', 'user_role'])?.toLowerCase() || ''

  if (roleRaw.includes('admin')) return ['admin']
  if (roleRaw.includes('editor')) return ['editor']

  return ['user']
}

function getUsername(row: Record<string, unknown>): string | null {
  return getFirstString(row, ['username', 'login', 'name'])
}

function buildTemporaryPassword(userId: number | null, email: string): string {
  const seed = `${userId ?? 'x'}-${email}`
  return `Migrace!${Buffer.from(seed).toString('base64url').slice(0, 16)}`
}

async function fetchEligibleUsers(conn: mysql.Connection): Promise<MySQLUserRow[]> {
  const limitClause = limit && Number.isFinite(limit) ? `LIMIT ${limit}` : ''
  const skipLegacyClause =
    SKIP_LEGACY_USER_IDS.size > 0
      ? `AND u.id NOT IN (${Array.from(SKIP_LEGACY_USER_IDS).join(',')})`
      : ''

  const query = `
    SELECT
      u.*,
      COUNT(DISTINCT t.id) AS transaction_count,
      COALESCE(SUM(t.cash_amount), 0) AS total_amount,
      COUNT(DISTINCT p.id) AS page_count
    FROM \`user\` u
    LEFT JOIN account a ON a.user_id = u.id
    LEFT JOIN transaction t ON t.account_id = a.id
    LEFT JOIN page p ON p.created_by_id = u.id
    WHERE 1=1
      ${skipLegacyClause}
    GROUP BY u.id
    HAVING total_amount > 0 OR page_count > 0
    ORDER BY u.id
    ${limitClause}
  `

  const [rows] = await conn.execute<mysql.RowDataPacket[]>(query)
  return rows as MySQLUserRow[]
}

async function run() {
  console.log(`\n🚀 Migrace users spuštěna${isDryRun ? ' (DRY RUN)' : ''}`)
  if (limit) console.log(`   Limit: ${limit}`)

  const conn = await mysql.createConnection(OLD_DB_CONFIG)
  console.log(`✅ Připojeno k MySQL: ${OLD_DB_CONFIG.database}@${OLD_DB_CONFIG.host}`)

  const payload = await getPayload({ config: configPromise })
  console.log('✅ Payload inicializován')

  const users = await fetchEligibleUsers(conn)
  console.log(`📦 Nalezeno ${users.length} uživatelů s total_amount > 0\n`)

  let created = 0
  let updated = 0
  let skippedLegacyId = 0
  let skippedNoEmail = 0
  let skippedDryRun = 0
  let errors = 0

  for (const [index, row] of users.entries()) {
    const progress = `[${index + 1}/${users.length}]`

    const email = getEmail(row)
    const userId = typeof row.id === 'number' ? row.id : null
    const username = getUsername(row)
    const totalAmount = Number(row.total_amount || 0)

    if (userId && SKIP_LEGACY_USER_IDS.has(userId)) {
      console.log(`${progress} ⏭️  Přeskakuji legacy user ID=${userId} (ve skip listu)`)
      skippedLegacyId++
      continue
    }

    if (!email) {
      console.log(
        `${progress} ⚠️  Přeskakuji uživatele ID=${String(row.id ?? 'N/A')} (chybí validní email)`,
      )
      skippedNoEmail++
      continue
    }

    const roles = getRoles(row)
    const temporaryPassword = buildTemporaryPassword(userId, email)

    let existing = await payload.find({
      collection: 'users',
      where: { legacyUserId: { equals: userId } },
      depth: 0,
      limit: 1,
    })

    if (existing.totalDocs === 0) {
      existing = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        depth: 0,
        limit: 1,
      })
    }

    if (isDryRun) {
      const action = existing.totalDocs > 0 ? 'UPDATE' : 'CREATE'
      console.log(
        `${progress} 📋 DRY RUN [${action}] ${email} (total_amount=${totalAmount.toFixed(2)})`,
      )
      skippedDryRun++
      continue
    }

    try {
      if (existing.totalDocs > 0) {
        const currentRoles = Array.isArray(existing.docs[0].roles) ? existing.docs[0].roles : []
        const mergedRoles = Array.from(new Set([...currentRoles, ...roles])) as Array<
          'admin' | 'editor' | 'user'
        >

        await payload.update({
          collection: 'users',
          id: existing.docs[0].id,
          data: {
            roles: mergedRoles,
            username,
            legacyUserId: userId,
          },
          overrideAccess: true,
        })

        console.log(`${progress} ✅ Aktualizován ${email}`)
        updated++
      } else {
        await payload.create({
          collection: 'users',
          data: {
            email,
            password: temporaryPassword,
            roles,
            username,
            legacyUserId: userId,
          },
          overrideAccess: true,
        })

        console.log(`${progress} ✅ Vytvořen ${email}`)
        created++
      }
    } catch (error) {
      console.error(`${progress} ❌ Chyba u ${email}:`, error)
      errors++
    }
  }

  await conn.end()

  console.log('\n══════════════════════════════════════════')
  console.log('📊 Výsledky migrace users:')
  console.log(`   Vytvořeno:            ${created}`)
  console.log(`   Aktualizováno:        ${updated}`)
  console.log(`   Přeskočeno (legacy id): ${skippedLegacyId}`)
  console.log(`   Přeskočeno (no email): ${skippedNoEmail}`)
  console.log(`   Přeskočeno (dry-run):  ${skippedDryRun}`)
  console.log(`   Chyby:                ${errors}`)
  console.log('══════════════════════════════════════════\n')

  process.exit(errors > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error('💥 Fatální chyba migrace users:', error)
  process.exit(1)
})
