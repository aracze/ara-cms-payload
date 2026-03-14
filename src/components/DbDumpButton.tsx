'use client'

import { Button, useAuth, useConfig } from '@payloadcms/ui'
import { useState } from 'react'

export function DbDumpButton() {
  const { user } = useAuth()
  const { config } = useConfig()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roles = Array.isArray(user?.roles) ? user.roles : []
  const isAdmin = roles.includes('admin')

  if (!isAdmin) return null

  const apiBase = config.routes?.api || '/api'

  const handleClick = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch(`${apiBase}/db-dump`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const message = await res.text()
        throw new Error(message || 'Failed to generate dump')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/i)
      const filename = match?.[1] || 'db-dump.dump'

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <Button buttonStyle="secondary" size="small" onClick={handleClick} disabled={isLoading}>
        {isLoading ? 'Generating dump...' : 'Download DB Dump'}
      </Button>
      {error ? <p style={{ marginTop: 6, color: 'var(--theme-error-500)' }}>{error}</p> : null}
    </div>
  )
}
