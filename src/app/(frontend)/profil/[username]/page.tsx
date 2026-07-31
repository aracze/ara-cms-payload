import { UserProfile } from '@/components/layout/profile/user-profile'
import { fetchUserProfile } from '@/lib/payload'
import type { UserProfileData } from '@/types/payload'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

// Stejný režim jako zbytek webu ([...slug]): streamované dynamické vykreslování,
// rychlost dat zajišťuje cache na úrovni fetchUserProfile (viz lib/payload.ts).
export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ username: string }>
}

/** Segment z URL může přijít procentově zakódovaný (mezera, diakritika). */
function decodeUsername(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** Souhrn veřejného obsahu — profil ÚPLNĚ bez obsahu vracíme jako 404
 *  (nechceme indexovatelné prázdné stránky pro každý registrovaný účet). */
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
  if (!profile || !hasPublicContent(profile)) notFound()

  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.username

  return {
    title: displayName,
    // Jako na starém webu: profily se vyhledávačům neukazují (tenký/duplicitní
    // obsah), ale odkazy z nich sledovat smí.
    robots: { index: false, follow: true },
  }
}

export default async function ProfileRoute({ params }: Props) {
  const { username } = await params
  const profile = await fetchUserProfile(decodeUsername(username))
  if (!profile || !hasPublicContent(profile)) notFound()

  return <UserProfile profile={profile} />
}
