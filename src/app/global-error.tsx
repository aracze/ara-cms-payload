'use client'

import { useEffect } from 'react'

// GLOBÁLNÍ error boundary — poslední záchyt. Aktivuje se, jen když selže i
// KOŘENOVÝ layout (např. výpadek při renderu <html>/<body> nebo v layoutu
// samotném). Nahrazuje celý dokument, proto renderuje vlastní <html>/<body>
// a používá INLINE styly — nespoléhá na to, že se stihne načíst globální CSS.
// Běžné chyby stránek/článků řeší (frontend)/error.tsx; sem se dostaneme jen
// při skutečně kritickém selhání. V dev režimu ji překryje Next error overlay,
// naostro se projeví až v produkčním buildu.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // `digest` umožní spárovat klientskou chybu se serverovým logem v produkci.
    console.error('[global] kritická chyba aplikace:', error)
  }, [error])

  return (
    <html lang="cs">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '5rem 1rem',
            textAlign: 'center',
            color: '#1a3f6c',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#215491',
            }}
          >
            Chyba
          </p>
          <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 700 }}>Něco se pokazilo</h1>
          <p style={{ margin: 0, maxWidth: '28rem', color: '#4b5563' }}>
            Web se teď nepodařilo načíst. Zkus to prosím za chvíli znovu.
          </p>
          <div
            style={{
              marginTop: '0.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={reset}
              style={{
                border: 'none',
                cursor: 'pointer',
                borderRadius: '9999px',
                background: '#215491',
                color: '#fff',
                fontWeight: 600,
                padding: '0.625rem 1.5rem',
              }}
            >
              Zkusit znovu
            </button>
            {/* Po kritické chybě chceme TVRDÝ reload (čistý stav aplikace) —
                klientská navigace přes <Link> by mohla znovu spadnout do téhož
                rozbitého stromu. Proto záměrně plain <a>. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: '9999px',
                border: '1px solid #215491',
                color: '#215491',
                fontWeight: 600,
                padding: '0.625rem 1.5rem',
                textDecoration: 'none',
              }}
            >
              Zpět na úvodní stránku
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
