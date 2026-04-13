import { getAvatarGradient } from '../lib/avatar'

interface AvatarProps {
  name: string
  id: string
  photoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
}

export function Avatar({ name, id, photoUrl, size = 'md' }: AvatarProps) {
  return (
    <div
      className={`flex ${sizes[size]} shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white`}
      style={{ background: photoUrl ? 'var(--color-bg-tertiary)' : getAvatarGradient(id) }}
    >
      {photoUrl && (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      )}
    </div>
  )
}
