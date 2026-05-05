import { useState } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { DatePicker } from '../DatePicker'
import type { SeparationType } from '../../lib/employeeStatus'

interface Props {
  type: SeparationType
  employeeName: string
  onCancel: () => void
  onConfirm: (lastDay: string, reason: string) => Promise<void>
}

export function SeparationModal({ type, employeeName, onCancel, onConfirm }: Props) {
  const { t } = useLang()
  const today = new Date()
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [lastDay, setLastDay] = useState(todayYmd)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const title = type === 'resigned' ? t.separationResignTitle : t.separationTerminateTitle
  const subtitle = type === 'resigned'
    ? t.separationResignSubtitle(employeeName)
    : t.separationTerminateSubtitle(employeeName)
  const confirmLabel = type === 'resigned' ? t.separationConfirmResign : t.separationConfirmTerminate
  const reasonPlaceholder = type === 'resigned' ? t.separationReasonResignPlaceholder : t.separationReasonTerminatePlaceholder

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!lastDay || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(lastDay, reason.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : t.separationError)
      setSubmitting(false)
    }
  }

  const currentYear = today.getFullYear()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-lg border p-5 shadow-xl"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.separationLastDayLabel}<span style={{ color: 'var(--color-danger)' }}> *</span>
            </label>
            <DatePicker value={lastDay} onChange={setLastDay} minYear={currentYear - 5} maxYear={currentYear + 1} />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.separationLastDayHelp}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.separationReasonLabel}
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={!lastDay || submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: type === 'terminated' ? 'var(--color-danger)' : 'var(--color-primary)' }}
            >
              {submitting ? t.saving : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
