import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { spawn } from 'node:child_process'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'

type RunResult = { code: number; stderr: string }

/** Spustí `pg_restore` s danými argumenty; dump jde vždy na stdin. */
type PgRestoreRunner = (pgArgs: string[]) => Promise<RunResult>

const RESTORE_FLAGS = [
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-acl',
  '--single-transaction',
  '--exit-on-error',
]

const spawnWithDump = async (
  command: string,
  args: string[],
  filePath: string,
): Promise<RunResult> => {
  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] })

    const input = createReadStream(filePath)
    input.pipe(child.stdin)
    // Když proces skončí dřív, než dočteme dump (např. `docker compose exec`
    // kontejner nenajde), přijde na stdin EPIPE. Bez posluchače by to byla
    // neodchycená výjimka; výsledek stejně poznáme z návratového kódu a stderr.
    child.stdin.on('error', () => {})

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    input.on('error', reject)
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr })
    })
  })
}

/** Produkce: `pg_restore` je nainstalovaný přímo v kontejneru aplikace. */
const directRunner =
  (filePath: string): PgRestoreRunner =>
  (pgArgs) =>
    spawnWithDump('pg_restore', pgArgs, filePath)

/** Dev: `pg_restore` uvnitř Postgres kontejneru nalezeného podle compose štítku. */
const dockerExecRunner =
  (containerId: string, filePath: string): PgRestoreRunner =>
  (pgArgs) =>
    spawnWithDump('docker', ['exec', '-i', containerId, 'pg_restore', ...pgArgs], filePath)

