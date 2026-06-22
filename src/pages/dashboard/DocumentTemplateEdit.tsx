// Editor for contract templates living in `public.document_templates`
// (Phase G.1). A slim relative of ContractEdit: same Google Docs–style
// edit shell and bilingual editor, minus everything that doesn't apply to
// a reusable starter — no employee link, no signing, no versioning, no
// snapshot/translation pipeline. Templates are authored bilingually
// directly in the editor (the BubbleMenu still offers per-selection
// translation), and the save path is a plain UPDATE.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DocumentEditor } from '../../components/editor/bilingual/DocumentEditor'
import { DocumentEditShell, EDITOR_STICKY_TOP_PX } from '../../components/editor/DocumentEditShell'
import { ToolbarButton } from '../../components/editor/ToolbarButton'
import { useLang } from '../../contexts/LanguageContext'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { useBreadcrumbTrailing } from '../../contexts/BreadcrumbContext'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { useBilling } from '../../contexts/BillingContext'
import { formatIdrDigits } from '../../lib/credits'
import { InfoTooltip } from '../../components/InfoTooltip'
import { AllowanceComponentsEditor, cleanCompLines, compLinesSum, type CompLine } from '../../components/AllowanceComponentsEditor'
import { templateComponents } from '../../lib/contractTemplates'
import { docAsJson, emptyDocumentDoc, type DocumentDoc, type LanguageMode } from '../../lib/documentDoc'
import { clearOffSideForMode } from '../../lib/offSide'
import { documentsIndexPath, type DocumentType } from '../../lib/documentTypes'
import type { User, DocumentTemplate, Organization } from '../../types/aliases'
import type { Json } from '../../types/database'

// Per-type accent for the top-bar icon chip, matching the document card
// colour language (SOPs=primary, contracts=success, JDs=warning).
// Neutral grey accent for the (non-clickable) type label — see Documents.tsx typeColors.
const TYPE_ACCENT: Record<DocumentType, string> = {
  sop: 'var(--color-text-secondary)',
  contract: 'var(--color-text-secondary)',
  job_description: 'var(--color-text-secondary)',
  letter: 'var(--color-text-secondary)',
  nda: 'var(--color-text-secondary)',
}

// Templates can be any document type; map the stored `type` string to the
// Documents index tab to return to on cancel/save.
function indexTypeFor(type: string): DocumentType {
  return type === 'sop' ? 'sop'
    : type === 'job_description' ? 'job_description'
    : type === 'letter' ? 'letter'
    : type === 'nda' ? 'nda'
    : 'contract'
}

