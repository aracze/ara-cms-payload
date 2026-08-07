/** Malý štítek s počtem zobrazení z GA4 — vidí jen přihlášený admin. */
export function AnalyticsDebugBadge({ views }: { views: number }) {
  return (
    <span
      title="Zobrazení za posledních 12 měsíců (GA4) — vidí jen admin"
      className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-mono text-white"
    >
      👁 {views}
    </span>
  )
}
