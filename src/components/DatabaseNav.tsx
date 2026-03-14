'use client'
import React, { useState } from 'react'
import { useAuth, useConfig } from '@payloadcms/ui'
import Link from 'next/link'

export function DatabaseNav() {
  const { user } = useAuth()
  const { config } = useConfig()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roles = Array.isArray(user?.roles) ? user.roles : []
  const isAdmin = roles.includes('admin')

  if (!isAdmin) return null

  const adminBase = (config.routes?.admin || '/admin').replace(/\/$/, '')
  const apiBase = (config.routes?.api || '/api').replace(/\/$/, '')

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
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
    <div className="nav-group">
      <div
        className="nav-group__label"
        style={{
          color: 'var(--theme-elevation-400)',
          marginBottom: '0.5rem',
          textTransform: 'capitalize',
        }}
      >
        Database
      </div>
      <div className="nav-group__content">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <a
            href="#"
            onClick={handleDownload}
            className="nav__link"
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            <span className="nav__link-label">
              {isLoading ? 'Generating dump...' : 'Download DB Dump'}
            </span>
          </a>
          <Link
            href={`${adminBase}/db-import`}
            className="nav__link"
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            <span className="nav__link-label">Import DB Dump</span>
          </Link>
          {error && (
            <div
              style={{ padding: '0 15px', color: 'var(--theme-error-500)', fontSize: '0.75rem' }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
