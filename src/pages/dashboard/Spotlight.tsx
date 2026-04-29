import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { formatRelativeTime } from '../../lib/relativeTime'
import { FilterPill } from '../../components/FilterControls'
import type { Lang, Translations } from '../../lib/translations'
import type { User, SpotlightPost, SpotlightStatus, SpotlightPriority } from '../../types/aliases'

type StatusFilter = 'all' | SpotlightStatus
// Single "view" enum that the dropdown drives. Each option sets both the
// priority filter and the sort order in one click. Mutually exclusive — no
// matrix of priority × sort combinations to think about.
type ViewMode = 'newest' | 'oldest' | 'republished' | 'critical' | 'important' | 'fyi'

type PostWithStats = SpotlightPost & {
  view_count: number
  ack_count: number
}

export function Spotlight({ user }: { user: User }) {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<PostWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewMode>('newest')

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: postRows } = await supabase
      .from('spotlight_posts')
      .select('*')
      .eq('org_id', user.org_id)
      .order('created_at', { ascending: false })

    const list = postRows || []

    // Load view stats per post for the read-receipt counts.
    const ids = list.map(p => p.id)
    const counts: Record<string, { views: number; acks: number }> = {}
    if (ids.length > 0) {
      const { data: viewRows } = await supabase
        .from('spotlight_post_views')
        .select('post_id, acknowledged_at')
        .in('post_id', ids)
      for (const v of viewRows || []) {
        const c = counts[v.post_id] || { views: 0, acks: 0 }
        c.views += 1
        if (v.acknowledged_at) c.acks += 1
        counts[v.post_id] = c
      }
    }

    setPosts(list.map(p => ({
      ...p,
      view_count: counts[p.id]?.views ?? 0,
      ack_count: counts[p.id]?.acks ?? 0,
    })))
    setLoading(false)
  }, [user.org_id])

  useEffect(() => { loadData() }, [loadData])

  async function handlePublish(post: PostWithStats) {
    if (!confirm(t.spotlightPublishConfirm)) return
    const { error } = await supabase
      .from('spotlight_posts')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', post.id)
    if (error) { alert(error.message); return }
    loadData()
  }

  async function handleArchive(post: PostWithStats) {
    if (!confirm(t.spotlightArchiveConfirm)) return
    const { error } = await supabase
      .from('spotlight_posts')
      .update({ status: 'archived' })
      .eq('id', post.id)
    if (error) { alert(error.message); return }
    loadData()
  }

  async function handleUnarchive(post: PostWithStats) {
    const { error } = await supabase
      .from('spotlight_posts')
      .update({ status: post.published_at ? 'published' : 'draft' })
      .eq('id', post.id)
    if (error) { alert(error.message); return }
    loadData()
  }

  async function handleRepublish(post: PostWithStats) {
    if (!confirm(t.spotlightRepublishConfirm)) return
    const { error } = await supabase.rpc('republish_spotlight_post', { p_post_id: post.id })
    if (error) { alert(error.message); return }
    loadData()
  }

  async function handleDelete(post: PostWithStats) {
    if (!confirm(t.spotlightDeleteConfirm)) return
    const { error } = await supabase.from('spotlight_posts').delete().eq('id', post.id)
    if (error) { alert(error.message); return }
    loadData()
  }

  // Resolve the active view into a priority filter + sort order.
  const priorityFilter: SpotlightPriority | null =
    view === 'critical' ? 'critical' :
    view === 'important' ? 'important' :
    view === 'fyi' ? 'fyi' : null
  const sortBy: 'newest' | 'oldest' | 'republished' =
    view === 'oldest' ? 'oldest' :
    view === 'republished' ? 'republished' : 'newest'

  const filtered = posts
    .filter(p => filter === 'all' || p.status === filter)
    .filter(p => priorityFilter === null || p.priority === priorityFilter)
    .slice()
    .sort((a, b) => {
      if (sortBy === 'oldest') return a.created_at.localeCompare(b.created_at)
      if (sortBy === 'republished') return b.republish_count - a.republish_count
      return b.created_at.localeCompare(a.created_at)
    })

  if (loading) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.spotlightTitle}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.spotlightSubtitle}</p>
        </div>
        <button
          onClick={() => navigate('/dashboard/spotlight/new')}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.spotlightNew}
        </button>
      </div>

      {/* Status pills + view selector on one row */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', t.spotlightFilterAll, posts.length],
            ['draft', t.spotlightFilterDraft, posts.filter(p => p.status === 'draft').length],
            ['scheduled', t.spotlightFilterScheduled, posts.filter(p => p.status === 'scheduled').length],
            ['published', t.spotlightFilterPublished, posts.filter(p => p.status === 'published').length],
            ['archived', t.spotlightFilterArchived, posts.filter(p => p.status === 'archived').length],
          ] as Array<[StatusFilter, string, number]>).map(([key, label, count]) => (
            <FilterPill key={key} active={filter === key} onClick={() => setFilter(key)} count={count}>
              {label}
            </FilterPill>
          ))}
        </div>
        <select
          value={view}
          onChange={e => setView(e.target.value as ViewMode)}
          className="rounded-md border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          <optgroup label={t.spotlightSortLabel}>
            <option value="newest">{t.spotlightSortNewest}</option>
            <option value="oldest">{t.spotlightSortOldest}</option>
            <option value="republished">{t.spotlightSortRepublished}</option>
          </optgroup>
          <optgroup label={t.spotlightFieldPriority}>
            <option value="critical">{t.spotlightPriorityCritical}</option>
            <option value="important">{t.spotlightPriorityImportant}</option>
            <option value="fyi">{t.spotlightPriorityFyi}</option>
          </optgroup>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.spotlightEmpty}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PostRow
              key={p.id}
              post={p}
              t={t}
              lang={lang}
              onEdit={() => navigate(`/dashboard/spotlight/${p.id}/edit`)}
              onPublish={() => handlePublish(p)}
              onArchive={() => handleArchive(p)}
              onUnarchive={() => handleUnarchive(p)}
              onRepublish={() => handleRepublish(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PostRow({
  post, t, lang, onEdit, onPublish, onArchive, onUnarchive, onRepublish, onDelete,
}: {
  post: PostWithStats
  t: Translations
  lang: Lang
  onEdit: () => void
  onPublish: () => void
  onArchive: () => void
  onUnarchive: () => void
  onRepublish: () => void
  onDelete: () => void
}) {
  // Action menu items vary by status. Edit isn't here — the card body click
  // opens the edit page directly.
  type MenuItem = { label: string; onClick: () => void; danger?: boolean }
  const items: MenuItem[] = []
  if (post.status === 'draft') items.push({ label: t.spotlightPublish, onClick: onPublish })
  if (post.status === 'published') {
    items.push({ label: t.spotlightRepublish, onClick: onRepublish })
    items.push({ label: t.spotlightArchive, onClick: onArchive })
  }
  if (post.status === 'archived') items.push({ label: t.spotlightUnarchive, onClick: onUnarchive })
  items.push({ label: t.delete, onClick: onDelete, danger: true })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit() } }}
      className="cursor-pointer rounded-xl border p-4 transition-colors"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
      onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--color-border-strong, var(--color-border))' }}
      onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {post.image_url && (
            <img
              src={post.image_url}
              alt=""
              className="mb-3 h-20 w-20 rounded-lg object-cover"
            />
          )}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <PriorityPill priority={post.priority as SpotlightPriority} t={t} />
            <StatusPill status={post.status as SpotlightStatus} t={t} />
            {post.republish_count > 0 && (
              <RepublishCountPill count={post.republish_count} t={t} />
            )}
          </div>
          <h3 className="truncate text-base font-semibold" style={{ color: 'var(--color-text)' }}>
            {post.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {post.what_happened}
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {datelineLabel(post, t, lang)}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {post.status === 'published' && post.requires_acknowledgement && (
            <span className="whitespace-nowrap pt-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {t.spotlightAcknowledgements(post.ack_count, post.view_count || post.ack_count)}
            </span>
          )}
          {post.status === 'published' && (
            <IconButton
              ariaLabel={t.spotlightRepublish}
              onClick={onRepublish}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
            </IconButton>
          )}
          <RowMenu items={items} ariaLabel={t.spotlightRowMenuAria} />
        </div>
      </div>
    </div>
  )
}

