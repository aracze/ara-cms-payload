import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createWriteStream } from 'node:fs'

const runPgDumpDocker = async (
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
        'pg_dump',
        '--dbname',
        dbUrl,
        '--format=c',
        '--no-owner',
        '--no-acl',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const out = createWriteStream(filePath)
    child.stdout.pipe(out)

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      out.close()
      resolve({ code: code ?? 1, stderr })
    })
  })
}

const runPgDumpDockerExec = async (containerId: string, dbUrl: string, filePath: string) => {
  return await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        containerId,
        'pg_dump',
        '--dbname',
        dbUrl,
        '--format=c',
        '--no-owner',
        '--no-acl',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const out = createWriteStream(filePath)
    child.stdout.pipe(out)

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      out.close()
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

const runPgDumpDockerAuto = async (service: string, dbUrl: string, filePath: string) => {
  const candidates: string[][] = [['docker', 'compose'], ['docker-compose']]

  let lastError: Error | null = null
  let lastStderr = ''

  for (const candidate of candidates) {
    try {
      const { code, stderr } = await runPgDumpDocker(candidate, service, dbUrl, filePath)
      if (code === 0) return { code, stderr }
      lastStderr = stderr
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  if (lastError) throw lastError
  return { code: 1, stderr: lastStderr || 'unknown error' }
}

export const dbDumpEndpoint: Endpoint = {
  path: '/db-dump',
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

    const dockerService = process.env.PG_DUMP_DOCKER_SERVICE || 'postgres'
    const dockerHost = process.env.PG_DUMP_DOCKER_HOST || 'localhost'
    const dockerContainer = process.env.PG_DUMP_DOCKER_CONTAINER || ''

    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-')
    const filename = `db-dump-${timestamp}.dump`

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'db-dump-'))
    const filePath = path.join(tmpDir, filename)

    try {
      const url = new URL(databaseUrl)
      url.hostname = dockerHost
      url.port = url.port || '5432'

      let result = await runPgDumpDockerAuto(dockerService, url.toString(), filePath)
      if (result.code !== 0) {
        const containerId = dockerContainer || (await findContainerId(dockerService)) || undefined
        if (containerId) {
          result = await runPgDumpDockerExec(containerId, url.toString(), filePath)
        }
      }

      if (result.code !== 0) {
        throw new APIError(`pg_dump failed: ${result.stderr || 'unknown error'}`, 500)
      }

      const file = await fs.readFile(filePath)
      return new Response(file, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
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
