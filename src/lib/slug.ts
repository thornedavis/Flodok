/**
 * Generate a URL-safe slug from a name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Generate a slug with a random suffix to satisfy the global
 * unique constraint on employees.slug.
 */
export function generateUniqueSlug(name: string): string {
  const base = generateSlug(name) || 'employee'
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(4)
  crypto.getRandomValues(array)
  let suffix = ''
  for (const byte of array) suffix += chars[byte % chars.length]
  return `${base}-${suffix}`
}

/**
 * Generate a random access token (6 alphanumeric chars).
 */
export function generateAccessToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  for (const byte of array) {
    token += chars[byte % chars.length]
  }
  return token
}