function TemplateTypeIcon({ type }: { type: DocumentType }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (type === 'sop') {
    return (
      <svg {...common}>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
      </svg>
    )
  }
  if (type === 'job_description') {
    return (
      <svg {...common}>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    )
  }
  if (type === 'letter') {
    return (
      <svg {...common}>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-10 5L2 7" />
      </svg>
    )
  }
  if (type === 'nda') {
    // Reuse the contract glyph — file with a signature scribble.
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M7 16q2-3 4 0t4 0" />
      </svg>
    )
  }
  // Contract — file with a signature scribble.
  return (
    <svg {...common}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M7 16q2-3 4 0t4 0" />
    </svg>
  )
}

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
  const [components, setComponents] = useState<CompLine[]>([])
  const [savedComponents, setSavedComponents] = useState<CompLine[]>([])
  const [hoursPerDay, setHoursPerDay] = useState('')
  const [daysPerWeek, setDaysPerWeek] = useState('')
  const [contentDoc, setContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [savedContentDoc, setSavedContentDoc] = useState<DocumentDoc>(() => emptyDocumentDoc())
  const [languageMode, setLanguageMode] = useState<LanguageMode>('bilingual')
  const [savedLanguageMode, setSavedLanguageMode] = useState<LanguageMode>('bilingual')
  const [jobPositions, setJobPositions] = useState<string[]>([])
  const [view, setView] = useState<'stacked' | 'side_by_side'>('side_by_side')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useBreadcrumbTrailing(title.trim() || null)

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
        // Prefer the itemised breakdown; fall back to a single line from the
        // legacy allowance total for templates created before the split.
        const loadedComps = templateComponents(tplResult.data)
        const compLines: CompLine[] = loadedComps.length > 0
          ? loadedComps.map(c => ({ key: crypto.randomUUID(), name: c.name, amount: String(c.amount_idr), isFixed: c.is_fixed }))
          : (tplResult.data.allowance_idr != null
              ? [{ key: crypto.randomUUID(), name: 'Tunjangan', amount: String(tplResult.data.allowance_idr), isFixed: false }]
              : [])
        setComponents(compLines)
        setSavedComponents(compLines)
        setHoursPerDay(tplResult.data.hours_per_day?.toString() ?? '')
        setDaysPerWeek(tplResult.data.days_per_week?.toString() ?? '')
        const doc = (tplResult.data.content_doc as DocumentDoc | null) ?? emptyDocumentDoc()
        setContentDoc(doc)
        setSavedContentDoc(doc)
        const mode = (tplResult.data as { language_mode?: LanguageMode }).language_mode ?? 'bilingual'
        setLanguageMode(mode)
        setSavedLanguageMode(mode)
      }
    }
    load()
  }, [id, user.org_id])

  const parsedBaseWage = baseWageIdr.trim() === '' ? null : Number(baseWageIdr)
  // Derived allowance total = sum of the earning components (null when none).
  const nonBlankComponents = components.filter(c => c.name.trim() !== '' || c.amount.trim() !== '')
  const parsedAllowance = nonBlankComponents.length === 0 ? null : compLinesSum(nonBlankComponents)
  const parsedHoursPerDay = hoursPerDay.trim() === '' ? null : Number(hoursPerDay)
  const parsedDaysPerWeek = daysPerWeek.trim() === '' ? null : Number(daysPerWeek)

  const componentsChanged = (() => {
    const norm = (list: CompLine[]) => list.map(c => ({ n: c.name.trim(), a: c.amount.trim(), f: c.isFixed }))
    return JSON.stringify(norm(components)) !== JSON.stringify(norm(savedComponents))
  })()

  const docChanged = JSON.stringify(contentDoc) !== JSON.stringify(savedContentDoc)
  const modeChanged = languageMode !== savedLanguageMode
  const hasChanges = template ? (
    docChanged ||
    modeChanged ||
    title !== template.title ||
    (position || null) !== template.template_for_position ||
    parsedBaseWage !== template.base_wage_idr ||
    componentsChanged ||
    parsedHoursPerDay !== template.hours_per_day ||
    parsedDaysPerWeek !== template.days_per_week
  ) : false

  const bypassUnsavedWarning = useUnsavedChangesWarning(hasChanges, t.unsavedChangesPrompt)

  async function handleSave() {
    if (!template || saving) return
    setError('')
    setSaving(true)
    const cleaned = cleanCompLines(components)
    const compsJson = cleaned.length > 0
      ? cleaned.map((c, i) => ({ name: c.name, kind: 'earning', is_fixed: c.isFixed, amount_idr: Number(c.amount) || 0, display_order: i }))
      : null
    // Monolingual templates clear the off-side so a later instantiation (and
    // the bilingual PDF/portal render) doesn't carry a stale or blank second
    // column. Bilingual templates pass through untouched. We persist — and
    // baseline the dirty-tracking against — this same cleared doc.
    const persistedDoc = clearOffSideForMode(contentDoc, languageMode)
    const { data, error: updateError } = await supabase
      .from('document_templates')
      .update({
        title,
        template_for_position: position || null,
        base_wage_idr: parsedBaseWage,
        allowance_idr: parsedAllowance,
        compensation_components: compsJson as unknown as Json,
        hours_per_day: parsedHoursPerDay,
        days_per_week: parsedDaysPerWeek,
        content_doc: docAsJson(persistedDoc),
        updated_at: new Date().toISOString(),
      })
      .eq('id', template.id)
      .select()
      .single()
    // Persist language_mode separately — it isn't in the generated database.ts
    // types yet, so it can't ride along in the typed update above.
    if (!updateError && data && modeChanged) {
      const { error: modeErr } = await supabase
        .from('document_templates')
        .update({ language_mode: languageMode } as never)
        .eq('id', template.id)
      if (modeErr) console.warn('Failed to persist template language_mode:', modeErr.message)
    }
    setSaving(false)
    if (updateError || !data) {
      setError(updateError?.message || 'Could not save template.')
      return
    }
    setTemplate(data)
    setSavedContentDoc(persistedDoc)
    setSavedLanguageMode(languageMode)
    bypassUnsavedWarning()
    navigate(documentsIndexPath(indexTypeFor(data.type)))
  }

  if (!template) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties
  // Type-aware bits — the template can be for any document type now. Wage /
  // hours fields only make sense for contracts; the others (title, position)
  // work for SOPs + JDs too.
  const type = template.type as DocumentType
  const isContractTemplate = type === 'contract'
  const indexType = indexTypeFor(template.type)
  const badgeLabel = isContractTemplate
    ? t.contractTemplateBadge
    : type === 'job_description'
      ? t.jdTemplateBadge
      : t.sopTemplateBadge

  const badge = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}
    >
      {badgeLabel}
    </span>
  )

  const actions = (
    /* Cancel is provided by DocumentEditShell (backTo); don't duplicate it here. */
    <ToolbarButton
      variant="primary"
      onClick={handleSave}
      disabled={saving || !canWrite || !hasChanges}
      title={!canWrite ? t.dunningWriteBlocked : undefined}
      loading={saving}
    >
      {saving ? t.saving : t.saveTemplate}
    </ToolbarButton>
  )

  const sidebar = (
    <>
      {/* Title lives in the page top bar as an inline-editable heading
          (click-to-rename, Google Docs style); it's not duplicated here. */}

      {/* For-position */}
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t.contractTemplateForPositionLabel}</label>
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

      {isContractTemplate && (
        <>
          {/* Base wage */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
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

          {/* Allowances — itemised components (pre-seed for new contracts) */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.allowancesLabel}
              <InfoTooltip text={t.allowancesHelp} />
            </label>
            <AllowanceComponentsEditor components={components} onChange={setComponents} />
          </div>

          {/* Hours + days side-by-side */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.hoursPerDayLabel}
                <InfoTooltip text={t.hoursPerDayHelp} />
              </label>
              <select
                value={hoursPerDay}
                onChange={e => setHoursPerDay(e.target.value)}
                className="w-full rounded-lg border px-2 py-2 text-sm"
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
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                {t.daysPerWeekLabel}
                <InfoTooltip text={t.daysPerWeekHelp} />
              </label>
              <select
                value={daysPerWeek}
                onChange={e => setDaysPerWeek(e.target.value)}
                className="w-full rounded-lg border px-2 py-2 text-sm"
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
        </>
      )}
    </>
  )

  return (
    <DocumentEditShell
      storageKey="templateEdit"
      icon={<TemplateTypeIcon type={type} />}
      accent={TYPE_ACCENT[type] ?? 'var(--color-text-secondary)'}
      typeLabel={t.documentTypeTemplateSuffix(
        type === 'sop' ? t.documentTypeSop
          : type === 'job_description' ? t.documentTypeJobDescription
          : type === 'letter' ? t.letterTypeLabel
          : type === 'nda' ? t.documentTypeNda
          : t.documentTypeContract,
      )}
      title={title}
      onTitleChange={setTitle}
      canEditTitle={canWrite}
      badge={badge}
      backTo={documentsIndexPath(indexType)}
      dirty={hasChanges}
      actions={actions}
      error={error}
      sidebar={sidebar}
      outlineDoc={contentDoc}
    >
      {/* Templates are authored bilingually — both EN and ID side by side.
          No auto-translation on save: the snapshot helper that powers
          contract translation only knows about the `contracts` table.
          Per-selection translation via the editor's BubbleMenu still works. */}
      <DocumentEditor
        initialDoc={contentDoc}
        onChange={setContentDoc}
        view={view}
        onViewChange={setView}
        languageMode={languageMode}
        onLanguageModeChange={setLanguageMode}
        stickyToolbar
        stickyToolbarOffset={`${EDITOR_STICKY_TOP_PX}px`}
        mergeFields={{
          scope: type === 'contract' ? 'contract' : type === 'nda' ? 'nda' : type === 'letter' ? 'letter' : 'sop',
          getContext: () => ({
            employee: null,
            organization,
            contract: null,
            today: new Date(),
            lang: 'en',
            signer: { name: user.name, title: user.title },
          }),
        }}
        aiGenerate={{ docType: type === 'contract' || type === 'nda' ? 'contract' : type === 'job_description' ? 'job_description' : 'sop', title }}
      />
    </DocumentEditShell>
  )
}
