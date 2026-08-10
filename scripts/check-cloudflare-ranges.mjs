// Hlídač driftu Cloudflare allowlistu v deploy/Caddyfile.
//
// Caddy na produkci pouští na origin jen oficiální rozsahy Cloudflare
// (matcher @mimoCloudflare). Rozsahy se mění vzácně, ale když Cloudflare
// nějaký přidá, návštěvníci z něj dostanou zavřené spojení — a bez téhle
// kontroly by se na to přišlo až od nich. Běží v CI: drift = červený build.
//
// Selhání SÍTĚ (cloudflare.com nedostupný) build neshazuje — jen varuje.
// Červená je vyhrazená pro skutečný nesoulad seznamů.

import { readFileSync } from 'node:fs'

const caddyfile = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8')
const matcherLine = caddyfile.split('\n').find((line) => line.includes('@mimoCloudflare'))
if (!matcherLine) {
  console.error('CHYBA: v deploy/Caddyfile chybí matcher @mimoCloudflare — allowlist zmizel?')
  process.exit(1)
}
// Z řádku matcheru jsou rozsahy všechny tokeny s lomítkem (CIDR zápis).
const configured = new Set(
  matcherLine
    .trim()
    .split(/\s+/)
    .filter((token) => token.includes('/')),
)

async function fetchList(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return (await res.text())
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

let current
try {
  current = [
    ...(await fetchList('https://www.cloudflare.com/ips-v4')),
    ...(await fetchList('https://www.cloudflare.com/ips-v6')),
  ]
} catch (err) {
  console.warn(
    'VAROVÁNÍ: seznam rozsahů Cloudflare se nepodařilo stáhnout, kontrola se přeskakuje:',
    err instanceof Error ? err.message : err,
  )
  process.exit(0)
}

const missing = current.filter((range) => !configured.has(range))
const extra = [...configured].filter((range) => !current.includes(range))

if (missing.length > 0 || extra.length > 0) {
  if (missing.length > 0) {
    console.error('CHYBA: v deploy/Caddyfile CHYBÍ aktuální rozsahy Cloudflare:', missing.join(' '))
    console.error('→ návštěvníci z nich dostanou zavřené spojení!')
  }
  if (extra.length > 0) {
    console.error(
      'CHYBA: deploy/Caddyfile má rozsahy, které už Cloudflare neuvádí:',
      extra.join(' '),
    )
  }
  console.error(
    'Postup: aktualizuj řádek @mimoCloudflare podle https://www.cloudflare.com/ips,',
    'nahraj Caddyfile na server a proveď force-recreate caddy (návod v komentáři souboru).',
  )
  process.exit(1)
}

console.log(`OK: Cloudflare allowlist v deploy/Caddyfile odpovídá (${current.length} rozsahů).`)
