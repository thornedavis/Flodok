import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { User, Sop, Employee, Tag } from '../../types/database'

type SopWithEmployee = Sop & { employee: Employee | null; tagIds: string[] }

export function SOPs({ user }: { user: User }) {
  const [sops, setSOPs] = useState<SopWithEmployee[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDepartments, setActiveDepartments] = useState<Set<string>>(new Set())
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set())
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

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

      setSOPs((sopResult.data || []).map(s => ({
        ...s,
        employee: empMap.get(s.employee_id) || null,
        tagIds: sopTagMap.get(s.id) || [],
      })))
      setAllTags(tagsResult.data || [])
      setLoading(false)
    }
    load()
  }, [user.org_id])

  // Derive departments from employees
  const departments = [...new Set(sops.map(s => s.employee?.department).filter(Boolean) as string[])].sort()

  const statuses = ['active', 'draft', 'archived'] as const

  // Count SOPs per department (from all SOPs, not filtered)
  function getDepartmentCount(dept: string) {
    return sops.filter(s => s.employee?.department === dept).length
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
    const matchesDept = activeDepartments.size === 0 || activeDepartments.has(s.employee?.department || '')
    const matchesStatus = activeStatuses.size === 0 || activeStatuses.has(s.status)
    const matchesTags = activeTags.size === 0 || s.tagIds.some(tid => activeTags.has(tid))
    const matchesSearch = !searchQuery.trim() ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.employee?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.employee?.department?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesDept && matchesStatus && matchesTags && matchesSearch
  })

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]" style={{ alignItems: 'start' }}>
      {/* Main content — SOP cards grid */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>SOPs</h1>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {filtered.length} {filtered.length === 1 ? 'SOP' : 'SOPs'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {sops.length === 0
              ? 'No SOPs found. Add employees to get started.'
              : 'No SOPs match your filters.'}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(sop => (
              <Link
                key={sop.id}
                to={`/dashboard/sops/${sop.id}/edit`}
                className="group rounded-xl border p-5 transition-all"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                onMouseOver={e => {
                  (e.currentTarget.style.borderColor = 'var(--color-border-strong)')
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseOut={e => {
                  (e.currentTarget.style.borderColor = 'var(--color-border)')
                  e.currentTarget.style.transform = 'none'
                }}
              >
                {/* Department badge */}
                {sop.employee?.department && (
                  <span
                    className="mb-3 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    {sop.employee.department}
                  </span>
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
                    {sop.status}
                  </span>
                  <span>&middot;</span>
                  <span>v{sop.current_version}</span>
                  <span>&middot;</span>
                  <span>{new Date(sop.updated_at).toLocaleDateString()}</span>
                </div>
              </Link>
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
              placeholder="Search SOPs..."
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
              Departments
            </h3>
            <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Filter by team.
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
            Status
          </h3>
          <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            Filter by SOP status.
          </p>
          <div className="space-y-1">
            {statuses.map(status => {
              const isActive = activeStatuses.has(status)
              const count = getStatusCount(status)
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm capitalize transition-all"
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
                    {status}
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
              Tags
            </h3>
            <p className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Filter by tag.
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
            Clear all filters
          </button>
        )}
      </aside>
    </div>
  )
}
