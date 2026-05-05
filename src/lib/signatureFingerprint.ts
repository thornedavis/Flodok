// Helpers for capturing the legal-evidence context around an electronic
// signature: a deterministic hash of the document being signed, the signer's
// device user-agent, and the exact consent wording they saw.
//
// IP address is intentionally omitted here — the browser cannot read its own
// public IP. Server-side capture requires a Cloudflare Worker or Supabase
// Edge Function endpoint, which can populate `ip_address` on the row from
// request headers (CF-Connecting-IP, X-Forwarded-For).

export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Hash the contract content along with its version number. Bumping the
// version OR mutating the markdown invalidates the hash, so any tamper
// after-the-fact is detectable by re-hashing the live row and comparing
// to the persisted document_hash.
export async function buildContractDocumentHash(contentMarkdown: string, versionNumber: number): Promise<string> {
  return sha256Hex(`v${versionNumber}|${contentMarkdown}`)
}

export function getUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : ''
}

// Patches the signer's public IP onto a freshly-created contract_signatures
// row. Calls the sign-contract-ip edge function which reads the IP from
// CF-Connecting-IP request headers (the browser cannot read its own public
// IP). Best-effort: a network failure here does not invalidate the
// signature itself.
//
// Two auth paths:
//   - Employer / dashboard signer: pass the user's session access_token
//   - Candidate / portal signer:    pass slug + access_token from URL
import { supabase } from './supabase'

export async function captureSignatureIp(
  signatureId: string,
  auth: { type: 'jwt'; token: string } | { type: 'portal'; slug: string; accessToken: string },
): Promise<void> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-contract-ip`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let body: Record<string, string> = { signature_id: signatureId }
  if (auth.type === 'jwt') {
    headers.Authorization = `Bearer ${auth.token}`
  } else {
    body = { ...body, slug: auth.slug, access_token: auth.accessToken }
    // The function still needs an Authorization header to satisfy Supabase
    // gateway routing; the anon key is fine here since real auth happens
    // via slug+token validation inside the function.
    headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
  }
  try {
    await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    // Best-effort. The signature row exists with everything else captured.
  }
}

// Resolves the current Supabase auth token for dashboard callers. Returns
// null if there's no logged-in user (e.g. portal context).
export async function currentAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
