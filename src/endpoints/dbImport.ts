import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'

const runPgRestoreDocker = async (
  composeCmd: string[],
  service: string,
  dbUrl: string,
  filePath: string,
) => {
  return await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(
      composeCmd[0],
      [
        ...composeCmd.slice(1),
        'exec',
        '-T',
        service,
        'pg_restore',
        '--dbname',
        dbUrl,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--single-transaction',
        '--exit-on-error',
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    )

    const input = createReadStream(filePath)
    input.pipe(child.stdin)

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

const runPgRestoreDockerExec = async (containerId: string, dbUrl: string, filePath: string) => {
  return await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        containerId,
        'pg_restore',
        '--dbname',
        dbUrl,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--single-transaction',
        '--exit-on-error',
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    )

    const input = createReadStream(filePath)
    input.pipe(child.stdin)

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

const runPgRestoreDockerAuto = async (service: string, dbUrl: string, filePath: string) => {
  const candidates: string[][] = [
    ['docker', 'compose'],
    ['docker-compose'],
  ]

  let lastError: Error | null = null
  let lastStderr = ''

  for (const candidate of candidates) {
    try {
      const { code, stderr } = await runPgRestoreDocker(candidate, service, dbUrl, filePath)
      if (code === 0) return { code, stderr }
      lastStderr = stderr
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  if (lastError) throw lastError
  return { code: 1, stderr: lastStderr || 'unknown error' }
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

      const url = new URL(databaseUrl)
      url.hostname = dockerHost
      url.port = url.port || '5432'

      let result = await runPgRestoreDockerAuto(dockerService, url.toString(), filePath)
      if (result.code !== 0) {
        const containerId =
          dockerContainer || (await findContainerId(dockerService)) || undefined
        if (containerId) {
          result = await runPgRestoreDockerExec(containerId, url.toString(), filePath)
        }
      }

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
