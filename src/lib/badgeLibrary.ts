// Registry of built-in badge illustrations. Add one entry per SVG dropped into
// /public/badges/. The `key` becomes the value stored in
// achievement_definitions.icon and the file path (`/badges/{key}.svg`).
//
// Currently everything sits in a single "library" bucket while illustrations
// are being drawn. As they're assigned to specific badge types, change the
// `category` field — re-categorising never breaks an existing badge because
// the stored icon value is just the `key`.

export type BadgeCategory = 'library' | 'tenure' | 'performance' | 'leaderboard' | 'milestone' | 'fun'

export type BadgeAsset = {
  key: string
  label: string
  category: BadgeCategory
}

export const BADGE_CATEGORIES: { id: BadgeCategory; label: string }[] = [
  { id: 'library', label: 'Library' },
  // Uncomment as you start splitting illustrations into themed buckets:
  // { id: 'tenure', label: 'Tenure' },
  // { id: 'performance', label: 'Performance' },
  // { id: 'leaderboard', label: 'Leaderboard' },
  // { id: 'milestone', label: 'Milestones' },
  // { id: 'fun', label: 'Fun & Recognition' },
]

// Generated to match /public/badges/illustration-{n}.svg. Add or remove
// entries as illustrations come in or out.
export const BADGE_LIBRARY: BadgeAsset[] = Array.from({ length: 24 }, (_, i) => {
  const n = i + 1
  return { key: `illustration-${n}`, label: `Illustration ${n}`, category: 'library' as const }
})

const KEY_SET = new Set(BADGE_LIBRARY.map(b => b.key))

export function isBadgeAssetKey(value: string | null | undefined): boolean {
  if (!value) return false
  return KEY_SET.has(value)
}

export function badgeAssetUrl(key: string): string {
  return `/badges/${key}.svg`
}
