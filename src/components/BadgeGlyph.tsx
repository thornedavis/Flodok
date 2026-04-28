// Renders an achievement's icon. Three cases:
//   1. Known library asset key → <img src="/badges/{key}.svg" />
//      (falls back to the seal SVG if the file isn't there yet)
//   2. Emoji glyph (non-ASCII) → <span>{emoji}</span>
//   3. Empty / legacy placeholder code → default badge-check seal SVG

import { useState } from 'react'
import { displayBadgeIcon } from '../lib/badgeIcon'
import { badgeAssetUrl, isBadgeAssetKey } from '../lib/badgeLibrary'

const FALLBACK_SENTINEL = '__BADGE_DEFAULT__'

export function BadgeGlyph({
  icon,
  size = 20,
  className,
}: {
  icon: string | null | undefined
  size?: number
  className?: string
}) {
  if (isBadgeAssetKey(icon)) {
    return <BadgeImage assetKey={icon!} size={size} className={className} />
  }

  const resolved = displayBadgeIcon(icon, FALLBACK_SENTINEL)
  if (resolved !== FALLBACK_SENTINEL) {
    return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>{resolved}</span>
  }

  return <SealIcon size={size} className={className} />
}

function BadgeImage({ assetKey, size, className }: { assetKey: string; size: number; className?: string }) {
  const [errored, setErrored] = useState(false)
  if (errored) return <SealIcon size={size} className={className} />
  return (
    <img
      src={badgeAssetUrl(assetKey)}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-block' }}
      onError={() => setErrored(true)}
    />
  )
}

function SealIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
