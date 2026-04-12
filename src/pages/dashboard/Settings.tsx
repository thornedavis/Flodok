import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User, Organization, ApiKey } from '../../types/database'

export function Settings({ user }: { user: User }) {
  const [org, setOrg] = useState<Organization | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [orgName, setOrgName] = useState('')
  const [countryCode, setCountryCode] = useState('+62')
  const [reviewMode, setReviewMode] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')

  useEffect(() => { loadData() }, [user.org_id])

  async function loadData() {
    const [orgResult, keysResult] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', user.org_id).single(),
      supabase.from('api_keys').select('*').eq('org_id', user.org_id).order('created_at', { ascending: false }),
    ])
    if (orgResult.data) {
      setOrg(orgResult.data)
      setOrgName(orgResult.data.name)
      setCountryCode(orgResult.data.default_country_code)
      setReviewMode(orgResult.data.review_mode)
    }
    setApiKeys(keysResult.data || [])
  }

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('organizations').update({
      name: orgName,
      default_country_code: countryCode,
      review_mode: reviewMode,
    }).eq('id', user.org_id)
    setSaving(false)
  }

  async function handleGenerateKey() {
    if (!newKeyName.trim()) return

    // Generate a random API key
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const key = 'flk_live_' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
    const prefix = key.slice(0, 16) + '...'

    // Hash it (we'll store a simple hash client-side for now — in production this should be done server-side)
    const encoder = new TextEncoder()
    const data = encoder.encode(key)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const { error } = await supabase.from('api_keys').insert({
      org_id: user.org_id,
      key_hash: hashHex,
      key_prefix: prefix,
      name: newKeyName.trim(),
    })

    if (error) { alert(error.message); return }

    setGeneratedKey(key)
    setNewKeyName('')
    loadData()
  }

  async function handleRevokeKey(keyId: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    await supabase.from('api_keys').delete().eq('id', keyId)
    loadData()
  }

  if (!org) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Settings</h1>

      {/* Organization Settings */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Organization</h2>
        <form onSubmit={handleSaveOrg} className="space-y-4 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Organization name</label>
            <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Default country code</label>
            <input type="text" value={countryCode} onChange={e => setCountryCode(e.target.value)} required className="w-48 rounded-lg border px-3 py-2 text-sm" style={inputStyle} placeholder="+62" />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="reviewMode"
              checked={reviewMode}
              onChange={e => setReviewMode(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <label htmlFor="reviewMode" className="text-sm" style={{ color: 'var(--color-text)' }}>
              Review mode — require manager approval for API-submitted updates
            </label>
          </div>

          <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </section>

      {/* API Keys */}
      <section>
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>API Keys</h2>

        {generatedKey && (
          <div className="mb-4 overflow-hidden rounded-xl border p-4" style={{ borderColor: 'var(--color-success)', backgroundColor: 'var(--color-diff-add)' }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                API key generated. Copy it now — you won't be able to see it again.
              </p>
              <button
                onClick={() => { navigator.clipboard.writeText(generatedKey); setGeneratedKey('') }}
                className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-success)' }}
              >
                Copy & dismiss
              </button>
            </div>
            <input
              type="text"
              readOnly
              value={generatedKey}
              onFocus={e => e.target.select()}
              className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>
        )}

        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Key name</label>
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="e.g. Meeting Pipeline"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleGenerateKey}
            disabled={!newKeyName.trim()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Generate
          </button>
        </div>

        {apiKeys.length > 0 && (
          <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
            {apiKeys.map(key => (
              <div key={key.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{key.name}</span>
                  <span className="ml-2 text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>{key.key_prefix}</span>
                  <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && ` · Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeKey(key.id)}
                  className="text-xs"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
