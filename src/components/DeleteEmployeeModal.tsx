import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { countEmployeeAttachments, trashEmployee, trashEmployees, type EmployeeAttachmentCounts } from '../lib/trash'
import { useLang } from '../contexts/LanguageContext'

type Target =
  | { kind: 'single'; id: string; name: string }
  | { kind: 'bulk'; ids: string[] }

export function DeleteEmployeeModal({
  open,
  target,
  onClose,
  onDeleted,
}: {
  open: boolean
  target: Target | null
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useLang()
  const [counts, setCounts] = useState<EmployeeAttachmentCounts | null>(null)
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [cascade, setCascade] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCascade(false)
    setError(null)
    setCounts(null)
    if (target?.kind === 'single') {
      setLoadingCounts(true)
      countEmployeeAttachments(target.id)
        .then(setCounts)
        .catch(err => setError(err.message))
        .finally(() => setLoadingCounts(false))
    }
  }, [open, target])

  if (!target) return null

  const hasRelated = counts !== null && (
    counts.soleAudienceSops > 0 ||
    counts.sharedAudienceSops > 0 ||
    counts.contracts > 0 ||
    counts.ndas > 0 ||
    counts.attachments > 0
  )
  // Cascade is meaningful only when there's something it would take with it:
  // either sole-audience SOPs (will be trashed) or contracts (also cascade).
  // If the employee only appears in shared audiences and has no contracts/
  // attachments, deletion just detaches them — no extra choice needed.
  const cascadeEligible = counts !== null && (counts.soleAudienceSops > 0 || counts.contracts > 0 || counts.ndas > 0)
  const isBulk = target.kind === 'bulk'
  const title = isBulk
    ? t.trashDeleteBulkTitle(target.ids.length)
    : t.trashDeleteSingleTitle(target.name)

  async function handleConfirm() {
    if (!target) return
    setSubmitting(true)
    setError(null)
    try {
      if (target.kind === 'single') {
        await trashEmployee(target.id, { cascadeDocs: cascade })
      } else {
        await trashEmployees(target.ids, { cascadeDocs: cascade })
      }
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={submitting ? () => undefined : onClose} title={title}>
      <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <p>{isBulk ? t.trashDeleteBulkBody : t.trashDeleteSingleBody}</p>

        {target.kind === 'single' && loadingCounts && (
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
        )}

        {target.kind === 'single' && hasRelated && counts && (
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-danger, #b91c1c)' }}>
              {t.trashDangerZone}
            </div>
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {t.trashDangerExplain(target.name, counts.soleAudienceSops, counts.contracts, counts.ndas, counts.attachments)}
            </p>
            {counts.sharedAudienceSops > 0 && (
              <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Also in the audience of {counts.sharedAudienceSops} other {counts.sharedAudienceSops === 1 ? 'SOP' : 'SOPs'} alongside other targets — {counts.sharedAudienceSops === 1 ? 'it stays' : 'they stay'} alive and silently {counts.sharedAudienceSops === 1 ? 'loses' : 'lose'} {target.name} as a required signer.
              </p>
            )}
            {cascadeEligible && (
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={cascade}
                  onChange={e => setCascade(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5"
                />
                <span className="text-xs" style={{ color: 'var(--color-text)' }}>
                  {t.trashAlsoDeleteDocs(counts.soleAudienceSops, counts.contracts, counts.ndas)}
                </span>
              </label>
            )}
          </div>
        )}

        {isBulk && (
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={cascade}
                onChange={e => setCascade(e.target.checked)}
                disabled={submitting}
                className="mt-0.5"
              />
              <span className="text-xs" style={{ color: 'var(--color-text)' }}>
                {t.trashAlsoDeleteAllDocs}
              </span>
            </label>
          </div>
        )}

        {error && (
          <div className="rounded-md border p-2 text-xs" style={{ borderColor: 'var(--color-danger, #b91c1c)', color: 'var(--color-danger, #b91c1c)' }}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || loadingCounts}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-danger, #b91c1c)' }}
          >
            {submitting ? t.loading : t.trashMoveToTrash}
          </button>
        </div>
      </div>
    </Modal>
  )
}
