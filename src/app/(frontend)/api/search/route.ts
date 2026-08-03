import { NextRequest, NextResponse } from 'next/server'
import { searchPages } from '@/lib/search'

// ResultList zobrazuje ~100 znaků úryvku; 150 dává rezervu na ořez markdownu.
const EXCERPT_LENGTH = 150

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
        item: { ...item, text: item.text?.slice(0, EXCERPT_LENGTH) },
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
