import { sql } from '@payloadcms/db-postgres'
import type { PayloadHandler } from 'payload'

export const initDbEndpoint: PayloadHandler = async (req) => {
  const { payload } = req

  // Simple security check using your existing secret
  const url = new URL(req.url || '', 'http://localhost')
  if (url.searchParams.get('secret') !== process.env.PAYLOAD_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    payload.logger.info('--- MANUAL DB INITIALIZATION STARTING ---')

    // We use the underlying db adapter to run the SQL
    const db = payload.db as any

    // Wipe and rebuild the public schema
    await db.drizzle.execute(sql`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;

      CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor', 'user');
      CREATE TYPE "public"."enum_pages_category" AS ENUM('Místo k navštívení', 'Turistický cíl', 'Místa', 'Praktické informace', 'Vstupní podmínky', 'Cesta', 'Počasí', 'Doprava', 'Měna a ceny', 'Zdraví a bezpečí', 'Jazyk a kultura', 'Jídlo a pití', 'Ubytování', 'Články');
      CREATE TYPE "public"."enum_articles_category" AS ENUM('Článek', 'Průvodce', 'RadyNaCestu');
      
      CREATE TABLE "users" (
          "id" serial PRIMARY KEY NOT NULL,
          "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "email" varchar NOT NULL,
          "reset_password_token" varchar,
          "reset_password_expiration" timestamp(3) with time zone,
          "salt" varchar,
          "hash" varchar,
          "login_attempts" numeric DEFAULT 0,
          "lock_until" timestamp(3) with time zone
      );

      CREATE TABLE "users_roles" (
          "order" integer NOT NULL,
          "parent_id" integer NOT NULL,
          "value" "enum_users_roles",
          "id" serial PRIMARY KEY NOT NULL
      );

      CREATE TABLE "users_sessions" (
          "_order" integer NOT NULL,
          "_parent_id" integer NOT NULL,
          "id" varchar PRIMARY KEY NOT NULL,
          "created_at" timestamp(3) with time zone,
          "expires_at" timestamp(3) with time zone NOT NULL
      );

      CREATE TABLE "media" (
          "id" serial PRIMARY KEY NOT NULL,
          "alt" varchar,
          "cloudinary_public_id" varchar,
          "cloudinary_url" varchar,
          "cloudinary_resource_type" varchar,
          "cloudinary_format" varchar,
          "cloudinary_version" numeric,
          "original_url" varchar,
          "transformed_url" varchar,
          "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "url" varchar,
          "thumbnail_u_r_l" varchar,
          "filename" varchar,
          "mime_type" varchar,
          "filesize" numeric,
          "width" numeric,
          "height" numeric,
          "focal_x" numeric,
          "focal_y" numeric
      );

      CREATE TABLE "pages" (
          "id" serial PRIMARY KEY NOT NULL,
          "title" varchar NOT NULL,
          "slug" varchar,
          "category" "enum_pages_category" DEFAULT 'Místo k navštívení' NOT NULL,
          "parent_id" integer,
          "full_slug" varchar,
          "include_in_child_url_paths" boolean DEFAULT true,
          "text" jsonb,
          "featured_image_image_id" integer,
          "featured_image_feature_image_style_css" varchar,
          "featured_image_cloudinary_setting" varchar,
          "featured_image_is_creative_commons" boolean DEFAULT false,
          "featured_image_author" varchar,
          "featured_image_description" varchar,
          "featured_image_source" varchar,
          "featured_image_source_link" varchar,
          "featured_image_creative_commons_license" varchar,
          "featured_image_svg_code" varchar,
          "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "articles" (
          "id" serial PRIMARY KEY NOT NULL,
          "title" varchar NOT NULL,
          "slug" varchar,
          "category" "enum_articles_category",
          "main_page_id" integer,
          "text" jsonb,
          "featured_image_image_id" integer,
          "featured_image_feature_image_style_css" varchar,
          "featured_image_cloudinary_setting" varchar,
          "featured_image_is_creative_commons" boolean DEFAULT false,
          "featured_image_author" varchar,
          "featured_image_description" varchar,
          "featured_image_source" varchar,
          "featured_image_source_link" varchar,
          "featured_image_creative_commons_license" varchar,
          "featured_image_svg_code" varchar,
          "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "payload_migrations" (
          "id" serial PRIMARY KEY NOT NULL,
          "name" varchar,
          "batch" numeric,
          "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "payload_locked_documents" (
          "id" serial PRIMARY KEY NOT NULL,
          "document_id" varchar NOT NULL,
          "document_slug" varchar NOT NULL,
          "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "payload_locked_documents_rels" (
          "id" serial PRIMARY KEY NOT NULL,
          "order" integer,
          "parent_id" integer NOT NULL,
          "path" varchar NOT NULL,
          "users_id" integer,
          "media_id" integer,
          "pages_id" integer,
          "articles_id" integer
      );

      CREATE TABLE "payload_preferences" (
          "id" serial PRIMARY KEY NOT NULL,
          "key" varchar,
          "value" jsonb,
          "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
          "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE "payload_preferences_rels" (
          "id" serial PRIMARY KEY NOT NULL,
          "order" integer,
          "parent_id" integer NOT NULL,
          "path" varchar NOT NULL,
          "users_id" integer
      );

      ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      ALTER TABLE "pages" ADD CONSTRAINT "pages_featured_image_image_id_media_id_fk" FOREIGN KEY ("featured_image_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
      ALTER TABLE "articles" ADD CONSTRAINT "articles_featured_image_image_id_media_id_fk" FOREIGN KEY ("featured_image_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
      ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

      CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
      CREATE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
      CREATE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
      CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
      CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
      CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
      CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
      CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
    `)

    return Response.json({ message: 'Database initialized successfully' })
  } catch (_error: any) {
    payload.logger.error('Database initialization failed: ' + _error.message)
    // Return the actual error message so we can debug
    return Response.json(
      {
        error: _error.message,
        stack: _error.stack,
        detail: _error.detail || 'No extra detail',
      },
      { status: 500 },
    )
  }
}
