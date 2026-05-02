import type { ReactNode } from 'react'
import { useLang } from '../../contexts/LanguageContext'

interface SectionPanelProps {
  title: string
  subtitle?: string
  editing?: boolean
  onEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  saving?: boolean
  canEdit?: boolean
  editDisabledTitle?: string
  headerExtra?: ReactNode
  children: ReactNode
}

export function SectionPanel({
  title,
  subtitle,
  editing = false,
  onEdit,
  onSave,
  onCancel,
  saving = false,
  canEdit = true,
  editDisabledTitle,
  headerExtra,
  children,
}: SectionPanelProps) {
  const { t } = useLang()
  const showEdit = Boolean(onEdit)

  return (
    <section
      className="rounded-xl border"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <header
        className="flex items-start justify-between gap-4 border-b px-6 py-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerExtra}
          {showEdit && (editing ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {saving ? t.saving : t.save}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onEdit}
              disabled={!canEdit}
              title={!canEdit ? editDisabledTitle : undefined}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.edit}
            </button>
          ))}
        </div>
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-4 sm:py-2.5"
      style={{ borderColor: 'color-mix(in srgb, var(--color-border) 45%, transparent)' }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
      <div className="text-sm" style={{ color: 'var(--color-text)' }}>{children}</div>
    </div>
  )
}

export function FieldValue({ value }: { value: string | null | undefined }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
  }
  return <>{value}</>
}
