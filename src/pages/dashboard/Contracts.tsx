import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts, primaryDept } from '../../lib/employee'
import { formatIdrDigits as formatCurrency } from '../../lib/credits'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { InfoTooltip } from '../../components/InfoTooltip'
import { FilterPill, FilterPanel, FilterSearchInput } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { DateTimePicker } from '../../components/DateTimePicker'
import { useBilling } from '../../contexts/BillingContext'
import { documentEditPath, documentTemplateEditPath } from '../../lib/documentTypes'
import { docAsJson, emptyDocumentDoc } from '../../lib/documentDoc'
import { buildPkwtStarterDoc } from '../../lib/pkwtStarterDoc'
import type { User, Contract, Employee, Tag, DocumentTemplate } from '../../types/aliases'

type ContractsView = 'contracts' | 'templates'

type ContractWithEmployee = Contract & { employee: Employee | null; tagIds: string[] }

export function Contracts({ user, embedded = false }: { user: User; embedded?: boolean }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useLang()
  const { canWrite, visibleItemLimit, state: dunning } = useBilling()
  const [contracts, setContracts] = useState<ContractWithEmployee[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set())
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [showCreateModalLocal, setShowCreateModalLocal] = useState(false)
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [showPickTemplateLocal, setShowPickTemplateLocal] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'last_edited' | 'newest' | 'oldest'>('last_edited')
  const [view, setView] = useState<ContractsView>('contracts')
  const [jobPositions, setJobPositions] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const [contractResult, templateResult, empResult, tagsResult, contractTagsResult, refResult] = await Promise.all([
        // Real contracts only — templates live in `document_templates`
        // since Phase G.1. The legacy `is_template = true` rows are
        // ignored here so they don't double-count during the rollout
        // window (those rows get cleaned up in a later migration).
        supabase.from('contracts').select('*').eq('org_id', user.org_id).eq('is_template', false).order('updated_at', { ascending: false }),
        supabase.from('document_templates').select('*').eq('org_id', user.org_id).eq('type', 'contract').order('updated_at', { ascending: false }),
        supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('contract_tags').select('*'),
        supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
      ])

      if (refResult.data) {
        const buckets = bucketReferenceValues(refResult.data)
        setJobPositions(referenceNames(buckets.job_position))
      }

      const empMap = new Map((empResult.data || []).map(e => [e.id, e]))

      const tagMap = new Map<string, string[]>()
      for (const ct of contractTagsResult.data || []) {
        const arr = tagMap.get(ct.contract_id) || []
        arr.push(ct.tag_id)
        tagMap.set(ct.contract_id, arr)
      }

      setEmployees(empResult.data || [])
      setContracts((contractResult.data || []).map(c => ({
        ...c,
        employee: c.employee_id ? empMap.get(c.employee_id) || null : null,
        tagIds: tagMap.get(c.id) || [],
      })))
      setTemplates(templateResult.data || [])
      setAllTags(tagsResult.data || [])
      setLoading(false)
    }
    load()
  }, [user.org_id])

  // When embedded, the Documents shell can signal "open the create-from-
  // scratch modal" with `?new=1` or "open the template picker" with
  // `?new=template`. Derive open-state directly from URL (no mirroring
  // into local state) and clear the URL param in the close handler.
  // Non-embedded mounts ignore the URL signal entirely.
  const urlNewParam = embedded ? searchParams.get('new') : null
  const showCreateModal = showCreateModalLocal || urlNewParam === '1'
  const showPickTemplate = showPickTemplateLocal || urlNewParam === 'template'

  function clearUrlNewParam() {
    if (!urlNewParam) return
    const params = new URLSearchParams(searchParams)
    params.delete('new')
    setSearchParams(params, { replace: true })
  }

  function closeCreateModal() {
    setShowCreateModalLocal(false)
    if (urlNewParam === '1') clearUrlNewParam()
  }

  function closePickTemplate() {
    setShowPickTemplateLocal(false)
    if (urlNewParam === 'template') clearUrlNewParam()
  }

  const departments = [...new Set(contracts.flatMap(c => c.employee ? getEmployeeDepts(c.employee) : []))].sort()

  function getDepartmentCount(dept: string) {
    return contracts.filter(c => c.employee && getEmployeeDepts(c.employee).includes(dept)).length
  }

  function getStatusCount(status: string) {
    return contracts.filter(c => c.status === status).length
  }

  function toggleStatus(status: string) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status); else next.add(status)
      return next
    })
  }

  function getTagCount(tagId: string) {
    return contracts.filter(c => c.tagIds.includes(tagId)).length
  }

  const tagNameMap = new Map(allTags.map(t => [t.id, t]))

  const filteredContracts = contracts
    .filter(c => {
      const empDepts = c.employee ? getEmployeeDepts(c.employee) : []
      const matchesDept = activeDepartments.size === 0 || empDepts.some(d => activeDepartments.has(d))
      const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(c.status)
      const matchesTags = activeTags.size === 0 || c.tagIds.some(tid => activeTags.has(tid))
      const q = searchQuery.trim().toLowerCase()
      const matchesSearch = !q ||
        c.title.toLowerCase().includes(q) ||
        c.employee?.name.toLowerCase().includes(q) ||
        empDepts.some(d => d.toLowerCase().includes(q))
      return matchesDept && matchesStatus && matchesTags && matchesSearch
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'newest') return b.created_at.localeCompare(a.created_at)
      if (sortBy === 'oldest') return a.created_at.localeCompare(b.created_at)
      return (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)
    })

  const filteredTemplates = templates
    .filter(tpl => {
      const q = searchQuery.trim().toLowerCase()
      return !q ||
        tpl.title.toLowerCase().includes(q) ||
        (tpl.template_for_position || '').toLowerCase().includes(q)
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'newest') return b.created_at.localeCompare(a.created_at)
      if (sortBy === 'oldest') return a.created_at.localeCompare(b.created_at)
      return (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)
    })

  const visibleFilteredContracts = visibleItemLimit !== null ? filteredContracts.slice(0, visibleItemLimit) : filteredContracts
  const hiddenCount = filteredContracts.length - visibleFilteredContracts.length

  async function handleCreateFromTemplate(template: DocumentTemplate) {
    if (!canWrite) return
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        org_id: user.org_id,
        employee_id: null,
        title: template.title,
        content_doc: template.content_doc ?? docAsJson(emptyDocumentDoc()),
        base_wage_idr: template.base_wage_idr,
        allowance_idr: template.allowance_idr,
        hours_per_day: template.hours_per_day,
        days_per_week: template.days_per_week,
        status: 'draft' as const,
        is_template: false,
      })
      .select()
      .single()
    if (error) { alert(error.message); return }
    if (data) navigate(documentEditPath('contract', data.id))
  }

  async function handleDuplicate(contract: ContractWithEmployee) {
    if (!canWrite) return
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        org_id: user.org_id,
        employee_id: contract.employee_id,
        title: t.copyOfName(contract.title),
        content_doc: contract.content_doc ?? docAsJson(emptyDocumentDoc()),
        status: 'draft' as const,
      })
      .select()
      .single()

    if (error) { alert(error.message); return }
    if (data) navigate(documentEditPath('contract', data.id))
  }

  async function handleDelete(contract: ContractWithEmployee) {
    if (!canWrite) return
    if (!confirm(t.deleteContractConfirm(contract.title))) return
    const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
    if (error) { alert(error.message); return }
    setContracts(prev => prev.filter(c => c.id !== contract.id))
    setMenuOpenId(null)
  }

  async function handleDeleteTemplate(template: DocumentTemplate) {
    if (!canWrite) return
    if (!confirm(t.deleteContractConfirm(template.title))) return
    const { error } = await supabase.from('document_templates').delete().eq('id', template.id)
    if (error) { alert(error.message); return }
    setTemplates(prev => prev.filter(t => t.id !== template.id))
    setMenuOpenId(null)
  }

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  const statusLabels: Record<string, string> = {
    active: t.statusActive,
    draft: t.statusDraft,
    archived: t.statusArchived,
  }

  const departmentOptions = departments.map(d => ({ id: d, label: d, count: getDepartmentCount(d) }))
  const tagOptions = allTags.map(tg => ({ id: tg.id, label: tg.name, count: getTagCount(tg.id) }))

  const filterSections: FilterPanelSection[] = [
    ...(departments.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'departments',
      label: t.departments,
      value: [...activeDepartments],
      options: departmentOptions,
      onChange: (next: string[]) => setActiveDepartments(new Set(next)),
      headerAction: { label: t.hiringFieldManage, onClick: () => navigate('/dashboard/company?tab=structure') },
    }] : []),
    ...(allTags.length > 0 ? [{
      type: 'multiselect' as const,
      key: 'tags',
      label: t.tagsLabel,
      value: [...activeTags],
      options: tagOptions,
      onChange: (next: string[]) => setActiveTags(new Set(next)),
    }] : []),
    {
      type: 'select' as const,
      key: 'sort',
      label: t.sortLabel,
      value: sortBy,
      defaultValue: 'last_edited',
      options: [
        { id: 'last_edited', label: t.sortLastEdited },
        { id: 'newest', label: t.sortNewest },
        { id: 'oldest', label: t.sortOldest },
      ],
      onChange: (next: string) => setSortBy(next as typeof sortBy),
    },
  ]

  return (
    <div>
      {!embedded && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.contractsTitle}</h1>
          {view === 'templates' || templates.length === 0 ? (
            <button
              onClick={() => view === 'templates' ? setShowCreateTemplate(true) : setShowCreateModalLocal(true)}
              disabled={!canWrite}
              title={!canWrite ? t.dunningWriteBlocked : undefined}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {view === 'templates' ? t.createTemplate : t.createContract}
            </button>
          ) : (
            <CreateContractButton
              disabled={!canWrite}
              disabledTitle={!canWrite ? t.dunningWriteBlocked : undefined}
              onFromScratch={() => setShowCreateModalLocal(true)}
              onFromTemplate={() => setShowPickTemplateLocal(true)}
            />
          )}
        </div>
      )}

      {/* Embedded mode: the parent Documents shell owns the global "New
          Document" menu, so we suppress the page-level Create button for
          regular contracts. The Templates sub-view, however, is the only
          place that can create a new template — keep its Create Template
          button visible there until templates get their own dedicated
          surface in Phase G. */}
      {embedded && view === 'templates' && (
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setShowCreateTemplate(true)}
            disabled={!canWrite}
            title={!canWrite ? t.dunningWriteBlocked : undefined}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t.createTemplate}
          </button>
        </div>
      )}

      <div className="mb-5 flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <ViewTab active={view === 'contracts'} onClick={() => setView('contracts')}>
          {t.contractsTabContracts}
          <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{contracts.length}</span>
        </ViewTab>
        <ViewTab active={view === 'templates'} onClick={() => setView('templates')}>
          {t.contractsTabTemplates}
          <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{templates.length}</span>
        </ViewTab>
      </div>

      {hiddenCount > 0 && dunning === 'free_frozen' && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
        >
          {t.dunningHiddenItemsNotice.replace('{count}', String(hiddenCount))}
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {view === 'contracts' && (
          <>
            <FilterPill
              active={activeStatuses.size === 0}
              onClick={() => setActiveStatuses(new Set())}
              count={contracts.length}
            >
              {t.filterAll}
            </FilterPill>
            {(['active', 'draft', 'archived'] as const).map(status => (
              <FilterPill
                key={status}
                active={activeStatuses.has(status)}
                onClick={() => toggleStatus(status)}
                count={getStatusCount(status)}
              >
                {statusLabels[status]}
              </FilterPill>
            ))}
          </>
        )}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <FilterSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t.searchContractsPlaceholder}
            />
          </div>
          <FilterPanel
            triggerLabel={t.filterButtonLabel}
            sections={filterSections}
            onReset={() => {
              setActiveDepartments(new Set())
              setActiveTags(new Set())
              setSortBy('last_edited')
            }}
          />
        </div>
      </div>

      <div>
        {view === 'templates' ? (
          filteredTemplates.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {templates.length === 0 ? t.noTemplatesYet : t.noContractsMatchFilters}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map(template => (
                <div
                  key={template.id}
                  className="group relative cursor-pointer rounded-xl border p-5 transition-all"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                  onClick={() => navigate(documentTemplateEditPath(template.id))}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  <div className="absolute right-3 top-3">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === template.id ? null : template.id) }}
                      className="rounded-md p-1 opacity-0 transition-all group-hover:opacity-100"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                      onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                    {menuOpenId === template.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpenId(null) }} />
                        <div
                          className="absolute right-0 z-20 mt-1 w-56 rounded-lg border py-1 shadow-lg"
                          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); setMenuOpenId(null); handleCreateFromTemplate(template) }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                            style={{ color: 'var(--color-text)' }}
                            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="12" y1="18" x2="12" y2="12" />
                              <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                            {t.createContractFromThis}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteTemplate(template) }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                            style={{ color: 'var(--color-danger)' }}
                            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            {t.delete}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mb-3 flex flex-wrap gap-1">
                    <span
                      className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', color: 'var(--color-primary)' }}
                    >
                      {t.contractTemplateBadge}
                    </span>
                    {template.template_for_position && (
                      <span
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                      >
                        {template.template_for_position}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
                    {template.title}
                  </h3>

                  {!template.template_for_position && (
                    <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                      {t.contractTemplateUnused}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    <span>{new Date(template.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : visibleFilteredContracts.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {contracts.length === 0 ? t.noContractsYet : t.noContractsMatchFilters}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFilteredContracts.map(contract => (
              <div
                key={contract.id}
                className="group relative cursor-pointer rounded-xl border p-5 transition-all"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                onClick={() => navigate(documentEditPath('contract', contract.id))}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                {/* Three-dot menu */}
                <div className="absolute right-3 top-3">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === contract.id ? null : contract.id) }}
                    className="rounded-md p-1 opacity-0 transition-all group-hover:opacity-100"
                    style={{ color: 'var(--color-text-tertiary)' }}
                    onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="12" cy="19" r="2" />
                    </svg>
                  </button>

                  {menuOpenId === contract.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpenId(null) }} />
                      <div
                        className="absolute right-0 z-20 mt-1 w-56 rounded-lg border py-1 shadow-lg"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); handleDuplicate(contract) }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                          style={{ color: 'var(--color-text)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          {t.duplicate}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(contract) }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                          style={{ color: 'var(--color-danger)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                          {t.delete}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {contract.employee && getEmployeeDepts(contract.employee).length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {getEmployeeDepts(contract.employee).map(d => (
                      <span
                        key={d}
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}

                <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
                  {contract.title}
                </h3>

                {contract.employee && (
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {contract.employee.name}
                  </p>
                )}

                {contract.tagIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {contract.tagIds.map(tid => {
                      const tag = tagNameMap.get(tid)
                      if (!tag) return null
                      return (
                        <span
                          key={tid}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                        >
                          {tag.name}
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span className="inline-flex items-center gap-1" style={{ color: statusColors[contract.status] }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[contract.status] }} />
                    {statusLabels[contract.status] || contract.status}
                  </span>
                  <span>&middot;</span>
                  <span>v{contract.current_version}</span>
                  <span>&middot;</span>
                  <span>{new Date(contract.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateContractModal
          orgId={user.org_id}
          employees={employees}
          onClose={closeCreateModal}
          onCreated={(id) => navigate(documentEditPath('contract', id))}
        />
      )}

      {showCreateTemplate && (
        <NewTemplateModal
          orgId={user.org_id}
          jobPositions={jobPositions}
          onClose={() => setShowCreateTemplate(false)}
          onCreated={(id) => navigate(documentTemplateEditPath(id))}
          onManagePositions={() => { setShowCreateTemplate(false); navigate('/dashboard/company?tab=structure') }}
        />
      )}

      {showPickTemplate && (
        <PickTemplateModal
          templates={templates}
          onClose={closePickTemplate}
          onPick={(tpl) => { closePickTemplate(); handleCreateFromTemplate(tpl) }}
        />
      )}
    </div>
  )
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative px-4 py-2 text-sm font-medium transition-colors"
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
    >
      {children}
      {active && <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />}
    </button>
  )
}

function NewTemplateModal({ orgId, jobPositions, onClose, onCreated, onManagePositions }: {
  orgId: string
  jobPositions: string[]
  onClose: () => void
  onCreated: (id: string) => void
  onManagePositions: () => void
}) {
  const { t } = useLang()
  const [title, setTitle] = useState('')
  const [position, setPosition] = useState('')
  // Phase G.2: starter picker. 'blank' keeps the previous behaviour
  // (empty doc); 'pkwt' / 'pkwtt' seed the template with the bilingual
  // PKWT / PKWTT structured starter so users have a real working
  // contract to customise.
  const [starter, setStarter] = useState<'blank' | 'pkwt' | 'pkwtt'>('pkwt')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    setError('')
    const doc = starter === 'blank' ? emptyDocumentDoc() : buildPkwtStarterDoc(starter)
    const { data, error: insertError } = await supabase
      .from('document_templates')
      .insert({
        org_id: orgId,
        type: 'contract',
        title: title.trim(),
        content_doc: docAsJson(doc),
        template_for_position: position || null,
      })
      .select()
      .single()
    setSaving(false)
    if (insertError || !data) {
      setError(insertError?.message || 'Could not create template.')
      return
    }
    onCreated(data.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border p-5 shadow-xl"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.newTemplateTitle}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.contractsTabTemplates}<span style={{ color: 'var(--color-danger)' }}> *</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              required
              placeholder={t.newTemplateTitlePlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.newTemplatePositionLabel}</label>
              <button
                type="button"
                onClick={onManagePositions}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--color-primary)' }}
              >
                {t.hiringFieldManage} →
              </button>
            </div>
            <select
              value={position}
              onChange={e => setPosition(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="">{t.newTemplatePositionAny}</option>
              {jobPositions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.contractTemplateForPositionHelp}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.newTemplateStarterLabel}</label>
            <div className="grid grid-cols-3 gap-2">
              {(['pkwt', 'pkwtt', 'blank'] as const).map(opt => {
                const isSelected = starter === opt
                const label = opt === 'pkwt' ? t.contractTypeFixedTerm
                  : opt === 'pkwtt' ? t.contractTypePermanent
                  : t.newTemplateStarterBlank
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStarter(opt)}
                    className="rounded-lg border px-3 py-2 text-xs font-medium transition-all"
                    style={{
                      borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.newTemplateStarterHelp}</p>
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              {t.cancel}
            </button>
            <button type="submit" disabled={!title.trim() || saving} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {saving ? t.saving : t.add}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type ContractType = 'pkwt' | 'pkwtt'


function CreateContractModal({ orgId, employees, onClose, onCreated }: {
  orgId: string
  employees: Employee[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useLang()
  const contractTypeInfo: Record<ContractType, { label: string; description: string }> = {
    pkwt: { label: t.contractTypeFixedTerm, description: t.contractTypePkwtDesc },
    pkwtt: { label: t.contractTypePermanent, description: t.contractTypePkwttDesc },
  }
  const [title, setTitle] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [empOpen, setEmpOpen] = useState(false)
  const empWrapRef = useRef<HTMLDivElement>(null)
  const [contractType, setContractType] = useState<ContractType>('pkwt')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Quick-fill fields
  const [ktpNumber, setKtpNumber] = useState('')
  const [employeeAddress, setEmployeeAddress] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [probationMonths, setProbationMonths] = useState('3')
  const [baseSalary, setBaseSalary] = useState('')
  const [allowance, setAllowance] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [daysPerWeek, setDaysPerWeek] = useState('6')
  const [annualLeave, setAnnualLeave] = useState('12')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (!empOpen) return
    function handleClick(e: MouseEvent) {
      if (empWrapRef.current && !empWrapRef.current.contains(e.target as Node)) setEmpOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [empOpen])

  const filteredEmployees = empSearch.trim()
    ? employees.filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()) || getEmployeeDepts(e).some(d => d.toLowerCase().includes(empSearch.toLowerCase())))
    : employees

  const selectedEmployee = employees.find(e => e.id === employeeId)

  async function handleCreate() {
    if (!title.trim()) { setError(t.titleRequired); return }
    setError('')
    setCreating(true)

    const baseWageIdr = baseSalary ? Number(baseSalary) : null
    const allowanceIdr = allowance ? Number(allowance) : null
    const hoursPerDayInt = hoursPerDay ? Number(hoursPerDay) : null
    const daysPerWeekInt = daysPerWeek ? Number(daysPerWeek) : null

    // Phase G.2: new contracts land with the PKWT or PKWTT structured
    // starter so users don't begin from a blank canvas. Merge fields
    // inside the starter (base_wage_idr, start_date, etc.) resolve at
    // view time from the row columns set below.
    const starterDoc = buildPkwtStarterDoc(contractType)
    const { data, error: insertError } = await supabase
      .from('contracts')
      .insert({
        org_id: orgId,
        employee_id: employeeId || null,
        title: title.trim(),
        content_doc: docAsJson(starterDoc),
        status: 'draft' as const,
        base_wage_idr: baseWageIdr,
        allowance_idr: allowanceIdr,
        hours_per_day: hoursPerDayInt,
        days_per_week: daysPerWeekInt,
        start_date: startDate || null,
        // PKWTT (permanent) contracts have no end date.
        end_date: contractType === 'pkwt' ? (endDate || null) : null,
      })
      .select()
      .single()

    if (insertError) { setError(insertError.message); setCreating(false); return }
    onCreated(data.id)
  }

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors" style={{ color: 'var(--color-text-tertiary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="mb-5 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.createContract}</h2>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>{error}</div>
          )}

          {/* Contract Type Toggle */}
          <div>
            <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contractTypeLabel}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['pkwt', 'pkwtt'] as const).map(type => {
                const isSelected = contractType === type
                const info = contractTypeInfo[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setContractType(type)}
                    className="relative rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-all"
                    style={{
                      borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                    }}
                  >
                    <span className="flex items-center">
                      {info.label}
                      <InfoTooltip text={info.description} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.titleLabel}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={t.contractTitlePlaceholder} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} autoFocus />
          </div>

          {/* Employee */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.employeeLabel} <span className="font-normal" style={{ color: 'var(--color-text-tertiary)' }}>{t.optional}</span>
            </label>
            {selectedEmployee ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{selectedEmployee.name}</span>
                  {primaryDept(selectedEmployee) && <span className="ml-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{primaryDept(selectedEmployee)}</span>}
                </div>
                <button type="button" onClick={() => { setEmployeeId(''); setKtpNumber(''); setEmployeeAddress('') }} className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.clear}</button>
              </div>
            ) : (
              <div ref={empWrapRef} className="relative">
                <input
                  type="text"
                  value={empSearch}
                  onChange={e => { setEmpSearch(e.target.value); setEmpOpen(true) }}
                  onFocus={() => setEmpOpen(true)}
                  onKeyDown={e => { if (e.key === 'Escape' && empOpen) { e.stopPropagation(); setEmpOpen(false); (e.target as HTMLInputElement).blur() } }}
                  placeholder={t.searchEmployeesPlaceholder}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
                {empOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                    {filteredEmployees.length === 0 ? (
                      <p className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.noMatches}</p>
                    ) : (
                      filteredEmployees.map(emp => (
                        <button key={emp.id} type="button" onClick={() => { setEmployeeId(emp.id); setEmpSearch(''); setEmpOpen(false); if (emp.ktp_nik) setKtpNumber(emp.ktp_nik); if (emp.address) setEmployeeAddress(emp.address) }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors" style={{ color: 'var(--color-text)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <span>{emp.name}</span>
                          {primaryDept(emp) && <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{primaryDept(emp)}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick-fill fields */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="mb-3 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.contractDetails}
              <span className="ml-2 font-normal text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.allFieldsEditableLater}</span>
            </h3>

            <div className="space-y-3">
              {/* Employee details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.ktpNikNumberLabel}</label>
                  <input type="text" value={ktpNumber} onChange={e => setKtpNumber(e.target.value)} placeholder="3171..." className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.workLocationLabel}</label>
                  <input type="text" value={workLocation} onChange={e => setWorkLocation(e.target.value)} placeholder={t.workLocationPlaceholder} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.employeeAddressLabel}</label>
                <input type="text" value={employeeAddress} onChange={e => setEmployeeAddress(e.target.value)} placeholder={t.fullAddressPlaceholder} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle} />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.startDateLabel}</label>
                  <DateTimePicker mode="date" value={startDate} onChange={setStartDate} />
                </div>
                {contractType === 'pkwt' ? (
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.endDateLabel}</label>
                    <DateTimePicker mode="date" value={endDate} onChange={setEndDate} />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.probationMonthsLabel}</label>
                    <select value={probationMonths} onChange={e => setProbationMonths(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                      <option value="1">{t.monthOption(1)}</option>
                      <option value="2">{t.monthOption(2)}</option>
                      <option value="3">{t.monthOption(3)}</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Compensation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.baseWageLabel}
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>{t.perMonth}</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
                    <input type="text" inputMode="numeric" value={formatCurrency(baseSalary)} onChange={e => setBaseSalary(e.target.value.replace(/\D/g, ''))}
                      placeholder="5,000,000" className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {t.allowanceLabel}
                    <span className="ml-1" style={{ color: 'var(--color-text-tertiary)' }}>{t.perMonth}</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Rp</span>
                    <input type="text" inputMode="numeric" value={formatCurrency(allowance)} onChange={e => setAllowance(e.target.value.replace(/\D/g, ''))}
                      placeholder="1,000,000" className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm" style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Working hours */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.hoursPerDayLabel}</label>
                  <select value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="7">{t.hoursOption(7)}</option>
                    <option value="8">{t.hoursOption(8)}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.daysPerWeekLabel}</label>
                  <select value={daysPerWeek} onChange={e => setDaysPerWeek(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="5">{t.daysOption(5)}</option>
                    <option value="6">{t.daysOption(6)}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.annualLeaveLabel}</label>
                  <select value={annualLeave} onChange={e => setAnnualLeave(e.target.value)} className="w-full rounded-lg border px-3 py-1.5 text-sm" style={inputStyle}>
                    <option value="12">{t.daysOption(12)}</option>
                    <option value="14">{t.daysOption(14)}</option>
                    <option value="15">{t.daysOption(15)}</option>
                    <option value="20">{t.daysOption(20)}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <button onClick={handleCreate} disabled={creating || !title.trim()} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
              {creating ? t.creating : t.createContract}
            </button>
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{t.cancel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CreateContractButton({ disabled, disabledTitle, onFromScratch, onFromTemplate }: {
  disabled: boolean
  disabledTitle?: string
  onFromScratch: () => void
  onFromTemplate: () => void
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        title={disabledTitle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <span>{t.createContract}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[200px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onFromScratch() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {t.createContractFromScratch}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onFromTemplate() }}
            className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors"
            style={{ color: 'var(--color-text)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {t.createContractFromTemplate}
          </button>
        </div>
      )}
    </div>
  )
}

function PickTemplateModal({ templates, onClose, onPick }: {
  templates: DocumentTemplate[]
  onClose: () => void
  onPick: (template: DocumentTemplate) => void
}) {
  const { t } = useLang()
  const [query, setQuery] = useState('')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? templates.filter(tpl =>
        tpl.title.toLowerCase().includes(q) ||
        (tpl.template_for_position || '').toLowerCase().includes(q)
      )
    : templates

  // Group by position. Templates with no position go in a final "Any position"
  // group so they don't disappear in the noise. Position groups are sorted
  // alphabetically; within each group, most-recently-edited first.
  const groups = new Map<string, DocumentTemplate[]>()
  for (const tpl of filtered) {
    const key = tpl.template_for_position || ''
    const arr = groups.get(key) || []
    arr.push(tpl)
    groups.set(key, arr)
  }
  const positionedKeys = [...groups.keys()].filter(k => k !== '').sort((a, b) => a.localeCompare(b))
  const orderedKeys = groups.has('') ? [...positionedKeys, ''] : positionedKeys

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border shadow-xl"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="border-b px-5 pt-5 pb-3" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="mb-3 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.pickTemplateTitle}</h2>
          {templates.length > 0 && (
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              placeholder={t.pickTemplateSearchPlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {templates.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.pickTemplateEmpty}</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.pickTemplateNoMatches}</p>
          ) : (
            <div className="space-y-4">
              {orderedKeys.map(key => {
                const items = groups.get(key) || []
                const label = key === '' ? t.pickTemplateNoPositionGroup : key
                return (
                  <div key={key || '__none__'}>
                    <div
                      className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {label}
                    </div>
                    <div className="space-y-1.5">
                      {items.map(tpl => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => onPick(tpl)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
                          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg)' }}
                        >
                          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{tpl.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
