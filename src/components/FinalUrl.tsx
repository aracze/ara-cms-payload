import React from 'react'

export const FinalUrl: React.FC<any> = ({ data }) => {
  const breadcrumbs = data?.breadcrumbs || []
  const url = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].url : '/'

  return (
    <div style={{ marginBottom: '20px' }}>
      <span
        style={{
          display: 'block',
          color: '#9A9A9A',
          fontSize: '11px',
          marginBottom: '5px',
          textTransform: 'uppercase',
        }}
      >
        Výsledná URL adresa
      </span>
      <code
        style={{
          background: '#333',
          padding: '4px 8px',
          borderRadius: '4px',
          color: '#fff',
          display: 'block',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
        }}
      >
        {url}
      </code>
    </div>
  )
}