/** Dev záloha: `docker compose exec` / `docker-compose exec`, když štítek nesedí. */
const composeRunner =
  (service: string, filePath: string): PgRestoreRunner =>
  async (pgArgs) => {
    const candidates: string[][] = [['docker', 'compose'], ['docker-compose']]

    let lastError: Error | null = null
    let lastStderr = ''

    for (const candidate of candidates) {
      try {
        const result = await spawnWithDump(
          candidate[0],
          [...candidate.slice(1), 'exec', '-T', service, 'pg_restore', ...pgArgs],
          filePath,
        )
        if (result.code === 0) return result
        lastStderr = result.stderr
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    if (lastError) throw lastError
    return { code: 1, stderr: lastStderr || 'unknown error' }
  }

const findContainerId = async (service: string) => {
  return await new Promise<string | null>((resolve, reject) => {
    const child = spawn(
      'docker',
      ['ps', '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || 'docker ps failed'))
        return
      }
      const id = stdout.trim().split('\n')[0]
      resolve(id || null)
    })
  })
}

/**
 * Smaže všechna ne-systémová schémata (CASCADE) a znovu založí prázdné `public`.
 * Import je destruktivní už z definice (README: „overwrites all existing data“),
 * takže tím o nic navíc nepřicházíme — jen se restore stane deterministický.
 *
 * Běží jako jeden vícepříkazový dotaz, tedy v jedné implicitní transakci: když
 * DROP některého schématu selže (např. cizí vlastník), nic se nesmaže a import
 * skončí chybou ještě před spuštěním `pg_restore`.
 */
const wipeUserSchemas = async (db: PostgresAdapter) => {
  if (!db.drizzle) {
    throw new APIError(
      'Database adapter has no drizzle instance; cannot wipe schemas before restore.',
      500,
    )
  }

  await db.drizzle.execute(sql`
    DO $$
    DECLARE
      schema_name text;
    BEGIN
      FOR schema_name IN
        SELECT nspname FROM pg_namespace
        WHERE left(nspname, 3) <> 'pg_' AND nspname <> 'information_schema'
      LOOP
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', schema_name);
      END LOOP;
    END
    $$;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `)
}

export const dbImportEndpoint: Endpoint = {
  path: '/db-import',
  method: 'post',
  handler: async (req) => {
    const roles = Array.isArray(req.user?.roles) ? req.user?.roles : []
    if (!req.user || !roles.includes('admin')) {
      throw new APIError('Forbidden', 403)
    }

    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new APIError('DATABASE_URL is not set', 500)
    }

    if (!req.formData) {
      throw new APIError('Multipart form data is not available on this server.', 500)
    }

    const formData = await req.formData()
    const file = formData.get('dump')
    if (!file || typeof file === 'string' || !(file instanceof File)) {
      throw new APIError('Missing dump file', 400)
    }

    if (!file.size) {
      throw new APIError('Dump file is empty', 400)
    }

    const dockerService = process.env.PG_DUMP_DOCKER_SERVICE || 'postgres'
    const dockerHost = process.env.PG_DUMP_DOCKER_HOST || 'localhost'
    const dockerContainer = process.env.PG_DUMP_DOCKER_CONTAINER || ''

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'db-import-'))
    const filePath = path.join(tmpDir, 'upload.dump')

    try {
      const stream = Readable.fromWeb(file.stream() as NodeReadableStream)
      await pipeline(stream, createWriteStream(filePath))

      const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER

      let runner: PgRestoreRunner
      let targetUrl: string

      if (isProduction) {
        // Direct pg_restore in production
        runner = directRunner(filePath)
        targetUrl = databaseUrl
      } else {
        // Local Docker logic. Kontejner hledáme PŘEDNOSTNĚ podle compose štítku
        // (`com.docker.compose.service`) a spouštíme přímo přes `docker exec -i`.
        // To funguje bez ohledu na název compose projektu — po přejmenování repa
        // běží kontejner pod starým projektem, takže `docker compose exec` ho
        // v nové složce „nevidí". `docker compose exec` zůstává jen jako záloha,
        // když se kontejner podle štítku nenajde.
        // Uvnitř kontejneru je DB dostupná na `localhost` (PG_DUMP_DOCKER_HOST),
        // ne na hostiteli z DATABASE_URL — jde ale o tu samou databázi, se kterou
        // je spojený Payload (kontejner ji hostuje).
        const url = new URL(databaseUrl)
        url.hostname = dockerHost
        url.port = url.port || '5432'
        targetUrl = url.toString()

        const containerId =
          dockerContainer || (await findContainerId(dockerService).catch(() => null))
        runner = containerId
          ? dockerExecRunner(containerId, filePath)
          : composeRunner(dockerService, filePath)
      }

      // 1) Předběžná kontrola JEŠTĚ PŘED mazáním: `pg_restore --list` selže,
      //    když soubor není pg_dump archiv (custom format) nebo když pg_restore /
      //    Docker nejsou dostupné. Tyhle chyby tak neskončí prázdnou databází.
      const check = await runner(['--list'])
      if (check.code !== 0) {
        throw new APIError(
          `Dump file could not be read by pg_restore (expected a pg_dump custom-format archive): ${
            check.stderr || 'unknown error'
          }`,
          400,
        )
      }

      // 2) Před obnovou zahodíme VŠECHNA uživatelská schémata (public, zaloha, …), ne jen
      //    `public`. `pg_restore --clean` maže pouze objekty obsažené v dumpu; když v cílové
      //    DB leží ve stejném schématu tabulky navíc (lokální zálohy, rozpracované větve),
      //    `DROP SCHEMA` selže na závislostech a celý import se v transakci vrátí zpět.
      await wipeUserSchemas(req.payload.db as unknown as PostgresAdapter)

      // 3) Samotný restore — v jedné transakci, při chybě se jeho změny vrátí zpět
      //    (schémata jsou ale už smazaná; proto krok 1).
      const result = await runner(['--dbname', targetUrl, ...RESTORE_FLAGS])
      if (result.code !== 0) {
        throw new APIError(`pg_restore failed: ${result.stderr || 'unknown error'}`, 500)
      }

      return Response.json({ ok: true })
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        throw new APIError(
          'docker-compose not found. Install docker-compose in the Payload container and mount /var/run/docker.sock.',
          500,
        )
      }
      throw err
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  },
}
