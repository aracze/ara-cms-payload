'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn, getPayloadURL } from '@/lib/utils'
import { isCloudinary } from '@/lib/cloudinary-loader'

/**
 * Sdílený avatar uživatele (komentáře, autor článku, přispěvatelé u míst).
 *
 * Má-li uživatel fotku → fotka. Jinak (nebo když se fotka nenačte) → značkový
 * fallback: bílá silueta papouška (Ara) na barevném kruhu; barva je deterministická
 * podle jména, takže je stejný autor pořád stejný a lidé jsou rozlišitelní.
 *
 * Kruh je jednotný: bílý 3px rámeček + jemný stín (legacy `0 3px 5px rgba(0,0,0,.3)`).
 */

const GRADIENTS = [
  'linear-gradient(135deg, #2f7d9a, #215491)',
  'linear-gradient(135deg, #8a6cc4, #b05a86)',
  'linear-gradient(135deg, #3a8f6f, #1f6d84)',
  'linear-gradient(135deg, #c98a3e, #b0553f)',
  'linear-gradient(135deg, #5a74c4, #4a4f9c)',
  'linear-gradient(135deg, #2f9aa0, #276f9a)',
]

function pickGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}

function resolveAvatarUrl(raw: string): string {
  if (raw.startsWith('/')) {
    try {
      return new URL(raw, getPayloadURL()).toString()
    } catch {
      return raw
    }
  }
  return raw
}

// Jednotný kruh: bílý rámeček + legacy stín.
const RING = 'rounded-full border-[3px] border-white shadow-[0_3px_5px_rgba(0,0,0,0.3)]'

export function UserAvatar({
  name,
  avatarUrl,
  size = 42,
  className,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
  /** Doladění vzhledu podle kontextu (např. tenčí rámeček `border-2` u mini avataru). */
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const src = avatarUrl ? resolveAvatarUrl(avatarUrl) : null

  if (!src || errored) {
    const parrot = Math.round(size * 0.6)
    return (
      <div
        className={cn('grid shrink-0 place-items-center overflow-hidden', RING, className)}
        style={{ width: size, height: size, background: pickGradient(name) }}
      >
        <Image src="/assets/avatar-parrot.png" alt="" width={parrot} height={parrot} unoptimized />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={cn('shrink-0 object-cover', RING, className)}
      style={{ width: size, height: size }}
      unoptimized={!isCloudinary(src)}
    />
  )
}
