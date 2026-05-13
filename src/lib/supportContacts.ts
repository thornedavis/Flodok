// Single source of truth for the support / sales contact channels surfaced
// in the unified Contact page (Help → Contact). If you change a number or
// email, do it here — every contact card pulls from this module.

export const SUPPORT_CONTACTS = {
  emailSales: 'sales@flodok.com',
  emailSupport: 'support@flodok.com',
  emailSecurity: 'security@flodok.com',
  emailHello: 'hello@flodok.com',

  // Owner WhatsApp — surfaced ONLY to logged-in Pro customers via the
  // gated WhatsApp CTA on the contact page. The display string is what
  // shows up next to the button; the phone string is what `wa.me/...`
  // routes to (digits only, country code, no plus sign).
  //
  // TODO(thorne): replace with the real number you want exposed.
  whatsAppPhone: '628000000000',
  whatsAppDisplay: '+62 800 0000 000',

  officeName: 'Flodok HQ',
  officeCity: 'Jakarta, Indonesia',
  officeHours: 'Mon–Fri · 09.00 – 18.00 WIB',

  // Status page (real-time uptime). Currently a placeholder URL — point
  // it at the real status page once it's live.
  statusPageUrl: 'https://status.flodok.com',
  statusPageDisplay: 'status.flodok.com',
}

// Build the wa.me deep link with an optional pre-filled message. Used by
// the Pro-gated "Chat on WhatsApp" CTA so the customer arrives in the
// chat with context the support owner can act on without asking.
export function whatsAppLinkFor(orgName?: string | null): string {
  const base = `https://wa.me/${SUPPORT_CONTACTS.whatsAppPhone}`
  const greeting = orgName
    ? `Hi! I'm with ${orgName} on Flodok Pro and have a question.`
    : "Hi! I'm a Flodok Pro customer and have a question."
  return `${base}?text=${encodeURIComponent(greeting)}`
}
