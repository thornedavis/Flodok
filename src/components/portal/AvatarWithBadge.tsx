import { getAvatarGradient } from '../../lib/avatar'
import { displayBadgeIcon } from '../../lib/badgeIcon'

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
}: {
  employeeId: string
  photoUrl: string | null
  name?: string
  size?: number
  badges?: TopAchievement[]
}) {
  const top = badges?.[0]
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
          className="absolute flex items-center justify-center rounded-full border text-[10px]"
          style={{
            right: -2,
            top: -2,
            width: Math.max(14, size * 0.38),
            height: Math.max(14, size * 0.38),
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
          }}
          title={badges && badges.length > 1 ? `${badges.map(b => b.name).join(' · ')}` : top.name}
        >
          {displayBadgeIcon(top.icon, '🏅')}
        </div>
      )}
    </div>
  )
}
