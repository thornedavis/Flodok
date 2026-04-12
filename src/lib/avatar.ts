// Generates a deterministic gradient for a user based on their ID,
// similar to Stripe's default avatar style.

const GRADIENT_PAIRS: [string, string][] = [
  ['#3b82f6', '#f5f0e8'], // blue → warm white
  ['#1d4ed8', '#e8e4dc'], // dark blue → beige
  ['#60a5fa', '#faf7f2'], // light blue → cream
  ['#2563eb', '#f0ece4'], // blue → sand
  ['#93c5fd', '#e8e0d4'], // sky blue → warm beige
  ['#1e40af', '#faf5ee'], // navy → ivory
  ['#3b82f6', '#d4cfc6'], // blue → stone
  ['#60a5fa', '#ece7de'], // light blue → linen
  ['#2563eb', '#faf8f4'], // blue → snow white
  ['#93c5fd', '#f5f0e6'], // sky → wheat
  ['#1d4ed8', '#e4dfd6'], // deep blue → parchment
  ['#3b82f6', '#ede8df'], // blue → antique white
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function getAvatarGradient(id: string): string {
  const index = hashString(id) % GRADIENT_PAIRS.length
  const angle = (hashString(id + 'angle') % 360)
  const [from, to] = GRADIENT_PAIRS[index]
  return `linear-gradient(${angle}deg, ${from}, ${to})`
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (parts[0]?.[0] || '?').toUpperCase()
}
