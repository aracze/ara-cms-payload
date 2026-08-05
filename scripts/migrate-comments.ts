/**
 * Migrační skript: MySQL (comment + comment_details + comment_link) -> Payload `comments`
 *
 * - comment_link.type = 'article'  -> type 'comment' (komentáře na článcích)
 * - comment_link.type = 'page'     -> type 'review'  (recenze na místech, s hvězdičkami)
 * - comment_link.type = 'DELETED_COMMENT' -> přeskočit (smazané)
 *
 * Autor: primárně jméno (username) + volitelně email; napojení na `users` jen když
 * legacy user_id odpovídá již migrovanému uživateli (přes legacyUserId).
 * Cíl (relatedTo): mapuje comment_ref na nový dokument přes legacyArticleId / legacyPageId,
 * s fallbackem přes commentable_url (slug / fullSlug).
 *
 * Spuštění:
 *   pnpm migrate:comments -- --dry-run
 *   pnpm migrate:comments
 *   pnpm migrate:comments -- --limit=50
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

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

type CommentRow = mysql.RowDataPacket & {
  comment_id: number
  body: string | null
  date_created: Date | string | null
  rating: number | null
  user_id: number | null
  username: string | null
  email: string | null
  commentable_url: string | null
  commentable_title: string | null
  comment_ref: number
  target_type: 'article' | 'page'
}

const normalizeSlug = (url: string): string =>
  url
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')

const lastSegment = (url: string): string => {
  const parts = normalizeSlug(url).split('/')
  return parts[parts.length - 1] || ''
}

// Legacy HTML tělo (recenze mají <p>…</p>, &nbsp; apod.) -> čistý text se zachovanými řádky.
function htmlToPlainText(input: string): string {
  return input
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type Payload = Awaited<ReturnType<typeof getPayload>>

// Načte všechny dokumenty kolekce (stránkovaně) a sestaví mapy pro rychlé mapování.
async function fetchAll(
  payload: Payload,
  collection: 'articles' | 'pages' | 'users',
  select: Record<string, true>,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection,
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
      pagination: true,
      // Jen pole potřebná pro mapy (id se vrací vždy); ušetří paměť i přenos.
      select,
    })
    out.push(...(res.docs as Record<string, unknown>[]))
    if (!res.hasNextPage) break
    page += 1
  }
  return out
}

async function run() {
  console.log(`\n🚀 Migrace comments spuštěna${isDryRun ? ' (DRY RUN)' : ''}`)
  if (limit) console.log(`   Limit: ${limit}`)

  const conn = await mysql.createConnection(OLD_DB_CONFIG)
  console.log(`✅ Připojeno k MySQL: ${OLD_DB_CONFIG.database}@${OLD_DB_CONFIG.host}`)

  const payload = await getPayload({ config: configPromise })
  console.log('✅ Payload inicializován')

  // --- Sestavení mapovacích tabulek ---
  const articles = await fetchAll(payload, 'articles', {
    legacyArticleId: true,
    slug: true,
  })
  const pages = await fetchAll(payload, 'pages', {
    legacyPageId: true,
    fullSlug: true,
  })
  const users = await fetchAll(payload, 'users', { legacyUserId: true })

  const articlesByLegacyId = new Map<number, number>()
  const articlesBySlug = new Map<string, number>()
  for (const a of articles) {
    if (typeof a.legacyArticleId === 'number')
      articlesByLegacyId.set(a.legacyArticleId, a.id as number)
    if (typeof a.slug === 'string' && !articlesBySlug.has(a.slug))
      articlesBySlug.set(a.slug, a.id as number)
  }

  const pagesByLegacyId = new Map<number, number>()
  const pagesByFullSlug = new Map<string, number>()
  for (const p of pages) {
    if (typeof p.legacyPageId === 'number') pagesByLegacyId.set(p.legacyPageId, p.id as number)
    if (typeof p.fullSlug === 'string')
      pagesByFullSlug.set(normalizeSlug(p.fullSlug), p.id as number)
  }

  const usersByLegacyId = new Map<number, number>()
  for (const u of users) {
    if (typeof u.legacyUserId === 'number') usersByLegacyId.set(u.legacyUserId, u.id as number)
  }

  console.log(
    `📚 Mapy: articles=${articlesByLegacyId.size} (leg.id), pages=${pagesByLegacyId.size} (leg.id), users=${usersByLegacyId.size}`,
  )

  // --- Načtení komentářů/recenzí z MySQL ---
  const limitClause = limit && Number.isFinite(limit) ? `LIMIT ${limit}` : ''
  const [rows] = await conn.query<CommentRow[]>(`
    SELECT c.id AS comment_id, c.body, c.date_created,
           cd.rating, cd.user_id, cd.username, cd.email,
           cd.commentable_url, cd.commentable_title,
           cl.comment_ref, cl.type AS target_type
    FROM comment c
    JOIN comment_details cd ON cd.id = c.poster_id
    JOIN comment_link cl ON cl.comment_id = c.id
    WHERE cl.type IN ('article', 'page')
    ORDER BY c.id
    ${limitClause}
  `)
  console.log(`📦 Nalezeno ${rows.length} komentářů/recenzí (bez smazaných)\n`)

  let created = 0
  let updated = 0
  let skippedNoBody = 0
  let skippedNoTarget = 0
  let skippedBadRating = 0
  let skippedDryRun = 0
  let errors = 0
  let linkedByLegacyId = 0
  let linkedByUrl = 0
  let authorLinked = 0
  const unresolved: string[] = []

  for (const [index, row] of rows.entries()) {
    const progress = `[${index + 1}/${rows.length}]`
    const type = row.target_type === 'article' ? 'comment' : 'review'

    const body = htmlToPlainText(String(row.body ?? ''))
    if (!body) {
      skippedNoBody++
      continue
    }

    // --- Cíl (relatedTo) ---
    let relatedTo:
      { relationTo: 'articles'; value: number } | { relationTo: 'pages'; value: number } | null =
      null

    if (row.target_type === 'article') {
      let id = articlesByLegacyId.get(row.comment_ref)
      if (id != null) linkedByLegacyId++
      if (id == null && row.commentable_url) {
        id = articlesBySlug.get(lastSegment(row.commentable_url))
        if (id != null) linkedByUrl++
      }
      if (id != null) relatedTo = { relationTo: 'articles', value: id }
    } else {
      let id = pagesByLegacyId.get(row.comment_ref)
      if (id != null) linkedByLegacyId++
      if (id == null && row.commentable_url) {
        id = pagesByFullSlug.get(normalizeSlug(row.commentable_url))
        if (id != null) linkedByUrl++
      }
      if (id != null) relatedTo = { relationTo: 'pages', value: id }
    }

    if (!relatedTo) {
      skippedNoTarget++
      unresolved.push(
        `#${row.comment_id} [${type}] ref=${row.comment_ref} url=${row.commentable_url ?? '?'}`,
      )
      continue
    }

    // --- Autor ---
    // Pozn.: legacy e-mail (comment_details.email) mají jen registrovaní; anonymní host
    // e-mail zadat nemohl. E-mail proto na komentář nepřenášíme — žije na účtu uživatele.
    const authorName = (row.username ?? '').trim() || 'Anonym'
    const authorUserId = row.user_id != null ? usersByLegacyId.get(row.user_id) : undefined
    if (authorUserId != null) authorLinked++

    const rating = type === 'review' && row.rating != null ? row.rating : undefined
    // Kolekce vyžaduje u recenze hodnocení 1–5. Řádek s chybějícím/mimo rozsah ratingem
    // přeskočíme, ať se do kolekce nedostane undefined/0/mimo rozsah.
    if (type === 'review' && (rating == null || rating < 1 || rating > 5)) {
      skippedBadRating++
      continue
    }
    const createdAt = row.date_created ? new Date(row.date_created).toISOString() : undefined

    const data = {
      type: type as 'comment' | 'review',
      rating,
      body,
      relatedTo,
      authorName,
      author: authorUserId ?? null,
      status: 'published' as const,
      createdAt,
      legacyCommentId: row.comment_id,
    }

    // --- Upsert podle legacyCommentId (idempotentní) ---
    const existing = await payload.find({
      collection: 'comments',
      where: { legacyCommentId: { equals: row.comment_id } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })

    if (isDryRun) {
      const action = existing.totalDocs > 0 ? 'UPDATE' : 'CREATE'
      const star = rating ? ` ${rating}★` : ''
      console.log(
        `${progress} 📋 DRY [${action}] ${type}${star} → ${relatedTo.relationTo}#${relatedTo.value} by ${authorName}`,
      )
      skippedDryRun++
      continue
    }

    try {
      if (existing.totalDocs > 0) {
        await payload.update({
          collection: 'comments',
          id: existing.docs[0].id,
          data,
          overrideAccess: true,
        })
        updated++
      } else {
        await payload.create({ collection: 'comments', data, overrideAccess: true })
        created++
      }
    } catch (error) {
      console.error(`${progress} ❌ Chyba u comment #${row.comment_id}:`, error)
      errors++
    }
  }

  await conn.end()

  console.log('\n══════════════════════════════════════════')
  console.log('📊 Výsledky migrace comments:')
  console.log(`   Vytvořeno:              ${created}`)
  console.log(`   Aktualizováno:          ${updated}`)
  console.log(`   Napojeno cíl přes leg.id: ${linkedByLegacyId}`)
  console.log(`   Napojeno cíl přes URL:  ${linkedByUrl}`)
  console.log(`   Napojen registr. autor: ${authorLinked}`)
  console.log(`   Přeskočeno (prázdné):   ${skippedNoBody}`)
  console.log(`   Přeskočeno (bez cíle):  ${skippedNoTarget}`)
  console.log(`   Přeskočeno (rating):    ${skippedBadRating}`)
  console.log(`   Přeskočeno (dry-run):   ${skippedDryRun}`)
  console.log(`   Chyby:                  ${errors}`)
  console.log('══════════════════════════════════════════')
  if (unresolved.length > 0) {
    console.log(`\n⚠️  Nenapojené cíle (${unresolved.length}):`)
    unresolved.slice(0, 50).forEach((u) => console.log(`   ${u}`))
    if (unresolved.length > 50) console.log(`   … a dalších ${unresolved.length - 50}`)
  }
  console.log()

  process.exit(errors > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error('💥 Fatální chyba migrace comments:', error)
  process.exit(1)
})
