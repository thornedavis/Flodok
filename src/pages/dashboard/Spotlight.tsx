import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import type { User, SpotlightPost, SpotlightStatus, SpotlightPriority } from '../../types/aliases'
import type { Translations } from '../../lib/translations'

type StatusFilter = 'all' | SpotlightStatus

type PostWithStats = SpotlightPost & {
  view_count: number
  ack_count: number
}

export function Spotlight({ user }: { user: User }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<PostWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')

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

  const filtered = filter === 'all' ? posts : posts.filter(p => p.status === filter)

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

      {/* Filter tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {([
          ['all', t.spotlightFilterAll],
          ['draft', t.spotlightFilterDraft],
          ['scheduled', t.spotlightFilterScheduled],
          ['published', t.spotlightFilterPublished],
          ['archived', t.spotlightFilterArchived],
        ] as Array<[StatusFilter, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: filter === key ? 'var(--color-primary)' : 'var(--color-border)',
              color: filter === key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              backgroundColor: filter === key ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
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
  post, t, onEdit, onPublish, onArchive, onUnarchive, onRepublish, onDelete,
}: {
  post: PostWithStats
  t: Translations
  onEdit: () => void
  onPublish: () => void
  onArchive: () => void
  onUnarchive: () => void
  onRepublish: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <PriorityPill priority={post.priority as SpotlightPriority} t={t} />
            <StatusPill status={post.status as SpotlightStatus} t={t} />
            {post.pinned && (
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>📌</span>
            )}
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
        </div>
        <div className="flex flex-col items-end gap-1 text-xs whitespace-nowrap">
          {post.status === 'published' && post.requires_acknowledgement && (
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {t.spotlightAcknowledgements(post.ack_count, post.view_count || post.ack_count)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button onClick={onEdit} className="rounded-md border px-2.5 py-1" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>{t.edit}</button>
        {post.status === 'draft' && (
          <button onClick={onPublish} className="rounded-md px-2.5 py-1 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>{t.spotlightPublish}</button>
        )}
        {post.status === 'published' && (
          <>
            <button onClick={onRepublish} className="rounded-md px-2.5 py-1 text-white" style={{ backgroundColor: 'var(--color-primary)' }}>{t.spotlightRepublish}</button>
            <button onClick={onArchive} className="rounded-md border px-2.5 py-1" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>{t.spotlightArchive}</button>
          </>
        )}
        {post.status === 'archived' && (
          <button onClick={onUnarchive} className="rounded-md border px-2.5 py-1" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>{t.spotlightUnarchive}</button>
        )}
        <button onClick={onDelete} className="rounded-md border px-2.5 py-1" style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}>{t.delete}</button>
      </div>
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
