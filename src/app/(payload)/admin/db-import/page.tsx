'use client'

import { Button, useAuth, useConfig } from '@payloadcms/ui'
import { useMemo, useState, type FormEvent } from 'react'

const DbImportPage = () => {
  const { user } = useAuth()
  const { config } = useConfig()
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const roles = Array.isArray(user?.roles) ? user.roles : []
  const isAdmin = roles.includes('admin')

  const apiBase = useMemo(() => config.routes?.api || '/api', [config.routes?.api])
  const adminBase = useMemo(() => config.routes?.admin || '/admin', [config.routes?.admin])
  const backUrl = useMemo(() => adminBase.replace(/\/$/, ''), [adminBase])

  if (!isAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ marginBottom: 12 }}>Database Import</h1>
        <p>You do not have access to this page.</p>
        <Button
          buttonStyle="secondary"
          size="small"
          onClick={() => window.location.assign(backUrl)}
        >
          Back to Admin
        </Button>
      </div>
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!file) {
      setError('Select a dump file to import.')
      return
    }

    if (!confirm) {
      setError('You must confirm that the import will overwrite the database.')
      return
    }

    setIsLoading(true)
    try {
      const formData = new FormData()
      formData.append('dump', file)

      const res = await fetch(`${apiBase}/db-import`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!res.ok) {
        const message = await res.text()
        throw new Error(message || 'Import failed')
      }

      setSuccess('Import completed. The database has been overwritten.')
      setFile(null)
      setConfirm(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h1 style={{ marginBottom: 12 }}>Database Import</h1>
      <p style={{ marginBottom: 12 }}>
        Upload a PostgreSQL dump created with <code>pg_dump</code> (custom format). This operation
        overwrites all existing data.
      </p>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="file"
            accept=".dump,.backup"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
            />
            I understand this will delete and replace all existing data.
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button type="submit" buttonStyle="primary" size="small" disabled={isLoading}>
              {isLoading ? 'Importing...' : 'Import Dump'}
            </Button>
            <Button
              type="button"
              buttonStyle="secondary"
              size="small"
              onClick={() => window.location.assign(backUrl)}
            >
              Back to Admin
            </Button>
          </div>
        </div>
      </form>
      {error ? <p style={{ marginTop: 12, color: 'var(--theme-error-500)' }}>{error}</p> : null}
      {success ? (
        <p style={{ marginTop: 12, color: 'var(--theme-success-500)' }}>{success}</p>
      ) : null}
    </div>
  )
}

export default DbImportPage
