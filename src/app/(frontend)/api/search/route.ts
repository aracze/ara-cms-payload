import { NextRequest, NextResponse } from 'next/server'
import { searchPages } from '@/lib/search'

const EXCERPT_LENGTH = 150

// Úryvek končí na hranici slova s výpustkou — useknutí vprostřed slova
// („…pod žhnoucím s") působí rozbitě. Zbytky markdownu čistíme už tady,
// ať klient dostane text připravený k vykreslení.
function toExcerpt(text?: string): string | undefined {
  if (!text) return undefined
  const cleaned = text.replace(/[#*]/g, '').trim()
  if (cleaned.length <= EXCERPT_LENGTH) return cleaned
  const cut = cleaned.slice(0, EXCERPT_LENGTH + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : EXCERPT_LENGTH).trimEnd()}…`
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)

  try {
    const results = await searchPages(searchParams.get('q') || '')

    return NextResponse.json({
      success: true,
      // Klientovi jde jen to, co se vykreslí — celé texty (až 2000 znaků
      // × stovky výsledků) dělaly z odpovědi megabajty na každé písmeno.
      message: results.map(({ item, refIndex }) => ({
        refIndex,
        item: { ...item, text: toExcerpt(item.text) },
      })),
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { success: false, error: 'Search is temporarily unavailable' },
      { status: 500 },
    )
  }
}
