import { getAvatarGradient } from '../../lib/avatar'

type TopAchievement = {
  name: string
  icon: string | null
  unlocked_at: string
  is_featured?: boolean
}

export function AvatarWithBadge({
  employeeId,
  photoUrl,
  name,
  size = 40,
  badges,
  enabled = true,
}: {
  employeeId: string
  photoUrl: string | null
  name?: string
  size?: number
  badges?: TopAchievement[]
  enabled?: boolean
}) {
  const top = enabled ? badges?.[0] : null
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="h-full w-full overflow-hidden rounded-full"
        style={{ background: photoUrl ? 'transparent' : getAvatarGradient(employeeId) }}
      >
        {photoUrl && <img src={photoUrl} alt={name || ''} className="h-full w-full object-cover" />}
      </div>
      {top && (
        <div
          className="absolute"
          style={{
            right: -2,
            top: -2,
            width: Math.max(14, size * 0.38),
            height: Math.max(14, size * 0.38),
            color: 'var(--color-warning)',
          }}
          title={badges && badges.length > 1 ? badges.map(b => b.name).join(' · ') : top.name}
        >
          {/* Filled badge-check shape — matches the Badges tab nav icon
              but solid instead of outlined so it stays legible at the
              small avatar-overlay size. */}
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
            <path d="m9 12 2 2 4-4" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  )
}
