// "Save as template" action for the document edit pages. Renders as a
// plain secondary button in the editor toolbar (deliberately not a kebab
// — an unlabelled icon in a toolbar of labelled actions reads as
// decoration). Clicking opens a modal that clones the current document
// body into a fresh row in `document_templates`, leaving the source
// document untouched — so a user can keep iterating on a real contract /
// SOP / JD and snapshot the polished version as a reusable starter at
// any point.
//
// Type-aware:
//   - contract: prompts for title + (optional) job position, and copies
//     the structured fields document_templates carries for contracts
//     (wages, hours, leave, probation, pkwt/pkwtt) so the template can
//     auto-fill subsequent offers.
//   - sop / job_description / letter: prompts for title only.
//
// On success the user is routed straight into the slim template editor
// (`/dashboard/document-templates/:id/edit`) so they can finish naming
// it / tweak the body before it lands in the gallery.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LanguageContext'
import { Modal } from './Modal'
import { docAsJson, type DocumentDoc } from '../lib/documentDoc'
import { documentTemplateEditPath } from '../lib/documentTypes'
import type { PkwtType } from '../lib/pkwtStarterDoc'

export type SaveAsTemplateSource =
  | { type: 'sop'; contentDoc: DocumentDoc }
  | { type: 'job_description'; contentDoc: DocumentDoc }
  | { type: 'letter'; contentDoc: DocumentDoc }
  | {
      type: 'contract'
      contentDoc: DocumentDoc
      contractType: PkwtType
      baseWageIdr: number | null
      allowanceIdr: number | null
      hoursPerDay: number | null
      daysPerWeek: number | null
      annualLeaveDays: number | null
      probationMonths: number | null
      jobPositions: string[]
    }

export function SaveAsTemplateButton({
  orgId,
  getSource,
  defaultTitle,
  disabled,
}: {
  orgId: string
  // Lazily fetched so the modal always uses the latest in-editor state
  // (a user might tweak content between opening the modal and confirming).
  getSource: () => SaveAsTemplateSource
  defaultTitle?: string
  disabled?: boolean
}) {
  const { t } = useLang()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={disabled}
        title={disabled ? t.dunningWriteBlocked : undefined}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      >
        {t.contractSaveAsTemplate}
      </button>

      {modalOpen && (
        <SaveAsTemplateModal
          orgId={orgId}
          source={getSource()}
          defaultTitle={defaultTitle}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

function SaveAsTemplateModal({
  orgId,
  source,
  defaultTitle,
  onClose,
}: {
  orgId: string
  source: SaveAsTemplateSource
  defaultTitle?: string
  onClose: () => void
}) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [title, setTitle] = useState(defaultTitle?.trim() || '')
  const [position, setPosition] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isContract = source.type === 'contract'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError('')
    setSaving(true)

    const baseRow = {
      org_id: orgId,
      type: source.type,
      title: title.trim() || t.documentsUntitled,
      content_doc: docAsJson(source.contentDoc),
    }

    const insertRow = isContract
      ? {
          ...baseRow,
          template_for_position: position.trim() || null,
          contract_type: source.contractType,
          base_wage_idr: source.baseWageIdr,
          allowance_idr: source.allowanceIdr,
          hours_per_day: source.hoursPerDay,
          days_per_week: source.daysPerWeek,
          annual_leave_days: source.annualLeaveDays,
          probation_months: source.probationMonths,
        }
      : baseRow

    const { data, error: insertError } = await supabase
      .from('document_templates')
      .insert(insertRow)
      .select('id')
      .single()

    setSaving(false)
    if (insertError || !data) {
      setError(insertError?.message || 'Could not save template.')
      return
    }
    navigate(documentTemplateEditPath(data.id))
  }

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  return (
    <Modal open onClose={onClose} title={t.newTemplateTitle}>
      <form onSubmit={handleSubmit}>
        <p className="mb-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.contractSaveAsTemplatePrompt}
        </p>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
          onFocus={e => e.currentTarget.select()}
          placeholder={t.newTemplateTitlePlaceholder}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={inputStyle}
        />

        {isContract && source.jobPositions.length > 0 && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.newTemplatePositionLabel}
            </label>
            <div className="relative">
              <select
                value={position}
                onChange={e => setPosition(e.target.value)}
                className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm"
                style={inputStyle}
              >
                <option value="">{t.newTemplatePositionAny}</option>
                {source.jobPositions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.contractTemplateForPositionHelp}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {saving ? t.saving : t.save}
          </button>
        </div>
      </form>
    </Modal>
  )
}
