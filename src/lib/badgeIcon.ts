// Badges currently store the achievement code (e.g. "first_earnings") as a
// placeholder in the `icon` column until proper icon assets are designed.
// Treat any value that looks like a code/identifier (only ASCII letters,
// digits, _ or -) as "no icon" and fall back to the default. Emoji and other
// real glyphs always include non-ASCII characters and pass through.

const PLACEHOLDER_RE = /^[A-Za-z0-9_-]+$/

export function displayBadgeIcon(icon: string | null | undefined, fallback: string): string {
  if (!icon) return fallback
  return PLACEHOLDER_RE.test(icon) ? fallback : icon
}
