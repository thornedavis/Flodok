import { useState } from 'react'
import type { Translations } from '../../lib/translations'
import { type IntegrationRow, verifyIntegration, getCredentialHint } from '../../lib/integrations'

interface Props {
  title: string
  description: string
  row: IntegrationRow | null
  onConnect: () => void
  onDisconnect: () => void
  onVerified?: () => void
  busy?: boolean
  t: Translations
}

export function IntegrationCard({ title, description, row, onConnect, onDisconnect, onVerified, busy, t }: Props) {
  const [testing, setTesting] = useState(false)
  const [testBanner, setTestBanner] = useState<{ ok: boolean; message: string } | null>(null)

  const connected = row?.has_credentials === true && row.status === 'active'
  const hasError = row?.status === 'error' || !!row?.last_error
  const hint = getCredentialHint(row)

  const statusLabel = !row
    ? t.integrationStatusNotConnected
    : hasError
    ? t.integrationStatusError
    : row.status === 'disabled'
    ? t.integrationStatusDisabled
    : t.integrationStatusConnected

  const statusColor = hasError
    ? 'var(--color-danger)'
    : connected
    ? 'var(--color-success)'
    : 'var(--color-text-tertiary)'

  async function handleTest() {
    if (!row) return
    setTesting(true)
    setTestBanner(null)
    try {
      const result = await verifyIntegration(row.provider)
      setTestBanner({
        ok: result.ok,
        message: result.ok ? t.integrationTestOk : result.error ?? t.integrationTestFailed,
      })
      onVerified?.()
    } catch (e) {
      setTestBanner({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {title}
            </h3>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: statusColor }}
              aria-hidden
            />
            <span className="text-xs" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {description}
          </p>
          {hint && connected && (
            <p className="mt-2 font-mono text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.integrationSavedKey}: •••• {hint}
            </p>
          )}
          {row?.last_verified_at && (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.integrationLastVerified}: {new Date(row.last_verified_at).toLocaleString()}
            </p>
          )}
          {row?.last_error && (
            <p className="mt-2 text-xs" style={{ color: 'var(--color-danger)' }}>
              {row.last_error}
            </p>
          )}
          {testBanner && (
            <p
              className="mt-2 text-xs"
              style={{ color: testBanner.ok ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              {testBanner.message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {connected && (
            <>
              <button
                type="button"
                onClick={handleTest}
                disabled={busy || testing}
                className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {testing ? t.integrationTesting : t.integrationTest}
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                disabled={busy || testing}
                className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
              >
                {t.integrationDisconnect}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onConnect}
            disabled={busy || testing}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {connected ? t.integrationReconnect : t.integrationConnect}
          </button>
        </div>
      </div>
    </div>
  )
}
