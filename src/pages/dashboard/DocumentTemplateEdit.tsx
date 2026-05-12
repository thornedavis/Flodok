// Editor for contract templates living in `public.document_templates`
// (Phase G.1). A slim relative of ContractEdit: same bilingual editor
// and structured fields, minus everything that doesn't apply to a
// reusable starter — no employee link, no signing, no versioning, no
// snapshot/translation pipeline. Templates are authored bilingually
// directly in the editor (the BubbleMenu still offers per-selection
// translation), and the save path is a plain UPDATE.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { useLang } from '../../contexts/LanguageContext'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { useBilling } from '../../contexts/BillingContext'
import { formatIdrDigits } from '../../lib/credits'
import { InfoTooltip } from '../../components/InfoTooltip'
import { docAsJson, emptyDocumentDoc, type DocumentDoc } from '../../lib/documentDoc'
import { documentsIndexPath } from '../../lib/documentTypes'
import type { User, DocumentTemplate, Organization } from '../../types/aliases'

export function DocumentTemplateEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = useBilling()

  const [template, setTemplate] = useState<DocumentTemplate | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [title, setTitle] = useState('')
  const [position, setPosition] = useState('')
  const [baseWageIdr, setBaseWageIdr] = useState('')
  const [allowanceIdr, setAllowanceIdr] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('')
  const [daysPerWeek, setDaysPerWeek] = useState('')
  const [contentDoc, setContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [savedContentDoc, setSavedContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [jobPositions, setJobPositions] = useState<string[]>([])
  const [view, setView] = useState<'stacked' | 'side_by_side'>('side_by_side')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [tplResult, orgResult, refResult] = await Promise.all([
        supabase.from('document_templates').select('*').eq('id', id!).single(),
        supabase.from('organizations').select('*').eq('id', user.org_id).single(),
        supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
      ])
      setOrganization(orgResult.data)
      if (refResult.data) {
        const buckets = bucketReferenceValues(refResult.data)
        setJobPositions(referenceNames(buckets.job_position))
      }
      if (tplResult.data) {
        setTemplate(tplResult.data)
        setTitle(tplResult.data.title)
        setPosition(tplResult.data.template_for_position ?? '')
        setBaseWageIdr(tplResult.data.base_wage_idr?.toString() ?? '')
        setAllowanceIdr(tplResult.data.allowance_idr?.toString() ?? '')
        setHoursPerDay(tplResult.data.hours_per_day?.toString() ?? '')
        setDaysPerWeek(tplResult.data.days_per_week?.toString() ?? '')
        const doc = (tplResult.data.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
        setContentDoc(doc)
        setSavedContentDoc(doc)
      }
    }
    load()
  }, [id, user.org_id])

  const parsedBaseWage = baseWageIdr.trim() === '' ? null : Number(baseWageIdr)
  const parsedAllowance = allowanceIdr.trim() === '' ? null : Number(allowanceIdr)
  const parsedHoursPerDay = hoursPerDay.trim() === '' ? null : Number(hoursPerDay)
  const parsedDaysPerWeek = daysPerWeek.trim() === '' ? null : Number(daysPerWeek)

  const docChanged = JSON.stringify(contentDoc) !== JSON.stringify(savedContentDoc)
  const hasChanges = template ? (
    docChanged ||
    title !== template.title ||
    (position || null) !== template.template_for_position ||
    parsedBaseWage !== template.base_wage_idr ||
    parsedAllowance !== template.allowance_idr ||
    parsedHoursPerDay !== template.hours_per_day ||
    parsedDaysPerWeek !== template.days_per_week
  ) : false

  const bypassUnsavedWarning = useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

  async function handleSave() {
    if (!template || saving) return
    setError('')
    setSaving(true)
    const { data, error: updateError } = await supabase
      .from('document_templates')
      .update({
        title,
        template_for_position: position || null,
        base_wage_idr: parsedBaseWage,
        allowance_idr: parsedAllowance,
        hours_per_day: parsedHoursPerDay,
        days_per_week: parsedDaysPerWeek,
        content_doc: docAsJson(contentDoc),
        updated_at: new Date().toISOString(),
      })
      .eq('id', template.id)
      .select()
      .single()
    setSaving(false)
    if (updateError || !data) {
      setError(updateError?.message || 'Could not save template.')
      return
    }
    setTemplate(data)
    setSavedContentDoc(contentDoc)
    bypassUnsavedWarning()
    navigate(documentsIndexPath('contract'))
  }

  if (!template) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.editTemplateTitle}</h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}
          >
            {t.contractTemplateBadge}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(documentsIndexPath('contract'))} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{t.cancel}</button>
          <button
            onClick={handleSave}
            disabled={saving || !canWrite || !hasChanges}
            title={!canWrite ? t.dunningWriteBlocked : undefined}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>{t.saving}</>
            ) : t.saveTemplate}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>{error}</div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.titleLabel}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contractTemplateForPositionLabel}</label>
            <div className="relative">
              <select
                value={position}
                onChange={e => setPosition(e.target.value)}
                className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm"
                style={inputStyle}
              >
                <option value="">{t.contractTemplateNoneForPosition}</option>
                {jobPositions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.contractTemplateForPositionHelp}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.baseWageLabel}
              <InfoTooltip text={t.baseWageHelp} />
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={formatIdrDigits(baseWageIdr)}
                onChange={e => setBaseWageIdr(e.target.value.replace(/\D/g, ''))}
                placeholder={t.amountIdrPlaceholder}
                className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
                style={inputStyle}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
            </div>
          </div>
          <div>
            <label className="mb-1 flex items-center text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.allowanceLabel}
              <InfoTooltip text={t.allowanceHelp} />
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={formatIdrDigits(allowanceIdr)}
                onChange={e => setAllowanceIdr(e.target.value.replace(/\D/g, ''))}
                placeholder={t.amountIdrPlaceholder}
                className="w-full rounded-lg border px-3 py-2 pr-12 text-sm"
                style={inputStyle}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
            </div>
          </div>
          <div>
            <label className="mb-1 flex items-center text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.hoursPerDayLabel}
              <InfoTooltip text={t.hoursPerDayHelp} />
            </label>
            <select
              value={hoursPerDay}
              onChange={e => setHoursPerDay(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="6">{t.hoursOption(6)}</option>
              <option value="7">{t.hoursOption(7)}</option>
              <option value="8">{t.hoursOption(8)}</option>
              <option value="9">{t.hoursOption(9)}</option>
              <option value="10">{t.hoursOption(10)}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.daysPerWeekLabel}
              <InfoTooltip text={t.daysPerWeekHelp} />
            </label>
            <select
              value={daysPerWeek}
              onChange={e => setDaysPerWeek(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="4">{t.daysOption(4)}</option>
              <option value="5">{t.daysOption(5)}</option>
              <option value="6">{t.daysOption(6)}</option>
              <option value="7">{t.daysOption(7)}</option>
            </select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contentLabel}</label>
          </div>
          {/* Templates are authored bilingually — both EN and ID side
              by side. No auto-translation on save: the snapshot helper
              that powers contract translation only knows about the
              `contracts` table. Per-selection translation via the
              editor's BubbleMenu still works. */}
          <DocumentEditor
            initialDoc={contentDoc}
            onChange={setContentDoc}
            view={view}
            onViewChange={setView}
            mergeFields={{
              scope: 'contract',
              getContext: () => ({
                employee: null,
                organization,
                contract: null,
                today: new Date(),
                lang: 'en',
                signer: { name: user.name, title: user.title },
              }),
            }}
            aiGenerate={{ docType: 'contract', title }}
          />
        </div>
      </div>
    </div>
  )
}
