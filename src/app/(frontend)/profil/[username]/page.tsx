import { UserProfile } from '@/components/layout/profile/user-profile'
import { getCurrentUser } from '@/lib/auth'
import { fetchUserProfile } from '@/lib/payload'
import type { UserProfileData } from '@/types/payload'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

// Stejný režim jako zbytek webu ([...slug]): streamované dynamické vykreslování,
// rychlost dat zajišťuje cache na úrovni fetchUserProfile (viz lib/payload.ts).
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ username: string }>
  searchParams: Promise<{ upravit?: string }>
}

/** Segment z URL může přijít procentově zakódovaný (mezera, diakritika). */
function decodeUsername(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Souhrn veřejného obsahu — profil ÚPLNĚ bez obsahu vracíme jako 404
 * (nechceme prázdné stránky pro každý registrovaný účet).
 *
 * VÝJIMKA: vlastníkovi se jeho profil ukáže vždycky. Bez toho by se nově
 * registrovaný člověk na svůj profil vůbec nedostal — a nemohl by si ho tedy
 * ani vyplnit.
 */
function hasPublicContent(profile: UserProfileData): boolean {
  return (
    profile.articles.length +
      profile.touristPoints.length +
      profile.places.length +
      profile.reviews.length +
      profile.comments.length >
    0
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  // React cache() dedupe — druhé volání v PageRoute už jen sáhne pro výsledek.
  const profile = await fetchUserProfile(decodeUsername(username))
  if (!profile) notFound()
  const me = await getCurrentUser()
  if (!hasPublicContent(profile) && me?.id !== profile.id) notFound()

  const displayName = profile.name || profile.username

  return {
    title: displayName,
    // Jako na starém webu: profily se vyhledávačům neukazují (tenký/duplicitní
    // obsah), ale odkazy z nich sledovat smí.
    robots: { index: false, follow: true },
  }
}

export default async function ProfileRoute({ params, searchParams }: Props) {
  const { username } = await params
  const profile = await fetchUserProfile(decodeUsername(username))
  if (!profile) notFound()

  // Vlastníka poznáváme podle ID z OVĚŘENÉ session, ne podle jména v adrese —
  // to by šlo napsat komukoliv. Režim úprav se tak cizímu profilu nezapne.
  const me = await getCurrentUser()
  const isOwner = me?.id === profile.id
  if (!hasPublicContent(profile) && !isOwner) notFound()
  const { upravit } = await searchParams

  return <UserProfile profile={profile} isOwner={isOwner} editing={isOwner && upravit === '1'} />
}
