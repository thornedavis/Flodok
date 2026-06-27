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
 * Generate a slug with a random suffix to satisfy the global unique constraint
 * on employees.slug. The slug is a display/URL convenience only — the portal's
 * security credential is the server-minted employees.access_token (default set
 * in migration 165), NOT this suffix. Uses rejection sampling to avoid the
 * modulo bias the old implementation had.
 */
export function generateUniqueSlug(name: string): string {
  const base = generateSlug(name) || 'employee'
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789' // 36 symbols
  const limit = 256 - (256 % chars.length) // 252 — reject bytes above this
  let suffix = ''
  while (suffix.length < 4) {
    const array = new Uint8Array(4)
    crypto.getRandomValues(array)
    for (const byte of array) {
      if (byte < limit && suffix.length < 4) suffix += chars[byte % chars.length]
    }
  }
  return `${base}-${suffix}`
}
