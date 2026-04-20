import { useState } from 'react'
import type { Translations } from '../../lib/translations'
import {
  saveIntegration,
  testIntegration,
  firefliesWebhookUrl,
  getCredentialHint,
  type IntegrationRow,
} from '../../lib/integrations'

interface Props {
  orgId: string
  existing: IntegrationRow | null
  onClose: () => void
  onSaved: () => void
  t: Translations
}

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

export function ConnectFirefliesDialog({ orgId, existing, onClose, onSaved, t }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [useWebhooks, setUseWebhooks] = useState(
    (existing?.config as { supports_webhooks?: boolean } | undefined)?.supports_webhooks === true,
  )
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const webhookUrl = firefliesWebhookUrl(orgId)
  const existingHint = getCredentialHint(existing)

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testIntegration('fireflies', { api_key: apiKey })
      if (result.ok) {
        setTestResult({ ok: true, message: t.integrationTestOk })
      } else {
        setTestResult({ ok: false, message: result.error ?? t.integrationTestFailed })
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setTestResult(null)
    try {
      const credentials: Record<string, string> = { api_key: apiKey.trim() }
      if (useWebhooks && webhookSecret.trim()) credentials.webhook_secret = webhookSecret.trim()

      await saveIntegration('fireflies', credentials, { supports_webhooks: useWebhooks })
      onSaved()
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : t.integrationSaveFailed })
    } finally {
      setSaving(false)
    }
  }

  function handleCopy() {
    if (!webhookUrl) return
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-lg rounded-xl p-6"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <h2 className="mb-1 text-lg font-semibold">{t.firefliesTitle}</h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.firefliesDesc}
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t.firefliesApiKeyLabel}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={existingHint ? `•••••••••• ${existingHint}` : t.firefliesApiKeyPlaceholder}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
            style={inputStyle}
          />
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useWebhooks}
            onChange={e => setUseWebhooks(e.target.checked)}
          />
          <span style={{ color: 'var(--color-text-secondary)' }}>{t.firefliesPlanBusinessLabel}</span>
        </label>

        {useWebhooks ? (
          <>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.firefliesWebhookSecretLabel}
              </label>
              <input
                type="password"
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                placeholder={t.firefliesWebhookSecretPlaceholder}
                className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
                style={inputStyle}
              />
            </div>

            <div className="mb-4 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t.firefliesWebhookUrlLabel}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl || '—'}
                  onFocus={e => e.target.select()}
                  className="flex-1 rounded-lg border px-2 py-1.5 font-mono text-xs"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!webhookUrl}
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}
                >
                  {copied ? t.urlCopied : t.copyUrl}
                </button>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.firefliesWebhookUrlHelp}
              </p>
            </div>
          </>
        ) : (
          <p className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.firefliesPollingNote}
          </p>
        )}

        {testResult && (
          <div
            className="mb-4 rounded-lg border p-3 text-xs"
            style={{
              borderColor: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
              color: testResult.ok ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {testResult.message}
          </div>
        )}

        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={!apiKey.trim() || testing || saving}
            className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {testing ? t.integrationTesting : t.integrationTest}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.integrationCancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!apiKey.trim() || saving || testing}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? t.integrationSaving : t.integrationSave}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
