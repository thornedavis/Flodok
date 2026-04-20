#!/usr/bin/env node
// One-shot migration of the legacy single-tenant `config:default` KV blob into
// the per-org `org_integrations` table.
//
// Usage:
//   1. Export the KV blob to a local file:
//        wrangler kv key get --namespace-id=<kv-ns-id> "config:default" \
//          > /tmp/flodok-config.json
//      (Or `cat` a config JSON file you already have.)
//
//   2. Run this script:
//        export SUPABASE_URL="https://<proj>.supabase.co"
//        export SUPABASE_SERVICE_ROLE_KEY="<service-role>"
//        export ENCRYPTION_KEY="<same-32-byte-base64-as-worker>"
//        node scripts/migrate-config-default.mjs \
//          --org-id <uuid> \
//          --config /tmp/flodok-config.json
//
//   The script:
//     - Reads the legacy OrgConfig JSON
//     - Encrypts the Fireflies creds + (if present) Asana creds
//     - Upserts into org_integrations
//     - Round-trip-verifies each blob before confirming
//     - Is idempotent — re-running just re-upserts
//
// The script does NOT migrate flodok_api_key / openrouter_api_key. Those
// concepts are gone in the multi-tenant architecture:
//   - Flodok API auth is now the operator-owned WORKER_SERVICE_TOKEN
//   - OpenRouter is a single operator-owned key set as a Worker secret

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { webcrypto as crypto } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const VERSION = 'v1'

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

async function importKey(keyB64) {
  const raw = fromBase64Url(keyB64)
  if (raw.length !== 32) throw new Error(`ENCRYPTION_KEY must be 32 bytes (got ${raw.length})`)
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptJson(obj, keyB64) {
  const key = await importKey(keyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)))
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ct))}`
}

async function decryptJson(envelope, keyB64) {
  const parts = envelope.split('.')
  if (parts.length !== 3) throw new Error('Malformed envelope')
  const [version, ivB64, ctB64] = parts
  if (version !== VERSION) throw new Error(`Unsupported envelope version: ${version}`)
  const key = await importKey(keyB64)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(ivB64) }, key, fromBase64Url(ctB64))
  return JSON.parse(new TextDecoder().decode(plain))
}

function die(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

async function main() {
  const { values } = parseArgs({
    options: {
      'org-id': { type: 'string' },
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  const orgId = values['org-id']
  const configPath = values.config
  const dryRun = values['dry-run']

  if (!orgId) die('missing --org-id')
  if (!configPath) die('missing --config (path to legacy config JSON)')

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encKey = process.env.ENCRYPTION_KEY
  if (!supabaseUrl) die('SUPABASE_URL env var is required')
  if (!serviceKey) die('SUPABASE_SERVICE_ROLE_KEY env var is required')
  if (!encKey) die('ENCRYPTION_KEY env var is required')

  let raw
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    die(`could not read ${configPath}: ${e.message}`)
  }

  // Legacy config shape (pre-refactor OrgConfig). Fields we still care about:
  //   fireflies_api_key, fireflies_webhook_secret
  //   asana_access_token, asana_workspace_id, asana_project_id
  if (!raw.fireflies_api_key) die('config is missing fireflies_api_key — nothing to migrate')

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Confirm the target org exists.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single()
  if (orgErr || !org) die(`org ${orgId} not found: ${orgErr?.message ?? 'no row'}`)
  console.log(`Migrating to org: ${org.name} (${org.id})`)

  const plan = []

  // Fireflies
  const firefliesCreds = {
    api_key: raw.fireflies_api_key,
    ...(raw.fireflies_webhook_secret ? { webhook_secret: raw.fireflies_webhook_secret } : {}),
  }
  plan.push({ provider: 'fireflies', credentials: firefliesCreds, config: {} })

  // Asana — only if a token is present. Workspace/project live in `config`.
  if (raw.asana_access_token) {
    plan.push({
      provider: 'asana',
      credentials: { access_token: raw.asana_access_token },
      config: {
        ...(raw.asana_workspace_id ? { workspace_id: raw.asana_workspace_id } : {}),
        ...(raw.asana_project_id ? { project_id: raw.asana_project_id } : {}),
      },
    })
  }

  console.log(`Planned upserts:`)
  for (const p of plan) {
    console.log(`  - ${p.provider} (config keys: ${Object.keys(p.config).join(', ') || 'none'})`)
  }

  if (dryRun) {
    console.log('--dry-run set; exiting without writes.')
    return
  }

  for (const p of plan) {
    const ciphertext = await encryptJson(p.credentials, encKey)

    // Round-trip verify before we write to the DB.
    const roundtrip = await decryptJson(ciphertext, encKey)
    const inKeys = Object.keys(p.credentials).sort().join(',')
    const outKeys = Object.keys(roundtrip).sort().join(',')
    if (inKeys !== outKeys) die(`round-trip shape mismatch for ${p.provider}: ${inKeys} vs ${outKeys}`)

    const { error } = await supabase
      .from('org_integrations')
      .upsert(
        {
          org_id: orgId,
          provider: p.provider,
          status: 'active',
          credentials_encrypted: ciphertext,
          config: p.config,
          last_verified_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: 'org_id,provider' },
      )

    if (error) die(`upsert failed for ${p.provider}: ${error.message}`)
    console.log(`  ✓ ${p.provider} upserted`)
  }

  console.log('Done. Run the Worker /health/deep/<org_id> with the service token to verify end-to-end.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