function datelineLabel(post: PostWithStats, t: Translations, lang: Lang): string {
  if (post.status === 'published' && post.published_at) {
    return `${t.spotlightDatelinePublished} ${formatRelativeTime(post.published_at, lang)}`
  }
  if (post.status === 'scheduled' && post.effective_from) {
    return `${t.spotlightDatelineScheduled} ${formatRelativeTime(post.effective_from, lang)}`
  }
  if (post.status === 'archived') {
    return `${t.spotlightDatelineArchived} ${formatRelativeTime(post.updated_at, lang)}`
  }
  return `${t.spotlightDatelineCreated} ${formatRelativeTime(post.created_at, lang)}`
}

function IconButton({ children, onClick, ariaLabel }: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-tertiary)',
        backgroundColor: 'transparent',
      }}
      onMouseOver={e => {
        e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
        e.currentTarget.style.color = 'var(--color-text)'
      }}
      onMouseOut={e => {
        e.currentTarget.style.backgroundColor = 'transparent'
        e.currentTarget.style.color = 'var(--color-text-tertiary)'
      }}
    >
      {children}
    </button>
  )
}

function RowMenu({ items, ariaLabel }: {
  items: { label: string; onClick: () => void; danger?: boolean }[]
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<'below' | 'above'>('below')

  // Decide flip direction synchronously, before paint, so the menu doesn't
  // visibly jump when there's no room below.
  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const estHeight = items.length * 36 + 12
    const spaceBelow = window.innerHeight - rect.bottom
    setPlacement(spaceBelow < estHeight && rect.top > spaceBelow ? 'above' : 'below')
  }, [open, items.length])

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
    <div ref={containerRef} className="relative" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
        style={{ color: 'var(--color-text-tertiary)' }}
        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 z-40 min-w-[160px] overflow-hidden rounded-lg border shadow-lg ${
            placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'
          }`}
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); item.onClick() }}
              className="block w-full px-3 py-2 text-left text-sm transition-colors"
              style={{ color: item.danger ? 'var(--color-danger)' : 'var(--color-text)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RepublishCountPill({ count, t }: { count: number; t: Translations }) {
  // Visual escalation: yellow at 2+, red at 4+. Surfaces "this keeps not
  // getting fixed" patterns at a glance.
  let bg = 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
  let fg = 'var(--color-primary)'
  if (count >= 4) {
    bg = 'color-mix(in srgb, var(--color-danger) 14%, transparent)'
    fg = 'var(--color-danger)'
  } else if (count >= 2) {
    bg = 'color-mix(in srgb, #d97706 18%, transparent)'
    fg = '#d97706'
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: bg, color: fg }}>
      {t.spotlightRepublishedCount(count)}
    </span>
  )
}

function PriorityPill({ priority, t }: { priority: SpotlightPriority; t: Translations }) {
  const labels: Record<SpotlightPriority, string> = {
    critical: t.spotlightPriorityCritical,
    important: t.spotlightPriorityImportant,
    fyi: t.spotlightPriorityFyi,
  }
  const colors: Record<SpotlightPriority, { bg: string; fg: string }> = {
    critical: { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)', fg: 'var(--color-danger)' },
    important: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' },
    fyi: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
  }
  const c = colors[priority]
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>
      {labels[priority]}
    </span>
  )
}

function StatusPill({ status, t }: { status: SpotlightStatus; t: Translations }) {
  const labels: Record<SpotlightStatus, string> = {
    draft: t.spotlightStatusDraft,
    scheduled: t.spotlightStatusScheduled,
    published: t.spotlightStatusPublished,
    archived: t.spotlightStatusArchived,
  }
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
    >
      {labels[status]}
    </span>
  )
}
