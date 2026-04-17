import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { getEmployeeDepts, primaryDept } from '../../lib/employee'
import type { User, Sop, Employee, Tag } from '../../types/database'

type SopWithEmployee = Sop & { employee: Employee | null; tagIds: string[] }

export function SOPs({ user }: { user: User }) {
  const navigate = useNavigate()
  const { t } = useLang()
  const [sops, setSOPs] = useState<SopWithEmployee[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set())
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [sopResult, empResult, tagsResult, sopTagsResult] = await Promise.all([
        supabase.from('sops').select('*').eq('org_id', user.org_id).order('updated_at', { ascending: false }),
        supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('sop_tags').select('*'),
      ])

      const empMap = new Map((empResult.data || []).map(e => [e.id, e]))

      // Build a map of sop_id -> tag_ids
      const sopTagMap = new Map<string, string[]>()
      for (const st of sopTagsResult.data || []) {
        const arr = sopTagMap.get(st.sop_id) || []
        arr.push(st.tag_id)
        sopTagMap.set(st.sop_id, arr)
      }

      setEmployees(empResult.data || [])
      setSOPs((sopResult.data || []).map(s => ({
        ...s,
        employee: s.employee_id ? empMap.get(s.employee_id) || null : null,
        tagIds: sopTagMap.get(s.id) || [],
      })))
      setAllTags(tagsResult.data || [])
      setLoading(false)
    }
    load()
  }, [user.org_id])

  // Derive departments from employees
  const departments = [...new Set(sops.flatMap(s => s.employee ? getEmployeeDepts(s.employee) : []))].sort()

  const statuses = ['active', 'draft', 'archived'] as const

  // Count SOPs per department (from all SOPs, not filtered)
  function getDepartmentCount(dept: string) {
    return sops.filter(s => s.employee && getEmployeeDepts(s.employee).includes(dept)).length
  }

  function getStatusCount(status: string) {
    return sops.filter(s => s.status === status).length
  }

  function toggleDepartment(dept: string) {
    setActiveDepartments(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  function toggleStatus(status: string) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  function toggleTag(tagId: string) {
    setActiveTags(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  function getTagCount(tagId: string) {
    return sops.filter(s => s.tagIds.includes(tagId)).length
  }

  const tagMap = new Map(allTags.map(t => [t.id, t]))

  // Filter SOPs
  const filtered = sops.filter(s => {
    const empDepts = s.employee ? getEmployeeDepts(s.employee) : []
    const matchesDept = activeDepartments.size === 0 || empDepts.some(d => activeDepartments.has(d))
    const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(s.status)
    const matchesTags = activeTags.size === 0 || s.tagIds.some(tid => activeTags.has(tid))
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch = !q ||
      s.title.toLowerCase().includes(q) ||
      s.employee?.name.toLowerCase().includes(q) ||
      empDepts.some(d => d.toLowerCase().includes(q))
    return matchesDept && matchesStatus && matchesTags && matchesSearch
  })

  async function handleDuplicate(sop: SopWithEmployee) {
    const { data, error } = await supabase
      .from('sops')
      .insert({
        org_id: user.org_id,
        employee_id: sop.employee_id,
        title: t.copyOfName(sop.title),
        content_markdown: sop.content_markdown,
        content_markdown_id: sop.content_markdown_id,
        status: 'draft' as const,
      })
      .select()
      .single()

    if (error) { alert(error.message); return }
    if (data) navigate(`/dashboard/sops/${data.id}/edit`)
  }

  async function handleDelete(sop: SopWithEmployee) {
    if (!confirm(t.deleteSopConfirm(sop.title))) return
    const { error } = await supabase.from('sops').delete().eq('id', sop.id)
    if (error) { alert(error.message); return }
    setSOPs(prev => prev.filter(s => s.id !== sop.id))
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

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>
      {/* Main content — SOP cards grid */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.sopsTitle}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t.sopCount(filtered.length)}
            </span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {t.createSop}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {sops.length === 0
              ? t.noSopsYet
              : t.noSopsMatchFilters}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(sop => (
              <div
                key={sop.id}
                className="group relative cursor-pointer rounded-xl border p-5 transition-all"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                onClick={() => navigate(`/dashboard/sops/${sop.id}/edit`)}
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
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === sop.id ? null : sop.id) }}
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

                  {menuOpenId === sop.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setMenuOpenId(null) }} />
                      <div
                        className="absolute right-0 z-20 mt-1 w-36 rounded-lg border py-1 shadow-lg"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); handleDuplicate(sop) }}
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
                          onClick={e => { e.stopPropagation(); handleDelete(sop) }}
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

                {/* Department badges */}
                {sop.employee && getEmployeeDepts(sop.employee).length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {getEmployeeDepts(sop.employee).map(d => (
                      <span
                        key={d}
                        className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--color-bg-tertiary)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}

                <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>
                  {sop.title}
                </h3>

                {sop.employee && (
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                    {sop.employee.name}
                  </p>
                )}

                {sop.tagIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sop.tagIds.map(tid => {
                      const tag = tagMap.get(tid)
                      if (!tag) return null
                      return (
                        <span
                          key={tid}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {tag.name}
                        </span>
                      )
                    })}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: statusColors[sop.status] }}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors[sop.status] }} />
                    {statusLabels[sop.status] || sop.status}
                  </span>
                  <span>&middot;</span>
                  <span>v{sop.current_version}</span>
                  <span>&middot;</span>
                  <span>{new Date(sop.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right sidebar — filters */}
      <aside className="sticky top-20 space-y-6 lg:border-l lg:pl-6" style={{ borderColor: 'var(--color-border)' }}>
        {/* Search */}
        <div>
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.searchSopsPlaceholder}
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[var(--color-border-strong)]"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        </div>

        {/* Departments */}
        {departments.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
              {t.departments}
            </h3>
            <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.filterByTeam}
            </p>
            <div className="space-y-1">
              {departments.map(dept => {
                const isActive = activeDepartments.has(dept)
                return (
                  <button
                    key={dept}
                    onClick={() => toggleDepartment(dept)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-all"
                    style={{
                      backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                      borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                    onMouseOver={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span>{dept}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {getDepartmentCount(dept)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
            {t.statusLabel}
          </h3>
          <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.filterBySopStatus}
          </p>
          <div className="space-y-1">
            {statuses.map(status => {
              const isActive = activeStatuses.has(status)
              const count = getStatusCount(status)
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-all"
                  style={{
                    backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                    color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                    borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                  onMouseOver={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                  onMouseOut={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: statusColors[status] }} />
                    {statusLabels[status]}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
              {t.tagsLabel}
            </h3>
            <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.filterByTag}
            </p>
            <div className="space-y-1">
              {allTags.map(tag => {
                const isActive = activeTags.has(tag.id)
                const count = getTagCount(tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-all"
                    style={{
                      backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                      borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                    }}
                    onMouseOver={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                    onMouseOut={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span>{tag.name}</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Clear filters */}
        {(activeDepartments.size > 0 || activeStatuses.size > 0 || activeTags.size > 0 || searchQuery) && (
          <button
            onClick={() => {
              setActiveDepartments(new Set())
              setActiveStatuses(new Set())
              setActiveTags(new Set())
              setSearchQuery('')
            }}
            className="text-xs font-medium"
            style={{ color: 'var(--color-primary)' }}
          >
            {t.clearAllFilters}
          </button>
        )}
      </aside>

      {showCreateModal && (
        <CreateSOPModal
          orgId={user.org_id}
          employees={employees}
          onClose={() => setShowCreateModal(false)}
          onCreated={(sopId) => navigate(`/dashboard/sops/${sopId}/edit`)}
        />
      )}
    </div>
  )
}

function CreateSOPModal({ orgId, employees, onClose, onCreated }: {
  orgId: string
  employees: Employee[]
  onClose: () => void
  onCreated: (sopId: string) => void
}) {
  const { t } = useLang()
  const [title, setTitle] = useState('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [empSearch, setEmpSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const filteredEmployees = empSearch.trim()
    ? employees.filter(e =>
        e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
        getEmployeeDepts(e).some(d => d.toLowerCase().includes(empSearch.toLowerCase()))
      )
    : employees

  const selectedEmployee = employees.find(e => e.id === employeeId)

  async function handleCreate() {
    if (!title.trim()) { setError(t.titleRequired); return }
    setError('')
    setCreating(true)

    const { data, error: insertError } = await supabase
      .from('sops')
      .insert({
        org_id: orgId,
        employee_id: employeeId || null,
        title: title.trim(),
        content_markdown: '',
        status: 'draft' as const,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setCreating(false)
      return
    }

    onCreated(data.id)
  }

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 transition-colors"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="mb-5 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.createSop}</h2>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.titleLabel}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t.sopTitlePlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {t.employeeLabel} <span className="font-normal" style={{ color: 'var(--color-text-tertiary)' }}>{t.optional}</span>
            </label>

            {selectedEmployee ? (
              <div
                className="flex items-center justify-between rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
              >
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{selectedEmployee.name}</span>
                  {primaryDept(selectedEmployee) && (
                    <span className="ml-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{primaryDept(selectedEmployee)}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEmployeeId('')}
                  className="text-xs"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {t.clear}
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder={t.searchEmployeesPlaceholder}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={inputStyle}
                />
                {empSearch.trim() && (
                  <div
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-32 overflow-y-auto rounded-lg border shadow-lg"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                  >
                    {filteredEmployees.length === 0 ? (
                      <p className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.noMatches}</p>
                    ) : (
                      filteredEmployees.map(emp => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => { setEmployeeId(emp.id); setEmpSearch('') }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors"
                          style={{ color: 'var(--color-text)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          <span>{emp.name}</span>
                          {primaryDept(emp) && (
                            <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{primaryDept(emp)}</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <button
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {creating ? t.creating : t.createSop}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
