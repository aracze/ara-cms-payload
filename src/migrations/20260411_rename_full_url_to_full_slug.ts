import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Check if the old column still exists before renaming (idempotent)
  const result = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'pages'
      AND column_name = 'full_url'
      AND table_schema = 'public'
  `)

  if (result.rows.length > 0) {
    await db.execute(sql`
      ALTER TABLE "pages" RENAME COLUMN "full_url" TO "full_slug";
    `)

    // Recreate any index that was on full_url
    await db.execute(sql`
      DROP INDEX IF EXISTS "pages_full_url_idx";
      CREATE INDEX IF NOT EXISTS "pages_full_slug_idx" ON "pages" USING btree ("full_slug");
    `)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Check if full_slug exists before renaming back
  const result = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'pages'
      AND column_name = 'full_slug'
      AND table_schema = 'public'
  `)

  if (result.rows.length > 0) {
    await db.execute(sql`
      ALTER TABLE "pages" RENAME COLUMN "full_slug" TO "full_url";
    `)

    await db.execute(sql`
      DROP INDEX IF EXISTS "pages_full_slug_idx";
      CREATE INDEX IF NOT EXISTS "pages_full_url_idx" ON "pages" USING btree ("full_url");
    `)
  }
}
