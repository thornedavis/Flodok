import { useState } from 'react'
import type { Translations } from '../../lib/translations'
import { saveIntegration, testIntegration, getCredentialHint, type IntegrationRow } from '../../lib/integrations'

interface Props {
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

export function ConnectAsanaDialog({ existing, onClose, onSaved, t }: Props) {
  const existingConfig = (existing?.config ?? {}) as { workspace_id?: string; project_id?: string }
  const [token, setToken] = useState('')
  const [workspaceId, setWorkspaceId] = useState(existingConfig.workspace_id ?? '')
  const [projectId, setProjectId] = useState(existingConfig.project_id ?? '')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const existingHint = getCredentialHint(existing)

  async function handleTest() {
    setTesting(true)
    setResult(null)
    try {
      const r = await testIntegration('asana', { access_token: token })
      setResult({ ok: r.ok, message: r.ok ? t.integrationTestOk : r.error ?? t.integrationTestFailed })
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!token.trim() || !workspaceId.trim() || !projectId.trim()) return
    setSaving(true)
    setResult(null)
    try {
      await saveIntegration(
        'asana',
        { access_token: token.trim() },
        { workspace_id: workspaceId.trim(), project_id: projectId.trim() },
      )
      onSaved()
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : t.integrationSaveFailed })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-lg rounded-xl p-6"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <h2 className="mb-1 text-lg font-semibold">{t.asanaTitle}</h2>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.asanaDesc}
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t.asanaTokenLabel}
          </label>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={existingHint ? `•••••••••• ${existingHint}` : t.asanaTokenPlaceholder}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
            style={inputStyle}
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t.asanaWorkspaceLabel}
          </label>
          <input
            type="text"
            value={workspaceId}
            onChange={e => setWorkspaceId(e.target.value)}
            placeholder={t.asanaWorkspacePlaceholder}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
            style={inputStyle}
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t.asanaProjectLabel}
          </label>
          <input
            type="text"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            placeholder={t.asanaProjectPlaceholder}
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
            style={inputStyle}
          />
        </div>

        {result && (
          <div
            className="mb-4 rounded-lg border p-3 text-xs"
            style={{
              borderColor: result.ok ? 'var(--color-success)' : 'var(--color-danger)',
              color: result.ok ? 'var(--color-success)' : 'var(--color-danger)',
            }}
          >
            {result.message}
          </div>
        )}

        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={!token.trim() || testing || saving}
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
              disabled={!token.trim() || !workspaceId.trim() || !projectId.trim() || saving || testing}
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
