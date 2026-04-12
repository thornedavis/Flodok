/**
 * Normalize a phone number to E.164 format.
 * - Strips spaces, dashes, dots, brackets
 * - If starts with 0, replaces leading 0 with defaultCountryCode
 * - If starts with country digits (e.g. 62), prepends +
 * - If already starts with +, keeps as-is
 */
export function normalizePhone(raw: string, defaultCountryCode = '+62'): string {
  let phone = raw.replace(/[\s\-.()\[\]]/g, '')

  if (phone.startsWith('0')) {
    phone = defaultCountryCode + phone.slice(1)
  } else if (!phone.startsWith('+')) {
    // If it starts with digits that match the country code without +, add +
    const codeDigits = defaultCountryCode.replace('+', '')
    if (phone.startsWith(codeDigits)) {
      phone = '+' + phone
    } else {
      phone = defaultCountryCode + phone
    }
  }

  return phone
}

/**
 * Validate that a phone number looks like E.164 format.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone)
}

/**
 * Format a phone number for display (adds spaces for readability).
 */
export function formatPhone(phone: string): string {
  if (!phone.startsWith('+')) return phone
  // Simple formatting: +62 812 3456 7890
  const digits = phone.slice(1)
  if (digits.length <= 4) return phone
  const countryCode = phone.startsWith('+62') ? '+62' : phone.slice(0, 3)
  const rest = phone.slice(countryCode.length)
  return `${countryCode} ${rest.replace(/(\d{3,4})(?=\d)/g, '$1 ')}`.trim()
}
