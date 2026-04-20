// AES-256-GCM envelope for per-org integration credentials.
//
// Envelope format: "v1." + base64url(iv) + "." + base64url(ciphertext||tag)
//   - v1        single ASCII byte version prefix so we can rotate the scheme later
//   - iv        12 bytes, randomly generated per encrypt
//   - ciphertext  WebCrypto returns ciphertext with the 16-byte auth tag appended
//
// The same file is duplicated at flodok-router/src/crypto.ts — keep them in
// sync. Both Deno and Cloudflare Workers expose the same WebCrypto API so the
// bytes are compatible across runtimes.

const VERSION = 'v1'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = fromBase64Url(keyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
  if (raw.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes (got ${raw.length})`)
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptJson(obj: unknown, keyB64: string): Promise<string> {
  const key = await importKey(keyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(obj))
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipherBuf))}`
}

export async function decryptJson<T = unknown>(envelope: string, keyB64: string): Promise<T> {
  const parts = envelope.split('.')
  if (parts.length !== 3) throw new Error('Malformed envelope')
  const [version, ivB64, ctB64] = parts
  if (version !== VERSION) throw new Error(`Unsupported envelope version: ${version}`)
  const key = await importKey(keyB64)
  const iv = fromBase64Url(ivB64)
  const ct = fromBase64Url(ctB64)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return JSON.parse(new TextDecoder().decode(plainBuf)) as T
}

// Generate a fresh 32-byte key encoded for the ENCRYPTION_KEY secret.
// Run once at setup; paste the output into `wrangler secret put ENCRYPTION_KEY`
// and `supabase secrets set ENCRYPTION_KEY=...`. Never commit the value.
export function generateKeyB64(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}
