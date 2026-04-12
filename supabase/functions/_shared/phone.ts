/**
 * Normalize a phone number to E.164 format.
 * Strips spaces, dashes, dots, brackets, then applies country code logic.
 */
export function normalizePhone(raw: string, defaultCountryCode = '+62'): string {
  let phone = raw.replace(/[\s\-.()\[\]]/g, '')

  if (phone.startsWith('0')) {
    phone = defaultCountryCode + phone.slice(1)
  } else if (!phone.startsWith('+')) {
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
