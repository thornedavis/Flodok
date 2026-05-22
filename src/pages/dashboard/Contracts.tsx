import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts, type EmpDeptShape } from '../../lib/employee'
import { bucketReferenceValues, referenceNames } from '../../lib/companyReference'
import { FilterPill, FilterPanel, FilterSearchInput } from '../../components/FilterControls'
import type { FilterPanelSection } from '../../components/FilterControls'
import { DocumentCardGridSkeleton } from '../../components/Skeleton'
import { useBilling } from '../../contexts/BillingContext'
import { documentEditPath, documentTemplateEditPath, documentsIndexPath } from '../../lib/documentTypes'
import { docAsJson, emptyDocumentDoc } from '../../lib/documentDoc'
import { buildPkwtStarterDoc } from '../../lib/pkwtStarterDoc'
import type { User, Contract, Employee, Tag, DocumentTemplate } from '../../types/aliases'

type ContractsView = 'contracts' | 'templates'

type EmployeeWithDepartments = Employee & EmpDeptShape

type ContractWithEmployee = Contract & { employee: EmployeeWithDepartments | null; tagIds: string[] }

const EMPLOYEE_WITH_DEPTS_SELECT =
  '*, employee_departments(is_primary, department:company_departments(id, name))'

export function Contracts({ user, embedded = false }: { user: User; embedded?: boolean }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useLang()
  const { canWrite, visibleItemLimit, state: dunning } = useBilling()
  const [contracts, setContracts] = useState<ContractWithEmployee[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set())
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
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
        supabase.from('employees').select(EMPLOYEE_WITH_DEPTS_SELECT).eq('org_id', user.org_id).order('name'),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('contract_tags').select('*'),
        supabase.from('company_reference_values').select('*').eq('org_id', user.org_id).order('display_order').order('name'),
      ])

      if (refResult.data) {
        const buckets = bucketReferenceValues(refResult.data)
        setJobPositions(referenceNames(buckets.job_position))
      }

      const empList = (empResult.data || []) as EmployeeWithDepartments[]
      const empMap = new Map(empList.map(e => [e.id, e]))

      const tagMap = new Map<string, string[]>()
      for (const ct of contractTagsResult.data || []) {
        const arr = tagMap.get(ct.contract_id) || []
        arr.push(ct.tag_id)
        tagMap.set(ct.contract_id, arr)
      }

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

  // When embedded, the Documents shell can signal "open the template picker"
  // with `?new=template`. The legacy "?new=1" path used to open a scratch
  // modal; that was removed when the Documents "Blank contract" tile
  // started inserting the row directly and routing to ContractEdit. Derive
  // open-state directly from URL (no mirroring into local state) and
  // clear the URL param in the close handler. Non-embedded mounts ignore
  // the URL signal entirely.
  const urlNewParam = embedded ? searchParams.get('new') : null
  const showPickTemplate = showPickTemplateLocal || urlNewParam === 'template'

  function clearUrlNewParam() {
    if (!urlNewParam) return
    const params = new URLSearchParams(searchParams)
    params.delete('new')
    setSearchParams(params, { replace: true })
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

  if (loading) return <DocumentCardGridSkeleton />

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
          {/* Non-embedded mode is only reached via legacy /dashboard/contracts
              deep links (the standard path redirects to /dashboard/documents).
              "New contract" routes back to the Documents tiles, which own the
              create flow now. Templates still create inline. */}
          {view === 'templates' ? (
            <button
              onClick={() => setShowCreateTemplate(true)}
              disabled={!canWrite}
              title={!canWrite ? t.dunningWriteBlocked : undefined}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t.createTemplate}
            </button>
          ) : (
            <button
              onClick={() => navigate(documentsIndexPath())}
              disabled={!canWrite}
              title={!canWrite ? t.dunningWriteBlocked : undefined}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t.createContract}
            </button>
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
